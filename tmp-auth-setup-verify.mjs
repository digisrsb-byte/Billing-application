/**
 * First-run administrator setup + legacy install auth tests.
 * Uses production src/services/auth.ts (not a replica).
 * Run: npm run test:auth-setup
 */
import { register } from 'tsx/esm/api';
import crypto from 'crypto';

const unregisterTsx = register();

const store = new Map();
const session = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(String(k), String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
  get length() {
    return store.size;
  },
  key: (i) => [...store.keys()][i] ?? null
};
globalThis.sessionStorage = {
  getItem: (k) => (session.has(k) ? session.get(k) : null),
  setItem: (k, v) => session.set(String(k), String(v)),
  removeItem: (k) => session.delete(k)
};
globalThis.btoa = (s) => Buffer.from(s, 'binary').toString('base64');
globalThis.atob = (s) => Buffer.from(s, 'base64').toString('binary');
Object.defineProperty(globalThis, 'crypto', { value: crypto.webcrypto });

const results = [];
function check(id, ok, detail) {
  results.push({ id, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${id} — ${detail}`);
}

async function main() {
  const auth = await import('./src/services/auth.ts');

  console.log('=== First-run setup ===');
  store.clear();
  session.clear();
  auth.__authTest.setSessionValidated(false);
  check('S1', auth.needsAuthSetup() === true, 'empty install needs setup');

  // Bypass attempts
  store.set(auth.__authTest.LEGACY_AUTH_FLAG, '1');
  check('S2', auth.needsAuthSetup() === true, 'legacy flag alone does not complete setup');
  check('S3', auth.isLoggedIn() === false, 'legacy flag does not grant login');
  check('S4', store.get(auth.__authTest.LEGACY_AUTH_FLAG) == null, 'legacy flag scrubbed');

  store.set(auth.__authTest.AUTH_META_KEY, '{not-json');
  check('S5', auth.needsAuthSetup() === true, 'corrupt meta treated as unset');
  store.delete(auth.__authTest.AUTH_META_KEY);

  let weak = await auth.createAdministrator('6362595002', 'short', 'short');
  check('S6', weak.ok === false && weak.reason === 'WEAK_PASSWORD', 'weak password rejected');
  check('S7', auth.needsAuthSetup() === true, 'failed setup leaves needsSetup true');

  let mismatch = await auth.createAdministrator('6362595002', 'password1', 'password2');
  check('S8', mismatch.ok === false && mismatch.reason === 'PASSWORD_MISMATCH', 'confirm mismatch rejected');

  const created = await auth.createAdministrator('6362595002', 'DeskPass99', 'DeskPass99');
  check('S9', created.ok === true, 'createAdministrator succeeds');
  check('S10', auth.needsAuthSetup() === false, 'setup complete');
  check('S11', auth.isLoggedIn() === true, 'session started after setup');

  const metaRaw = store.get(auth.__authTest.AUTH_META_KEY);
  const meta = JSON.parse(metaRaw);
  check(
    'S12',
    meta.saltB64 !== auth.__authTest.LEGACY_SHARED_BOOTSTRAP_VERIFIER.saltB64 ||
      meta.hashB64 !== auth.__authTest.LEGACY_SHARED_BOOTSTRAP_VERIFIER.hashB64,
    'new install does not write shared bootstrap verifier'
  );
  check('S13', !metaRaw.includes('DeskPass99'), 'plaintext password not stored in meta');

  const again = await auth.createAdministrator('9999999999', 'AnotherPass1', 'AnotherPass1');
  check('S14', again.ok === false && again.reason === 'ALREADY_INITIALIZED', 'second setup blocked');

  console.log('\n=== Login / wrong password / logout / restart ===');
  auth.clearSession();
  check('L1', auth.isLoggedIn() === false, 'logout clears gate');

  const wrong = await auth.verifyAndStartSession('6362595002', 'wrong-password');
  check('L2', wrong === false && auth.isLoggedIn() === false, 'wrong password rejected');

  const okLogin = await auth.verifyAndStartSession('6362595002', 'DeskPass99');
  check('L3', okLogin === true && auth.isLoggedIn() === true, 'successful login');

  // Simulate app restart: keep localStorage meta, clear in-memory + sessionStorage
  const savedSession = session.get(auth.__authTest.SESSION_KEY);
  auth.__authTest.setSessionValidated(false);
  session.clear();
  check('L4', auth.isLoggedIn() === false, 'restart without session requires login');
  session.set(auth.__authTest.SESSION_KEY, savedSession);
  const hydrated = await auth.hydrateSession();
  check('L5', hydrated === true && auth.isLoggedIn() === true, 'valid session hydrates after restart');

  console.log('\n=== Expiry (deterministic) ===');
  const raw = JSON.parse(session.get(auth.__authTest.SESSION_KEY));
  raw.exp = Date.now() - 1000;
  session.set(auth.__authTest.SESSION_KEY, JSON.stringify(raw));
  check('X1', auth.isLoggedIn() === false, 'expired session fails gate');
  check('X2', !session.get(auth.__authTest.SESSION_KEY), 'expiry clears session storage');

  console.log('\n=== Legacy install (existing shared bootstrap meta kept) ===');
  store.clear();
  session.clear();
  auth.__authTest.setSessionValidated(false);
  // Simulate upgrade: older build already wrote shared bootstrap meta
  store.set(
    auth.__authTest.AUTH_META_KEY,
    JSON.stringify({ ...auth.__authTest.LEGACY_SHARED_BOOTSTRAP_VERIFIER })
  );
  check('G1', auth.needsAuthSetup() === false, 'legacy meta present → no setup forced');
  check('G2', auth.usesLegacySharedBootstrapVerifier() === true, 'legacy shared verifier detected');
  // Known historical desk password for that verifier (test secret only)
  const legacyLogin = await auth.verifyAndStartSession('6362595002', 'srk@123');
  check('G3', legacyLogin === true, 'legacy install still logs in with existing password');
  check('G4', auth.isLoggedIn() === true, 'legacy session active');

  // ensureAuthBootstrap must not overwrite custom/legacy meta
  const before = store.get(auth.__authTest.AUTH_META_KEY);
  auth.ensureAuthBootstrap();
  check('G5', store.get(auth.__authTest.AUTH_META_KEY) === before, 'ensureAuthBootstrap does not rewrite meta');

  const failed = results.filter((r) => !r.ok).length;
  console.log(`\nSUMMARY: ${results.length - failed}/${results.length} passed`);
  unregisterTsx();
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  try {
    unregisterTsx();
  } catch {
    /* ignore */
  }
  process.exit(1);
});

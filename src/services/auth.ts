/**
 * Desk authentication — PBKDF2-SHA256 password verification + signed session.
 * No plaintext password is stored in source.
 *
 * First-run: each installation creates its own administrator phone + password
 * verifier via createAdministrator(). Existing installs keep whatever AuthMeta
 * is already in localStorage (including legacy shared-bootstrap meta written by
 * older builds) and continue to log in with that password — we never overwrite
 * an existing verifier or invent a new default password.
 */

const AUTH_META_KEY = 'srk_billing_auth_meta_v2';
const SESSION_KEY = 'srk_billing_session_v2';
/** Legacy flag from pre-P0 builds — never grants access; removed on sight */
const LEGACY_AUTH_FLAG = 'srk_billing_auth_v1';

const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours
const PBKDF2_ITERATIONS = 210_000;
const HASH_BYTES = 32;
const MIN_PASSWORD_LENGTH = 8;

/**
 * Historical shared verifier (pre–first-run-setup builds).
 * Kept ONLY for detecting/legacy test comparison — never written by current code.
 * Older installs may already have this exact meta in localStorage; login still
 * works against that stored copy. New installs never receive it.
 */
const LEGACY_SHARED_BOOTSTRAP_VERIFIER = {
  v: 2 as const,
  phone: '6362595002',
  algo: 'PBKDF2-SHA256' as const,
  iterations: PBKDF2_ITERATIONS,
  saltB64: 'Fqdhg5K0ax+VY0IHrocDzQ==',
  hashB64: '0o1k8t8u6UQR0aGR7NLcozYRuvQ2+MexY9AOkzaHJTg='
};

/** @deprecated Prefer LEGACY_SHARED_BOOTSTRAP_VERIFIER naming; export for tests */
const BOOTSTRAP_VERIFIER = LEGACY_SHARED_BOOTSTRAP_VERIFIER;

/** Suggested default desk phone shown on first-run setup (not a secret). */
export const DESK_PHONE = '6362595002';

export interface AuthMeta {
  v: 2;
  phone: string;
  algo: 'PBKDF2-SHA256';
  iterations: number;
  saltB64: string;
  hashB64: string;
}

interface SessionRecord {
  v: 2;
  phone: string;
  exp: number;
  nonce: string;
  mac: string;
}

/** In-memory gate: true only after MAC-validated session (login or hydrate). */
let sessionValidated = false;

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '');
}

function bufToB64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function b64ToBuf(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function pbkdf2(
  password: string,
  salt: Uint8Array,
  iterations: number
): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const saltBuf = new Uint8Array(salt);
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBuf,
      iterations,
      hash: 'SHA-256'
    },
    keyMaterial,
    HASH_BYTES * 8
  );
  return new Uint8Array(bits);
}

async function sha256B64(parts: string[]): Promise<string> {
  const enc = new TextEncoder();
  const data = enc.encode(parts.join('|'));
  const digest = await crypto.subtle.digest('SHA-256', data);
  return bufToB64(digest);
}

function isValidAuthMeta(parsed: unknown): parsed is AuthMeta {
  if (!parsed || typeof parsed !== 'object') return false;
  const m = parsed as Record<string, unknown>;
  return (
    m.v === 2 &&
    m.algo === 'PBKDF2-SHA256' &&
    typeof m.phone === 'string' &&
    typeof m.saltB64 === 'string' &&
    m.saltB64.length > 0 &&
    typeof m.hashB64 === 'string' &&
    m.hashB64.length > 0 &&
    typeof m.iterations === 'number' &&
    m.iterations > 0
  );
}

function readMeta(): AuthMeta | null {
  try {
    const raw = localStorage.getItem(AUTH_META_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (isValidAuthMeta(parsed)) return parsed;
  } catch {
    /* ignore */
  }
  return null;
}

function writeMeta(meta: AuthMeta): void {
  localStorage.setItem(AUTH_META_KEY, JSON.stringify(meta));
}

function scrubLegacyFlag(): void {
  try {
    localStorage.removeItem(LEGACY_AUTH_FLAG);
  } catch {
    /* ignore */
  }
}

/**
 * True when this install has no administrator verifier yet.
 * Does not write any meta. Forging LEGACY_AUTH_FLAG does not satisfy setup.
 */
export function needsAuthSetup(): boolean {
  scrubLegacyFlag();
  return readMeta() === null;
}

/**
 * True when stored meta matches the historical shared bootstrap verifier
 * (informative only — login still works; password change is a future feature).
 */
export function usesLegacySharedBootstrapVerifier(): boolean {
  const meta = readMeta();
  if (!meta) return false;
  return (
    meta.saltB64 === LEGACY_SHARED_BOOTSTRAP_VERIFIER.saltB64 &&
    meta.hashB64 === LEGACY_SHARED_BOOTSTRAP_VERIFIER.hashB64 &&
    meta.iterations === LEGACY_SHARED_BOOTSTRAP_VERIFIER.iterations
  );
}

export type CreateAdministratorResult =
  | { ok: true }
  | {
      ok: false;
      reason: 'ALREADY_INITIALIZED' | 'WEAK_PASSWORD' | 'PHONE_REQUIRED' | 'PASSWORD_MISMATCH';
      message: string;
    };

/**
 * First-run administrator creation. Generates a unique salt+hash per install.
 * Refuses if AuthMeta already exists (upgrade / re-entry protection).
 */
export async function createAdministrator(
  phone: string,
  password: string,
  passwordConfirm: string
): Promise<CreateAdministratorResult> {
  scrubLegacyFlag();

  if (readMeta()) {
    return {
      ok: false,
      reason: 'ALREADY_INITIALIZED',
      message: 'Administrator is already set up. Sign in with your existing password.'
    };
  }

  const p = normalizePhone(phone);
  if (!p || p.length < 10) {
    return { ok: false, reason: 'PHONE_REQUIRED', message: 'Enter a valid phone number' };
  }

  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    return {
      ok: false,
      reason: 'WEAK_PASSWORD',
      message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`
    };
  }

  if (password !== passwordConfirm) {
    return { ok: false, reason: 'PASSWORD_MISMATCH', message: 'Passwords do not match' };
  }

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, PBKDF2_ITERATIONS);
  const meta: AuthMeta = {
    v: 2,
    phone: p,
    algo: 'PBKDF2-SHA256',
    iterations: PBKDF2_ITERATIONS,
    saltB64: bufToB64(salt),
    hashB64: bufToB64(hash)
  };
  writeMeta(meta);
  await startSession(p);
  return { ok: true };
}

/**
 * @deprecated No longer seeds a shared verifier. Kept as a no-op read for older callers.
 */
export function ensureAuthBootstrap(): AuthMeta | null {
  scrubLegacyFlag();
  return readMeta();
}

/**
 * Removes forgeable legacy flag. Never grants access and never seeds a password.
 */
export function migrateLegacyAuthFlag(): void {
  scrubLegacyFlag();
}

export async function verifyLogin(phone: string, password: string): Promise<boolean> {
  scrubLegacyFlag();
  const meta = readMeta();
  if (!meta || !password) return false;

  const p = normalizePhone(phone);
  if (p !== normalizePhone(meta.phone)) return false;

  const salt = b64ToBuf(meta.saltB64);
  const expected = b64ToBuf(meta.hashB64);
  const actual = await pbkdf2(password, salt, meta.iterations);
  return timingSafeEqual(actual, expected);
}

async function buildSessionMac(
  phone: string,
  exp: number,
  nonce: string,
  hashB64: string
): Promise<string> {
  return sha256B64(['srk-session-v2', phone, String(exp), nonce, hashB64]);
}

function readSession(): SessionRecord | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SessionRecord;
    if (parsed?.v !== 2 || !parsed.mac || !parsed.nonce || !parsed.exp) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Create a signed session after successful password verification or setup. */
export async function startSession(phone: string): Promise<void> {
  const meta = readMeta();
  if (!meta) {
    sessionValidated = false;
    throw new Error('AUTH_META_MISSING');
  }
  const p = normalizePhone(phone);
  const exp = Date.now() + SESSION_TTL_MS;
  const nonceBytes = crypto.getRandomValues(new Uint8Array(16));
  const nonce = bufToB64(nonceBytes);
  const mac = await buildSessionMac(p, exp, nonce, meta.hashB64);
  const session: SessionRecord = { v: 2, phone: p, exp, nonce, mac };
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  scrubLegacyFlag();
  sessionValidated = true;
}

export function clearSession(): void {
  sessionValidated = false;
  try {
    sessionStorage.removeItem(SESSION_KEY);
    scrubLegacyFlag();
  } catch {
    /* ignore */
  }
}

/** Cryptographic session validation for data-layer boundaries. */
export async function assertAuthenticated(): Promise<void> {
  scrubLegacyFlag();
  const session = readSession();
  if (!session) {
    sessionValidated = false;
    throw new Error('AUTH_REQUIRED');
  }
  if (Date.now() > session.exp) {
    clearSession();
    throw new Error('AUTH_EXPIRED');
  }
  const meta = readMeta();
  if (!meta) {
    sessionValidated = false;
    clearSession();
    throw new Error('AUTH_META_MISSING');
  }
  const phone = normalizePhone(session.phone);
  if (phone !== normalizePhone(meta.phone)) {
    clearSession();
    throw new Error('AUTH_PHONE_MISMATCH');
  }
  const expected = await buildSessionMac(phone, session.exp, session.nonce, meta.hashB64);
  const a = b64ToBuf(expected);
  const b = b64ToBuf(session.mac);
  if (!timingSafeEqual(a, b)) {
    clearSession();
    throw new Error('AUTH_SESSION_INVALID');
  }
  sessionValidated = true;
}

/** Validate existing sessionStorage session (call on app boot). */
export async function hydrateSession(): Promise<boolean> {
  try {
    await assertAuthenticated();
    return true;
  } catch {
    sessionValidated = false;
    return false;
  }
}

/**
 * Sync gate for React. True only after login/setup or successful hydrateSession().
 * Forging localStorage srk_billing_auth_v1=1 does NOT grant access.
 * Missing AuthMeta does NOT auto-create a password.
 */
export function isLoggedIn(): boolean {
  scrubLegacyFlag();
  if (!sessionValidated) return false;
  const session = readSession();
  if (!session) {
    sessionValidated = false;
    return false;
  }
  if (Date.now() > session.exp) {
    clearSession();
    return false;
  }
  if (!readMeta()) {
    sessionValidated = false;
    return false;
  }
  return true;
}

export function assertAuthenticatedSync(): void {
  if (!isLoggedIn()) throw new Error('AUTH_REQUIRED');
}

export function setLoggedIn(value: boolean): void {
  if (!value) clearSession();
}

export async function verifyAndStartSession(phone: string, password: string): Promise<boolean> {
  if (needsAuthSetup()) {
    clearSession();
    return false;
  }
  const ok = await verifyLogin(phone, password);
  if (!ok) {
    clearSession();
    return false;
  }
  await startSession(phone);
  return true;
}

/** Test-only exports for the isolated harness. */
export const __authTest = {
  AUTH_META_KEY,
  SESSION_KEY,
  LEGACY_AUTH_FLAG,
  BOOTSTRAP_VERIFIER,
  LEGACY_SHARED_BOOTSTRAP_VERIFIER,
  MIN_PASSWORD_LENGTH,
  normalizePhone,
  readMeta,
  getSessionValidated: () => sessionValidated,
  setSessionValidated: (v: boolean) => {
    sessionValidated = v;
  }
};

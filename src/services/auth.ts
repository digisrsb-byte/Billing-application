/**
 * Desk authentication — PBKDF2-SHA256 password verification + signed session.
 * No plaintext password is stored in source. Bootstrap verifier matches the
 * existing administrator password so upgrades do not lock out the desk user.
 */

const AUTH_META_KEY = 'srk_billing_auth_meta_v2';
const SESSION_KEY = 'srk_billing_session_v2';
/** Legacy flag from pre-P0 builds — never grants access; removed on migrate */
const LEGACY_AUTH_FLAG = 'srk_billing_auth_v1';

const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours
const PBKDF2_ITERATIONS = 210_000;
const HASH_BYTES = 32;

/** Public desk phone (username). Not a secret. */
export const DESK_PHONE = '6362595002';

/**
 * Bootstrap PBKDF2 verifier for the existing desk password.
 * Generated offline; plaintext password is not present in this module.
 */
const BOOTSTRAP_VERIFIER = {
  v: 2 as const,
  phone: DESK_PHONE,
  algo: 'PBKDF2-SHA256' as const,
  iterations: PBKDF2_ITERATIONS,
  saltB64: 'Fqdhg5K0ax+VY0IHrocDzQ==',
  hashB64: '0o1k8t8u6UQR0aGR7NLcozYRuvQ2+MexY9AOkzaHJTg='
};

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
  const saltBuf = new Uint8Array(salt); // copy for BufferSource typing compatibility
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

function readMeta(): AuthMeta | null {
  try {
    const raw = localStorage.getItem(AUTH_META_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthMeta;
    if (
      parsed?.v === 2 &&
      parsed.algo === 'PBKDF2-SHA256' &&
      typeof parsed.saltB64 === 'string' &&
      typeof parsed.hashB64 === 'string' &&
      typeof parsed.iterations === 'number'
    ) {
      return parsed;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function writeMeta(meta: AuthMeta): void {
  localStorage.setItem(AUTH_META_KEY, JSON.stringify(meta));
}

/** Ensure a password verifier exists (bootstrap once; never stores plaintext). */
export function ensureAuthBootstrap(): AuthMeta {
  const existing = readMeta();
  if (existing) return existing;
  const meta: AuthMeta = { ...BOOTSTRAP_VERIFIER };
  writeMeta(meta);
  return meta;
}

/**
 * Safe migration from pre-P0 builds that only had a forgeable "1" flag.
 * Does not lock out the administrator: bootstrap verifier accepts the
 * existing desk password. Legacy flag never grants access.
 */
export function migrateLegacyAuthFlag(): void {
  ensureAuthBootstrap();
  try {
    localStorage.removeItem(LEGACY_AUTH_FLAG);
  } catch {
    /* ignore */
  }
}

export async function verifyLogin(phone: string, password: string): Promise<boolean> {
  const meta = ensureAuthBootstrap();
  const p = normalizePhone(phone);
  if (p !== normalizePhone(meta.phone) || !password) return false;

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

/** Create a signed session after successful password verification. */
export async function startSession(phone: string): Promise<void> {
  const meta = ensureAuthBootstrap();
  const p = normalizePhone(phone);
  const exp = Date.now() + SESSION_TTL_MS;
  const nonceBytes = crypto.getRandomValues(new Uint8Array(16));
  const nonce = bufToB64(nonceBytes);
  const mac = await buildSessionMac(p, exp, nonce, meta.hashB64);
  const session: SessionRecord = { v: 2, phone: p, exp, nonce, mac };
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  try {
    localStorage.removeItem(LEGACY_AUTH_FLAG);
  } catch {
    /* ignore */
  }
  sessionValidated = true;
}

export function clearSession(): void {
  sessionValidated = false;
  try {
    sessionStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(LEGACY_AUTH_FLAG);
  } catch {
    /* ignore */
  }
}

/** Cryptographic session validation for data-layer boundaries. */
export async function assertAuthenticated(): Promise<void> {
  migrateLegacyAuthFlag();
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
 * Sync gate for React. True only after login or successful hydrateSession().
 * Forging localStorage srk_billing_auth_v1=1 does NOT grant access.
 */
export function isLoggedIn(): boolean {
  migrateLegacyAuthFlag();
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
  return true;
}

export function assertAuthenticatedSync(): void {
  if (!isLoggedIn()) throw new Error('AUTH_REQUIRED');
}

export function setLoggedIn(value: boolean): void {
  if (!value) clearSession();
}

export async function verifyAndStartSession(phone: string, password: string): Promise<boolean> {
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
  normalizePhone,
  getSessionValidated: () => sessionValidated,
  setSessionValidated: (v: boolean) => {
    sessionValidated = v;
  }
};

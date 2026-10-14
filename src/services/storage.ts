import { AppDatabase, CompanySettings, Client, Invoice, BoxConfig, AuditEvent, DbMeta } from '../types/billing';
import { assertAuthenticatedSync } from './auth';
import { findDuplicateInvoiceNos, syncNextSeq } from './invoiceIntegrity';
import { kvGetItem, kvKeys, kvSetItem } from './kvStore';

export const STORAGE_KEY = 'srk_enterprises_billing_db_v2';
/**
 * Legacy live pre-migration backup key (P0 era).
 * Equals preMigrationBackupKey(STORAGE_KEY). Kept for explicit read compatibility.
 */
export const LEGACY_BACKUP_KEY_PRE_P0 = 'srk_enterprises_billing_db_v2_backup_pre_p0_v3';
/** @deprecated Prefer LEGACY_BACKUP_KEY_PRE_P0 or preMigrationBackupKey() */
export const BACKUP_KEY_PRE_P0 = LEGACY_BACKUP_KEY_PRE_P0;
/** Isolated key for automated tests — never the live desk database */
export const TEST_STORAGE_KEY = 'srk_enterprises_billing_db_TEST_p0';

export const SCHEMA_VERSION = 3;

export type DatabaseLoadErrorCode = 'PARSE_FAIL' | 'SHAPE_FAIL' | 'SALVAGE_FAIL' | 'AUTH_REQUIRED';

/** Safe load failure — never embeds raw DB / PII in message. */
export class DatabaseLoadError extends Error {
  readonly code: DatabaseLoadErrorCode;
  readonly storageKey: string;
  readonly salvageKey?: string;

  constructor(code: DatabaseLoadErrorCode, storageKey: string, salvageKey?: string) {
    super(
      code === 'SALVAGE_FAIL'
        ? 'Database is unreadable and a recovery copy could not be saved. The original data was not overwritten.'
        : 'Stored database is unreadable. A recovery copy was preserved. Use Backup & recovery to restore.'
    );
    this.name = 'DatabaseLoadError';
    this.code = code;
    this.storageKey = storageKey;
    this.salvageKey = salvageKey;
  }
}

export const DEFAULT_BOXES: BoxConfig[] = [
  { id: 'b1', n: '1 Litre Box', p: 120, hsn: '481910', pack: '1 Litre' },
  { id: 'b2', n: '2 Litre Box', p: 220, hsn: '481910', pack: '2 Litre' },
  { id: 'b3', n: '½ Litre Box', p: 65, hsn: '481910', pack: '½ Litre' },
  { id: 'b4', n: '250 ml Box', p: 35, hsn: '481910', pack: '250 ml' },
  { id: 'b5', n: '5 Litre Can', p: 65, hsn: '481910', pack: '5 Litre' },
  { id: 'b6', n: '10 Litre Can', p: 110, hsn: '481910', pack: '10 Litre' },
  { id: 'b7', n: '20 Litre Can', p: 100, hsn: '481910', pack: '20 Litre' }
];

/**
 * Neutral shipped defaults — no client-specific bank/tax/contact details.
 * Existing saved settings always win over these blanks during normalize.
 */
export const DEFAULT_SETTINGS: CompanySettings = {
  name: 'SRK Enterprises',
  addr: '',
  phone: '',
  email: '',
  gst: '',
  pan: '',
  state: '',
  gstOn: true,
  rate: 1,
  cgstSplit: 0.5,
  sgstSplit: 0.5,
  defaultHsn: '481910',
  bankName: '',
  accountNo: '',
  ifsc: '',
  branch: '',
  upiId: '',
  logoUrl: '',
  signatureUrl: '',
  boxes: DEFAULT_BOXES,
  invoicePrefix: 'SRK-',
  nextSeq: 1
};

/**
 * Demo fixtures for isolated tests only — never used by emptyInitialDb / production init.
 * @deprecated Do not seed into live databases.
 */
export const INITIAL_CLIENTS: Client[] = [
  {
    id: 'c1',
    name: 'Apex Retail Traders',
    phone: '+91 98450 12345',
    addr: '#12, Commercial Street, Bangalore, Karnataka - 560001',
    gst: '29ABCDE1234F1Z5',
    state: 'Karnataka',
    pin: '560001',
    email: 'accounts@apexretail.in',
    createdAt: '2026-10-01'
  },
  {
    id: 'c2',
    name: 'GreenLeaf Supermarket',
    phone: '+91 98451 98765',
    addr: 'Plot 45, Indiranagar 100ft Road, Bangalore, Karnataka - 560038',
    gst: '29XYZPA5678Q1Z2',
    state: 'Karnataka',
    pin: '560038',
    email: 'billing@greenleafmarket.com',
    createdAt: '2026-10-05'
  }
];

export const INITIAL_INVOICES: Invoice[] = [];

let activeStorageKey = STORAGE_KEY;

export function useStorageKey(key: string): void {
  activeStorageKey = key;
}

export function getActiveStorageKey(): string {
  return activeStorageKey;
}

/** Namespaced pre-migration backup for a storage key (FIX-A). */
export function preMigrationBackupKey(storageKey: string = activeStorageKey): string {
  return `${storageKey}_backup_pre_p0_v3`;
}

function salvageKeyFor(storageKey: string, stamp: string, attempt = 0): string {
  return attempt === 0
    ? `${storageKey}_salvage_${stamp}`
    : `${storageKey}_salvage_${stamp}_${attempt}`;
}

function preRestoreKeyFor(storageKey: string, stamp: string, attempt = 0): string {
  return attempt === 0
    ? `${storageKey}_pre_restore_${stamp}`
    : `${storageKey}_pre_restore_${stamp}_${attempt}`;
}

function appendAudit(meta: DbMeta, event: Omit<AuditEvent, 'id' | 'at'> & { id?: string; at?: string }): DbMeta {
  const entry: AuditEvent = {
    id: event.id || 'aud-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    at: event.at || new Date().toISOString(),
    action: event.action,
    invoiceId: event.invoiceId,
    invoiceNo: event.invoiceNo,
    reason: event.reason,
    detail: event.detail
  };
  const log = [...(meta.auditLog || []), entry].slice(-200);
  return { ...meta, auditLog: log };
}

function mergeDefaultBoxes(existing: BoxConfig[] | undefined): BoxConfig[] {
  const list = Array.isArray(existing) ? [...existing] : [];
  const byId = new Map(list.map((b) => [b.id, b]));
  const byName = new Map(list.map((b) => [b.n.trim().toLowerCase(), b]));

  for (const def of DEFAULT_BOXES) {
    if (byId.has(def.id) || byName.has(def.n.trim().toLowerCase())) continue;
    list.push({ ...def });
    byId.set(def.id, def);
    byName.set(def.n.trim().toLowerCase(), def);
  }

  return list.map((b) => {
    const def = DEFAULT_BOXES.find((d) => d.id === b.id || d.n.trim().toLowerCase() === b.n.trim().toLowerCase());
    if (def && !b.pack) return { ...b, pack: def.pack };
    return b;
  });
}

async function writeSalvageCopy(storageKey: string, raw: string): Promise<string> {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  for (let attempt = 0; attempt < 50; attempt++) {
    const key = salvageKeyFor(storageKey, stamp, attempt);
    if (kvGetItem(key) != null) continue;
    try {
      await kvSetItem(key, raw);
    } catch {
      throw new DatabaseLoadError('SALVAGE_FAIL', storageKey);
    }
    if (kvGetItem(key) !== raw) {
      throw new DatabaseLoadError('SALVAGE_FAIL', storageKey);
    }
    return key;
  }
  throw new DatabaseLoadError('SALVAGE_FAIL', storageKey);
}

async function writePreRestoreSnapshot(storageKey: string, raw: string): Promise<string> {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  for (let attempt = 0; attempt < 50; attempt++) {
    const key = preRestoreKeyFor(storageKey, stamp, attempt);
    if (kvGetItem(key) != null) continue;
    await kvSetItem(key, raw);
    return key;
  }
  throw new Error('PRE_RESTORE_SNAPSHOT_FAIL');
}

/**
 * Create namespaced pre-migration backup (FIX-A).
 * Never writes outside the active storage key's backup namespace.
 */
async function createBackupIfNeeded(raw: string): Promise<boolean> {
  const key = preMigrationBackupKey(activeStorageKey);
  try {
    if (kvGetItem(key)) return false;
    await kvSetItem(key, raw);
    return true;
  } catch (err) {
    console.error('Failed to write pre-migration backup', (err as Error)?.name || 'error');
    return false;
  }
}

export function verifyPreP0Backup(storageKey: string = activeStorageKey): {
  exists: boolean;
  bytes: number;
  key: string | null;
} {
  try {
    const namespaced = preMigrationBackupKey(storageKey);
    let raw = kvGetItem(namespaced);
    let key: string | null = raw ? namespaced : null;
    // One-time compatibility: read legacy live key if namespaced missing (only for live DB)
    if (!raw && storageKey === STORAGE_KEY && namespaced !== LEGACY_BACKUP_KEY_PRE_P0) {
      raw = kvGetItem(LEGACY_BACKUP_KEY_PRE_P0);
      key = raw ? LEGACY_BACKUP_KEY_PRE_P0 : null;
    }
    return { exists: !!raw, bytes: raw ? raw.length : 0, key };
  } catch {
    return { exists: false, bytes: 0, key: null };
  }
}

async function migrateToV3(db: AppDatabase, createdBackup: boolean, backupKey: string): Promise<AppDatabase> {
  const legacyDupes = findDuplicateInvoiceNos(db.invoices || []);
  let meta: DbMeta = {
    schemaVersion: SCHEMA_VERSION,
    legacyDuplicateInvoiceNos: legacyDupes,
    auditLog: db.meta?.auditLog || []
  };

  if (createdBackup) {
    meta = appendAudit(meta, {
      action: 'backup_pre_p0',
      detail: `Backup written to ${backupKey}`
    });
  }

  if ((db.meta?.schemaVersion || 0) < SCHEMA_VERSION) {
    meta = appendAudit(meta, {
      action: 'migrate_p0',
      detail:
        legacyDupes.length > 0
          ? `Schema v${SCHEMA_VERSION}; preserved ${legacyDupes.length} legacy duplicate number(s)`
          : `Schema v${SCHEMA_VERSION}; no legacy duplicate invoice numbers`
    });
  }

  const nextSeq = syncNextSeq({ ...DEFAULT_SETTINGS, ...db.settings }, db.invoices || []);

  return {
    ...db,
    settings: {
      ...DEFAULT_SETTINGS,
      ...db.settings,
      boxes: mergeDefaultBoxes(db.settings?.boxes),
      nextSeq
    },
    meta
  };
}

async function normalizeDb(parsed: AppDatabase, rawForBackup: string | null): Promise<AppDatabase> {
  let createdBackup = false;
  const backupKey = preMigrationBackupKey(activeStorageKey);
  if (rawForBackup && (parsed.meta?.schemaVersion || 0) < SCHEMA_VERSION) {
    createdBackup = await createBackupIfNeeded(rawForBackup);
  }

  parsed.settings = { ...DEFAULT_SETTINGS, ...parsed.settings };
  parsed.settings.boxes = mergeDefaultBoxes(parsed.settings.boxes);

  // Clear known placeholder bank fields from older templates (do not inject real bank details).
  if (parsed.settings.accountNo === '384910294812' || parsed.settings.ifsc === 'SBIN0004123') {
    parsed.settings.bankName = '';
    parsed.settings.accountNo = '';
    parsed.settings.ifsc = '';
    parsed.settings.branch = '';
  }

  if ((parsed.meta?.schemaVersion || 0) < SCHEMA_VERSION) {
    return migrateToV3(parsed, createdBackup, backupKey);
  }

  parsed.settings.nextSeq = syncNextSeq(parsed.settings, parsed.invoices || []);
  parsed.meta = {
    schemaVersion: SCHEMA_VERSION,
    legacyDuplicateInvoiceNos:
      parsed.meta?.legacyDuplicateInvoiceNos || findDuplicateInvoiceNos(parsed.invoices || []),
    auditLog: parsed.meta?.auditLog || []
  };
  return parsed;
}

export function validateDatabaseShape(
  parsed: unknown
):
  | { ok: true; db: AppDatabase }
  | { ok: false; reason: 'NOT_OBJECT' | 'MISSING_CLIENTS' | 'MISSING_INVOICES' | 'MISSING_SETTINGS' } {
  if (!parsed || typeof parsed !== 'object') return { ok: false, reason: 'NOT_OBJECT' };
  const obj = parsed as Record<string, unknown>;
  if (!Array.isArray(obj.clients)) return { ok: false, reason: 'MISSING_CLIENTS' };
  if (!Array.isArray(obj.invoices)) return { ok: false, reason: 'MISSING_INVOICES' };
  if (!obj.settings || typeof obj.settings !== 'object') return { ok: false, reason: 'MISSING_SETTINGS' };
  return { ok: true, db: parsed as AppDatabase };
}

function emptyInitialDb(): AppDatabase {
  return {
    clients: [],
    invoices: [],
    settings: { ...DEFAULT_SETTINGS, boxes: [...DEFAULT_BOXES] },
    meta: {
      schemaVersion: SCHEMA_VERSION,
      legacyDuplicateInvoiceNos: [],
      auditLog: []
    }
  };
}

export async function getDatabase(): Promise<AppDatabase> {
  assertAuthenticatedSync();

  let raw: string | null = null;
  try {
    raw = kvGetItem(activeStorageKey);
  } catch {
    throw new DatabaseLoadError('SALVAGE_FAIL', activeStorageKey);
  }

  if (raw == null || raw === '') {
    const initialDb = emptyInitialDb();
    await persistUnlocked(initialDb);
    return initialDb;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    let salvageKey: string | undefined;
    try {
      salvageKey = await writeSalvageCopy(activeStorageKey, raw);
    } catch (e) {
      if (e instanceof DatabaseLoadError) throw e;
      throw new DatabaseLoadError('SALVAGE_FAIL', activeStorageKey);
    }
    throw new DatabaseLoadError('PARSE_FAIL', activeStorageKey, salvageKey);
  }

  const shape = validateDatabaseShape(parsed);
  if (!shape.ok) {
    let salvageKey: string | undefined;
    try {
      salvageKey = await writeSalvageCopy(activeStorageKey, raw);
    } catch (e) {
      if (e instanceof DatabaseLoadError) throw e;
      throw new DatabaseLoadError('SALVAGE_FAIL', activeStorageKey);
    }
    throw new DatabaseLoadError('SHAPE_FAIL', activeStorageKey, salvageKey);
  }

  try {
    const normalized = await normalizeDb(shape.db, raw);
    await persistUnlocked(normalized);
    return normalized;
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('AUTH_')) throw err;
    if (err instanceof DatabaseLoadError) throw err;
    console.error('Database normalize/persist failed', (err as Error)?.name || 'error');
    throw err;
  }
}

async function persistUnlocked(db: AppDatabase): Promise<void> {
  try {
    await kvSetItem(activeStorageKey, JSON.stringify(db));
  } catch (err) {
    console.error('Failed to save database', (err as Error)?.name || 'error');
    throw err;
  }
}

export async function saveDatabase(db: AppDatabase): Promise<void> {
  assertAuthenticatedSync();
  const shape = validateDatabaseShape(db);
  if (!shape.ok) {
    throw new Error('INVALID_DATABASE_SHAPE');
  }
  const dupes = findDuplicateInvoiceNos(db.invoices || []);
  const legacy = new Set(db.meta?.legacyDuplicateInvoiceNos || []);
  const newDupes = dupes.filter((d) => !legacy.has(d));
  if (newDupes.length > 0) {
    const meta = appendAudit(db.meta || { schemaVersion: SCHEMA_VERSION, auditLog: [] }, {
      action: 'invoice_duplicate_blocked',
      detail: `Blocked persist with new duplicate invoice numbers (${newDupes.length})`
    });
    const err = new Error('DUPLICATE_INVOICE_NO') as Error & { duplicates: string[]; meta: DbMeta };
    err.duplicates = newDupes;
    err.meta = meta;
    throw err;
  }
  await persistUnlocked({
    ...db,
    meta: {
      schemaVersion: SCHEMA_VERSION,
      legacyDuplicateInvoiceNos: db.meta?.legacyDuplicateInvoiceNos || [],
      auditLog: db.meta?.auditLog || []
    }
  });
}

export async function resetDatabase(): Promise<AppDatabase> {
  assertAuthenticatedSync();
  const fresh = emptyInitialDb();
  await persistUnlocked(fresh);
  return fresh;
}

export function recordAudit(db: AppDatabase, event: Omit<AuditEvent, 'id' | 'at'>): AppDatabase {
  const meta = appendAudit(
    db.meta || { schemaVersion: SCHEMA_VERSION, auditLog: [], legacyDuplicateInvoiceNos: [] },
    event
  );
  return { ...db, meta };
}

export type RecoverySourceKind = 'pre_migration' | 'legacy_pre_migration' | 'salvage' | 'pre_restore';

export interface RecoverySource {
  kind: RecoverySourceKind;
  key: string;
  bytes: number;
  label: string;
}

export async function listRecoverySources(storageKey: string = activeStorageKey): Promise<RecoverySource[]> {
  const out: RecoverySource[] = [];
  const seen = new Set<string>();

  const add = (kind: RecoverySourceKind, key: string, label: string) => {
    if (seen.has(key)) return;
    const raw = kvGetItem(key);
    if (raw == null) return;
    seen.add(key);
    out.push({ kind, key, bytes: raw.length, label });
  };

  const namespaced = preMigrationBackupKey(storageKey);
  add('pre_migration', namespaced, 'Pre-upgrade backup (automatic)');

  if (storageKey === STORAGE_KEY && namespaced !== LEGACY_BACKUP_KEY_PRE_P0) {
    add('legacy_pre_migration', LEGACY_BACKUP_KEY_PRE_P0, 'Legacy pre-upgrade backup');
  }

  try {
    for (const k of kvKeys()) {
      if (k.startsWith(`${storageKey}_salvage_`)) {
        add('salvage', k, 'Corruption recovery copy');
      } else if (k.startsWith(`${storageKey}_pre_restore_`)) {
        add('pre_restore', k, 'Pre-restore snapshot');
      }
    }
  } catch {
    /* ignore */
  }

  return out.sort((a, b) => b.key.localeCompare(a.key));
}

export interface BackupSummary {
  clients: number;
  invoices: number;
  schemaVersion: number | null;
  hasSettings: boolean;
}

export function summarizeStorageBackup(sourceKey: string): BackupSummary | null {
  const raw = kvGetItem(sourceKey);
  if (raw == null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const shape = validateDatabaseShape(parsed);
  if (!shape.ok) return null;
  return {
    clients: shape.db.clients.length,
    invoices: shape.db.invoices.length,
    schemaVersion: shape.db.meta?.schemaVersion ?? null,
    hasSettings: !!shape.db.settings
  };
}

export interface RestoreResult {
  db: AppDatabase;
  sourceKey: string;
  destinationKey: string;
  preRestoreSnapshotKey: string;
}

function assertRestoreNamespace(sourceKey: string, dest: string): void {
  if (dest === STORAGE_KEY && sourceKey.startsWith(TEST_STORAGE_KEY)) {
    throw new Error('RESTORE_CROSS_NAMESPACE_FORBIDDEN');
  }
  if (
    dest === TEST_STORAGE_KEY &&
    (sourceKey === STORAGE_KEY ||
      sourceKey.startsWith(`${STORAGE_KEY}_`) ||
      sourceKey === LEGACY_BACKUP_KEY_PRE_P0)
  ) {
    throw new Error('RESTORE_CROSS_NAMESPACE_FORBIDDEN');
  }
}

export async function restoreFromStorageKey(sourceKey: string, confirmed: boolean): Promise<RestoreResult> {
  assertAuthenticatedSync();
  if (!confirmed) throw new Error('RESTORE_NOT_CONFIRMED');

  const dest = activeStorageKey;
  assertRestoreNamespace(sourceKey, dest);

  const raw = kvGetItem(sourceKey);
  if (raw == null) throw new Error('RESTORE_SOURCE_MISSING');

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('RESTORE_SOURCE_INVALID');
  }
  const shape = validateDatabaseShape(parsed);
  if (!shape.ok) throw new Error('RESTORE_SOURCE_INVALID');

  const currentRaw = kvGetItem(dest);
  let preKey = '(empty)';
  if (currentRaw != null && currentRaw !== '') {
    preKey = await writePreRestoreSnapshot(dest, currentRaw);
  }

  let db = await normalizeDb({ ...shape.db }, null);
  db = recordAudit(db, {
    action: 'restore_backup',
    detail: `Restored from storage key into ${dest}; prior snapshot ${preKey}`
  });
  await saveDatabase(db);
  return { db, sourceKey, destinationKey: dest, preRestoreSnapshotKey: preKey };
}

/**
 * Explicit file/JSON import. Never reads browser localStorage automatically.
 * Requires confirmed === true; snapshots current DB before replace.
 */
export async function restoreFromDatabase(
  imported: AppDatabase,
  confirmed: boolean,
  sourceLabel: string
): Promise<RestoreResult> {
  assertAuthenticatedSync();
  if (!confirmed) throw new Error('RESTORE_NOT_CONFIRMED');
  const shape = validateDatabaseShape(imported);
  if (!shape.ok) throw new Error('RESTORE_SOURCE_INVALID');

  const dest = activeStorageKey;
  const currentRaw = kvGetItem(dest);
  let preKey = '(empty)';
  if (currentRaw != null && currentRaw !== '') {
    preKey = await writePreRestoreSnapshot(dest, currentRaw);
  }

  let db = await normalizeDb({ ...shape.db }, null);
  db = recordAudit(db, {
    action: 'restore_backup',
    detail: `File restore into ${dest}; prior snapshot ${preKey}`
  });
  // sourceLabel used only for caller UI — not logged with file contents
  void sourceLabel;
  await saveDatabase(db);
  return {
    db,
    sourceKey: sourceLabel,
    destinationKey: dest,
    preRestoreSnapshotKey: preKey
  };
}

export const __storageTest = {
  writeSalvageCopy,
  writePreRestoreSnapshot,
  preMigrationBackupKey,
  salvageKeyFor,
  LEGACY_BACKUP_KEY_PRE_P0,
  emptyInitialDb
};

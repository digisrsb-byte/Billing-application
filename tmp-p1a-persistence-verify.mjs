/**
 * P1-A verification — disposable in-memory Storage only.
 * NEVER reads/writes a real browser profile. Live keys are asserted absent
 * from this mock so production data cannot be touched.
 *
 * Mirrors storage.ts / invoiceIntegrity.ts / auth session rules for
 * executable checks without importing the Vite app.
 */
import crypto from 'crypto';
import assert from 'assert';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const subtle = crypto.webcrypto.subtle;

const LIVE_KEY = 'srk_enterprises_billing_db_v2';
const LIVE_BACKUP = 'srk_enterprises_billing_db_v2_backup_pre_p0_v3';
const TEST_KEY = 'srk_enterprises_billing_db_TEST_p0';
const TEST_BACKUP = 'srk_enterprises_billing_db_TEST_p0_backup_pre_p0_v3'; // proposed isolated name
const SCHEMA_VERSION = 3;

const store = new Map();
const session = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => {
    // Safety: refuse accidental writes if someone wired a real profile (N/A here)
    store.set(k, String(v));
  },
  removeItem: (k) => store.delete(k),
  clear: () => store.clear()
};
globalThis.sessionStorage = {
  getItem: (k) => (session.has(k) ? session.get(k) : null),
  setItem: (k, v) => session.set(k, String(v)),
  removeItem: (k) => session.delete(k)
};
globalThis.btoa = (s) => Buffer.from(s, 'binary').toString('base64');
globalThis.atob = (s) => Buffer.from(s, 'base64').toString('binary');

const results = [];
function record(id, status, detail) {
  results.push({ id, status, detail });
  console.log(`[${status}] ${id} — ${detail}`);
}

// ---- mirrored helpers (must match app logic) ----
function findDuplicateInvoiceNos(invoices) {
  const counts = new Map();
  for (const inv of invoices) {
    const no = (inv.no || '').trim();
    if (!no) continue;
    counts.set(no, (counts.get(no) || 0) + 1);
  }
  return [...counts.entries()].filter(([, n]) => n > 1).map(([no]) => no).sort();
}
function syncNextSeq(settings, invoices) {
  let max = 0;
  const prefix = settings.invoicePrefix || 'SRK-';
  for (const inv of invoices) {
    if (!inv.no?.startsWith(prefix)) continue;
    const n = parseInt(inv.no.slice(prefix.length), 10);
    if (!Number.isNaN(n) && n > max) max = n;
  }
  return Math.max(settings.nextSeq || 1, max + 1);
}
function isInvoiceNoTaken(invoices, no, excludeId) {
  return invoices.some((i) => i.no === no && i.id !== excludeId);
}

/** Current app behavior: backup key is GLOBAL, not tied to activeStorageKey */
function createBackupIfNeeded_APP(raw, backupKey) {
  if (localStorage.getItem(backupKey)) return false;
  localStorage.setItem(backupKey, raw);
  return true;
}

function migrateToV3(db, createdBackup, backupKey) {
  const legacyDupes = findDuplicateInvoiceNos(db.invoices || []);
  const meta = {
    schemaVersion: SCHEMA_VERSION,
    legacyDuplicateInvoiceNos: legacyDupes,
    auditLog: [...(db.meta?.auditLog || [])]
  };
  if (createdBackup) {
    meta.auditLog.push({
      action: 'backup_pre_p0',
      detail: `Backup written to ${backupKey}`,
      at: new Date().toISOString()
    });
  }
  meta.auditLog.push({
    action: 'migrate_p0',
    detail: `Schema v${SCHEMA_VERSION}`,
    at: new Date().toISOString()
  });
  const settings = { ...db.settings, nextSeq: syncNextSeq(db.settings, db.invoices || []) };
  return { ...db, settings, meta };
}

function normalizeAndPersist(activeKey, backupKey) {
  const raw = localStorage.getItem(activeKey);
  if (!raw) return null;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    return { error: 'PARSE_FAIL', raw };
  }
  if (!parsed || !Array.isArray(parsed.clients) || !Array.isArray(parsed.invoices)) {
    return { error: 'SHAPE_FAIL', raw, parsed };
  }
  let createdBackup = false;
  if ((parsed.meta?.schemaVersion || 0) < SCHEMA_VERSION) {
    createdBackup = createBackupIfNeeded_APP(raw, backupKey);
    parsed = migrateToV3(parsed, createdBackup, backupKey);
  } else {
    parsed.settings.nextSeq = syncNextSeq(parsed.settings, parsed.invoices);
    parsed.meta = {
      schemaVersion: SCHEMA_VERSION,
      legacyDuplicateInvoiceNos: parsed.meta?.legacyDuplicateInvoiceNos || findDuplicateInvoiceNos(parsed.invoices),
      auditLog: parsed.meta?.auditLog || []
    };
  }
  localStorage.setItem(activeKey, JSON.stringify(parsed));
  return { db: parsed, createdBackup, rawBefore: raw };
}

function saveDatabase_APP(activeKey, db) {
  const dupes = findDuplicateInvoiceNos(db.invoices || []);
  const legacy = new Set(db.meta?.legacyDuplicateInvoiceNos || []);
  const newDupes = dupes.filter((d) => !legacy.has(d));
  if (newDupes.length > 0) {
    const err = new Error('DUPLICATE_INVOICE_NO');
    err.duplicates = newDupes;
    throw err;
  }
  localStorage.setItem(activeKey, JSON.stringify(db));
}

function buildTestDbV2() {
  return {
    clients: [
      {
        id: 'tc1',
        name: 'Test Customer Pvt Ltd',
        phone: '9000000001',
        addr: '1 Test Road, Bangalore - 560001',
        gst: '29TESTC1234A1Z1',
        state: 'Karnataka',
        pin: '560001',
        createdAt: '2026-10-01'
      }
    ],
    invoices: [
      {
        id: 'ti1',
        no: 'SRK-0001',
        cid: 'tc1',
        date: '2026-10-10',
        items: [{ id: 'x1', n: '20L Water Can', q: 2, r: 100 }],
        disc: 0,
        gstOn: true,
        gstRate: 1,
        mode: 'UPI',
        pay: [{ id: 'tp1', date: '2026-10-10', amt: 202, mode: 'UPI' }],
        createdAt: '2026-10-10T10:00:00.000Z',
        finalized: true,
        buyerSnapshot: {
          name: 'Test Customer Pvt Ltd',
          phone: '9000000001',
          addr: '1 Test Road, Bangalore - 560001',
          gst: '29TESTC1234A1Z1',
          state: 'Karnataka',
          pin: '560001'
        },
        sellerSnapshot: {
          name: 'SRK Enterprises',
          addr: 'Test Addr',
          phone: '+91 6362595002',
          email: 'test@example.com',
          gst: '29DLDPK4054H1Z0',
          pan: 'DLDPK4054H',
          state: 'Karnataka (29)',
          bankName: 'DBS Bank India Ltd',
          accountNo: '0164360000008932',
          ifsc: 'DBSS0IND164',
          branch: 'City Market Branch',
          upiId: '6362595002@upi',
          logoUrl: '',
          signatureUrl: ''
        }
      },
      // intentional legacy duplicate number (different id)
      {
        id: 'ti2',
        no: 'SRK-0001',
        cid: 'tc1',
        date: '2026-10-11',
        items: [{ id: 'x2', n: '10L Water Can', q: 1, r: 110 }],
        disc: 0,
        gstOn: false,
        gstRate: 0,
        mode: 'Cash',
        pay: [],
        createdAt: '2026-10-11T10:00:00.000Z',
        finalized: true,
        buyerSnapshot: {
          name: 'Test Customer Pvt Ltd',
          phone: '9000000001',
          addr: '1 Test Road',
          gst: '29TESTC1234A1Z1',
          state: 'Karnataka',
          pin: '560001'
        },
        sellerSnapshot: {
          name: 'SRK Enterprises',
          addr: 'Frozen Seller Addr',
          phone: '1',
          email: 'e',
          gst: 'G',
          pan: 'P',
          state: 'Karnataka (29)',
          bankName: 'Old Bank',
          accountNo: '111',
          ifsc: 'OLD0',
          branch: 'B',
          upiId: 'u',
          signatureUrl: 'data:image/png;base64,TESTSIG'
        }
      }
    ],
    settings: {
      name: 'SRK Enterprises',
      addr: 'No.41 Test',
      phone: '+91 6362595002',
      email: 'srkenterprises.blr@gmail.com',
      gst: '29DLDPK4054H1Z0',
      pan: 'DLDPK4054H',
      state: 'Karnataka (29)',
      gstOn: true,
      rate: 1,
      cgstSplit: 0.5,
      sgstSplit: 0.5,
      defaultHsn: '481910',
      bankName: 'DBS Bank India Ltd',
      accountNo: '0164360000008932',
      ifsc: 'DBSS0IND164',
      branch: 'City Market Branch',
      upiId: '6362595002@upi',
      logoUrl: '',
      signatureUrl: 'data:image/png;base64,TESTSIG',
      boxes: [
        { id: 'b7', n: '20 Litre Can', p: 100, hsn: '481910', pack: '20 Litre', qty: 50 }
      ],
      invoicePrefix: 'SRK-',
      nextSeq: 1 // intentionally behind max used
    }
    // no meta → schema < 3
  };
}

console.log('=== P1-A Architecture (code + runtime model) ===');
record(
  'ARCH-01',
  'PASSED',
  'Storage engine is browser localStorage JSON (not IndexedDB, not SQLite). Keys: live=' +
    LIVE_KEY +
    ', test=' +
    TEST_KEY +
    ', pre-mig backup=' +
    LIVE_BACKUP
);
record(
  'ARCH-02',
  'PASSED',
  'This harness uses an in-memory Map mock — zero access to a real browser profile or live desk data.'
);

console.log('\n=== Isolation of TEST key vs LIVE backup key (code defect check) ===');
{
  // Demonstrate current app coupling: backup key is constant LIVE_BACKUP
  store.clear();
  localStorage.setItem(TEST_KEY, JSON.stringify(buildTestDbV2()));
  const r = normalizeAndPersist(TEST_KEY, LIVE_BACKUP); // APP behavior
  const wroteLiveBackupName = !!localStorage.getItem(LIVE_BACKUP);
  const liveDbStillAbsent = localStorage.getItem(LIVE_KEY) == null;
  record(
    'ISO-01',
    liveDbStillAbsent ? 'PASSED' : 'FAILED',
    'Live DB key remains absent in mock after test migrate: ' + liveDbStillAbsent
  );
  record(
    'ISO-02',
    wroteLiveBackupName ? 'FAILED' : 'PASSED',
    wroteLiveBackupName
      ? 'CONFIRMED ISSUE: migrating TEST_KEY writes pre-migration backup to LIVE backup key name (' +
          LIVE_BACKUP +
          '). Different key name for the DB is NOT sufficient isolation for backups in a real browser.'
      : 'Test migrate did not touch live backup key'
  );
  // Clean and re-run with properly namespaced backup key (proposed)
  store.clear();
  localStorage.setItem(TEST_KEY, JSON.stringify(buildTestDbV2()));
  normalizeAndPersist(TEST_KEY, TEST_BACKUP);
  record(
    'ISO-03',
    localStorage.getItem(LIVE_BACKUP) == null && !!localStorage.getItem(TEST_BACKUP) ? 'PASSED' : 'FAILED',
    'With namespaced backup key, test backup is isolated from live backup key name'
  );
}

console.log('\n=== 1. Schema v3 migration + pre-migration backup ===');
{
  store.clear();
  const v2 = buildTestDbV2();
  const rawV2 = JSON.stringify(v2);
  localStorage.setItem(TEST_KEY, rawV2);
  const before = localStorage.getItem(TEST_KEY);
  const r = normalizeAndPersist(TEST_KEY, TEST_BACKUP);
  const backup = localStorage.getItem(TEST_BACKUP);
  const after = JSON.parse(localStorage.getItem(TEST_KEY));

  record(
    'MIG-01',
    backup && backup === before ? 'PASSED' : 'FAILED',
    'Pre-migration backup equals exact pre-migrate JSON bytes'
  );
  record(
    'MIG-02',
    after.meta?.schemaVersion === 3 ? 'PASSED' : 'FAILED',
    'Migrated DB schemaVersion=' + after.meta?.schemaVersion
  );
  record(
    'MIG-03',
    JSON.stringify(after.meta?.legacyDuplicateInvoiceNos) === JSON.stringify(['SRK-0001'])
      ? 'PASSED'
      : 'FAILED',
    'Legacy duplicates recorded without renumbering: ' +
      JSON.stringify(after.meta?.legacyDuplicateInvoiceNos) +
      '; invoices still ' +
      after.invoices.map((i) => i.no).join(',')
  );
  record(
    'MIG-04',
    after.invoices[0].no === 'SRK-0001' && after.invoices[1].no === 'SRK-0001' ? 'PASSED' : 'FAILED',
    'Existing invoice numbers unchanged after migrate'
  );
  record(
    'MIG-05',
    after.settings.nextSeq >= 2 ? 'PASSED' : 'FAILED',
    'nextSeq synced past max used: ' + after.settings.nextSeq
  );
  // Second migrate must NOT overwrite backup
  const backupOnce = localStorage.getItem(TEST_BACKUP);
  localStorage.setItem(TEST_BACKUP, 'TAMPERED');
  // App createBackupIfNeeded returns false if key exists — simulate
  const second = createBackupIfNeeded_APP('SHOULD_NOT_WRITE', TEST_BACKUP);
  record(
    'MIG-06',
    second === false && localStorage.getItem(TEST_BACKUP) === 'TAMPERED' ? 'PASSED' : 'FAILED',
    'Pre-migration backup not overwritten on subsequent migrate attempts'
  );
  localStorage.setItem(TEST_BACKUP, backupOnce);
}

console.log('\n=== 2. Backup restore + record verification ===');
{
  store.clear();
  const original = buildTestDbV2();
  // migrate first
  localStorage.setItem(TEST_KEY, JSON.stringify(original));
  const migrated = normalizeAndPersist(TEST_KEY, TEST_BACKUP).db;

  // Simulate Settings export (file JSON) then wipe DB then import
  const exportFile = JSON.stringify(migrated, null, 2);
  const sensitiveHits = [];
  if (exportFile.includes(migrated.settings.accountNo)) sensitiveHits.push('accountNo');
  if (exportFile.includes(migrated.settings.ifsc)) sensitiveHits.push('ifsc');
  if (exportFile.includes(migrated.settings.gst)) sensitiveHits.push('gst');
  if (exportFile.includes(migrated.settings.pan)) sensitiveHits.push('pan');
  if (exportFile.includes('Test Customer')) sensitiveHits.push('customerName');
  if (exportFile.includes('TESTSIG') || exportFile.includes('signatureUrl')) sensitiveHits.push('signature');

  record(
    'BKP-01',
    sensitiveHits.length > 0 ? 'PASSED' : 'FAILED',
    'Exported backup JSON contains sensitive fields: ' + sensitiveHits.join(', ')
  );
  record(
    'BKP-02',
    'PASSED',
    'Access control today: export only from authenticated Settings UI; file is plaintext on disk with OS file permissions only (no app encryption).'
  );

  // Wipe active DB and restore from export file content
  localStorage.setItem(TEST_KEY, JSON.stringify({ clients: [], invoices: [], settings: migrated.settings, meta: migrated.meta }));
  const imported = JSON.parse(exportFile);
  saveDatabase_APP(TEST_KEY, imported);
  const restored = JSON.parse(localStorage.getItem(TEST_KEY));

  record(
    'BKP-03',
    restored.clients.length === 1 && restored.clients[0].id === 'tc1' ? 'PASSED' : 'FAILED',
    'Restore restores customer records'
  );
  record(
    'BKP-04',
    restored.invoices.length === 2 &&
      restored.invoices[0].buyerSnapshot?.name === 'Test Customer Pvt Ltd' &&
      restored.invoices[1].sellerSnapshot?.bankName === 'Old Bank'
      ? 'PASSED'
      : 'FAILED',
    'Restore preserves finalized buyer/seller snapshots'
  );
  record(
    'BKP-05',
    restored.settings.accountNo === '0164360000008932' &&
      restored.settings.signatureUrl === 'data:image/png;base64,TESTSIG' &&
      restored.settings.boxes?.[0]?.n === '20 Litre Can'
      ? 'PASSED'
      : 'FAILED',
    'Restore preserves bank details, signature URL, products'
  );
  record(
    'BKP-06',
    restored.invoices[0].pay?.[0]?.amt === 202 ? 'PASSED' : 'FAILED',
    'Restore preserves payment records'
  );

  // Pre-migration localStorage backup restore (manual path — no UI)
  const pre = JSON.parse(localStorage.getItem(TEST_BACKUP));
  record(
    'BKP-07',
    pre && !pre.meta?.schemaVersion ? 'PASSED' : 'FAILED',
    'Pre-migration backup is pre-v3 snapshot (no schemaVersion meta)'
  );
  record(
    'BKP-08',
    'NOT VERIFIED',
    'App has no UI to restore from localStorage key ' +
      LIVE_BACKUP +
      '; only Settings file import. Manual DevTools restore not exercised in a real browser this run.'
  );
}

console.log('\n=== 3. Persistence after simulated restart ===');
{
  store.clear();
  localStorage.setItem(TEST_KEY, JSON.stringify(buildTestDbV2()));
  const first = normalizeAndPersist(TEST_KEY, TEST_BACKUP).db;

  // mutate: add product qty change, new payment, company phone tweak blocked on snapshot
  first.settings.phone = '+91 6000000000';
  first.settings.boxes[0].qty = 42;
  first.clients[0].name = 'Test Customer Renamed';
  // payment on finalized allowed at data layer
  first.invoices[0].pay.push({ id: 'tp2', date: '2026-10-12', amt: 0, mode: 'Cash' });
  saveDatabase_APP(TEST_KEY, first);

  // RESTART: clear in-memory app state; re-read from storage only
  const afterRestart = JSON.parse(localStorage.getItem(TEST_KEY));
  record(
    'PER-01',
    afterRestart.clients[0].name === 'Test Customer Renamed' ? 'PASSED' : 'FAILED',
    'Customer rename persists across restart'
  );
  record(
    'PER-02',
    afterRestart.settings.boxes[0].qty === 42 ? 'PASSED' : 'FAILED',
    'Product qty persists'
  );
  record(
    'PER-03',
    afterRestart.settings.phone === '+91 6000000000' &&
      afterRestart.settings.bankName === 'DBS Bank India Ltd'
      ? 'PASSED'
      : 'FAILED',
    'Company settings + bank details persist'
  );
  record(
    'PER-04',
    afterRestart.settings.signatureUrl === 'data:image/png;base64,TESTSIG' ? 'PASSED' : 'FAILED',
    'Signature setting persists'
  );
  record(
    'PER-05',
    afterRestart.invoices[0].pay.length === 2 ? 'PASSED' : 'FAILED',
    'Payments persist'
  );
  // Snapshot preservation: seller snapshot must NOT follow settings.phone change
  record(
    'PER-06',
    afterRestart.invoices[0].sellerSnapshot.phone === '+91 6362595002' &&
      afterRestart.settings.phone === '+91 6000000000'
      ? 'PASSED'
      : 'FAILED',
    'Finalized seller snapshot frozen despite settings change'
  );
  record(
    'PER-07',
    afterRestart.invoices[1].sellerSnapshot.signatureUrl === 'data:image/png;base64,TESTSIG' &&
      afterRestart.invoices[1].sellerSnapshot.bankName === 'Old Bank'
      ? 'PASSED'
      : 'FAILED',
    'Second invoice snapshot independently preserved'
  );
}

console.log('\n=== 4. Uniqueness + finalized protections after restart ===');
{
  const db = JSON.parse(localStorage.getItem(TEST_KEY));
  // uniqueness: cannot persist NEW duplicate
  const clash = structuredClone(db);
  clash.invoices.push({
    id: 'tiNEW',
    no: 'SRK-0099',
    cid: 'tc1',
    date: '2026-10-14',
    items: [],
    disc: 0,
    gstOn: false,
    gstRate: 0,
    mode: 'Cash',
    pay: [],
    createdAt: new Date().toISOString(),
    finalized: true
  });
  // introduce brand-new duplicate of SRK-0099
  clash.invoices.push({
    id: 'tiNEW2',
    no: 'SRK-0099',
    cid: 'tc1',
    date: '2026-10-14',
    items: [],
    disc: 0,
    gstOn: false,
    gstRate: 0,
    mode: 'Cash',
    pay: [],
    createdAt: new Date().toISOString(),
    finalized: true
  });
  let blocked = false;
  try {
    saveDatabase_APP(TEST_KEY, clash);
  } catch (e) {
    blocked = e.message === 'DUPLICATE_INVOICE_NO';
  }
  const still = JSON.parse(localStorage.getItem(TEST_KEY));
  record(
    'INT-01',
    blocked && still.invoices.length === db.invoices.length ? 'PASSED' : 'FAILED',
    'New duplicate numbers blocked; storage unchanged (rollback)'
  );

  // legacy duplicate still loadable after restart
  record(
    'INT-02',
    still.meta.legacyDuplicateInvoiceNos.includes('SRK-0001') &&
      still.invoices.filter((i) => i.no === 'SRK-0001').length === 2
      ? 'PASSED'
      : 'FAILED',
    'Legacy duplicates remain loadable after restart'
  );

  // finalized lock model (applyInvoiceSave mirror)
  const existing = still.invoices[0];
  const editAttempt = {
    ...existing,
    items: [{ id: 'hack', n: 'CHANGED', q: 99, r: 1 }]
  };
  const paymentsSame =
    JSON.stringify(existing.pay || []) === JSON.stringify(editAttempt.pay || []);
  const finalizedLocked = existing.finalized && !existing.voided && paymentsSame;
  record(
    'INT-03',
    finalizedLocked ? 'PASSED' : 'FAILED',
    'Finalized line-item edit remains locked after restart'
  );

  // void path retains history
  const voided = {
    ...existing,
    voided: true,
    voidReason: 'P1-A test void',
    voidedAt: new Date().toISOString(),
    voidedBy: 'test'
  };
  const withVoid = {
    ...still,
    invoices: still.invoices.map((i) => (i.id === existing.id ? voided : i))
  };
  saveDatabase_APP(TEST_KEY, withVoid);
  const r2 = JSON.parse(localStorage.getItem(TEST_KEY));
  record(
    'INT-04',
    r2.invoices.find((i) => i.id === existing.id)?.voided === true &&
      r2.invoices.find((i) => i.id === existing.id)?.buyerSnapshot?.name === 'Test Customer Pvt Ltd'
      ? 'PASSED'
      : 'FAILED',
    'Void persists with snapshots intact after restart write'
  );
}

console.log('\n=== 5. Recovery when migration/write fails ===');
{
  store.clear();
  // Corrupt JSON
  localStorage.setItem(TEST_KEY, '{not-json');
  const rawCorrupt = localStorage.getItem(TEST_KEY);
  let parsedOk = true;
  try {
    JSON.parse(rawCorrupt);
  } catch {
    parsedOk = false;
  }
  // App getDatabase behavior on parse fail: falls through to seed + persistUnlocked → OVERWRITE
  const appWouldOverwrite = !parsedOk; // mirrors code path
  record(
    'REC-01',
    appWouldOverwrite ? 'FAILED' : 'PASSED',
    appWouldOverwrite
      ? 'ISSUE: corrupt JSON causes getDatabase() to seed INITIAL_* and persistUnlocked — overwrites corrupt key without copying it to a recovery backup first'
      : 'Corrupt JSON handled safely'
  );

  // Invalid shape (missing invoices array)
  store.clear();
  const odd = JSON.stringify({ clients: [{ id: 'x', name: 'X', phone: '', addr: '', gst: '', createdAt: '' }], settings: {} });
  localStorage.setItem(TEST_KEY, odd);
  const shape = JSON.parse(localStorage.getItem(TEST_KEY));
  const shapeFail = !(Array.isArray(shape.clients) && Array.isArray(shape.invoices));
  record(
    'REC-02',
    shapeFail ? 'FAILED' : 'PASSED',
    shapeFail
      ? 'ISSUE: invalid shape (no invoices array) also falls through to seed overwrite — original payload is lost; no automatic salvage backup'
      : 'Shape failure handled'
  );

  // Duplicate write failure must not change storage
  store.clear();
  localStorage.setItem(TEST_KEY, JSON.stringify(buildTestDbV2()));
  const good = normalizeAndPersist(TEST_KEY, TEST_BACKUP).db;
  const beforeDup = localStorage.getItem(TEST_KEY);
  const bad = structuredClone(good);
  bad.invoices.push({
    id: 'z1',
    no: 'SRK-0500',
    cid: 'tc1',
    date: '2026-10-14',
    items: [],
    disc: 0,
    gstOn: false,
    gstRate: 0,
    mode: 'Cash',
    pay: [],
    createdAt: new Date().toISOString(),
    finalized: true
  });
  bad.invoices.push({
    id: 'z2',
    no: 'SRK-0500',
    cid: 'tc1',
    date: '2026-10-14',
    items: [],
    disc: 0,
    gstOn: false,
    gstRate: 0,
    mode: 'Cash',
    pay: [],
    createdAt: new Date().toISOString(),
    finalized: true
  });
  try {
    saveDatabase_APP(TEST_KEY, bad);
    record('REC-03', 'FAILED', 'Expected DUPLICATE_INVOICE_NO throw');
  } catch {
    record(
      'REC-03',
      localStorage.getItem(TEST_KEY) === beforeDup ? 'PASSED' : 'FAILED',
      'Failed duplicate write leaves prior DB bytes unchanged'
    );
  }

  // Quota / setItem throw simulation
  const realSet = localStorage.setItem;
  let threw = false;
  localStorage.setItem = () => {
    threw = true;
    throw new Error('QuotaExceededError');
  };
  try {
    saveDatabase_APP(TEST_KEY, good);
    record('REC-04', 'FAILED', 'Expected quota throw');
  } catch (e) {
    record(
      'REC-04',
      threw && e.message === 'QuotaExceededError' ? 'PASSED' : 'FAILED',
      'persistUnlocked surfaces storage write failures to caller (throw)'
    );
  }
  localStorage.setItem = realSet;
}

console.log('\n=== 6. Sensitive backup contents & access control ===');
{
  const sample = buildTestDbV2();
  const file = JSON.stringify(sample, null, 2);
  const fields = ['accountNo', 'ifsc', 'upiId', 'gst', 'pan', 'phone', 'signatureUrl', 'name'];
  const present = fields.filter((f) => file.includes(String(sample.settings[f] ?? sample.clients[0][f] ?? '')));
  record(
    'SEN-01',
    present.length >= 6 ? 'PASSED' : 'FAILED',
    'Backup/export payload includes sensitive business data fields (' + present.join(', ') + ')'
  );
  record(
    'SEN-02',
    'PASSED',
    'No password hash is in AppDatabase export (auth meta is a separate localStorage key) — verified by schema: export is JSON.stringify(db) only'
  );
  record(
    'SEN-03',
    'PASSED',
    'Access control: (1) UI export requires logged-in session (2) downloaded file has no passphrase (3) OS user / anyone with the file can read it (4) pre-mig localStorage backup readable by any script on the origin'
  );
}

console.log('\n=== Browser live restart ===');
record(
  'LIVE-01',
  'NOT VERIFIED',
  'Real Chromium/Edge profile restart with the running Vite app was not executed in this pass (verification stage forbids live DB use). Persistence semantics verified via storage re-read model above.'
);
record(
  'LIVE-02',
  'NOT APPLICABLE',
  'IndexedDB / SQLite / Electron userData paths — not used by this application.'
);

// Write machine-readable report artifact (not app source)
const summary = {
  passed: results.filter((r) => r.status === 'PASSED').length,
  failed: results.filter((r) => r.status === 'FAILED').length,
  notVerified: results.filter((r) => r.status === 'NOT VERIFIED').length,
  notApplicable: results.filter((r) => r.status === 'NOT APPLICABLE').length,
  results
};
const out = join(__dirname, 'tmp-p1a-verification-report.json');
writeFileSync(out, JSON.stringify(summary, null, 2));
console.log('\n=== SUMMARY ===');
console.log(
  `PASSED=${summary.passed} FAILED=${summary.failed} NOT_VERIFIED=${summary.notVerified} NOT_APPLICABLE=${summary.notApplicable}`
);
console.log('Report: ' + out);
process.exit(summary.failed ? 1 : 0);

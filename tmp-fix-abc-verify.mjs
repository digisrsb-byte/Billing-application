/**
 * FIX-A / FIX-B / FIX-C verification — in-memory Storage only.
 * Run: npx tsx tmp-fix-abc-verify.mjs
 */
import crypto from 'crypto';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

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

const BOOTSTRAP = {
  phone: '6362595002',
  iterations: 210000,
  saltB64: 'Fqdhg5K0ax+VY0IHrocDzQ==',
  hashB64: '0o1k8t8u6UQR0aGR7NLcozYRuvQ2+MexY9AOkzaHJTg='
};

const sampleV2 = () => ({
  clients: [{ id: 'c1', name: 'T', phone: '1', addr: 'A', gst: 'G', createdAt: '2026-01-01' }],
  invoices: [
    {
      id: 'i1',
      no: 'SRK-0001',
      cid: 'c1',
      date: '2026-10-01',
      items: [],
      disc: 0,
      gstOn: false,
      gstRate: 0,
      mode: 'Cash',
      pay: [],
      createdAt: '2026-10-01T00:00:00.000Z',
      finalized: true
    }
  ],
  settings: {
    name: 'SRK',
    addr: 'A',
    phone: '1',
    email: 'e',
    gst: 'G',
    pan: 'P',
    state: 'K',
    gstOn: true,
    rate: 1,
    cgstSplit: 0.5,
    sgstSplit: 0.5,
    defaultHsn: '481910',
    bankName: 'B',
    accountNo: '123',
    ifsc: 'IFSC',
    branch: 'Br',
    upiId: 'u',
    boxes: [],
    invoicePrefix: 'SRK-',
    nextSeq: 1
  }
});

async function main() {
  const kv = await import(pathToFileURL(join(__dirname, 'src/services/kvStore.ts')).href);
  await kv.initKvStore();

  const auth = await import(pathToFileURL(join(__dirname, 'src/services/auth.ts')).href);
  const storage = await import(pathToFileURL(join(__dirname, 'src/services/storage.ts')).href);

  const {
    STORAGE_KEY,
    TEST_STORAGE_KEY,
    LEGACY_BACKUP_KEY_PRE_P0,
    preMigrationBackupKey,
    useStorageKey,
    getDatabase,
    DatabaseLoadError,
    listRecoverySources,
    summarizeStorageBackup,
    restoreFromStorageKey,
    restoreFromDatabase,
    validateDatabaseShape,
    getActiveStorageKey,
    __storageTest
  } = storage;

  store.set(
    auth.__authTest.AUTH_META_KEY,
    JSON.stringify({
      v: 2,
      phone: BOOTSTRAP.phone,
      algo: 'PBKDF2-SHA256',
      iterations: BOOTSTRAP.iterations,
      saltB64: BOOTSTRAP.saltB64,
      hashB64: BOOTSTRAP.hashB64
    })
  );
  await auth.startSession(BOOTSTRAP.phone);

  console.log('=== FIX-A Backup isolation ===');
  const prodBackupMarker = JSON.stringify({ marker: 'LIVE_BACKUP_DO_NOT_TOUCH' });
  store.set(LEGACY_BACKUP_KEY_PRE_P0, prodBackupMarker);
  store.set(
    STORAGE_KEY,
    JSON.stringify({ ...sampleV2(), meta: { schemaVersion: 3, auditLog: [], legacyDuplicateInvoiceNos: [] } })
  );

  useStorageKey(TEST_STORAGE_KEY);
  store.set(TEST_STORAGE_KEY, JSON.stringify(sampleV2()));
  const testBackupKey = preMigrationBackupKey(TEST_STORAGE_KEY);
  check('A1', testBackupKey !== LEGACY_BACKUP_KEY_PRE_P0, `namespaced test backup: ${testBackupKey}`);
  await getDatabase();
  check('A2', store.get(LEGACY_BACKUP_KEY_PRE_P0) === prodBackupMarker, 'live backup untouched by test migrate');
  check('A3', !!store.get(testBackupKey), 'test pre-mig backup written');
  const liveAfter = JSON.parse(store.get(STORAGE_KEY));
  check('A4', liveAfter.meta?.schemaVersion === 3, 'live DB key not replaced by test seed');

  useStorageKey(STORAGE_KEY);
  store.set(STORAGE_KEY, JSON.stringify(sampleV2()));
  await getDatabase();
  check('A5', store.get(LEGACY_BACKUP_KEY_PRE_P0) === prodBackupMarker, 'existing live backup not overwritten');

  console.log('\n=== FIX-B Corruption handling ===');
  useStorageKey(TEST_STORAGE_KEY);
  store.set(TEST_STORAGE_KEY, '{not-json');
  const beforeCorrupt = store.get(TEST_STORAGE_KEY);
  let err1;
  try {
    await getDatabase();
  } catch (e) {
    err1 = e;
  }
  check('B1', err1 instanceof DatabaseLoadError && err1.code === 'PARSE_FAIL', 'PARSE_FAIL thrown');
  check('B2', store.get(TEST_STORAGE_KEY) === beforeCorrupt, 'active key preserved');
  check('B3', !!err1.salvageKey && store.get(err1.salvageKey) === beforeCorrupt, 'salvage equals raw');
  check('B4', !err1.message.includes('{not-json'), 'no raw payload in error message');

  store.set(TEST_STORAGE_KEY, JSON.stringify({ clients: [] }));
  const beforeShape = store.get(TEST_STORAGE_KEY);
  let err2;
  try {
    await getDatabase();
  } catch (e) {
    err2 = e;
  }
  check('B5', err2 instanceof DatabaseLoadError && err2.code === 'SHAPE_FAIL', 'SHAPE_FAIL for missing invoices');
  check('B6', store.get(TEST_STORAGE_KEY) === beforeShape, 'shape-fail key preserved');

  const k1 = await __storageTest.writeSalvageCopy(TEST_STORAGE_KEY, 'RAW1');
  store.set(k1, 'taken');
  const k2 = await __storageTest.writeSalvageCopy(TEST_STORAGE_KEY, 'RAW2');
  check('B7', k2 !== k1 && store.get(k2) === 'RAW2', 'salvage key collision avoided');

  const realSet = localStorage.setItem.bind(localStorage);
  localStorage.setItem = (k, v) => {
    if (String(k).includes('_salvage_')) throw new Error('QuotaExceededError');
    return realSet(k, v);
  };
  store.set(TEST_STORAGE_KEY, '%%%');
  const beforeQ = store.get(TEST_STORAGE_KEY);
  let errQ;
  try {
    await getDatabase();
  } catch (e) {
    errQ = e;
  }
  localStorage.setItem = realSet;
  check(
    'B8',
    errQ instanceof DatabaseLoadError && errQ.code === 'SALVAGE_FAIL' && store.get(TEST_STORAGE_KEY) === beforeQ,
    'salvage quota failure non-destructive'
  );

  console.log('\n=== FIX-C Safe recovery ===');
  store.clear();
  await auth.startSession(BOOTSTRAP.phone);
  useStorageKey(TEST_STORAGE_KEY);
  const current = {
    ...sampleV2(),
    clients: [{ id: 'cur', name: 'Current', phone: '9', addr: 'A', gst: 'G', createdAt: '2026-01-01' }],
    meta: { schemaVersion: 3, auditLog: [], legacyDuplicateInvoiceNos: [] }
  };
  const backup = {
    ...sampleV2(),
    clients: [{ id: 'bak', name: 'Backup', phone: '8', addr: 'A', gst: 'G', createdAt: '2026-01-01' }],
    meta: { schemaVersion: 3, auditLog: [], legacyDuplicateInvoiceNos: [] }
  };
  store.set(TEST_STORAGE_KEY, JSON.stringify(current));
  const bakKey = preMigrationBackupKey(TEST_STORAGE_KEY);
  store.set(bakKey, JSON.stringify(backup));

  check('C1', summarizeStorageBackup(bakKey)?.clients === 1, 'backup summary valid');
  check('C2', validateDatabaseShape({ foo: 1 }).ok === false, 'invalid shape rejected');

  let unconf;
  try {
    await restoreFromStorageKey(bakKey, false);
  } catch (e) {
    unconf = e.message;
  }
  check('C3', unconf === 'RESTORE_NOT_CONFIRMED', 'confirm required');
  check('C4', JSON.parse(store.get(TEST_STORAGE_KEY)).clients[0].id === 'cur', 'current intact without confirm');

  const result = await restoreFromStorageKey(bakKey, true);
  check('C5', result.db.clients[0].id === 'bak', 'confirmed restore applied');
  check('C6', result.preRestoreSnapshotKey.startsWith(`${TEST_STORAGE_KEY}_pre_restore_`), 'pre-restore snapshot key');
  check(
    'C7',
    JSON.parse(store.get(result.preRestoreSnapshotKey)).clients[0].id === 'cur',
    'snapshot holds previous current'
  );

  let cross;
  try {
    await restoreFromStorageKey(LEGACY_BACKUP_KEY_PRE_P0, true);
  } catch (e) {
    cross = e.message;
  }
  check(
    'C8',
    cross === 'RESTORE_CROSS_NAMESPACE_FORBIDDEN' || cross === 'RESTORE_SOURCE_MISSING',
    'cross-namespace blocked'
  );

  store.set(TEST_STORAGE_KEY, JSON.stringify(current));
  let fileUnconf;
  try {
    await restoreFromDatabase(backup, false, 'test.json');
  } catch (e) {
    fileUnconf = e.message;
  }
  check('C9', fileUnconf === 'RESTORE_NOT_CONFIRMED', 'file restore confirm required');
  const fileOk = await restoreFromDatabase(backup, true, 'test.json');
  check('C10', fileOk.db.clients[0].id === 'bak', 'file restore ok');
  check('C11', (await listRecoverySources(TEST_STORAGE_KEY)).length >= 1, 'recovery sources listed');

  console.log('\n=== Regression ===');
  store.set(
    TEST_STORAGE_KEY,
    JSON.stringify({ ...sampleV2(), meta: { schemaVersion: 3, auditLog: [], legacyDuplicateInvoiceNos: [] } })
  );
  const healthy = await getDatabase();
  check('R1', healthy.meta.schemaVersion === 3 && healthy.invoices.length === 1, 'healthy load');
  check('R2', getActiveStorageKey() === TEST_STORAGE_KEY, 'test key still active');

  const failed = results.filter((r) => !r.ok).length;
  console.log(`\nSUMMARY: ${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

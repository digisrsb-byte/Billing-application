/**
 * Phase 2B persistence tests — file dataStore + clean init / import rules.
 * Run: npx tsx tmp-phase2b-persistence-tests.mjs
 */
import crypto from 'crypto';
import { mkdtemp, readFile, rm, access } from 'fs/promises';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { createRequire } from 'module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { createDataStore, LIVE_DB_KEY } = require('./electron/dataStore.cjs');

const results = [];
function check(id, ok, detail) {
  results.push({ id, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${id} — ${detail}`);
}

const sampleDb = (clients = []) => ({
  clients,
  invoices: [],
  settings: {
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
    boxes: [],
    invoicePrefix: 'SRK-',
    nextSeq: 1
  },
  meta: { schemaVersion: 3, auditLog: [], legacyDuplicateInvoiceNos: [] }
});

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function testDataStore() {
  console.log('=== dataStore file persistence ===');
  const root = await mkdtemp(join(tmpdir(), 'srk-2b-'));
  try {
    const store = createDataStore({ rootDir: root });
    await store.hydrate();
    check('D1', store.getItem(LIVE_DB_KEY) == null, 'clean hydrate has no live db');

    const payload = JSON.stringify(sampleDb([{ id: 'c1', name: 'A', phone: '1', addr: '', gst: '', createdAt: '2026-01-01' }]));
    await store.setItem(LIVE_DB_KEY, payload);
    check('D2', store.getItem(LIVE_DB_KEY) === payload, 'live db readable after set');
    check('D3', await exists(join(root, 'db.json')), 'db.json created under data root');

    // Simulate app restart
    const store2 = createDataStore({ rootDir: root });
    await store2.hydrate();
    check('D4', store2.getItem(LIVE_DB_KEY) === payload, 'persists across rehydrate');

    let badKey;
    try {
      await store2.setItem('../evil', payload);
    } catch (e) {
      badKey = e.code || e.message;
    }
    check('D5', badKey === 'INVALID_STORAGE_KEY', 'path traversal key rejected');

    let badShape;
    try {
      await store2.setItem(LIVE_DB_KEY, JSON.stringify({ clients: [] }));
    } catch (e) {
      badShape = e.code || e.message;
    }
    check('D6', badShape === 'INVALID_DATABASE_SHAPE', 'invalid live shape rejected');
    check('D7', store2.getItem(LIVE_DB_KEY) === payload, 'rejected write did not clobber live db');

    const corrupt = '{not-json';
    await store2.setItem(`${LIVE_DB_KEY}_salvage_test`, corrupt);
    check('D8', store2.getItem(`${LIVE_DB_KEY}_salvage_test`) === corrupt, 'opaque salvage raw allowed');

    // Overwrite live with new payload — backup side effects
    const payload2 = JSON.stringify(sampleDb([]));
    await store2.setItem(LIVE_DB_KEY, payload2);
    check('D9', await exists(join(root, 'db.json.bak')), 'last-good .bak created on overwrite');
    const bak = await readFile(join(root, 'db.json.bak'), 'utf8');
    check('D10', bak === payload, '.bak holds previous live contents');
    const autoDir = join(root, 'backups', 'auto');
    check('D11', await exists(autoDir), 'auto backup directory exists');

    let huge;
    try {
      await store2.setItem(`${LIVE_DB_KEY}_salvage_huge`, 'x'.repeat(21 * 1024 * 1024));
    } catch (e) {
      huge = e.code || e.message;
    }
    check('D12', huge === 'STORAGE_VALUE_TOO_LARGE', 'oversized payload rejected');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function testStorageService() {
  console.log('\n=== storage service clean init / import ===');
  const mem = new Map();
  const session = new Map();
  globalThis.localStorage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(String(k), String(v)),
    removeItem: (k) => mem.delete(k),
    clear: () => mem.clear(),
    get length() {
      return mem.size;
    },
    key: (i) => [...mem.keys()][i] ?? null
  };
  globalThis.sessionStorage = {
    getItem: (k) => (session.has(k) ? session.get(k) : null),
    setItem: (k, v) => session.set(String(k), String(v)),
    removeItem: (k) => session.delete(k)
  };
  globalThis.btoa = (s) => Buffer.from(s, 'binary').toString('base64');
  globalThis.atob = (s) => Buffer.from(s, 'base64').toString('binary');
  Object.defineProperty(globalThis, 'crypto', { value: crypto.webcrypto });

  const kv = await import(pathToFileURL(join(__dirname, 'src/services/kvStore.ts')).href);
  kv.resetKvStoreForTests();
  await kv.initKvStore();

  const auth = await import(pathToFileURL(join(__dirname, 'src/services/auth.ts')).href);
  const storage = await import(pathToFileURL(join(__dirname, 'src/services/storage.ts')).href);

  mem.set(
    auth.__authTest.AUTH_META_KEY,
    JSON.stringify({
      v: 2,
      phone: '6362595002',
      algo: 'PBKDF2-SHA256',
      iterations: 210000,
      saltB64: 'Fqdhg5K0ax+VY0IHrocDzQ==',
      hashB64: '0o1k8t8u6UQR0aGR7NLcozYRuvQ2+MexY9AOkzaHJTg='
    })
  );
  await auth.startSession('6362595002');

  storage.useStorageKey(storage.TEST_STORAGE_KEY);
  mem.delete(storage.TEST_STORAGE_KEY);
  const fresh = await storage.getDatabase();
  check('S1', fresh.clients.length === 0, 'clean init has zero customers');
  check('S2', fresh.invoices.length === 0, 'clean init has zero invoices');
  check('S3', fresh.settings.accountNo === '' && fresh.settings.gst === '', 'blank company bank/tax defaults');
  check('S4', !JSON.stringify(fresh).includes('Apex Retail'), 'demo customer names absent');

  let unconf;
  try {
    await storage.restoreFromDatabase(sampleDb([{ id: 'x', name: 'X', phone: '1', addr: '', gst: '', createdAt: '2026-01-01' }]), false, 'x.json');
  } catch (e) {
    unconf = e.message;
  }
  check('S5', unconf === 'RESTORE_NOT_CONFIRMED', 'import requires confirm');
  check('S6', (await storage.getDatabase()).clients.length === 0, 'unconfirmed import leaves current data');

  const imported = sampleDb([
    { id: 'imp', name: 'Imported Co', phone: '9', addr: 'A', gst: 'G', createdAt: '2026-01-01' }
  ]);
  const result = await storage.restoreFromDatabase(imported, true, 'browser-export.json');
  check('S7', result.db.clients[0].id === 'imp', 'confirmed import applied');
  check('S8', result.preRestoreSnapshotKey.startsWith(`${storage.TEST_STORAGE_KEY}_pre_restore_`), 'pre-restore snapshot written');

  let invalid;
  try {
    await storage.restoreFromDatabase({ foo: 1 }, true, 'bad.json');
  } catch (e) {
    invalid = e.message;
  }
  check('S9', invalid === 'RESTORE_SOURCE_INVALID', 'invalid import rejected');
  check('S10', (await storage.getDatabase()).clients[0].id === 'imp', 'invalid import did not replace data');
}

async function main() {
  await testDataStore();
  await testStorageService();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\nSUMMARY: ${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

/**
 * Data-safety: no Settings reset wipe, invalid import rejected, failed restore preserves live DB.
 * Run: npm run test:data-safety
 */
import { register } from 'tsx/esm/api';
import crypto from 'crypto';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const unregisterTsx = register();
const root = dirname(fileURLToPath(import.meta.url));

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

function sampleDb(overrides = {}) {
  return {
    clients: [{ id: 'c1', name: 'Alpha', phone: '9000000001', addr: 'A', gst: '', createdAt: '2026-01-01' }],
    invoices: [
      {
        id: 'inv-1',
        no: 'SRK-0001',
        cid: 'c1',
        date: '2026-04-01',
        items: [{ id: 'i1', n: 'Jar', q: 2, r: 100 }],
        disc: 0,
        gstOn: false,
        gstRate: 0,
        mode: 'Cash',
        pay: [{ id: 'p1', date: '2026-04-01', amt: 50, mode: 'Cash', invoiceId: 'inv-1' }],
        createdAt: '2026-04-01T00:00:00.000Z',
        finalized: true
      }
    ],
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
      logoUrl: '',
      signatureUrl: '',
      boxes: [],
      invoicePrefix: 'SRK-',
      nextSeq: 2
    },
    meta: { schemaVersion: 3, auditLog: [], legacyDuplicateInvoiceNos: [] },
    ...overrides
  };
}

async function main() {
  const { initKvStore, resetKvStoreForTests } = await import('./src/services/kvStore.ts');
  resetKvStoreForTests();
  await initKvStore();

  const auth = await import('./src/services/auth.ts');
  const storage = await import('./src/services/storage.ts');

  // Auth gate for storage writes
  store.set(
    auth.__authTest.AUTH_META_KEY,
    JSON.stringify({
      v: 2,
      phone: '6362595002',
      algo: 'PBKDF2-SHA256',
      iterations: 210000,
      saltB64: auth.__authTest.LEGACY_SHARED_BOOTSTRAP_VERIFIER.saltB64,
      hashB64: auth.__authTest.LEGACY_SHARED_BOOTSTRAP_VERIFIER.hashB64
    })
  );
  await auth.startSession('6362595002');

  storage.useStorageKey(storage.TEST_STORAGE_KEY);
  store.delete(storage.TEST_STORAGE_KEY);

  console.log('=== UI: Reset all data removed ===');
  const settingsSrc = readFileSync(join(root, 'src/components/SettingsView.tsx'), 'utf8');
  const appSrc = readFileSync(join(root, 'src/App.tsx'), 'utf8');
  check('U1', !settingsSrc.includes('Reset all data'), 'SettingsView has no Reset all data button');
  check('U2', !settingsSrc.includes('onResetData') && !settingsSrc.includes('isResetConfirmOpen'), 'no reset props/state');
  check('U3', !appSrc.includes('onResetData') && !appSrc.includes('handleResetData'), 'App does not wire reset');
  check('U4', settingsSrc.includes('Export backup') && settingsSrc.includes('Import backup file'), 'export/import kept');
  check('U5', settingsSrc.includes('Type RESTORE'), 'import still requires RESTORE confirmation');

  console.log('\n=== Invalid / incomplete imports ===');
  check('V1', storage.validateDatabaseShape(null).ok === false, 'null rejected');
  check('V2', storage.validateDatabaseShape({ foo: 1 }).ok === false, 'random object rejected');
  check('V3', storage.validateDatabaseShape({ clients: [], invoices: [] }).ok === false, 'missing settings rejected');
  check(
    'V4',
    storage.validateDatabaseShape({ clients: [], invoices: [], settings: {} }).ok === true,
    'empty lists with settings object accepted as shape'
  );

  const live = sampleDb();
  await storage.saveDatabase(live);
  const liveRaw = store.get(storage.TEST_STORAGE_KEY);
  check('P1', !!liveRaw && liveRaw.includes('Alpha') && liveRaw.includes('SRK-0001'), 'live DB seeded');

  let blocked;
  try {
    await storage.restoreFromDatabase({ clients: [], invoices: [] }, true, 'bad.json');
  } catch (e) {
    blocked = e.message;
  }
  check('P2', blocked === 'RESTORE_SOURCE_INVALID', 'incomplete import throws RESTORE_SOURCE_INVALID');
  check('P3', store.get(storage.TEST_STORAGE_KEY) === liveRaw, 'live DB unchanged after invalid import');

  let unconf;
  try {
    await storage.restoreFromDatabase(sampleDb({ clients: [] }), false, 'x.json');
  } catch (e) {
    unconf = e.message;
  }
  check('P4', unconf === 'RESTORE_NOT_CONFIRMED', 'unconfirmed import blocked');
  check('P5', store.get(storage.TEST_STORAGE_KEY) === liveRaw, 'live DB unchanged without confirm');

  console.log('\n=== Failed restore rolls back to snapshot ===');
  // Valid shape but new duplicate invoice numbers → saveDatabase throws; prior live must remain.
  const dupImport = sampleDb({
    invoices: [
      {
        id: 'a',
        no: 'SRK-0099',
        cid: 'c1',
        date: '2026-05-01',
        items: [{ id: 'i1', n: 'X', q: 1, r: 10 }],
        disc: 0,
        gstOn: false,
        gstRate: 0,
        mode: 'Cash',
        pay: [],
        createdAt: '2026-05-01T00:00:00.000Z',
        finalized: true
      },
      {
        id: 'b',
        no: 'SRK-0099',
        cid: 'c1',
        date: '2026-05-02',
        items: [{ id: 'i1', n: 'Y', q: 1, r: 10 }],
        disc: 0,
        gstOn: false,
        gstRate: 0,
        mode: 'Cash',
        pay: [],
        createdAt: '2026-05-02T00:00:00.000Z',
        finalized: true
      }
    ],
    meta: { schemaVersion: 3, auditLog: [], legacyDuplicateInvoiceNos: [] }
  });

  let failMsg;
  try {
    await storage.restoreFromDatabase(dupImport, true, 'dup.json');
  } catch (e) {
    failMsg = e.message;
  }
  check('R1', failMsg === 'DUPLICATE_INVOICE_NO', 'duplicate import fails at persist');
  const afterFail = store.get(storage.TEST_STORAGE_KEY);
  check('R2', afterFail === liveRaw, 'failed restore restored prior live snapshot');
  check('R3', afterFail.includes('Alpha') && afterFail.includes('p1'), 'customers/payments preserved');
  const snaps = [...store.keys()].filter((k) => String(k).includes('_pre_restore_'));
  check('R4', snaps.length >= 1, 'pre-restore snapshot was written');

  console.log('\n=== Successful confirmed import ===');
  const replacement = sampleDb({
    clients: [{ id: 'c2', name: 'Beta', phone: '9000000002', addr: 'B', gst: '', createdAt: '2026-02-01' }],
    invoices: []
  });
  const ok = await storage.restoreFromDatabase(replacement, true, 'ok.json');
  check('S1', ok.db.clients[0].name === 'Beta', 'confirmed import applied');
  check('S2', store.get(storage.TEST_STORAGE_KEY).includes('Beta'), 'live key updated');
  check('S3', !store.get(storage.TEST_STORAGE_KEY).includes('Alpha'), 'previous customers replaced only after confirm');

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

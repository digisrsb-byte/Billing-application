/**
 * Settings defaults: first-run catalogue, persistence, and preservation of existing data.
 * Run: npm run test:settings-defaults
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

const EXPECTED_PRODUCTS = [
  { n: '1 Litre Water Bottle', p: 140, unitsPerBox: 12 },
  { n: '500 ml Water Bottle', p: 170, unitsPerBox: 24 },
  { n: '2 Litre Water Bottle', p: 210, unitsPerBox: 9 },
  { n: '250 ml Water Bottle', p: 140, unitsPerBox: 24 },
  { n: '300 ml Water Bottle', p: 160, unitsPerBox: 24 },
  { n: '20 Litre Water Can', p: 100, unitsPerBox: 1 },
  { n: '5 Litre Water Can', p: 65, unitsPerBox: 1 },
  { n: '10 Litre Water Can', p: 110, unitsPerBox: 1 }
];

async function main() {
  const { initKvStore, resetKvStoreForTests } = await import('./src/services/kvStore.ts');
  resetKvStoreForTests();
  await initKvStore();

  const auth = await import('./src/services/auth.ts');
  const storage = await import('./src/services/storage.ts');
  const { calculateInvoice, normalizeGstSplits } = await import('./src/utils/formatters.ts');

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
  // Ensure no leftover backups for this test key
  for (const k of [...store.keys()]) {
    if (String(k).startsWith(storage.TEST_STORAGE_KEY)) store.delete(k);
  }

  console.log('=== First-run defaults ===');
  const fresh = await storage.getDatabase();
  check('D1', fresh.settings.name === 'SRK Enterprises', `name=${fresh.settings.name}`);
  check('D2', fresh.settings.currency === 'INR', `currency=${fresh.settings.currency}`);
  check('D3', fresh.settings.invoicePrefix === 'SRK-', `prefix=${fresh.settings.invoicePrefix}`);
  check('D4', fresh.settings.gstOn === true, `gstOn=${fresh.settings.gstOn}`);
  check('D5', fresh.settings.defaultHsn === '481910', `hsn=${fresh.settings.defaultHsn}`);
  check('D6', fresh.settings.cgstSplit === 0.5 && fresh.settings.sgstSplit === 0.5, 'CGST/SGST 50/50');
  check(
    'D7',
    !fresh.settings.addr &&
      !fresh.settings.phone &&
      !fresh.settings.email &&
      !fresh.settings.gst &&
      !fresh.settings.pan &&
      !fresh.settings.state &&
      !fresh.settings.upiId,
    'unknown contact fields blank'
  );
  check(
    'D7b',
    fresh.settings.bankName === 'DBS Bank' &&
      fresh.settings.accountNo === '0164360000008932' &&
      fresh.settings.ifsc === 'DBSS0IN0164' &&
      fresh.settings.branch === 'City Market Branch',
    'DBS Bank details pre-filled'
  );
  check('D8', fresh.settings.boxes.length === 8, `boxes=${fresh.settings.boxes.length}`);
  const catalogueOk = EXPECTED_PRODUCTS.every((exp) => {
    const hit = fresh.settings.boxes.find((b) => b.n === exp.n);
    return hit && hit.p === exp.p && hit.unitsPerBox === exp.unitsPerBox;
  });
  check('D9', catalogueOk, 'default product names, rates, pack qty');

  console.log('=== Settings persistence ===');
  const edited = {
    ...fresh,
    settings: {
      ...fresh.settings,
      name: 'SRK Enterprises Mysore',
      phone: '9999999999',
      rate: 5,
      cgstSplit: 0.6,
      sgstSplit: 0.4,
      boxes: fresh.settings.boxes.map((b, i) => (i === 0 ? { ...b, p: 155 } : b))
    }
  };
  await storage.saveDatabase(edited);
  const reloaded = await storage.getDatabase();
  check('P1', reloaded.settings.name === 'SRK Enterprises Mysore', 'saved name persists');
  check('P2', reloaded.settings.phone === '9999999999', 'saved phone persists');
  check('P3', reloaded.settings.rate === 5, 'saved GST rate persists');
  check('P4', reloaded.settings.cgstSplit === 0.6 && reloaded.settings.sgstSplit === 0.4, 'saved splits persist');
  check('P5', reloaded.settings.boxes[0].p === 155, 'saved product rate persists');
  check('P6', reloaded.settings.boxes.length === 8, 'product count unchanged after save');

  console.log('=== Existing data preservation on launch ===');
  const customDb = {
    clients: [
      {
        id: 'c-keep',
        name: 'Keep Customer',
        phone: '9111111111',
        addr: 'Old Street',
        gst: '',
        createdAt: '2026-01-01'
      }
    ],
    invoices: [
      {
        id: 'inv-keep',
        no: 'SRK-0099',
        cid: 'c-keep',
        date: '2026-03-01',
        items: [{ id: 'li1', n: '1 Litre Water Bottle', q: 2, r: 99 }],
        disc: 0,
        gstOn: true,
        gstRate: 1,
        mode: 'Cash',
        pay: [],
        createdAt: '2026-03-01T00:00:00.000Z',
        finalized: true
      }
    ],
    settings: {
      name: 'Custom Co',
      addr: 'Custom Addr',
      phone: '8000000000',
      email: 'a@b.com',
      gst: '29AAAAA0000A1Z5',
      pan: 'AAAAA0000A',
      state: 'Karnataka',
      currency: 'INR',
      gstOn: false,
      rate: 18,
      cgstSplit: 0.5,
      sgstSplit: 0.5,
      defaultHsn: '2201',
      bankName: 'Test Bank',
      accountNo: '111',
      ifsc: 'TEST0001',
      branch: 'Main',
      upiId: 'pay@upi',
      logoUrl: '',
      signatureUrl: '',
      boxes: [{ id: 'custom1', n: 'Legacy Jar', p: 50, hsn: '2201', pack: '6 / box', unitsPerBox: 6 }],
      invoicePrefix: 'LEG-',
      nextSeq: 10
    },
    meta: { schemaVersion: 3, auditLog: [], legacyDuplicateInvoiceNos: [] }
  };
  await storage.saveDatabase(customDb);
  const preserved = await storage.getDatabase();
  check('V1', preserved.clients.length === 1 && preserved.clients[0].name === 'Keep Customer', 'customers preserved');
  check('V2', preserved.invoices.length === 1 && preserved.invoices[0].no === 'SRK-0099', 'invoices preserved');
  check('V3', preserved.invoices[0].items[0].r === 99, 'issued invoice line rate preserved');
  check('V4', preserved.settings.name === 'Custom Co', 'custom company name not overwritten');
  check('V5', preserved.settings.gstOn === false && preserved.settings.rate === 18, 'custom tax settings kept');
  check('V6', preserved.settings.boxes.length === 1 && preserved.settings.boxes[0].n === 'Legacy Jar', 'custom catalogue not replaced');
  check('V7', preserved.settings.boxes[0].p === 50, 'custom product price not overwritten');
  check('V8', preserved.settings.invoicePrefix === 'LEG-', 'custom prefix kept');
  check('V9', preserved.settings.bankName === 'Test Bank' && preserved.settings.upiId === 'pay@upi', 'bank details kept');

  // Empty boxes only → fill defaults; customers still untouched
  const emptyBoxesDb = {
    ...customDb,
    settings: { ...customDb.settings, boxes: [] }
  };
  await storage.saveDatabase(emptyBoxesDb);
  const filledBoxes = await storage.getDatabase();
  check('V10', filledBoxes.clients[0].name === 'Keep Customer', 'customers intact when boxes empty');
  check('V11', filledBoxes.settings.boxes.length === 8, 'empty boxes get default catalogue');
  check('V12', filledBoxes.settings.name === 'Custom Co', 'name still custom when boxes backfilled');

  console.log('=== GST split + invoice rates ===');
  const splits = normalizeGstSplits(0.5, 0.5);
  check('G1', Math.abs(splits.cgst - 0.5) < 1e-9 && Math.abs(splits.sgst - 0.5) < 1e-9, 'normalize 50/50');
  const pctSplits = normalizeGstSplits(50, 50);
  check('G2', Math.abs(pctSplits.cgst - 0.5) < 1e-9, 'normalize percent 50/50');
  const calc = calculateInvoice(
    {
      items: [{ id: '1', n: '1 Litre Water Bottle', q: 10, r: 140 }],
      disc: 0,
      gstOn: true,
      gstRate: 1,
      pay: []
    },
    1,
    { cgstSplit: 0.5, sgstSplit: 0.5 }
  );
  check('G3', calc.sub === 1400, `sub=${calc.sub}`);
  check('G4', calc.gst === 14, `gst=${calc.gst}`);
  check('G5', calc.cgst === 7 && calc.sgst === 7, `cgst=${calc.cgst} sgst=${calc.sgst}`);
  check('G6', calc.total === 1414, `total=${calc.total}`);

  const uneven = calculateInvoice(
    {
      items: [{ id: '1', n: 'X', q: 1, r: 1000 }],
      disc: 0,
      gstOn: true,
      gstRate: 18,
      pay: []
    },
    18,
    { cgstSplit: 0.6, sgstSplit: 0.4 }
  );
  check('G7', uneven.gst === 180, `gst=${uneven.gst}`);
  check('G8', uneven.cgst === 108 && uneven.sgst === 72, `cgst=${uneven.cgst} sgst=${uneven.sgst}`);

  // Snapshot: issued invoice line rates stay frozen even after catalogue defaults are applied
  check('G9', filledBoxes.invoices[0].items[0].r === 99, 'issued invoice line rate still 99');
  check(
    'G10',
    filledBoxes.settings.boxes.find((b) => b.n === '1 Litre Water Bottle')?.p === 140,
    'live catalogue default rate is 140'
  );

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  unregisterTsx();
  if (failed.length) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  unregisterTsx();
  process.exit(1);
});

/**
 * Phase 2C verification — payment overpay, phone uniqueness, ErrorBoundary, auth expiry/logout.
 * Imports production modules under src/ (not logic replicas).
 * Run: npm run test:phase2c
 */
import { register } from 'tsx/esm/api';
import crypto from 'crypto';
import React from 'react';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const unregisterTsx = register();
const rootDir = dirname(fileURLToPath(import.meta.url));

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

const baseInv = (overrides = {}) => ({
  id: 'i1',
  no: 'SRK-0001',
  cid: 'c1',
  date: '2026-10-01',
  items: [{ id: 'x', n: 'Box', q: 1, r: 100 }],
  disc: 0,
  gstOn: false,
  gstRate: 0,
  mode: 'Cash',
  pay: [],
  createdAt: '2026-10-01T00:00:00.000Z',
  finalized: true,
  ...overrides
});

async function main() {
  const pay = await import('./src/services/paymentValidation.ts');
  const phone = await import('./src/utils/customerPhone.ts');
  const { ErrorBoundary } = await import('./src/components/ErrorBoundary.tsx');
  const auth = await import('./src/services/auth.ts');
  const storage = await import('./src/services/storage.ts');
  const kv = await import('./src/services/kvStore.ts');
  await kv.initKvStore();

  console.log('=== A. Payment validation ===');
  const full = pay.validatePaymentAmount(baseInv(), 100, 1);
  check('P1', full.ok === true && full.amt === 100, 'full payment accepted');

  const partial = pay.validatePaymentAmount(baseInv(), 40, 1);
  check('P2', partial.ok === true && partial.amt === 40, 'partial payment accepted');

  const afterPartial = baseInv({ pay: [{ id: 'p1', date: '2026-10-01', amt: 40, mode: 'Cash' }] });
  const second = pay.validatePaymentAmount(afterPartial, 60, 1);
  check('P3', second.ok === true && second.amt === 60, 'second payment to clear balance');

  const over = pay.validatePaymentAmount(afterPartial, 60.06, 1);
  check('P4', over.ok === false && over.reason === 'OVERPAY', 'overpayment rejected');

  const overFull = pay.validatePaymentAmount(baseInv(), 150, 1);
  check('P5', overFull.ok === false && overFull.reason === 'OVERPAY', 'over full total rejected');

  check(
    'P6',
    pay.validatePaymentAmount(baseInv(), 0, 1).reason === 'ZERO_OR_NEGATIVE',
    'zero rejected'
  );
  check(
    'P7',
    pay.validatePaymentAmount(baseInv(), -5, 1).reason === 'ZERO_OR_NEGATIVE',
    'negative rejected'
  );
  check(
    'P8',
    pay.validatePaymentAmount(baseInv(), Number.NaN, 1).reason === 'NON_FINITE',
    'NaN rejected'
  );

  const voided = baseInv({ voided: true, pay: [] });
  check(
    'P9',
    pay.validatePaymentAmount(voided, 10, 1).reason === 'VOIDED',
    'voided invoice payment rejected'
  );

  // Historical overpay already on record: outstanding negative → further pay rejected
  const historical = baseInv({ pay: [{ id: 'p', date: '2026-01-01', amt: 150, mode: 'Cash' }] });
  const histBal = pay.getOutstandingBalance(historical, 1);
  check('P10', histBal === -50, `historical overpay bal=${histBal}`);
  check(
    'P11',
    pay.validatePaymentAmount(historical, 1, 1).reason === 'ALREADY_SETTLED',
    'no further payment when already overpaid'
  );

  const withinTol = pay.validatePaymentAmount(baseInv(), 100.04, 1);
  check('P12', withinTol.ok === true, 'within ₹0.05 tolerance accepted');

  console.log('\n=== B. Customer phone ===');
  check('H1', phone.normalizeCustomerPhone('+91 98450 12345') === '9845012345', 'normalize +91 spaced');
  check('H2', phone.normalizeCustomerPhone('09845012345') === '9845012345', 'normalize trunk 0');
  check('H3', phone.normalizeCustomerPhone('') === '', 'blank → empty');
  check('H4', phone.normalizeCustomerPhone('   ') === '', 'whitespace → empty');

  const clients = [
    { id: 'a', name: 'A', phone: '+91 98450 11111', addr: '', gst: '', createdAt: '2026-01-01' },
    { id: 'b', name: 'B', phone: '', addr: '', gst: '', createdAt: '2026-01-01' },
    { id: 'c', name: 'C', phone: '', addr: '', gst: '', createdAt: '2026-01-01' }
  ];
  check(
    'H5',
    phone.findCustomerPhoneConflict(clients, '9845011111')?.id === 'a',
    'duplicate normalized phone found'
  );
  check(
    'H6',
    phone.findCustomerPhoneConflict(clients, '9845011111', 'a') === null,
    'exclude self on update'
  );
  check(
    'H7',
    phone.findCustomerPhoneConflict(clients, '') === null &&
      phone.findCustomerPhoneConflict(clients, '   ') === null,
    'blank phones not treated as duplicates'
  );

  const legacy = [
    ...clients,
    { id: 'd', name: 'D', phone: '98450 11111', addr: '', gst: '', createdAt: '2026-01-01' }
  ];
  const groups = phone.listLegacyPhoneDuplicates(legacy);
  check(
    'H8',
    groups.some((g) => g.normalized === '9845011111' && g.clientIds.includes('a') && g.clientIds.includes('d')),
    'legacy duplicate group reported without rewrite'
  );

  console.log('\n=== C. ErrorBoundary (production component) ===');
  store.set('srk_phase2c_marker', 'KEEP');
  function Bomb() {
    throw new Error('phase2c-render-boom');
  }
  let renderErr = null;
  try {
    Bomb();
  } catch (e) {
    renderErr = e;
  }
  check('E1', renderErr instanceof Error && renderErr.message === 'phase2c-render-boom', 'child render throws');

  const eb = new ErrorBoundary({ children: React.createElement('div', null, 'ok') });
  eb.state = { hasError: false };
  eb.captureDescendantRenderError(renderErr);
  check('E2', eb.state.hasError === true, 'ErrorBoundary catches descendant render error');
  const fallback = eb.render();
  const fallbackStr = JSON.stringify(fallback);
  check(
    'E3',
    fallbackStr.includes('Something went wrong') &&
      fallbackStr.includes('was not cleared') &&
      !fallbackStr.includes('phase2c-render-boom') &&
      !fallbackStr.includes('AppData') &&
      !fallbackStr.includes('stack'),
    'safe fallback UI (no secrets/stack/paths)'
  );
  check('E4', store.get('srk_phase2c_marker') === 'KEEP', 'catch path did not clear storage');

  const mainSrc = readFileSync(join(rootDir, 'src/main.tsx'), 'utf8');
  check(
    'E5',
    mainSrc.includes('ErrorBoundary') && mainSrc.includes('<App'),
    'main.tsx wraps App in production ErrorBoundary'
  );

  console.log('\n=== Production wiring (source paths) ===');
  const appSrc = readFileSync(join(rootDir, 'src/App.tsx'), 'utf8');
  const recordPaySrc = readFileSync(join(rootDir, 'src/components/RecordCustomerPaymentModal.tsx'), 'utf8');
  check(
    'W1',
    appSrc.includes("from './services/paymentValidation'") &&
      appSrc.includes('validatePaymentRecord(target, payment') &&
      appSrc.includes('RecordCustomerPaymentModal') &&
      recordPaySrc.includes('validatePaymentRecord(selected') &&
      recordPaySrc.includes("invoiceId: selected.id") &&
      recordPaySrc.includes('Select an invoice'),
    'App handleRecordPayment + RecordCustomerPaymentModal call production validator'
  );
  check(
    'W2',
    appSrc.includes("from './utils/customerPhone'") &&
      appSrc.includes('findCustomerPhoneConflict(prev.clients') &&
      appSrc.includes('findCustomerPhoneConflict(clients, phone, id)'),
    'App persistClient + QuickAddClientModal call production phone helper'
  );
  const dailySrc = readFileSync(join(rootDir, 'src/components/DailyBoxBillingView.tsx'), 'utf8');
  check(
    'W3',
    dailySrc.includes("from '../utils/customerPhone'") &&
      dailySrc.includes('findCustomerPhoneConflict(db.clients'),
    'DailyBoxBillingView uses production phone helper'
  );
  const ledgerSrc = readFileSync(join(rootDir, 'src/components/PaymentsLedger.tsx'), 'utf8');
  check(
    'W4',
    ledgerSrc.includes("from '../services/paymentValidation'") &&
      ledgerSrc.includes('validatePaymentRecord(activePayingInvoice'),
    'PaymentsLedger legacy path uses production validator'
  );

  console.log('\n=== D. Auth expiry / logout (production auth.ts) ===');
  console.log(
    'Auth: first-run uses createAdministrator (per-install salt/hash); legacy installs keep existing AuthMeta; ' +
      'ensureAuthBootstrap no longer seeds shared BOOTSTRAP_VERIFIER.'
  );
  store.set(
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
  check('A1', auth.isLoggedIn() === true, 'session active after startSession');

  // Deterministic expiry: rewrite exp to the past (no 12h wait). MAC not rechecked after exp gate.
  const raw = session.get(auth.__authTest.SESSION_KEY);
  const parsed = JSON.parse(raw);
  parsed.exp = Date.now() - 1000;
  session.set(auth.__authTest.SESSION_KEY, JSON.stringify(parsed));
  check('A2', auth.isLoggedIn() === false, 'expired session fails isLoggedIn');
  check('A3', !session.get(auth.__authTest.SESSION_KEY), 'expiry clears session via clearSession');

  await auth.startSession('6362595002');
  auth.clearSession();
  check('A4', auth.isLoggedIn() === false, 'logout clears gate');
  check('A5', !session.get(auth.__authTest.SESSION_KEY), 'logout removes session');

  // Forged MAC must still fail when session is unexpired (gate not weakened).
  await auth.startSession('6362595002');
  const live = JSON.parse(session.get(auth.__authTest.SESSION_KEY));
  live.mac = 'deadbeef';
  session.set(auth.__authTest.SESSION_KEY, JSON.stringify(live));
  auth.__authTest.setSessionValidated(true);
  const hydrateForged = await auth.hydrateSession();
  check('A6', hydrateForged === false && auth.isLoggedIn() === false, 'forged MAC rejected by hydrateSession');

  check('A7', !('INITIAL_CLIENTS' in storage), 'INITIAL_CLIENTS not exported from production storage');
  await auth.startSession('6362595002');
  storage.useStorageKey(storage.TEST_STORAGE_KEY);
  store.delete(storage.TEST_STORAGE_KEY);
  const fresh = await storage.getDatabase();
  check('A8', fresh.clients.length === 0 && fresh.invoices.length === 0, 'emptyInitialDb has no demo data');
  check(
    'A9',
    fresh.settings.gst === '' &&
      fresh.settings.addr === '' &&
      fresh.settings.phone === '' &&
      fresh.settings.bankName === 'DBS Bank' &&
      fresh.settings.accountNo === '0164360000008932' &&
      fresh.settings.ifsc === 'DBSS0IN0164',
    'contact/tax blank; DBS Bank invoice details present'
  );
  check(
    'A10',
    !JSON.stringify(fresh).toLowerCase().includes('password') && !JSON.stringify(fresh).includes('hashB64'),
    'DB seed has no auth secrets'
  );

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

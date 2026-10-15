/**
 * Payment ↔ invoice linking tests (production modules).
 * Run: npm run test:payment-link
 */
import { register } from 'tsx/esm/api';

const unregisterTsx = register();

const results = [];
function check(id, ok, detail) {
  results.push({ id, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${id} — ${detail}`);
}

function baseInvoice(overrides) {
  return {
    id: 'inv-a',
    no: 'SRK-0001',
    cid: 'c-a',
    date: '2026-04-01',
    items: [{ id: 'i1', n: 'Jar', q: 10, r: 100 }],
    disc: 0,
    gstOn: false,
    gstRate: 0,
    mode: 'Cash',
    pay: [],
    createdAt: '2026-04-01T00:00:00.000Z',
    ...overrides
  };
}

/** Mirror App.handleRecordPayment linking rules without persistence. */
function applyPayment(invoices, invoiceId, payment, rate = 1) {
  const link = assertPaymentInvoiceLink(invoiceId, payment.invoiceId);
  if (link) return { ok: false, reason: link.reason, invoices, message: link.message };

  const target = invoices.find((i) => i.id === invoiceId);
  if (!target) return { ok: false, reason: 'NOT_FOUND', invoices };

  const check = validatePaymentRecord(target, payment, rate);
  if (!check.ok) return { ok: false, reason: check.reason, invoices, message: check.message };

  const safe = { ...payment, amt: check.amt, invoiceId };
  const next = invoices.map((inv) =>
    inv.id === invoiceId ? { ...inv, pay: [...(inv.pay || []), safe] } : inv
  );
  return { ok: true, invoices: next, payment: safe };
}

function activityRows(invoices, clients) {
  return invoices.flatMap((inv) => {
    const clientName = invoiceCustomerName(inv, clients);
    return (inv.pay || []).map((p) => ({
      ...p,
      invoiceId: p.invoiceId || inv.id,
      invoiceNo: inv.no,
      clientName
    }));
  });
}

let assertPaymentInvoiceLink;
let validatePaymentRecord;
let calculateInvoice;
let invoiceCustomerName;

async function main() {
  const validation = await import('./src/services/paymentValidation.ts');
  const formatters = await import('./src/utils/formatters.ts');
  assertPaymentInvoiceLink = validation.assertPaymentInvoiceLink;
  validatePaymentRecord = validation.validatePaymentRecord;
  calculateInvoice = formatters.calculateInvoice;
  invoiceCustomerName = formatters.invoiceCustomerName;

  const clients = [
    { id: 'c-a', name: 'Alpha Traders' },
    { id: 'c-b', name: 'Beta Stores' }
  ];

  let invoices = [
    baseInvoice({
      id: 'inv-a',
      no: 'SRK-0001',
      cid: 'c-a',
      items: [{ id: 'i1', n: 'Jar', q: 10, r: 100 }]
    }),
    baseInvoice({
      id: 'inv-b',
      no: 'SRK-0002',
      cid: 'c-b',
      items: [{ id: 'i1', n: 'Can', q: 5, r: 200 }]
    })
  ];

  console.log('=== Two customers / correct invoice link ===');
  let r = applyPayment(invoices, 'inv-b', {
    id: 'p1',
    date: '2026-04-02',
    amt: 300,
    mode: 'UPI',
    invoiceId: 'inv-b'
  });
  check('L1', r.ok === true, 'partial payment on Beta invoice accepted');
  invoices = r.invoices;
  check('L2', invoices.find((i) => i.id === 'inv-a').pay.length === 0, 'Alpha invoice untouched');
  check('L3', invoices.find((i) => i.id === 'inv-b').pay.length === 1, 'payment nested under Beta');
  check('L4', invoices.find((i) => i.id === 'inv-b').pay[0].invoiceId === 'inv-b', 'invoiceId stamped');

  const calcB = calculateInvoice(invoices.find((i) => i.id === 'inv-b'), 1);
  check('L5', calcB.paid === 300 && calcB.bal === 700 && calcB.st === 'Part paid', `Beta paid/bal/status ${calcB.paid}/${calcB.bal}/${calcB.st}`);

  console.log('\n=== Multiple payments → fully cleared ===');
  r = applyPayment(invoices, 'inv-b', {
    id: 'p2',
    date: '2026-04-03',
    amt: 700,
    mode: 'Cash',
    invoiceId: 'inv-b'
  });
  check('L6', r.ok === true, 'second payment clears Beta');
  invoices = r.invoices;
  const cleared = calculateInvoice(invoices.find((i) => i.id === 'inv-b'), 1);
  check('L7', cleared.paid === 1000 && cleared.bal === 0 && cleared.st === 'Paid', `cleared ${cleared.paid}/${cleared.bal}/${cleared.st}`);

  r = applyPayment(invoices, 'inv-b', {
    id: 'p3',
    date: '2026-04-04',
    amt: 10,
    mode: 'Cash',
    invoiceId: 'inv-b'
  });
  check('L8', r.ok === false && r.reason === 'ALREADY_SETTLED', 'no further payment on paid invoice');

  console.log('\n=== Wrong invoice ID / unlinked ===');
  r = applyPayment(invoices, 'inv-a', {
    id: 'p4',
    date: '2026-04-05',
    amt: 100,
    mode: 'Cash',
    invoiceId: 'inv-b'
  });
  check('L9', r.ok === false && r.reason === 'INVOICE_MISMATCH', 'mismatched payment.invoiceId rejected');

  const missingLink = assertPaymentInvoiceLink('', undefined);
  check('L10', missingLink && missingLink.reason === 'INVOICE_REQUIRED', 'empty invoice ID rejected');

  const missingLink2 = assertPaymentInvoiceLink(null, undefined);
  check('L11', missingLink2 && missingLink2.reason === 'INVOICE_REQUIRED', 'null invoice ID rejected');

  console.log('\n=== Partial on Alpha + activity display ===');
  r = applyPayment(invoices, 'inv-a', {
    id: 'p5',
    date: '2026-04-06',
    amt: 250,
    mode: 'Bank',
    invoiceId: 'inv-a'
  });
  check('L12', r.ok === true, 'partial on Alpha');
  invoices = r.invoices;
  const rows = activityRows(invoices, clients);
  const alphaRow = rows.find((p) => p.id === 'p5');
  const betaRow = rows.find((p) => p.id === 'p1');
  check('L13', alphaRow?.invoiceNo === 'SRK-0001' && alphaRow?.clientName === 'Alpha Traders', 'activity shows Alpha invoice/customer');
  check('L14', betaRow?.invoiceNo === 'SRK-0002' && betaRow?.clientName === 'Beta Stores', 'activity shows Beta invoice/customer');
  check('L15', rows.every((p) => p.invoiceId === 'inv-a' || p.invoiceId === 'inv-b'), 'every activity row has invoiceId');

  console.log('\n=== Amount rejects ===');
  for (const [id, amt, reason] of [
    ['R1', 0, 'ZERO_OR_NEGATIVE'],
    ['R2', -5, 'ZERO_OR_NEGATIVE'],
    ['R3', Number.NaN, 'NON_FINITE'],
    ['R4', 99999, 'OVERPAY']
  ]) {
    const bad = validatePaymentRecord(invoices.find((i) => i.id === 'inv-a'), { amt }, 1);
    check(id, bad.ok === false && bad.reason === reason, `${reason} for amt=${amt}`);
  }

  const voided = validatePaymentRecord(
    { ...invoices.find((i) => i.id === 'inv-a'), voided: true },
    { amt: 10 },
    1
  );
  check('R5', voided.ok === false && voided.reason === 'VOIDED', 'voided invoice rejected');

  console.log('\n=== Legacy payment (no invoiceId field) ===');
  const legacyInv = baseInvoice({
    id: 'inv-leg',
    no: 'SRK-0099',
    cid: 'c-a',
    items: [{ id: 'i1', n: 'Jar', q: 2, r: 50 }],
    pay: [{ id: 'legacy-p', date: '2026-01-01', amt: 40, mode: 'Cash' }] // no invoiceId
  });
  const legCalc = calculateInvoice(legacyInv, 1);
  check('G1', legCalc.paid === 40 && legCalc.bal === 60 && legCalc.st === 'Part paid', 'legacy pay counted in balance');
  const legRows = activityRows([legacyInv], clients);
  check('G2', legRows[0].invoiceId === 'inv-leg' && legRows[0].invoiceNo === 'SRK-0099', 'legacy activity derives link from parent');
  check('G3', !('invoiceId' in legacyInv.pay[0]), 'legacy record not rewritten');

  // Overpaid historical: bal negative — further payments blocked
  const over = baseInvoice({
    id: 'inv-over',
    pay: [{ id: 'op', date: '2026-01-01', amt: 1500, mode: 'Cash' }]
  });
  const overCheck = validatePaymentRecord(over, { amt: 1 }, 1);
  check('G4', overCheck.ok === false && overCheck.reason === 'ALREADY_SETTLED', 'overpaid blocks further payments');

  // Walk-in buyer snapshot name
  const walk = baseInvoice({
    id: 'inv-w',
    cid: '',
    buyerSnapshot: { name: 'Walk-in Ravi', phone: '', addr: '', gst: '', state: '', pin: '' },
    pay: [{ id: 'wp', date: '2026-02-01', amt: 10, mode: 'Cash', invoiceId: 'inv-w' }]
  });
  check('G5', invoiceCustomerName(walk, clients) === 'Walk-in Ravi', 'buyerSnapshot name used when no client');

  const failed = results.filter((x) => !x.ok).length;
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

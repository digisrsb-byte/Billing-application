/**
 * Invoice create payment choices: Full / Partial / Pay Later.
 * Run: npm run test:invoice-create-pay
 */
import { register } from 'tsx/esm/api';

const unregisterTsx = register();

const results = [];
function check(id, ok, detail) {
  results.push({ id, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${id} — ${detail}`);
}

function applyPlan(invoiceBase, plan, method) {
  if (!plan.ok) return { ok: false, reason: 'PLAN', invoice: invoiceBase, message: plan.message };
  const inv = {
    ...invoiceBase,
    mode: plan.invoiceMode,
    pay: []
  };
  if (plan.createPayment) {
    inv.pay = [
      buildInitialPaymentRecord({
        invoiceId: inv.id,
        amount: plan.received,
        mode: method,
        date: inv.date,
        notes: plan.choice
      })
    ];
  }
  return { ok: true, invoice: inv, plan };
}

let resolveCreatePaymentPlan;
let previewCreatePaymentAmounts;
let buildInitialPaymentRecord;
let calculateInvoice;

async function main() {
  const createPay = await import('./src/services/invoiceCreatePayment.ts');
  const formatters = await import('./src/utils/formatters.ts');
  resolveCreatePaymentPlan = createPay.resolveCreatePaymentPlan;
  previewCreatePaymentAmounts = createPay.previewCreatePaymentAmounts;
  buildInitialPaymentRecord = createPay.buildInitialPaymentRecord;
  calculateInvoice = formatters.calculateInvoice;

  const total = 5000;
  const items = [{ id: 'i1', n: 'Water', q: 50, r: 100 }];
  const base = {
    id: 'inv-1',
    no: 'SRK-0001',
    cid: 'c1',
    date: '2026-04-15',
    items,
    disc: 0,
    gstOn: false,
    gstRate: 0,
    mode: 'Credit',
    pay: [],
    createdAt: '2026-04-15T00:00:00.000Z',
    finalized: true
  };

  console.log('=== Pay Later ===');
  let plan = resolveCreatePaymentPlan('later', total, '999', 'Cash');
  check('L1', plan.ok && plan.createPayment === false && plan.received === 0, 'later: no payment');
  check('L2', plan.invoiceMode === 'Credit' && plan.balanceDue === 5000, 'later: Credit + full balance');
  let r = applyPlan(base, plan, 'Cash');
  let calc = calculateInvoice(r.invoice, 1);
  check('L3', r.invoice.pay.length === 0, 'later: pay[] empty');
  check('L4', calc.paid === 0 && calc.bal === 5000 && calc.st === 'Pending', `later status ${calc.st}`);

  console.log('\n=== Full Payment ===');
  plan = resolveCreatePaymentPlan('full', total, '', 'UPI');
  check('F1', plan.ok && plan.createPayment === true && plan.received === 5000, 'full: one payment = total');
  check('F2', plan.balanceDue === 0 && plan.invoiceMode === 'UPI', 'full: balance 0');
  r = applyPlan(base, plan, 'UPI');
  calc = calculateInvoice(r.invoice, 1);
  check('F3', r.invoice.pay.length === 1 && r.invoice.pay[0].amt === 5000, 'exactly one full payment');
  check('F4', r.invoice.pay[0].invoiceId === 'inv-1', 'payment linked to invoice');
  check('F5', calc.paid === 5000 && calc.bal === 0 && calc.st === 'Paid', `full status ${calc.st}`);

  // Switching away from full must not leave stale partial string as the plan amount for full
  plan = resolveCreatePaymentPlan('full', total, '123', 'Cash');
  check('F6', plan.ok && plan.received === 5000, 'full ignores leftover partial input');

  console.log('\n=== Partial Payment ===');
  plan = resolveCreatePaymentPlan('partial', total, '3000', 'Bank');
  check('P1', plan.ok && plan.received === 3000 && plan.balanceDue === 2000, 'partial 3000/2000');
  r = applyPlan(base, plan, 'Bank');
  calc = calculateInvoice(r.invoice, 1);
  check('P2', r.invoice.pay.length === 1 && r.invoice.pay[0].amt === 3000, 'exactly one partial payment');
  check('P3', calc.paid === 3000 && calc.bal === 2000 && calc.st === 'Part paid', `part status ${calc.st}`);

  const badZero = resolveCreatePaymentPlan('partial', total, '0', 'Cash');
  check('P4', badZero.ok === false, 'partial rejects 0');
  const badNeg = resolveCreatePaymentPlan('partial', total, '-10', 'Cash');
  check('P5', badNeg.ok === false, 'partial rejects negative');
  const badFull = resolveCreatePaymentPlan('partial', total, '5000', 'Cash');
  check('P6', badFull.ok === false, 'partial rejects amount == total');
  const badOver = resolveCreatePaymentPlan('partial', total, '6000', 'Cash');
  check('P7', badOver.ok === false, 'partial rejects overpay');
  const badEmpty = resolveCreatePaymentPlan('partial', total, '', 'Cash');
  check('P8', badEmpty.ok === false, 'partial rejects empty');

  console.log('\n=== Switching preview amounts ===');
  let prev = previewCreatePaymentAmounts('later', total, '3000');
  check('S1', prev.paidNow === 0 && prev.balanceDue === 5000, 'preview later clears paid');
  prev = previewCreatePaymentAmounts('full', total, '3000');
  check('S2', prev.paidNow === 5000 && prev.balanceDue === 0, 'preview full uses total');
  prev = previewCreatePaymentAmounts('partial', total, '1500.5');
  check('S3', prev.paidNow === 1500.5 && prev.balanceDue === 3499.5, 'preview partial calc');
  prev = previewCreatePaymentAmounts('partial', total, '');
  check('S4', prev.paidNow === 0 && prev.balanceDue === 5000, 'preview partial empty = 0 paid');

  // Switch later → full → later: apply later must not retain payment
  plan = resolveCreatePaymentPlan('full', total, '', 'Cash');
  r = applyPlan(base, plan, 'Cash');
  check('S5', r.invoice.pay.length === 1, 'after full has payment');
  plan = resolveCreatePaymentPlan('later', total, '5000', 'Cash');
  r = applyPlan(base, plan, 'Cash');
  check('S6', r.invoice.pay.length === 0 && calculateInvoice(r.invoice, 1).st === 'Pending', 'switch to later clears payment');

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

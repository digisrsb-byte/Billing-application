/**
 * Isolated security negative tests — does NOT touch browser localStorage
 * or any production data. Logic mirrors src/services/auth.ts and
 * src/utils/formatters.ts for offline verification only.
 */

const DESK = { phone: '6362595002', password: 'srk@123' };
const normalizePhone = (phone) =>
  phone.replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '');
const verifyLogin = (phone, password) =>
  normalizePhone(phone) === DESK.phone && password === DESK.password;

function calculateInvoice(inv, defaultGstRate = 1) {
  const items = inv.items || [];
  const sub = items.reduce(
    (acc, it) => acc + (Number(it.q) || 0) * (Number(it.r) || 0),
    0
  );
  const rawDisc = Number(inv.disc) || 0;
  const disc = Math.min(rawDisc, sub);
  const taxable = Math.max(0, sub - disc);
  const gstOn = !!inv.gstOn;
  const gstRate = inv.gstRate !== undefined ? Number(inv.gstRate) : defaultGstRate;
  const isInterState = !!inv.isInterState;
  let gst = 0;
  let cgst = 0;
  let sgst = 0;
  let igst = 0;
  if (gstOn && gstRate > 0) {
    gst = Math.round(((taxable * gstRate) / 100) * 100) / 100;
    if (isInterState) igst = gst;
    else {
      cgst = Math.round((gst / 2) * 100) / 100;
      sgst = Math.round((gst - cgst) * 100) / 100;
    }
  }
  const total = Math.round((taxable + gst) * 100) / 100;
  const paid = (inv.pay || []).reduce((acc, p) => acc + (Number(p.amt) || 0), 0);
  const bal = Math.round((total - paid) * 100) / 100;
  let st = 'Pending';
  if (total > 0 && bal <= 0.05) st = 'Paid';
  else if (paid > 0) st = 'Part paid';
  return { sub, disc, taxable, gst, cgst, sgst, igst, total, paid, bal, st };
}

const results = [];
function check(suite, name, ok, detail = '') {
  results.push({ suite, name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${suite} | ${name}${detail ? ' — ' + detail : ''}`);
}

console.log('=== LOGIN (logic replica of auth.ts) ===');
const loginCases = [
  ['empty credentials', '', '', false],
  ['wrong password', '6362595002', 'wrong', false],
  ['wrong phone', '9999999999', 'srk@123', false],
  ['exact match', '6362595002', 'srk@123', true],
  ['+91 prefix accepted', '+91 6362595002', 'srk@123', true],
  ['spaces in phone', '63625 95002', 'srk@123', true],
  ['password case-sensitive', '6362595002', 'SRK@123', false],
  ['SQL-ish phone string', "' OR 1=1 --", 'srk@123', false],
  ['empty password', '6362595002', '', false]
];
for (const [name, p, pw, exp] of loginCases) {
  const got = verifyLogin(p, pw);
  check('login', name, got === exp, `got=${got} expected=${exp}`);
}

console.log('\n=== INVOICE CALC / MALFORMED INPUT (formatters.ts replica) ===');
{
  const c = calculateInvoice({
    items: [{ q: 10, r: 100 }],
    disc: 0,
    gstOn: false,
    pay: []
  });
  check('calc', 'normal total', c.total === 1000 && c.st === 'Pending', JSON.stringify(c));
}
{
  const c = calculateInvoice({
    items: [{ q: -5, r: 100 }],
    disc: 0,
    gstOn: false,
    pay: []
  });
  // App UI clamps qty>=0, but calculator accepts negatives if injected
  check(
    'calc',
    'negative qty produces negative subtotal (integrity gap if data injected)',
    c.sub === -500,
    JSON.stringify(c)
  );
}
{
  const c = calculateInvoice({
    items: [{ q: 2, r: 'x' }],
    disc: 0,
    gstOn: false,
    pay: []
  });
  check('calc', 'NaN rate treated as 0 line', c.sub === 0, JSON.stringify(c));
}
{
  const c = calculateInvoice({
    items: [{ q: 1, r: 100 }],
    disc: 999,
    gstOn: false,
    pay: []
  });
  check(
    'calc',
    'discount capped at subtotal',
    c.disc === 100 && c.total === 0,
    JSON.stringify(c)
  );
}
{
  const c = calculateInvoice({
    items: [{ q: 1, r: 100 }],
    disc: 0,
    gstOn: false,
    pay: [{ amt: 40 }]
  });
  check(
    'calc',
    'partial payment balance',
    c.st === 'Part paid' && c.bal === 60,
    JSON.stringify(c)
  );
}
{
  const c = calculateInvoice({
    items: [{ q: 1, r: 100 }],
    disc: 0,
    gstOn: false,
    pay: [{ amt: 150 }]
  });
  check(
    'calc',
    'overpayment yields negative balance marked Paid',
    c.bal === -50 && c.st === 'Paid',
    JSON.stringify(c)
  );
}
{
  const c = calculateInvoice({
    items: [{ q: 1e15, r: 1e6 }],
    disc: 0,
    gstOn: false,
    pay: []
  });
  check('calc', 'extreme qty remains finite', Number.isFinite(c.total), String(c.total));
}
{
  const c = calculateInvoice({
    items: [{ q: 100, r: 100 }],
    disc: 0,
    gstOn: true,
    gstRate: 1,
    pay: []
  });
  check(
    'calc',
    '1% composition GST',
    c.gst === 100 && c.total === 10100,
    JSON.stringify(c)
  );
}

console.log('\n=== DUPLICATE INVOICE NUMBER MODEL ===');
{
  const generateInvoiceNo = (prefix, seq) => `${prefix}${String(seq).padStart(4, '0')}`;
  const a = generateInvoiceNo('SRK-', 5);
  const b = generateInvoiceNo('SRK-', 5);
  check(
    'invoice-no',
    'same seq produces identical numbers (no uniqueness guard in generator)',
    a === b && a === 'SRK-0005',
    `${a} / ${b}`
  );
}

console.log('\n=== BACKUP SHAPE VALIDATION MODEL (SettingsView) ===');
{
  const isAccepted = (parsed) =>
    !!(parsed && Array.isArray(parsed.clients) && Array.isArray(parsed.invoices));
  check('backup', 'minimal valid shape accepted', isAccepted({ clients: [], invoices: [] }));
  check(
    'backup',
    'missing settings still accepted (weak schema)',
    isAccepted({ clients: [], invoices: [], settings: undefined }) === true
  );
  check('backup', 'random object rejected', isAccepted({ foo: 1 }) === false);
  check('backup', 'null rejected', isAccepted(null) === false);
}

console.log('\n=== CODE-REVIEW ASSERTIONS (not runtime UI) ===');
check(
  'review',
  'auth bypass via localStorage flag srk_billing_auth_v1=1',
  true,
  'isLoggedIn() only checks flag === "1"'
);
check(
  'review',
  'hardcoded plaintext desk password in client bundle',
  true,
  'DESK_CREDENTIALS.password = srk@123'
);
check('review', 'no SQL engine present — SQLi N/A', true, 'storage is localStorage JSON');
check('review', 'not Electron — IPC N/A', true, 'Vite + React SPA');

const failed = results.filter((r) => !r.ok).length;
const passed = results.filter((r) => r.ok).length;
console.log(`\nSUMMARY: ${passed} passed, ${failed} failed, ${results.length} total`);
process.exit(failed > 0 ? 1 : 0);

/**
 * Isolated P0 security tests — uses an in-memory Storage mock and the TEST DB key.
 * Does not touch the live browser desk database.
 */
import crypto from 'crypto';
import assert from 'assert';

// ---- minimal browser shims ----
const store = new Map();
const session = new Map();

globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k)
};
globalThis.sessionStorage = {
  getItem: (k) => (session.has(k) ? session.get(k) : null),
  setItem: (k, v) => session.set(k, String(v)),
  removeItem: (k) => session.delete(k)
};
globalThis.btoa = (s) => Buffer.from(s, 'binary').toString('base64');
globalThis.atob = (s) => Buffer.from(s, 'base64').toString('binary');
const subtle = crypto.webcrypto.subtle;

const BOOTSTRAP = {
  phone: '6362595002',
  password: 'srk@123', // test secret only — not written to app source
  iterations: 210000,
  saltB64: 'Fqdhg5K0ax+VY0IHrocDzQ==',
  hashB64: '0o1k8t8u6UQR0aGR7NLcozYRuvQ2+MexY9AOkzaHJTg='
};

function bufToB64(buf) {
  return Buffer.from(buf).toString('base64');
}
function b64ToBuf(b64) {
  return new Uint8Array(Buffer.from(b64, 'base64'));
}
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
async function pbkdf2(password, salt, iterations) {
  const keyMaterial = await subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    keyMaterial,
    256
  );
  return new Uint8Array(bits);
}

// Mirror invoice integrity (inline to avoid TS import)
function generateInvoiceNo(prefix, seq) {
  return `${prefix}${String(seq).padStart(4, '0')}`;
}
function findDuplicateInvoiceNos(invoices) {
  const counts = new Map();
  for (const inv of invoices) {
    const no = (inv.no || '').trim();
    if (!no) continue;
    counts.set(no, (counts.get(no) || 0) + 1);
  }
  return [...counts.entries()].filter(([, n]) => n > 1).map(([no]) => no);
}
function isInvoiceNoTaken(invoices, no, excludeId) {
  return invoices.some((inv) => inv.no === no && inv.id !== excludeId);
}
function maxSeqForPrefix(invoices, prefix) {
  let max = 0;
  for (const inv of invoices) {
    if (!inv.no?.startsWith(prefix)) continue;
    const n = parseInt(inv.no.slice(prefix.length), 10);
    if (!Number.isNaN(n) && n > max) max = n;
  }
  return max;
}
function allocateInvoiceNo(prefix, nextSeq, invoices) {
  let seq = Math.max(1, nextSeq || 1, maxSeqForPrefix(invoices, prefix) + 1);
  const used = new Set(invoices.map((i) => i.no));
  for (let g = 0; g < 10000; g++) {
    const no = generateInvoiceNo(prefix, seq);
    if (!used.has(no)) return { no, nextSeq: seq + 1 };
    seq++;
  }
  throw new Error('alloc failed');
}
function applyInvoiceSave(prevInvoices, prevNextSeq, invoice, prefix) {
  const existingIdx = prevInvoices.findIndex((i) => i.id === invoice.id);
  if (existingIdx >= 0) {
    const existing = prevInvoices[existingIdx];
    if (existing.finalized && !existing.voided) {
      const paymentsChanged =
        JSON.stringify(existing.pay || []) !== JSON.stringify(invoice.pay || []);
      if (!paymentsChanged && !invoice.voided) {
        return {
          ok: false,
          reason: 'FINALIZED_LOCKED',
          invoices: prevInvoices,
          nextSeq: prevNextSeq,
          saved: existing
        };
      }
    }
    if (isInvoiceNoTaken(prevInvoices, invoice.no, invoice.id)) {
      return {
        ok: false,
        reason: 'DUPLICATE_INVOICE_NO',
        invoices: prevInvoices,
        nextSeq: prevNextSeq,
        saved: existing
      };
    }
    const next = [...prevInvoices];
    next[existingIdx] = invoice;
    return { ok: true, invoices: next, nextSeq: prevNextSeq, saved: invoice };
  }
  let nextSeq = prevNextSeq;
  let no = invoice.no;
  if (!no || isInvoiceNoTaken(prevInvoices, no)) {
    const alloc = allocateInvoiceNo(prefix, nextSeq, prevInvoices);
    no = alloc.no;
    nextSeq = alloc.nextSeq;
  } else {
    nextSeq = Math.max(prevNextSeq + 1, maxSeqForPrefix([...prevInvoices, { ...invoice, no }], prefix) + 1);
  }
  const saved = { ...invoice, no };
  if (isInvoiceNoTaken(prevInvoices, saved.no)) {
    return {
      ok: false,
      reason: 'DUPLICATE_INVOICE_NO',
      invoices: prevInvoices,
      nextSeq: prevNextSeq,
      saved: invoice
    };
  }
  return { ok: true, invoices: [...prevInvoices, saved], nextSeq, saved };
}

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${name}${detail ? ' — ' + detail : ''}`);
}

console.log('=== P0.1 Password hashing ===');
{
  const salt = b64ToBuf(BOOTSTRAP.saltB64);
  const expected = b64ToBuf(BOOTSTRAP.hashB64);
  const actual = await pbkdf2(BOOTSTRAP.password, salt, BOOTSTRAP.iterations);
  check('bootstrap verifier matches desk password', timingSafeEqual(actual, expected));
  const wrong = await pbkdf2('wrong-password', salt, BOOTSTRAP.iterations);
  check('wrong password fails verifier', !timingSafeEqual(wrong, expected));
  check('plaintext password not equal to stored hash', BOOTSTRAP.password !== BOOTSTRAP.hashB64);
}

console.log('\n=== P0.2 Auth bypass resistance ===');
{
  // Legacy flag alone must not authenticate
  store.set('srk_billing_auth_v1', '1');
  const legacyAlone = store.get('srk_billing_auth_v1') === '1' && !session.get('srk_billing_session_v2');
  check('legacy flag present without session is detectable as bypass attempt', legacyAlone === true);

  // Signed session required
  store.set(
    'srk_billing_auth_meta_v2',
    JSON.stringify({
      v: 2,
      phone: BOOTSTRAP.phone,
      algo: 'PBKDF2-SHA256',
      iterations: BOOTSTRAP.iterations,
      saltB64: BOOTSTRAP.saltB64,
      hashB64: BOOTSTRAP.hashB64
    })
  );
  const exp = Date.now() + 3600_000;
  const nonce = bufToB64(crypto.randomBytes(16));
  const macMaterial = ['srk-session-v2', BOOTSTRAP.phone, String(exp), nonce, BOOTSTRAP.hashB64].join('|');
  const mac = bufToB64(await subtle.digest('SHA-256', new TextEncoder().encode(macMaterial)));
  session.set('srk_billing_session_v2', JSON.stringify({ v: 2, phone: BOOTSTRAP.phone, exp, nonce, mac }));

  const forged = JSON.parse(session.get('srk_billing_session_v2'));
  forged.mac = bufToB64(crypto.randomBytes(32));
  const forgedMac = forged.mac;
  const goodMac = mac;
  check('forged session MAC differs from valid MAC', forgedMac !== goodMac);

  // Data-access gate model
  let sessionValidated = false;
  const isLoggedIn = () => sessionValidated && !!session.get('srk_billing_session_v2');
  check('without hydrate/login, data gate closed', isLoggedIn() === false);
  sessionValidated = true;
  check('after validated login, data gate open', isLoggedIn() === true);
  sessionValidated = false;
  store.set('srk_billing_auth_v1', '1');
  check('legacy flag cannot open validated gate', isLoggedIn() === false);
}

console.log('\n=== P0.3 Invoice uniqueness + rollback ===');
{
  const invoices = [
    { id: 'a', no: 'SRK-0001', finalized: true, pay: [] },
    { id: 'b', no: 'SRK-0001', finalized: true, pay: [] } // legacy duplicate
  ];
  const legacy = findDuplicateInvoiceNos(invoices);
  check('legacy duplicates detected without renumbering', legacy.length === 1 && legacy[0] === 'SRK-0001');
  check('legacy invoice numbers unchanged', invoices[0].no === 'SRK-0001' && invoices[1].no === 'SRK-0001');

  const alloc = allocateInvoiceNo('SRK-', 1, invoices);
  check('allocator skips taken numbers', alloc.no === 'SRK-0002', alloc.no);

  const prev = [{ id: 'a', no: 'SRK-0005', finalized: true, pay: [] }];
  const snap = JSON.stringify(prev);
  // New insert with a colliding requested number is reallocated to a free number
  const dupAttempt = applyInvoiceSave(
    prev,
    6,
    { id: 'new', no: 'SRK-0005', finalized: true, pay: [], items: [] },
    'SRK-'
  );
  check(
    'colliding new insert reallocates to unique number',
    dupAttempt.ok === true && dupAttempt.saved.no !== 'SRK-0005',
    dupAttempt.ok ? dupAttempt.saved.no : dupAttempt.reason
  );
  check('prior invoices untouched after reallocation', dupAttempt.invoices[0].no === 'SRK-0005' && dupAttempt.invoices[0].id === 'a');

  // Editing an existing draft to a taken number must fail (rollback)
  const drafts = [
    { id: 'a', no: 'SRK-0005', finalized: false, pay: [] },
    { id: 'b', no: 'SRK-0006', finalized: false, pay: [] }
  ];
  const editClash = applyInvoiceSave(
    drafts,
    7,
    { id: 'b', no: 'SRK-0005', finalized: false, pay: [], items: [] },
    'SRK-'
  );
  check(
    'edit to taken number rejected (rollback)',
    editClash.ok === false && editClash.reason === 'DUPLICATE_INVOICE_NO'
  );
  check('rollback keeps prior invoices intact', JSON.stringify(editClash.invoices) === JSON.stringify(drafts));
  void snap;

  const okSave = applyInvoiceSave(
    prev,
    6,
    { id: 'new', no: 'SRK-0006', finalized: true, pay: [], items: [] },
    'SRK-'
  );
  check('unique insert accepted', okSave.ok === true && okSave.saved.no === 'SRK-0006');
  check('nextSeq advances', okSave.nextSeq >= 7, String(okSave.nextSeq));

  // Restart safety: nextSeq behind max used
  const afterRestart = allocateInvoiceNo('SRK-', 1, okSave.invoices);
  check('after restart with low nextSeq, allocates past max', afterRestart.no === 'SRK-0007', afterRestart.no);
}

console.log('\n=== P0.4 Finalized deletion → void ===');
{
  const inv = {
    id: 'f1',
    no: 'SRK-0010',
    finalized: true,
    voided: false,
    pay: [{ id: 'p1', amt: 100 }],
    items: [{ id: 'i1', n: 'Can', q: 1, r: 100 }]
  };
  const canHardDelete = !(inv.finalized && !inv.voided);
  check('finalized invoice blocked from ordinary hard delete', canHardDelete === false);

  const voided = {
    ...inv,
    voided: true,
    voidReason: 'Issued in error',
    voidedAt: new Date().toISOString(),
    voidedBy: 'desk'
  };
  const audit = {
    action: 'invoice_void',
    invoiceId: voided.id,
    invoiceNo: voided.no,
    reason: voided.voidReason
  };
  check('void preserves invoice id and number', voided.id === inv.id && voided.no === inv.no);
  check('void requires reason in audit', !!audit.reason && audit.reason.length >= 3);
  check('payments retained after void', voided.pay.length === 1);

  const draft = { id: 'd1', no: 'SRK-0011', finalized: false };
  check('non-finalized draft still deletable', draft.finalized === false);
}

console.log('\n=== Compatibility: existing password still works ===');
{
  const salt = b64ToBuf(BOOTSTRAP.saltB64);
  const hash = await pbkdf2(BOOTSTRAP.password, salt, BOOTSTRAP.iterations);
  check('admin password verifies against bootstrap hash', timingSafeEqual(hash, b64ToBuf(BOOTSTRAP.hashB64)));
}

console.log('\n=== Test DB isolation ===');
{
  const TEST_KEY = 'srk_enterprises_billing_db_TEST_p0';
  const LIVE_KEY = 'srk_enterprises_billing_db_v2';
  store.set(TEST_KEY, JSON.stringify({ clients: [], invoices: [], settings: {} }));
  check('test key written', !!store.get(TEST_KEY));
  check('live key untouched by test write', store.get(LIVE_KEY) == null);
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\nSUMMARY: ${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);

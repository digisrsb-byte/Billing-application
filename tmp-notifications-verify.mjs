/**
 * Notifications merge/unread/company-name tests (production modules).
 * Run: npm run test:notifications
 */
import { register } from 'tsx/esm/api';
import crypto from 'crypto';

const unregisterTsx = register();

const store = new Map();
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
Object.defineProperty(globalThis, 'crypto', { value: crypto.webcrypto });

const results = [];
function check(id, ok, detail) {
  results.push({ id, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${id} — ${detail}`);
}

async function main() {
  const { initKvStore, resetKvStoreForTests } = await import('./src/services/kvStore.ts');
  resetKvStoreForTests();
  await initKvStore();

  const notif = await import('./src/services/notifications.ts');

  console.log('=== Company display name ===');
  check('H1', notif.resolveCompanyDisplayName({ name: 'Acme Waters' }) === 'Acme Waters', 'uses settings name');
  check('H2', notif.resolveCompanyDisplayName({ name: '  ' }) === 'SRK Enterprises', 'blank → fallback');
  check('H3', notif.resolveCompanyDisplayName(null) === 'SRK Enterprises', 'null → fallback');
  check('H4', notif.companyAvatarInitials('SRK Enterprises') === 'SE', 'initials SE');
  check('H5', notif.companyAvatarInitials('Solo') === 'SO', 'single-word initials');

  const clients = [
    { id: 'c1', name: 'Alpha Co' },
    { id: 'c2', name: 'Beta Co' }
  ];
  const invA = {
    id: 'inv-a',
    no: 'SRK-0001',
    cid: 'c1',
    date: '2026-04-01',
    items: [{ id: 'i1', n: 'Jar', q: 10, r: 100 }],
    disc: 0,
    gstOn: false,
    gstRate: 0,
    mode: 'Cash',
    pay: [],
    createdAt: '2026-04-01T10:00:00.000Z',
    finalized: true
  };
  const invB = {
    ...invA,
    id: 'inv-b',
    no: 'SRK-0002',
    cid: 'c2',
    createdAt: '2026-04-02T10:00:00.000Z',
    pay: [{ id: 'p-1', date: '2026-04-02', amt: 200, mode: 'UPI' }]
  };

  const db = {
    clients,
    invoices: [invA, invB],
    settings: { name: 'SRK Enterprises', rate: 1 }
  };

  console.log('\n=== Sync / duplicates / unread ===');
  store.clear();
  let items = await notif.syncNotificationsFromDatabase(db);
  const outstanding = items.filter((n) => n.type === 'outstanding');
  const payments = items.filter((n) => n.type === 'payment');
  check('N1', outstanding.length === 2, `two outstanding (bal>0) got=${outstanding.length}`);
  check('N2', payments.length === 1 && payments[0].id === 'payment:p-1', 'one payment notification');
  check('N3', notif.countUnread(items) === items.length, 'all unread on first sync');

  // Duplicate prevention: sync again must not duplicate
  const again = await notif.syncNotificationsFromDatabase(db);
  check('N4', again.length === items.length, 'second sync same count');
  check(
    'N5',
    new Set(again.map((n) => n.id)).size === again.length,
    'all notification ids unique'
  );

  // Mark one read, re-sync preserves read
  items = await notif.markNotificationRead('outstanding:inv-a');
  check('N6', items.find((n) => n.id === 'outstanding:inv-a')?.read === true, 'marked read');
  check('N7', notif.countUnread(items) === items.length - 1, 'unread decremented');
  items = await notif.syncNotificationsFromDatabase(db);
  check('N8', items.find((n) => n.id === 'outstanding:inv-a')?.read === true, 'read preserved after sync');

  // Settle inv-a → outstanding notification removed; payment history kept
  const settledA = {
    ...invA,
    pay: [{ id: 'p-full', date: '2026-04-03', amt: 1000, mode: 'Cash' }]
  };
  const db2 = { ...db, invoices: [settledA, invB] };
  items = await notif.syncNotificationsFromDatabase(db2);
  check('N9', !items.some((n) => n.id === 'outstanding:inv-a'), 'settled invoice drops outstanding alert');
  check('N10', items.some((n) => n.id === 'payment:p-full'), 'new payment notification added');
  check('N11', items.some((n) => n.id === 'payment:p-1'), 'prior payment notification kept');

  // Persistence across "restart"
  const raw = store.get(notif.NOTIFICATIONS_KEY);
  check('N12', !!raw && raw.includes('payment:p-1'), 'persisted to kv/localStorage');
  const reloaded = notif.loadNotificationStore();
  check('N13', reloaded.items.length === items.length, 'reload matches store');

  items = await notif.markAllNotificationsRead();
  check('N14', notif.countUnread(items) === 0, 'mark all read → unread 0');

  const inv = notif.findInvoiceForNotification(db2, { invoiceId: 'inv-b' });
  check('N15', inv?.no === 'SRK-0002', 'click resolves invoice');

  // Voided invoices do not generate outstanding
  const voided = { ...invA, id: 'inv-v', no: 'SRK-0099', voided: true, pay: [] };
  const db3 = { ...db, invoices: [voided] };
  items = notif.mergeNotificationsFromDatabase(db3, []);
  check('N16', items.filter((n) => n.type === 'outstanding').length === 0, 'voided excluded');

  // Header wiring source check
  const { readFileSync } = await import('fs');
  const { join, dirname } = await import('path');
  const { fileURLToPath } = await import('url');
  const root = join(dirname(fileURLToPath(import.meta.url)));
  const appSrc = readFileSync(join(root, 'src/App.tsx'), 'utf8');
  const headerSrc = readFileSync(join(root, 'src/components/DesktopHeader.tsx'), 'utf8');
  check('W1', !appSrc.includes('hello.rakshithass'), 'App no longer hardcodes hello.rakshithass');
  check('W2', appSrc.includes('companyName={db.settings.name}'), 'App passes settings company name');
  check('W3', headerSrc.includes('resolveCompanyDisplayName') && !headerSrc.includes('userEmail'), 'Header uses company name API');
  check('W4', headerSrc.includes('setPanelOpen') && headerSrc.includes('unreadCount'), 'bell toggles panel + unread badge');

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

import { AppDatabase, CompanySettings, Client, Invoice, BoxConfig } from '../types/billing';

const STORAGE_KEY = 'srk_enterprises_billing_db_v2';

export const DEFAULT_BOXES: BoxConfig[] = [
  { id: 'b1', n: '1 Litre Box', p: 120, hsn: '481910', pack: '1 Litre' },
  { id: 'b2', n: '2 Litre Box', p: 220, hsn: '481910', pack: '2 Litre' },
  { id: 'b3', n: '½ Litre Box', p: 65, hsn: '481910', pack: '½ Litre' },
  { id: 'b4', n: '250 ml Box', p: 35, hsn: '481910', pack: '250 ml' },
  { id: 'b5', n: '5 Litre Can', p: 65, hsn: '481910', pack: '5 Litre' },
  { id: 'b6', n: '10 Litre Can', p: 110, hsn: '481910', pack: '10 Litre' },
  { id: 'b7', n: '20 Litre Can', p: 100, hsn: '481910', pack: '20 Litre' }
];

export const DEFAULT_SETTINGS: CompanySettings = {
  name: 'SRK Enterprises',
  addr: 'No.41, MM Lane, Gangarapete, Bangalore North, Bangalore, Bangalore Corporation Building S.O, Karnataka, India - 560002',
  phone: '+91 6362595002',
  email: 'srkenterprises.blr@gmail.com',
  gst: '29DLDPK4054H1Z0',
  pan: 'DLDPK4054H',
  state: 'Karnataka (29)',
  gstOn: true,
  rate: 1, // 1% total (0.5% CGST + 0.5% SGST)
  cgstSplit: 0.5,
  sgstSplit: 0.5,
  defaultHsn: '481910',
  bankName: 'State Bank of India',
  accountNo: '384910294812',
  ifsc: 'SBIN0004123',
  branch: 'Bangalore MM Lane S.O Branch',
  upiId: '6362595002@upi',
  logoUrl: '',
  boxes: DEFAULT_BOXES,
  invoicePrefix: 'SRK-',
  nextSeq: 1
};

export const INITIAL_CLIENTS: Client[] = [
  {
    id: 'c1',
    name: 'Apex Retail Traders',
    phone: '+91 98450 12345',
    addr: '#12, Commercial Street, Bangalore, Karnataka - 560001',
    gst: '29ABCDE1234F1Z5',
    state: 'Karnataka',
    email: 'accounts@apexretail.in',
    createdAt: '2026-10-01'
  },
  {
    id: 'c2',
    name: 'GreenLeaf Supermarket',
    phone: '+91 98451 98765',
    addr: 'Plot 45, Indiranagar 100ft Road, Bangalore, Karnataka - 560038',
    gst: '29XYZPA5678Q1Z2',
    state: 'Karnataka',
    email: 'billing@greenleafmarket.com',
    createdAt: '2026-10-05'
  }
];

export const INITIAL_INVOICES: Invoice[] = [];

/** Ensure catalog products exist without overwriting user price edits. */
function mergeDefaultBoxes(existing: BoxConfig[] | undefined): BoxConfig[] {
  const list = Array.isArray(existing) ? [...existing] : [];
  const byId = new Map(list.map((b) => [b.id, b]));
  const byName = new Map(list.map((b) => [b.n.trim().toLowerCase(), b]));

  for (const def of DEFAULT_BOXES) {
    if (byId.has(def.id) || byName.has(def.n.trim().toLowerCase())) continue;
    list.push({ ...def });
    byId.set(def.id, def);
    byName.set(def.n.trim().toLowerCase(), def);
  }

  // Fill missing pack labels for older saved rows
  return list.map((b) => {
    const def = DEFAULT_BOXES.find((d) => d.id === b.id || d.n.trim().toLowerCase() === b.n.trim().toLowerCase());
    if (def && !b.pack) return { ...b, pack: def.pack };
    return b;
  });
}

export function getDatabase(): AppDatabase {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AppDatabase;
      if (parsed && Array.isArray(parsed.clients) && Array.isArray(parsed.invoices)) {
        parsed.settings = { ...DEFAULT_SETTINGS, ...parsed.settings };
        parsed.settings.boxes = mergeDefaultBoxes(parsed.settings.boxes);
        saveDatabase(parsed);
        return parsed;
      }
    }
  } catch (err) {
    console.error('Failed to parse database from localStorage', err);
  }

  const initialDb: AppDatabase = {
    clients: INITIAL_CLIENTS,
    invoices: INITIAL_INVOICES,
    settings: { ...DEFAULT_SETTINGS, boxes: [...DEFAULT_BOXES] }
  };
  saveDatabase(initialDb);
  return initialDb;
}

export function saveDatabase(db: AppDatabase): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch (err) {
    console.error('Failed to save database to localStorage', err);
  }
}

export function resetDatabase(): AppDatabase {
  const fresh: AppDatabase = {
    clients: INITIAL_CLIENTS,
    invoices: INITIAL_INVOICES,
    settings: { ...DEFAULT_SETTINGS, boxes: [...DEFAULT_BOXES] }
  };
  saveDatabase(fresh);
  return fresh;
}

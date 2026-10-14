export type PaymentMode = 'Cash' | 'UPI' | 'Bank' | 'Credit' | 'Cheque';

export type InvoiceStatus = 'Paid' | 'Part paid' | 'Pending';

export interface Client {
  id: string;
  name: string;
  phone: string;
  addr: string;
  gst: string;
  state?: string;
  email?: string;
  notes?: string;
  createdAt: string;
}

export interface InvoiceItem {
  id: string;
  n: string; // Item name / description
  hsn?: string;
  q: number; // Quantity
  r: number; // Rate per unit in ₹
}

export interface PaymentRecord {
  id: string;
  date: string;
  amt: number;
  mode: PaymentMode;
  refNo?: string;
  notes?: string;
}

export interface Invoice {
  id: string;
  no: string; // e.g. SRK-0001
  cid: string; // Client ID
  date: string; // YYYY-MM-DD
  items: InvoiceItem[];
  disc: number; // Discount in ₹
  gstOn: boolean;
  gstRate: number; // e.g. 1% (0.5% CGST + 0.5% SGST), or 5%, 12%, 18%
  isInterState?: boolean; // If true, IGST instead of CGST + SGST
  poNo?: string;
  poDate?: string;
  state?: string;
  hsnCode?: string;
  mode: PaymentMode;
  pay: PaymentRecord[];
  notes?: string;
  createdAt: string;
}

export interface BoxConfig {
  id: string;
  n: string; // Box name
  p: number; // Price in ₹
  hsn?: string;
  pack?: string; // Pack size e.g. 1 Litre
  qty?: number; // Stock quantity on hand
}

export interface CompanySettings {
  name: string;
  addr: string;
  phone: string;
  email: string;
  gst: string; // GSTIN: 29DLDPK4054H1Z0
  pan: string; // PAN: DLDPK4054H
  state: string; // Karnataka (29)
  gstOn: boolean;
  rate: number; // default GST rate (e.g. 1%)
  cgstSplit: number; // e.g. 0.5%
  sgstSplit: number; // e.g. 0.5%
  defaultHsn: string;
  bankName: string;
  accountNo: string;
  ifsc: string;
  branch: string;
  upiId: string;
  logoUrl?: string;
  boxes: BoxConfig[];
  invoicePrefix: string;
  nextSeq: number;
}

export interface AppDatabase {
  clients: Client[];
  invoices: Invoice[];
  settings: CompanySettings;
}

export interface InvoiceCalculation {
  sub: number;
  disc: number;
  taxable: number;
  gstRate: number;
  gst: number;
  cgst: number;
  sgst: number;
  igst: number;
  isInterState: boolean;
  total: number;
  paid: number;
  bal: number;
  st: InvoiceStatus;
}

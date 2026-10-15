export type PaymentMode = 'Cash' | 'UPI' | 'Bank' | 'Credit' | 'Cheque';

export type InvoiceStatus = 'Paid' | 'Part paid' | 'Pending';

export interface Client {
  id: string;
  name: string;
  phone: string;
  addr: string;
  gst: string;
  state?: string;
  pin?: string;
  email?: string;
  notes?: string;
  createdAt: string;
}

/** Buyer details frozen on the invoice at finalize time */
export interface InvoiceBuyerSnapshot {
  name: string;
  phone: string;
  addr: string;
  gst: string;
  state: string;
  pin: string;
}

/** Seller company + bank + branding frozen on the invoice at finalize time */
export interface InvoiceSellerSnapshot {
  name: string;
  addr: string;
  phone: string;
  email: string;
  gst: string;
  pan: string;
  state: string;
  bankName: string;
  accountNo: string;
  ifsc: string;
  branch: string;
  upiId: string;
  logoUrl?: string;
  /** empty = use app default handwritten signature asset */
  signatureUrl?: string;
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
  /**
   * Invoice this payment belongs to. New saves always set this.
   * Legacy records may omit it — they remain linked by nesting under invoice.pay.
   */
  invoiceId?: string;
}

export interface Invoice {
  id: string;
  no: string; // e.g. SRK-0001
  cid: string; // Client ID (empty for one-time unsaved walk-in)
  date: string; // YYYY-MM-DD
  items: InvoiceItem[];
  disc: number; // Discount in ₹
  gstOn: boolean;
  gstRate: number; // e.g. 1% (0.5% CGST + 0.5% SGST), or 5%, 12%, 18%
  isInterState?: boolean; // If true, IGST instead of CGST + SGST
  poNo?: string; // per-invoice only (not stored on customer)
  poDate?: string; // per-invoice only
  customerPhone?: string; // phone printed on invoice (from billing form)
  state?: string;
  hsnCode?: string;
  mode: PaymentMode;
  pay: PaymentRecord[];
  notes?: string;
  createdAt: string;
  /** When true, line items / identity fields should not be rewritten accidentally */
  finalized?: boolean;
  /** Soft-cancel: record kept for financial history; not hard-deleted */
  voided?: boolean;
  voidReason?: string;
  voidedAt?: string;
  voidedBy?: string;
  buyerSnapshot?: InvoiceBuyerSnapshot;
  sellerSnapshot?: InvoiceSellerSnapshot;
}

export type AuditAction =
  | 'migrate_p0'
  | 'backup_pre_p0'
  | 'invoice_void'
  | 'invoice_delete'
  | 'invoice_duplicate_blocked'
  | 'restore_backup'
  | 'salvage_corrupt';

export interface AuditEvent {
  id: string;
  at: string;
  action: AuditAction;
  invoiceId?: string;
  invoiceNo?: string;
  reason?: string;
  detail?: string;
}

export interface DbMeta {
  schemaVersion: number;
  /** Invoice numbers that were already duplicated before P0 — not auto-renamed */
  legacyDuplicateInvoiceNos?: string[];
  auditLog?: AuditEvent[];
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
  /** Optional custom signature data-URL; empty uses default handwritten asset */
  signatureUrl?: string;
  boxes: BoxConfig[];
  invoicePrefix: string;
  nextSeq: number;
}

export interface AppDatabase {
  clients: Client[];
  invoices: Invoice[];
  settings: CompanySettings;
  meta?: DbMeta;
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

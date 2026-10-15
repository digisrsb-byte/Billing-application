import { Invoice, InvoiceCalculation } from '../types/billing';

export function money(n: number | string | undefined | null): string {
  const num = typeof n === 'string' ? parseFloat(n) : (n ?? 0);
  if (isNaN(num)) return '₹ 0.00';
  return '₹ ' + num.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

export function formatNumber(n: number | string | undefined | null): string {
  const num = typeof n === 'string' ? parseFloat(n) : (n ?? 0);
  if (isNaN(num)) return '0.00';
  return num.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

export function todayISO(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatDateDisplay(dateStr: string): string {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const [y, m, d] = parts;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthIdx = parseInt(m, 10) - 1;
  const monthName = months[monthIdx] || m;
  return `${d}-${monthName}-${y}`;
}

export function formatShortDate(dateStr: string): string {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const [y, m, d] = parts;
  return `${d}/${m}/${y}`;
}

export type GstSplitOptions = {
  /** Share of GST for CGST (0–1, or percent > 1). Default 0.5. */
  cgstSplit?: number;
  /** Share of GST for SGST (0–1, or percent > 1). Default 0.5. */
  sgstSplit?: number;
};

/** Normalize CGST/SGST shares so they sum to 1. Accepts 0.5/0.5 or 50/50. */
export function normalizeGstSplits(
  cgstSplit?: number,
  sgstSplit?: number
): { cgst: number; sgst: number } {
  let c = Number(cgstSplit);
  let s = Number(sgstSplit);
  if (!Number.isFinite(c) || c < 0) c = 0.5;
  if (!Number.isFinite(s) || s < 0) s = 0.5;
  if (c === 0 && s === 0) {
    c = 0.5;
    s = 0.5;
  }
  // Values > 1 are treated as percentages (e.g. 50 + 50)
  if (c > 1 || s > 1) {
    const sum = c + s;
    return { cgst: c / sum, sgst: s / sum };
  }
  const sum = c + s;
  return { cgst: c / sum, sgst: s / sum };
}

export function calculateInvoice(
  inv: Partial<Invoice>,
  defaultGstRate: number = 1,
  splits?: GstSplitOptions
): InvoiceCalculation {
  const items = inv.items || [];
  const sub = items.reduce((acc, it) => acc + (Number(it.q) || 0) * (Number(it.r) || 0), 0);
  const rawDisc = Number(inv.disc) || 0;
  const disc = Math.min(rawDisc, sub);
  const taxable = Math.max(0, sub - disc);
  
  const gstOn = !!inv.gstOn;
  const gstRate = inv.gstRate !== undefined ? Number(inv.gstRate) : defaultGstRate;
  const isInterState = !!inv.isInterState;
  const { cgst: cgstShare, sgst: sgstShare } = normalizeGstSplits(
    splits?.cgstSplit,
    splits?.sgstSplit
  );

  let gst = 0;
  let cgst = 0;
  let sgst = 0;
  let igst = 0;

  if (gstOn && gstRate > 0) {
    gst = Math.round((taxable * gstRate / 100) * 100) / 100;
    if (isInterState) {
      igst = gst;
    } else {
      // Prefer CGST share; assign rounding residual to SGST so CGST+SGST === GST.
      void sgstShare;
      cgst = Math.round(gst * cgstShare * 100) / 100;
      sgst = Math.round((gst - cgst) * 100) / 100;
    }
  }

  const total = Math.round((taxable + gst) * 100) / 100;
  const paid = (inv.pay || []).reduce((acc, p) => acc + (Number(p.amt) || 0), 0);
  const bal = Math.round((total - paid) * 100) / 100;

  let st: InvoiceCalculation['st'] = 'Pending';
  if (total > 0 && bal <= 0.05) {
    st = 'Paid';
  } else if (paid > 0) {
    st = 'Part paid';
  }

  return {
    sub,
    disc,
    taxable,
    gstRate,
    gst,
    cgst,
    sgst,
    igst,
    isInterState,
    total,
    paid,
    bal,
    st
  };
}

export function generateInvoiceNo(prefix: string, seq: number): string {
  return `${prefix}${String(seq).padStart(4, '0')}`;
}

/** Display name for an invoice's customer (saved client, then buyer snapshot, then fallback). */
export function invoiceCustomerName(
  inv: Pick<Invoice, 'cid' | 'buyerSnapshot'>,
  clients: Array<{ id: string; name: string }>
): string {
  const fromClient = clients.find((c) => c.id === inv.cid)?.name?.trim();
  if (fromClient) return fromClient;
  const fromSnap = inv.buyerSnapshot?.name?.trim();
  if (fromSnap) return fromSnap;
  return 'Customer';
}

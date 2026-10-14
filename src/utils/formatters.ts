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

export function calculateInvoice(inv: Partial<Invoice>, defaultGstRate: number = 1): InvoiceCalculation {
  const items = inv.items || [];
  const sub = items.reduce((acc, it) => acc + (Number(it.q) || 0) * (Number(it.r) || 0), 0);
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
    gst = Math.round((taxable * gstRate / 100) * 100) / 100;
    if (isInterState) {
      igst = gst;
    } else {
      cgst = Math.round((gst / 2) * 100) / 100;
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

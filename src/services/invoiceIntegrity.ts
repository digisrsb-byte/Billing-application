import { Invoice, CompanySettings } from '../types/billing';
import { generateInvoiceNo } from '../utils/formatters';

/** Find invoice numbers that appear more than once (legacy data). Does not mutate. */
export function findDuplicateInvoiceNos(invoices: Invoice[]): string[] {
  const counts = new Map<string, number>();
  for (const inv of invoices) {
    const no = (inv.no || '').trim();
    if (!no) continue;
    counts.set(no, (counts.get(no) || 0) + 1);
  }
  return [...counts.entries()].filter(([, n]) => n > 1).map(([no]) => no).sort();
}

/** True if another invoice (optionally excluding one id) already uses this number. */
export function isInvoiceNoTaken(
  invoices: Invoice[],
  no: string,
  excludeId?: string
): boolean {
  const target = (no || '').trim();
  if (!target) return false;
  return invoices.some((inv) => inv.no === target && inv.id !== excludeId);
}

/** Highest numeric suffix for a given prefix among existing invoices. */
export function maxSeqForPrefix(invoices: Invoice[], prefix: string): number {
  let max = 0;
  for (const inv of invoices) {
    if (!inv.no?.startsWith(prefix)) continue;
    const suffix = inv.no.slice(prefix.length);
    const n = parseInt(suffix, 10);
    if (!Number.isNaN(n) && n > max) max = n;
  }
  return max;
}

/**
 * Ensure settings.nextSeq is at least one past the highest used number.
 * Safe across restarts; does not renumber existing invoices.
 */
export function syncNextSeq(settings: CompanySettings, invoices: Invoice[]): number {
  const maxUsed = maxSeqForPrefix(invoices, settings.invoicePrefix);
  return Math.max(settings.nextSeq || 1, maxUsed + 1);
}

/**
 * Allocate a unique invoice number. Skips numbers already present (including voided).
 * Returns the number and the next sequence value to persist.
 */
export function allocateInvoiceNo(
  prefix: string,
  nextSeq: number,
  invoices: Invoice[]
): { no: string; nextSeq: number } {
  let seq = Math.max(1, nextSeq || 1);
  const used = new Set(invoices.map((i) => i.no).filter(Boolean));
  // Also jump past max existing for this prefix
  seq = Math.max(seq, maxSeqForPrefix(invoices, prefix) + 1);

  let guard = 0;
  while (guard++ < 10000) {
    const no = generateInvoiceNo(prefix, seq);
    if (!used.has(no)) {
      return { no, nextSeq: seq + 1 };
    }
    seq += 1;
  }
  // Extremely unlikely fallback
  const fallback = `${prefix}${Date.now()}`;
  return { no: fallback, nextSeq: seq + 1 };
}

export type SaveInvoiceResult =
  | { ok: true; invoices: Invoice[]; nextSeq: number; saved: Invoice }
  | { ok: false; reason: 'DUPLICATE_INVOICE_NO' | 'FINALIZED_LOCKED'; invoices: Invoice[]; nextSeq: number; saved: Invoice };

/**
 * Persistent-layer invoice save with uniqueness + finalized protection.
 * On failure, returns previous invoices unchanged (transactional rollback).
 */
export function applyInvoiceSave(
  prevInvoices: Invoice[],
  prevNextSeq: number,
  invoice: Invoice,
  prefix: string
): SaveInvoiceResult {
  const existingIdx = prevInvoices.findIndex((i) => i.id === invoice.id);
  let nextInvoices = [...prevInvoices];
  let nextSeq = prevNextSeq;
  let saved = invoice;

  if (existingIdx >= 0) {
    const existing = prevInvoices[existingIdx];

    if (existing.finalized && !existing.voided) {
      const paymentsChanged =
        JSON.stringify(existing.pay || []) !== JSON.stringify(invoice.pay || []);
      const voidOnly =
        !!invoice.voided &&
        !existing.voided &&
        invoice.no === existing.no &&
        JSON.stringify(existing.items) === JSON.stringify(invoice.items);

      if (voidOnly) {
        saved = {
          ...existing,
          voided: true,
          voidReason: invoice.voidReason,
          voidedAt: invoice.voidedAt,
          voidedBy: invoice.voidedBy
        };
        nextInvoices[existingIdx] = saved;
        return { ok: true, invoices: nextInvoices, nextSeq, saved };
      }

      if (!paymentsChanged) {
        return {
          ok: false,
          reason: 'FINALIZED_LOCKED',
          invoices: prevInvoices,
          nextSeq: prevNextSeq,
          saved: existing
        };
      }
      saved = {
        ...existing,
        pay: invoice.pay,
        mode: invoice.mode
      };
      nextInvoices[existingIdx] = saved;
      return { ok: true, invoices: nextInvoices, nextSeq, saved };
    }

    // Non-finalized update: number change must stay unique
    if (isInvoiceNoTaken(prevInvoices, invoice.no, invoice.id)) {
      return {
        ok: false,
        reason: 'DUPLICATE_INVOICE_NO',
        invoices: prevInvoices,
        nextSeq: prevNextSeq,
        saved: existing
      };
    }
    nextInvoices[existingIdx] = invoice;
    saved = invoice;
    return { ok: true, invoices: nextInvoices, nextSeq, saved };
  }

  // New invoice
  let no = invoice.no;
  if (!no || isInvoiceNoTaken(prevInvoices, no)) {
    const alloc = allocateInvoiceNo(prefix, nextSeq, prevInvoices);
    no = alloc.no;
    nextSeq = alloc.nextSeq;
  } else {
    nextSeq = Math.max(nextSeq, maxSeqForPrefix([...prevInvoices, { ...invoice, no }], prefix) + 1);
    nextSeq = Math.max(nextSeq, prevNextSeq + 1);
  }

  saved = { ...invoice, no };
  if (isInvoiceNoTaken(prevInvoices, saved.no)) {
    return {
      ok: false,
      reason: 'DUPLICATE_INVOICE_NO',
      invoices: prevInvoices,
      nextSeq: prevNextSeq,
      saved: invoice
    };
  }

  nextInvoices.push(saved);
  return { ok: true, invoices: nextInvoices, nextSeq, saved };
}

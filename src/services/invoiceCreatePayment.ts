import { PaymentMode, PaymentRecord } from '../types/billing';

/** Invoice-creation payment choice (not the same as Cash/UPI/Bank method). */
export type CreatePaymentChoice = 'full' | 'partial' | 'later';

export type CreatePaymentMethod = Extract<PaymentMode, 'Cash' | 'UPI' | 'Bank'>;

export interface CreatePaymentPlanOk {
  ok: true;
  choice: CreatePaymentChoice;
  /** Amount to record now (0 for Pay Later). */
  received: number;
  /** Stored on invoice.mode */
  invoiceMode: PaymentMode;
  /** True only when exactly one payment row should be created. */
  createPayment: boolean;
  balanceDue: number;
}

export interface CreatePaymentPlanErr {
  ok: false;
  message: string;
}

export type CreatePaymentPlan = CreatePaymentPlanOk | CreatePaymentPlanErr;

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Resolves how much (if anything) to collect when creating an invoice.
 * - full → exactly one payment for the invoice total
 * - partial → exactly one payment for entered amount (0 < amt < total)
 * - later → no payment record
 */
export function resolveCreatePaymentPlan(
  choice: CreatePaymentChoice,
  invoiceTotal: number,
  partialAmountRaw: string,
  method: CreatePaymentMethod
): CreatePaymentPlan {
  const total = roundMoney(Number(invoiceTotal) || 0);

  if (choice === 'later') {
    return {
      ok: true,
      choice,
      received: 0,
      invoiceMode: 'Credit',
      createPayment: false,
      balanceDue: total
    };
  }

  if (choice === 'full') {
    if (total <= 0) {
      return {
        ok: true,
        choice,
        received: 0,
        invoiceMode: method,
        createPayment: false,
        balanceDue: 0
      };
    }
    return {
      ok: true,
      choice,
      received: total,
      invoiceMode: method,
      createPayment: true,
      balanceDue: 0
    };
  }

  // partial
  const raw = partialAmountRaw.trim() === '' ? NaN : Number(partialAmountRaw);
  if (!Number.isFinite(raw)) {
    return { ok: false, message: 'Enter a valid partial payment amount' };
  }
  const amt = roundMoney(raw);
  if (amt <= 0) {
    return { ok: false, message: 'Partial payment must be greater than zero' };
  }
  if (amt >= total) {
    return {
      ok: false,
      message:
        total > 0
          ? 'Partial payment must be less than the invoice total. Use Full Payment to settle in full.'
          : 'Cannot record a partial payment on a zero-total invoice'
    };
  }

  return {
    ok: true,
    choice,
    received: amt,
    invoiceMode: method,
    createPayment: true,
    balanceDue: roundMoney(total - amt)
  };
}

/** Build the single initial payment row (caller must not push more than once). */
export function buildInitialPaymentRecord(args: {
  invoiceId: string;
  amount: number;
  mode: CreatePaymentMethod;
  date: string;
  notes?: string;
}): PaymentRecord {
  return {
    id: 'p-' + Math.random().toString(36).slice(2, 9),
    date: args.date,
    amt: roundMoney(args.amount),
    mode: args.mode,
    notes: args.notes,
    invoiceId: args.invoiceId
  };
}

/** Preview amounts when switching choices in the UI (no validation errors). */
export function previewCreatePaymentAmounts(
  choice: CreatePaymentChoice,
  invoiceTotal: number,
  partialAmountRaw: string
): { paidNow: number; balanceDue: number } {
  const total = roundMoney(Number(invoiceTotal) || 0);
  if (choice === 'later') return { paidNow: 0, balanceDue: total };
  if (choice === 'full') return { paidNow: total, balanceDue: 0 };
  const raw = partialAmountRaw.trim() === '' ? 0 : Number(partialAmountRaw);
  const amt = Number.isFinite(raw) ? Math.max(0, roundMoney(raw)) : 0;
  const paidNow = Math.min(amt, total);
  return { paidNow, balanceDue: roundMoney(total - paidNow) };
}

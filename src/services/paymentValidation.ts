import { Invoice, PaymentRecord } from '../types/billing';
import { calculateInvoice } from '../utils/formatters';

/**
 * Currency tolerance (₹0.05) matching paid-status threshold in calculateInvoice.
 * Amounts within this epsilon of the outstanding balance are accepted.
 */
export const PAYMENT_TOLERANCE_INR = 0.05;

export type PaymentRejectReason =
  | 'VOIDED'
  | 'ALREADY_SETTLED'
  | 'NON_FINITE'
  | 'ZERO_OR_NEGATIVE'
  | 'OVERPAY'
  | 'INVOICE_MISMATCH'
  | 'INVOICE_REQUIRED';

export type PaymentValidationResult =
  | { ok: true; amt: number; outstanding: number }
  | { ok: false; reason: PaymentRejectReason; message: string; outstanding: number };

/** Outstanding = invoice total − sum of existing payment amounts (same model as calculateInvoice). */
export function getOutstandingBalance(invoice: Pick<Invoice, 'items' | 'disc' | 'gstOn' | 'gstRate' | 'isInterState' | 'pay'>, defaultGstRate: number): number {
  return calculateInvoice(invoice, defaultGstRate).bal;
}

/**
 * Authoritative payment amount check. Does not mutate invoice or audit state.
 * Callers must not persist when ok === false.
 */
export function validatePaymentAmount(
  invoice: Pick<Invoice, 'voided' | 'items' | 'disc' | 'gstOn' | 'gstRate' | 'isInterState' | 'pay'>,
  rawAmt: unknown,
  defaultGstRate: number
): PaymentValidationResult {
  const outstanding = getOutstandingBalance(invoice, defaultGstRate);

  if (invoice.voided) {
    return {
      ok: false,
      reason: 'VOIDED',
      message: 'Cannot record payment on a voided invoice',
      outstanding
    };
  }

  // Paid or overpaid (balance within tolerance or negative) — no further payments.
  if (outstanding <= PAYMENT_TOLERANCE_INR) {
    return {
      ok: false,
      reason: 'ALREADY_SETTLED',
      message:
        outstanding < -PAYMENT_TOLERANCE_INR
          ? 'Invoice is overpaid — cannot record additional payments'
          : 'Invoice is already paid — cannot record additional payments',
      outstanding
    };
  }

  const amt = typeof rawAmt === 'number' ? rawAmt : Number(rawAmt);
  if (!Number.isFinite(amt)) {
    return {
      ok: false,
      reason: 'NON_FINITE',
      message: 'Enter a valid payment amount',
      outstanding
    };
  }

  if (amt <= 0) {
    return {
      ok: false,
      reason: 'ZERO_OR_NEGATIVE',
      message: 'Payment amount must be greater than zero',
      outstanding
    };
  }

  // Reject when amount exceeds outstanding + tolerance (prevents negative balances).
  if (amt > outstanding + PAYMENT_TOLERANCE_INR) {
    return {
      ok: false,
      reason: 'OVERPAY',
      message: `Payment exceeds outstanding balance of ₹${Math.max(0, outstanding).toFixed(2)}`,
      outstanding
    };
  }

  return {
    ok: true,
    amt: Math.round(amt * 100) / 100,
    outstanding
  };
}

export type PaymentLinkFailure = Extract<PaymentValidationResult, { ok: false }>;

/**
 * Ensures a payment is bound to a specific invoice ID.
 * Rejects missing target ID, or a payment that claims a different invoiceId.
 */
export function assertPaymentInvoiceLink(
  targetInvoiceId: string | null | undefined,
  paymentInvoiceId?: string | null
): PaymentLinkFailure | null {
  if (!targetInvoiceId || typeof targetInvoiceId !== 'string' || !targetInvoiceId.trim()) {
    return {
      ok: false,
      reason: 'INVOICE_REQUIRED',
      message: 'Select an invoice before recording a payment',
      outstanding: 0
    };
  }
  if (paymentInvoiceId && paymentInvoiceId !== targetInvoiceId) {
    return {
      ok: false,
      reason: 'INVOICE_MISMATCH',
      message: 'Payment invoice ID does not match the selected invoice',
      outstanding: 0
    };
  }
  return null;
}

/** Convenience: validate a PaymentRecord against an invoice. */
export function validatePaymentRecord(
  invoice: Pick<Invoice, 'voided' | 'items' | 'disc' | 'gstOn' | 'gstRate' | 'isInterState' | 'pay'>,
  payment: Pick<PaymentRecord, 'amt'>,
  defaultGstRate: number
): PaymentValidationResult {
  return validatePaymentAmount(invoice, payment.amt, defaultGstRate);
}

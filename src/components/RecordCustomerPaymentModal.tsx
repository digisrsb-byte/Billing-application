import React, { useEffect, useMemo, useState } from 'react';
import { AppDatabase, Invoice, PaymentRecord } from '../types/billing';
import { calculateInvoice, invoiceCustomerName, money, todayISO } from '../utils/formatters';
import { validatePaymentRecord } from '../services/paymentValidation';
import { X } from 'lucide-react';

export interface RecordCustomerPaymentModalProps {
  db: AppDatabase;
  /** When set (e.g. from Invoices), that invoice is pre-selected. Payments page passes null. */
  initialInvoice?: Invoice | null;
  /** When false, invoice dropdown is locked to initialInvoice. */
  allowInvoiceChange?: boolean;
  onClose: () => void;
  onSave: (invoiceId: string, payment: PaymentRecord) => void | Promise<boolean | void>;
}

const MODES: PaymentRecord['mode'][] = ['Cash', 'UPI', 'Bank', 'Cheque'];

/**
 * Prominent Record Customer Payment modal.
 * Does not auto-select the first payable invoice — user must choose (unless initialInvoice is provided).
 * Business rules: validatePaymentRecord + invoiceId stamp; no persistence changes here.
 */
export const RecordCustomerPaymentModal: React.FC<RecordCustomerPaymentModalProps> = ({
  db,
  initialInvoice = null,
  allowInvoiceChange = true,
  onClose,
  onSave
}) => {
  const payable = useMemo(
    () =>
      db.invoices
        .filter((i) => !i.voided && calculateInvoice(i, db.settings.rate).bal > 0.05)
        .slice()
        .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.no < b.no ? 1 : -1)),
    [db.invoices, db.settings.rate]
  );

  // Include a locked initial invoice even if somehow not in payable (edge: race); still validate on save.
  const selectable = useMemo(() => {
    if (!initialInvoice) return payable;
    if (payable.some((i) => i.id === initialInvoice.id)) return payable;
    return [initialInvoice, ...payable];
  }, [payable, initialInvoice]);

  // Critical: do NOT default to first payable invoice when opening from Payments.
  const [selectedId, setSelectedId] = useState<string>(() => initialInvoice?.id || '');
  const [amtStr, setAmtStr] = useState<string>('');
  const [mode, setMode] = useState<PaymentRecord['mode']>('Cash');
  const [date, setDate] = useState<string>(todayISO());
  const [refNo, setRefNo] = useState<string>('');
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  const selected = selectable.find((i) => i.id === selectedId) || null;
  const calc = selected ? calculateInvoice(selected, db.settings.rate) : null;

  // When invoice changes (user pick or initial), seed amount to outstanding — empty until an invoice is chosen.
  useEffect(() => {
    if (!selected || !calc) {
      setAmtStr('');
      return;
    }
    setAmtStr(calc.bal > 0 ? calc.bal.toFixed(2) : '');
    setFormError('');
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps -- intentional: only when selection changes

  const handleInvoiceChange = (id: string) => {
    setSelectedId(id);
    setFormError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!selectedId || !selected) {
      setFormError('Select an invoice before recording a payment');
      return;
    }

    if (selected.voided) {
      setFormError('Cannot record payment on a voided invoice');
      return;
    }

    const rawAmt = amtStr.trim() === '' ? NaN : Number(amtStr);
    const check = validatePaymentRecord(selected, { amt: rawAmt }, db.settings.rate);
    if (!check.ok) {
      setFormError(check.message);
      return;
    }

    const payment: PaymentRecord = {
      id: 'p-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      date,
      amt: check.amt,
      mode,
      refNo: refNo.trim(),
      invoiceId: selected.id
    };

    setBusy(true);
    try {
      const ok = await Promise.resolve(onSave(selected.id, payment));
      if (ok === false) {
        setBusy(false);
        return;
      }
    } catch {
      setFormError('Could not save payment. Please try again.');
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-60 bg-[#081C2D]/55 backdrop-blur-[2px] flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="record-payment-title"
    >
      <div className="bg-white w-full max-w-[800px] max-h-[90vh] rounded-2xl border border-slate-200/90 shadow-[0_24px_64px_rgba(8,28,45,0.22)] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="shrink-0 px-6 sm:px-8 pt-6 pb-5 border-b border-slate-100 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-[#1F7A63] m-0 mb-1.5">
              Cash flow
            </p>
            <h2 id="record-payment-title" className="text-xl sm:text-2xl font-extrabold text-[#081C2D] m-0 tracking-tight">
              Record Customer Payment
            </h2>
            <p className="text-sm text-slate-500 m-0 mt-2 leading-relaxed max-w-xl">
              Choose the invoice this payment belongs to. The amount is linked to that invoice ID and updates
              paid balance and status immediately.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 w-10 h-10 rounded-xl border border-slate-200 bg-slate-50 text-slate-500 hover:text-[#081C2D] hover:bg-slate-100 flex items-center justify-center cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body (scrolls) */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto px-6 sm:px-8 py-6 space-y-6">
            {/* Invoice selection */}
            <div>
              <label htmlFor="payment-invoice" className="block text-sm font-bold text-[#081C2D] mb-2">
                Invoice <span className="text-rose-600">*</span>
              </label>
              {selectable.length === 0 ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 font-medium">
                  No invoices with an outstanding balance. Create an invoice or clear an existing balance first.
                </div>
              ) : (
                <select
                  id="payment-invoice"
                  value={selectedId}
                  disabled={!allowInvoiceChange}
                  onChange={(e) => handleInvoiceChange(e.target.value)}
                  className="w-full h-12 px-4 text-sm font-semibold bg-[#F8FAFB] border border-slate-300 rounded-xl text-[#081C2D] focus:outline-none focus:border-[#1F7A63] focus:ring-2 focus:ring-[#1F7A63]/20 focus:bg-white disabled:opacity-80 disabled:cursor-not-allowed"
                >
                  <option value="">Select an invoice…</option>
                  {selectable.map((inv) => {
                    const c = calculateInvoice(inv, db.settings.rate);
                    const name = invoiceCustomerName(inv, db.clients);
                    return (
                      <option key={inv.id} value={inv.id}>
                        {inv.no} — {name} — due {money(c.bal)}
                      </option>
                    );
                  })}
                </select>
              )}
            </div>

            {/* Summary panel */}
            <div
              className={`rounded-2xl border p-4 sm:p-5 ${
                selected && calc
                  ? 'border-[#1F7A63]/25 bg-gradient-to-br from-[#F5F7FA] to-white'
                  : 'border-dashed border-slate-200 bg-slate-50/60'
              }`}
            >
              {selected && calc ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                      Invoice #
                    </div>
                    <div className="text-base font-mono font-extrabold text-[#1F7A63]">{selected.no}</div>
                  </div>
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                      Customer
                    </div>
                    <div className="text-base font-bold text-[#081C2D] truncate" title={invoiceCustomerName(selected, db.clients)}>
                      {invoiceCustomerName(selected, db.clients)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                      Invoice total
                    </div>
                    <div className="text-base font-mono font-bold tabular-nums text-slate-800">
                      {money(calc.total)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                      Already paid
                    </div>
                    <div className="text-base font-mono font-bold tabular-nums text-emerald-700">
                      {money(calc.paid)}
                    </div>
                  </div>
                  <div className="sm:col-span-2 lg:col-span-4 rounded-xl border border-amber-200/80 bg-amber-50/90 px-4 py-3 flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-sm font-bold text-amber-900">Outstanding balance</span>
                    <span className="text-2xl font-mono font-extrabold tabular-nums text-amber-800">
                      {money(calc.bal)}
                    </span>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-500 m-0 py-2">
                  Select an invoice to see total, amount paid, and outstanding balance.
                </p>
              )}
            </div>

            {/* Amount */}
            <div>
              <label htmlFor="payment-amount" className="block text-sm font-bold text-[#081C2D] mb-2">
                Payment amount <span className="text-rose-600">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg font-bold text-slate-400 pointer-events-none">
                  ₹
                </span>
                <input
                  id="payment-amount"
                  type="number"
                  inputMode="decimal"
                  min="0.01"
                  step="0.01"
                  required
                  disabled={!selected}
                  value={amtStr}
                  onChange={(e) => {
                    setAmtStr(e.target.value);
                    setFormError('');
                  }}
                  placeholder="0.00"
                  className="w-full h-14 pl-10 pr-4 font-mono font-extrabold text-2xl bg-[#F8FAFB] border border-slate-300 rounded-xl text-[#081C2D] focus:outline-none focus:border-[#1F7A63] focus:ring-2 focus:ring-[#1F7A63]/20 focus:bg-white disabled:opacity-50 tabular-nums"
                />
              </div>
              {calc && (
                <p className="text-xs text-slate-500 mt-2 m-0">
                  Enter up to {money(calc.bal)}. Partial payments are allowed.
                </p>
              )}
            </div>

            {/* Method */}
            <div>
              <div className="block text-sm font-bold text-[#081C2D] mb-2" id="payment-mode-label">
                Payment method
              </div>
              <div
                role="group"
                aria-labelledby="payment-mode-label"
                className="grid grid-cols-2 sm:grid-cols-4 gap-2"
              >
                {MODES.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    className={`h-11 rounded-xl text-sm font-bold border transition-colors cursor-pointer ${
                      mode === m
                        ? 'bg-[#1F7A63] border-[#1F7A63] text-white shadow-sm'
                        : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            {/* Date + ref */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="payment-date" className="block text-sm font-bold text-[#081C2D] mb-2">
                  Payment date
                </label>
                <input
                  id="payment-date"
                  type="date"
                  required
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full h-12 px-4 text-sm font-semibold bg-[#F8FAFB] border border-slate-300 rounded-xl text-[#081C2D] focus:outline-none focus:border-[#1F7A63] focus:ring-2 focus:ring-[#1F7A63]/20 focus:bg-white"
                />
              </div>
              <div>
                <label htmlFor="payment-ref" className="block text-sm font-bold text-[#081C2D] mb-2">
                  Transaction reference / note
                </label>
                <input
                  id="payment-ref"
                  type="text"
                  value={refNo}
                  onChange={(e) => setRefNo(e.target.value)}
                  placeholder="e.g. UPI Ref / Cheque 002910"
                  className="w-full h-12 px-4 text-sm font-mono bg-[#F8FAFB] border border-slate-300 rounded-xl text-[#081C2D] focus:outline-none focus:border-[#1F7A63] focus:ring-2 focus:ring-[#1F7A63]/20 focus:bg-white"
                />
              </div>
            </div>

            {formError && (
              <div
                role="alert"
                className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800"
              >
                {formError}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="shrink-0 px-6 sm:px-8 py-4 border-t border-slate-100 bg-slate-50/80 flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="h-12 px-6 rounded-xl bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 font-bold text-sm cursor-pointer disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy || selectable.length === 0}
              className="h-12 px-8 rounded-xl bg-[#1F7A63] hover:bg-[#186351] disabled:opacity-60 text-white font-extrabold text-sm cursor-pointer shadow-sm"
            >
              {busy ? 'Saving…' : 'Save Payment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

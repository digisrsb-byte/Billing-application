import React, { useState, useMemo } from 'react';
import { AppDatabase, Invoice, PaymentMode, PaymentRecord } from '../types/billing';
import { calculateInvoice, money, todayISO, formatDateDisplay } from '../utils/formatters';
import { CreditCard, CheckCircle2, History, Plus, X } from 'lucide-react';

interface PaymentsLedgerProps {
  db: AppDatabase;
  onRecordPaymentToInvoice: (invoiceId: string, payment: PaymentRecord) => void;
  onViewInvoice: (invoice: Invoice) => void;
  showToast: (msg: string) => void;
}

export const PaymentsLedger: React.FC<PaymentsLedgerProps> = ({
  db,
  onRecordPaymentToInvoice,
  onViewInvoice,
  showToast
}) => {
  const [tab, setTab] = useState<'pending' | 'history'>('pending');
  const [activePayingInvoice, setActivePayingInvoice] = useState<Invoice | null>(null);

  // Payment Form state
  const [payAmount, setPayAmount] = useState<number>(0);
  const [payMode, setPayMode] = useState<PaymentMode>('Cash');
  const [payDate, setPayDate] = useState<string>(todayISO());
  const [payRef, setPayRef] = useState<string>('');
  const [payNotes, setPayNotes] = useState<string>('');

  // Pending invoices
  const pendingInvoices = useMemo(() => {
    return db.invoices
      .filter((i) => calculateInvoice(i, db.settings.rate).bal > 0.05)
      .slice()
      .reverse();
  }, [db.invoices, db.settings.rate]);

  // All payment transactions
  const allPayments = useMemo(() => {
    return db.invoices.flatMap((inv) => {
      const client = db.clients.find((c) => c.id === inv.cid);
      return (inv.pay || []).map((p) => ({
        ...p,
        invoiceId: inv.id,
        invoiceNo: inv.no,
        clientName: client?.name || 'Customer'
      }));
    }).sort((a, b) => (b.date > a.date ? 1 : -1));
  }, [db.invoices, db.clients]);

  // Payment totals by mode
  const modeTotals = useMemo(() => {
    const totals: Record<string, number> = { Cash: 0, UPI: 0, Bank: 0, Cheque: 0, Total: 0 };
    allPayments.forEach((p) => {
      totals[p.mode] = (totals[p.mode] || 0) + Number(p.amt);
      totals.Total += Number(p.amt);
    });
    return totals;
  }, [allPayments]);

  const handleOpenPay = (inv: Invoice) => {
    const calc = calculateInvoice(inv, db.settings.rate);
    setActivePayingInvoice(inv);
    setPayAmount(calc.bal);
    setPayMode('Cash');
    setPayDate(todayISO());
    setPayRef('');
    setPayNotes('');
  };

  const handleSavePayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activePayingInvoice) return;

    if (!payAmount || payAmount <= 0) {
      showToast('Please enter a valid payment amount');
      return;
    }

    const newPayment: PaymentRecord = {
      id: 'p-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      date: payDate,
      amt: Number(payAmount),
      mode: payMode,
      refNo: payRef.trim(),
      notes: payNotes.trim()
    };

    onRecordPaymentToInvoice(activePayingInvoice.id, newPayment);
    showToast(`Payment of ${money(payAmount)} recorded for ${activePayingInvoice.no}`);
    setActivePayingInvoice(null);
  };

  return (
    <div className="space-y-5 max-w-6xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 m-0">Payments & Receipts</h2>
          <p className="text-xs text-slate-500 mt-0.5 m-0">
            Track receivables, record settlement receipts, and audit collections
          </p>
        </div>

        {/* Segmented Tab Filter */}
        <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg text-xs font-semibold">
          <button
            type="button"
            onClick={() => setTab('pending')}
            className={`px-3 py-1.5 rounded-md transition-all cursor-pointer ${
              tab === 'pending'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Pending Dues ({pendingInvoices.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('history')}
            className={`px-3 py-1.5 rounded-md transition-all cursor-pointer ${
              tab === 'history'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Payment History ({allPayments.length})
          </button>
        </div>
      </div>

      {/* Collection Stats Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-white p-3.5 rounded-xl border border-slate-200 text-xs">
        <div>
          <span className="text-slate-500">Total Collections:</span>
          <div className="font-bold font-mono text-emerald-800 text-base">{money(modeTotals.Total)}</div>
        </div>
        <div>
          <span className="text-slate-500">Cash Received:</span>
          <div className="font-bold font-mono tabular-nums text-slate-900 text-base">{money(modeTotals.Cash)}</div>
        </div>
        <div>
          <span className="text-slate-500">UPI Received:</span>
          <div className="font-bold font-mono tabular-nums text-teal-800 text-base">{money(modeTotals.UPI)}</div>
        </div>
        <div>
          <span className="text-slate-500">Bank / NEFT:</span>
          <div className="font-bold font-mono tabular-nums text-indigo-800 text-base">{money(modeTotals.Bank + modeTotals.Cheque)}</div>
        </div>
      </div>

      {/* View 1: Pending Invoices */}
      {tab === 'pending' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex justify-between items-center">
            <h3 className="font-bold text-slate-900 text-sm m-0">Invoices Awaiting Settlement</h3>
            <span className="text-xs text-slate-500 font-mono">
              {pendingInvoices.length} invoices
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-semibold">
                  <th className="py-3 px-4">Invoice No</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Client</th>
                  <th className="py-3 px-4 text-right">Invoice Total</th>
                  <th className="py-3 px-4 text-right">Already Paid</th>
                  <th className="py-3 px-4 text-right">Balance Due</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pendingInvoices.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-400">
                      No pending invoices! All accounts are fully settled.
                    </td>
                  </tr>
                ) : (
                  pendingInvoices.map((inv) => {
                    const client = db.clients.find((c) => c.id === inv.cid);
                    const calc = calculateInvoice(inv, db.settings.rate);

                    return (
                      <tr key={inv.id} className="hover:bg-slate-50/60 transition-colors">
                        <td
                          onClick={() => onViewInvoice(inv)}
                          className="py-3 px-4 font-bold font-mono text-teal-800 cursor-pointer hover:underline"
                        >
                          {inv.no}
                        </td>
                        <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                          {formatDateDisplay(inv.date)}
                        </td>
                        <td className="py-3 px-4 font-semibold text-slate-900">
                          {client?.name || '—'}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700">
                          {money(calc.total)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-emerald-700">
                          {money(calc.paid)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums font-bold text-amber-700">
                          {money(calc.bal)}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-800">
                            {calc.st}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            type="button"
                            onClick={() => handleOpenPay(inv)}
                            className="px-3 py-1.5 text-xs font-bold rounded-md bg-teal-700 hover:bg-teal-800 text-white transition-colors cursor-pointer shadow-2xs"
                          >
                            Record Payment
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* View 2: Payment History Log */}
      {tab === 'history' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex justify-between items-center">
            <h3 className="font-bold text-slate-900 text-sm m-0">Recent Receipts & Collections</h3>
            <span className="text-xs text-slate-500 font-mono">
              {allPayments.length} entries
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-semibold">
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Invoice #</th>
                  <th className="py-3 px-4">Client</th>
                  <th className="py-3 px-4">Mode</th>
                  <th className="py-3 px-4">Reference / Notes</th>
                  <th className="py-3 px-4 text-right">Amount Received</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {allPayments.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-400">
                      No payment transactions recorded yet.
                    </td>
                  </tr>
                ) : (
                  allPayments.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                        {formatDateDisplay(p.date)}
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-teal-800">
                        {p.invoiceNo}
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-900">
                        {p.clientName}
                      </td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-700">
                          {p.mode}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-500 text-[11px]">
                        {p.refNo && <span className="font-mono text-slate-700 mr-1.5">Ref: {p.refNo}</span>}
                        {p.notes || ''}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold tabular-nums text-emerald-700 text-sm">
                        {money(p.amt)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Record Payment Modal */}
      {activePayingInvoice && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
              <div>
                <h3 className="font-bold text-slate-900 text-sm m-0">
                  Record Payment for {activePayingInvoice.no}
                </h3>
                <p className="text-xs text-slate-500 m-0 mt-0.5">
                  Balance due: {money(calculateInvoice(activePayingInvoice, db.settings.rate).bal)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActivePayingInvoice(null)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSavePayment} className="p-5 space-y-3.5 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Payment Amount (₹) *</label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                  value={payAmount || ''}
                  onChange={(e) => setPayAmount(Math.max(0, Number(e.target.value) || 0))}
                  className="w-full h-10 px-3 font-mono font-bold text-lg bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-teal-600"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Payment Mode</label>
                <div className="grid grid-cols-4 gap-1 p-1 bg-slate-100 rounded-lg">
                  {(['Cash', 'UPI', 'Bank', 'Cheque'] as PaymentMode[]).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setPayMode(m)}
                      className={`py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                        payMode === m
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Payment Date</label>
                <input
                  type="date"
                  required
                  value={payDate}
                  onChange={(e) => setPayDate(e.target.value)}
                  className="w-full h-9 px-3 bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-teal-600 text-xs"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Transaction Ref / Cheque No (Optional)</label>
                <input
                  type="text"
                  value={payRef}
                  onChange={(e) => setPayRef(e.target.value)}
                  placeholder="e.g. UPI Ref / Cheque 002910"
                  className="w-full h-9 px-3 bg-white border border-slate-300 rounded-lg text-slate-900 font-mono focus:outline-teal-600 text-xs"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Notes / Remarks</label>
                <input
                  type="text"
                  value={payNotes}
                  onChange={(e) => setPayNotes(e.target.value)}
                  placeholder="e.g. Received via PhonePe"
                  className="w-full h-9 px-3 bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-teal-600 text-xs"
                />
              </div>

              <div className="pt-3 flex justify-end gap-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setActivePayingInvoice(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg transition-colors cursor-pointer text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white font-bold rounded-lg transition-colors cursor-pointer text-xs shadow-sm"
                >
                  Save Payment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

import React, { useMemo } from 'react';
import { AppDatabase, Invoice } from '../types/billing';
import { calculateInvoice, money, formatDateDisplay, invoiceCustomerName } from '../utils/formatters';
import { Plus, CreditCard, Wallet, FileText } from 'lucide-react';

interface PaymentsViewProps {
  db: AppDatabase;
  onOpenRecordPayment: () => void;
  onViewInvoice: (invoice: Invoice) => void;
}

export const PaymentsView: React.FC<PaymentsViewProps> = ({
  db,
  onOpenRecordPayment,
  onViewInvoice
}) => {
  // Activity rows are derived from invoice.pay[] — each payment is linked by parent invoice
  // (and invoiceId when present). Never invent a separate unlinked payments list.
  const allPayments = useMemo(() => {
    return db.invoices
      .flatMap((inv) => {
        const clientName = invoiceCustomerName(inv, db.clients);
        return (inv.pay || []).map((p) => ({
          ...p,
          invoiceId: p.invoiceId || inv.id,
          invoiceNo: inv.no,
          clientName,
          invoice: inv
        }));
      })
      .sort((a, b) => (b.date > a.date ? 1 : -1));
  }, [db.invoices, db.clients]);

  const totalCollected = useMemo(() => {
    return allPayments.reduce((sum, p) => sum + Number(p.amt), 0);
  }, [allPayments]);

  const pendingInvoices = useMemo(() => {
    return db.invoices.filter((i) => !i.voided && calculateInvoice(i, db.settings.rate).bal > 0.05);
  }, [db.invoices, db.settings.rate]);

  const totalOpenBalance = useMemo(() => {
    return pendingInvoices.reduce((sum, inv) => sum + calculateInvoice(inv, db.settings.rate).bal, 0);
  }, [pendingInvoices, db.settings.rate]);

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-16">
      {/* Top Banner Row */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-[11px] font-extrabold uppercase tracking-widest text-[#1F7A63]">
            CASH FLOW
          </div>
          <h1 className="text-3xl font-extrabold text-slate-900 mt-1 m-0 tracking-tight">
            Payments
          </h1>
          <p className="text-sm text-slate-500 mt-1 m-0">
            See what has been collected and what still needs attention.
          </p>
        </div>

        <button
          type="button"
          onClick={onOpenRecordPayment}
          className="h-10 px-5 bg-[#1F7A63] hover:bg-[#186351] text-white font-bold rounded-xl shadow-xs transition-colors flex items-center gap-2 cursor-pointer text-xs"
        >
          <Plus className="w-4 h-4" />
          <span>Record payment</span>
        </button>
      </div>

      {/* 3 Summary Stats Cards matching Image 6 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-2xs">
          <div className="flex justify-between items-start">
            <span className="text-xs font-semibold text-slate-500">Total collected</span>
            <div className="w-6 h-6 rounded-md bg-[#F5F7FA] text-[#1F7A63] flex items-center justify-center">
              <Wallet className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-3xl font-extrabold font-mono text-slate-900 mt-3 tabular-nums">
            {totalCollected === 0 ? '₹0' : money(totalCollected)}
          </div>
          <div className="text-xs text-slate-400 mt-1">Across all methods</div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-2xs">
          <div className="flex justify-between items-start">
            <span className="text-xs font-semibold text-slate-500">Open balance</span>
            <div className="w-6 h-6 rounded-md bg-[#F5F7FA] text-[#1F7A63] flex items-center justify-center">
              <CreditCard className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-3xl font-extrabold font-mono text-slate-900 mt-3 tabular-nums">
            {totalOpenBalance === 0 ? '₹0' : money(totalOpenBalance)}
          </div>
          <div className="text-xs text-slate-400 mt-1">{pendingInvoices.length} invoices</div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-2xs">
          <div className="flex justify-between items-start">
            <span className="text-xs font-semibold text-slate-500">Transactions</span>
            <div className="w-6 h-6 rounded-md bg-[#F5F7FA] text-[#1F7A63] flex items-center justify-center">
              <span className="font-bold text-xs">₹</span>
            </div>
          </div>
          <div className="text-3xl font-extrabold font-mono text-slate-900 mt-3 tabular-nums">
            {allPayments.length}
          </div>
          <div className="text-xs text-slate-400 mt-1">Recorded payments</div>
        </div>
      </div>

      {/* Main Payment Activity Card matching Image 6 */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
        <div className="p-6 border-b border-slate-200/80">
          <h2 className="text-base font-bold text-slate-900 m-0">Payment activity</h2>
          <p className="text-xs text-slate-500 mt-0.5 m-0">Every collection, in one reliable history</p>
        </div>

        {allPayments.length === 0 ? (
          /* Empty state matching Image 6 */
          <div className="py-20 px-6 text-center flex flex-col items-center justify-center">
            <div className="w-12 h-12 rounded-2xl bg-[#F5F7FA] text-[#1F7A63] flex items-center justify-center mb-3">
              <FileText className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-900 m-0">No payments recorded</h3>
            <p className="text-xs text-slate-500 max-w-sm mt-1 mb-5">
              Record your first payment to keep cash flow up to date.
            </p>
            <button
              type="button"
              onClick={onOpenRecordPayment}
              className="h-10 px-5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 font-bold rounded-xl transition-all shadow-2xs flex items-center gap-2 cursor-pointer text-xs"
            >
              <Plus className="w-4 h-4 text-slate-600" />
              <span>Record payment</span>
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="bg-slate-50/70 border-b border-slate-200 text-slate-500 font-semibold">
                  <th className="py-3 px-6">Date</th>
                  <th className="py-3 px-6">Invoice #</th>
                  <th className="py-3 px-6">Client</th>
                  <th className="py-3 px-6">Method</th>
                  <th className="py-3 px-6">Reference / Note</th>
                  <th className="py-3 px-6 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {allPayments.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3.5 px-6 text-slate-600 whitespace-nowrap">
                      {formatDateDisplay(p.date)}
                    </td>
                    <td className="py-3.5 px-6 font-bold font-mono text-[#1F7A63]">
                      <button
                        type="button"
                        onClick={() => onViewInvoice(p.invoice)}
                        className="bg-transparent border-0 p-0 font-bold font-mono text-[#1F7A63] cursor-pointer hover:underline"
                      >
                        {p.invoiceNo}
                      </button>
                    </td>
                    <td className="py-3.5 px-6 font-semibold text-slate-900">
                      {p.clientName}
                    </td>
                    <td className="py-3.5 px-6">
                      <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-100 text-slate-700">
                        {p.mode}
                      </span>
                    </td>
                    <td className="py-3.5 px-6 text-slate-500 text-[11px]">
                      {p.refNo && <span className="font-mono text-slate-700 mr-1.5 font-semibold">Ref: {p.refNo}</span>}
                      {p.notes || ''}
                    </td>
                    <td className="py-3.5 px-6 text-right font-mono font-bold text-emerald-700 tabular-nums">
                      {money(p.amt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

import React, { useState, useMemo } from 'react';
import { AppDatabase, Invoice } from '../types/billing';
import { calculateInvoice, money, formatDateDisplay } from '../utils/formatters';
import { 
  Plus, 
  Search, 
  FileText, 
  Calendar, 
  ChevronDown, 
  Printer, 
  Trash2, 
  CreditCard 
} from 'lucide-react';

interface InvoicesViewProps {
  db: AppDatabase;
  onCreateInvoice: () => void;
  onViewInvoice: (invoice: Invoice) => void;
  onDeleteInvoice: (id: string) => void;
  onRecordPayment: (invoice: Invoice) => void;
}

export const InvoicesView: React.FC<InvoicesViewProps> = ({
  db,
  onCreateInvoice,
  onViewInvoice,
  onDeleteInvoice,
  onRecordPayment
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Calculations
  const stats = useMemo(() => {
    let totalInvoices = db.invoices.length;
    let awaitingPayment = 0;
    let totalValue = 0;
    let totalCollected = 0;

    db.invoices.forEach((inv) => {
      const calc = calculateInvoice(inv, db.settings.rate);
      totalValue += calc.total;
      totalCollected += calc.paid;
      if (calc.bal > 0.05) {
        awaitingPayment += 1;
      }
    });

    return { totalInvoices, awaitingPayment, totalValue, totalCollected };
  }, [db.invoices, db.settings.rate]);

  // Filtered list
  const filtered = useMemo(() => {
    return db.invoices.filter((inv) => {
      const client = db.clients.find((c) => c.id === inv.cid);
      const calc = calculateInvoice(inv, db.settings.rate);

      if (statusFilter && calc.st !== statusFilter) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchNo = inv.no.toLowerCase().includes(q);
        const matchName = (client?.name || '').toLowerCase().includes(q);
        if (!matchNo && !matchName) return false;
      }

      return true;
    }).slice().reverse();
  }, [db.invoices, db.clients, db.settings.rate, searchQuery, statusFilter]);

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-16">
      {/* Top Banner Row */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-[11px] font-extrabold uppercase tracking-widest text-[#1F7A63]">
            Billing
          </div>
          <h1 className="text-3xl font-extrabold text-slate-900 mt-1 m-0 tracking-tight">
            Invoices
          </h1>
          <p className="text-sm text-slate-500 mt-1 m-0">
            Create, track, and keep every customer invoice in one place.
          </p>
        </div>

        <button
          type="button"
          onClick={onCreateInvoice}
          className="h-10 px-5 bg-[#1F7A63] hover:bg-[#186351] text-white font-bold rounded-xl shadow-xs transition-colors flex items-center gap-2 cursor-pointer text-xs"
        >
          <Plus className="w-4 h-4" />
          <span>Create invoice</span>
        </button>
      </div>

      {/* 4 Summary Stats Cards matching Image 4 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-2xs">
          <span className="text-xs font-semibold text-slate-500">Total invoices</span>
          <div className="text-3xl font-extrabold font-mono text-slate-900 mt-3 tabular-nums">
            {stats.totalInvoices}
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-2xs">
          <span className="text-xs font-semibold text-slate-500">Awaiting payment</span>
          <div className="text-3xl font-extrabold font-mono text-slate-900 mt-3 tabular-nums">
            {stats.awaitingPayment}
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-2xs">
          <span className="text-xs font-semibold text-slate-500">Invoice value</span>
          <div className="text-3xl font-extrabold font-mono text-slate-900 mt-3 tabular-nums">
            {stats.totalValue === 0 ? '₹0' : money(stats.totalValue)}
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-2xs">
          <span className="text-xs font-semibold text-slate-500">Collected</span>
          <div className="text-3xl font-extrabold font-mono text-slate-900 mt-3 tabular-nums">
            {stats.totalCollected === 0 ? '₹0' : money(stats.totalCollected)}
          </div>
        </div>
      </div>

      {/* Main Table / Empty Card matching Image 4 */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
        {/* Filters Bar matching Image 4 */}
        <div className="p-4 sm:p-5 border-b border-slate-200/80 flex flex-wrap gap-3 items-center justify-between">
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by invoice or customer"
              className="w-full h-10 pl-9 pr-3 text-xs bg-white border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-teal-600 transition-colors"
            />
          </div>

          <div className="flex items-center gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-10 px-3.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-xl focus:outline-teal-600"
            >
              <option value="">All statuses</option>
              <option value="Paid">Paid</option>
              <option value="Part paid">Part paid</option>
              <option value="Pending">Pending</option>
            </select>

            <button
              type="button"
              className="h-10 px-3.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 flex items-center gap-1.5 transition-colors"
            >
              <span>Date range</span>
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
            </button>
          </div>
        </div>

        {/* Content: Empty State matching Image 4 OR Invoices List */}
        {filtered.length === 0 ? (
          <div className="py-20 px-6 text-center flex flex-col items-center justify-center">
            <div className="w-12 h-12 rounded-2xl bg-[#F5F7FA] text-[#1F7A63] flex items-center justify-center mb-3">
              <FileText className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-900 m-0">No invoices found</h3>
            <p className="text-xs text-slate-500 max-w-sm mt-1 mb-5">
              Create your first invoice to start tracking revenue.
            </p>
            <button
              type="button"
              onClick={onCreateInvoice}
              className="h-10 px-5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 font-bold rounded-xl transition-all shadow-2xs flex items-center gap-2 cursor-pointer text-xs"
            >
              <Plus className="w-4 h-4 text-slate-600" />
              <span>Create invoice</span>
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="bg-slate-50/70 border-b border-slate-200 text-slate-500 font-semibold">
                  <th className="py-3 px-6">Invoice #</th>
                  <th className="py-3 px-6">Date</th>
                  <th className="py-3 px-6">Client</th>
                  <th className="py-3 px-6 text-right">Total</th>
                  <th className="py-3 px-6 text-right">Paid</th>
                  <th className="py-3 px-6 text-right">Balance</th>
                  <th className="py-3 px-6 text-center">Status</th>
                  <th className="py-3 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((inv) => {
                  const client = db.clients.find((c) => c.id === inv.cid);
                  const calc = calculateInvoice(inv, db.settings.rate);

                  return (
                    <tr
                      key={inv.id}
                      onClick={() => onViewInvoice(inv)}
                      className="hover:bg-slate-50 cursor-pointer transition-colors"
                    >
                      <td className="py-3.5 px-6 font-bold font-mono text-[#1F7A63]">
                        {inv.no}
                      </td>
                      <td className="py-3.5 px-6 text-slate-600">
                        {formatDateDisplay(inv.date)}
                      </td>
                      <td className="py-3.5 px-6 font-semibold text-slate-900">
                        {client?.name || '—'}
                      </td>
                      <td className="py-3.5 px-6 text-right font-mono font-bold text-slate-900 tabular-nums">
                        {money(calc.total)}
                      </td>
                      <td className="py-3.5 px-6 text-right font-mono tabular-nums text-emerald-700">
                        {money(calc.paid)}
                      </td>
                      <td className="py-3.5 px-6 text-right font-mono tabular-nums font-semibold">
                        {calc.bal > 0 ? (
                          <span className="text-amber-700">{money(calc.bal)}</span>
                        ) : (
                          <span className="text-slate-400">₹0</span>
                        )}
                      </td>
                      <td className="py-3.5 px-6 text-center">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                            calc.st === 'Paid'
                              ? 'bg-emerald-100 text-emerald-800'
                              : calc.st === 'Part paid'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {calc.st}
                        </span>
                      </td>
                      <td
                        className="py-3.5 px-6 text-right"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => onViewInvoice(inv)}
                            className="p-1.5 text-[#1F7A63] hover:bg-emerald-50 rounded-lg transition-colors"
                            title="Print / View"
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </button>
                          {calc.bal > 0 && (
                            <button
                              type="button"
                              onClick={() => onRecordPayment(inv)}
                              className="p-1.5 text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors"
                              title="Record payment"
                            >
                              <CreditCard className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => onDeleteInvoice(inv.id)}
                            className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

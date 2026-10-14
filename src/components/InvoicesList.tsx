import React, { useState, useMemo } from 'react';
import { AppDatabase, Invoice } from '../types/billing';
import { calculateInvoice, money, formatDateDisplay } from '../utils/formatters';
import { Search, Filter, Download, Plus, Printer, Edit, Trash2, CreditCard } from 'lucide-react';

interface InvoicesListProps {
  db: AppDatabase;
  onOpenNewInvoice: () => void;
  onViewInvoice: (invoice: Invoice) => void;
  onEditInvoice: (invoice: Invoice) => void;
  onDeleteInvoice: (id: string) => void;
  onRecordPayment: (invoice: Invoice) => void;
  showToast: (msg: string) => void;
}

export const InvoicesList: React.FC<InvoicesListProps> = ({
  db,
  onOpenNewInvoice,
  onViewInvoice,
  onEditInvoice,
  onDeleteInvoice,
  onRecordPayment,
  showToast
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [clientFilter, setClientFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Filtered invoices
  const filtered = useMemo(() => {
    return db.invoices.filter((inv) => {
      const client = db.clients.find((c) => c.id === inv.cid);
      const calc = calculateInvoice(inv, db.settings.rate);

      if (clientFilter && inv.cid !== clientFilter) return false;
      if (statusFilter && calc.st !== statusFilter) return false;

      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase();
        const noMatch = inv.no.toLowerCase().includes(query);
        const nameMatch = (client?.name || '').toLowerCase().includes(query);
        const poMatch = (inv.poNo || '').toLowerCase().includes(query);
        if (!noMatch && !nameMatch && !poMatch) return false;
      }

      return true;
    }).slice().reverse();
  }, [db.invoices, db.clients, db.settings.rate, clientFilter, statusFilter, searchTerm]);

  // Total summary of filtered set
  const summary = useMemo(() => {
    let billed = 0;
    let paid = 0;
    let bal = 0;

    filtered.forEach((inv) => {
      const c = calculateInvoice(inv, db.settings.rate);
      billed += c.total;
      paid += c.paid;
      bal += Math.max(0, c.bal);
    });

    return { billed, paid, bal, count: filtered.length };
  }, [filtered, db.settings.rate]);

  const handleExportCSV = () => {
    if (filtered.length === 0) {
      showToast('No invoices to export');
      return;
    }

    const headers = ['Invoice No', 'Date', 'Client', 'PO No', 'Subtotal', 'Taxable', 'GST Rate %', 'GST Amt', 'Total', 'Paid', 'Balance', 'Status', 'Mode'];
    const rows = filtered.map((inv) => {
      const client = db.clients.find((c) => c.id === inv.cid);
      const c = calculateInvoice(inv, db.settings.rate);
      return [
        inv.no,
        inv.date,
        `"${(client?.name || '').replace(/"/g, '""')}"`,
        inv.poNo || '',
        c.sub.toFixed(2),
        c.taxable.toFixed(2),
        inv.gstOn ? c.gstRate : 0,
        c.gst.toFixed(2),
        c.total.toFixed(2),
        c.paid.toFixed(2),
        c.bal.toFixed(2),
        c.st,
        inv.mode
      ].join(',');
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `SRK_Invoices_Report_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Invoices exported to CSV');
  };

  return (
    <div className="space-y-5 max-w-6xl mx-auto pb-12">
      {/* Top Action & KPI Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 m-0">Invoices Archive</h2>
          <p className="text-xs text-slate-500 mt-0.5 m-0">
            View, filter, manage, and print tax invoices issued by SRK Enterprises
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExportCSV}
            className="h-10 px-3.5 flex items-center gap-1.5 text-xs font-semibold bg-white border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
          <button
            type="button"
            onClick={onOpenNewInvoice}
            className="h-10 px-4 flex items-center gap-1.5 text-xs font-bold bg-teal-700 text-white rounded-lg hover:bg-teal-800 transition-colors shadow-sm cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Create Invoice</span>
          </button>
        </div>
      </div>

      {/* Filter Stats Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-white p-3.5 rounded-xl border border-slate-200 text-xs">
        <div>
          <span className="text-slate-500">Invoices Listed:</span>
          <div className="font-bold font-mono text-slate-900 text-base">{summary.count}</div>
        </div>
        <div>
          <span className="text-slate-500">Total Billed:</span>
          <div className="font-bold font-mono tabular-nums text-teal-800 text-base">{money(summary.billed)}</div>
        </div>
        <div>
          <span className="text-slate-500">Total Collected:</span>
          <div className="font-bold font-mono tabular-nums text-emerald-700 text-base">{money(summary.paid)}</div>
        </div>
        <div>
          <span className="text-slate-500">Outstanding Balance:</span>
          <div className="font-bold font-mono tabular-nums text-amber-700 text-base">{money(summary.bal)}</div>
        </div>
      </div>

      {/* Filters Toolbar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex flex-wrap gap-3 items-center">
        {/* Search Input */}
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by invoice number, client, or PO..."
            className="w-full h-10 pl-9 pr-3 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-teal-600"
          />
        </div>

        {/* Client Selector */}
        <div className="w-48">
          <select
            value={clientFilter}
            onChange={(e) => setClientFilter(e.target.value)}
            className="w-full h-10 px-3 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 font-medium focus:bg-white focus:outline-teal-600"
          >
            <option value="">All Clients</option>
            {db.clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {/* Status Selector */}
        <div className="w-36">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full h-10 px-3 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 font-medium focus:bg-white focus:outline-teal-600"
          >
            <option value="">All Statuses</option>
            <option value="Paid">Paid</option>
            <option value="Part paid">Part paid</option>
            <option value="Pending">Pending</option>
          </select>
        </div>

        {(searchTerm || clientFilter || statusFilter) && (
          <button
            type="button"
            onClick={() => {
              setSearchTerm('');
              setClientFilter('');
              setStatusFilter('');
            }}
            className="text-xs text-teal-700 hover:text-teal-900 font-semibold px-2 py-1"
          >
            Clear Filters
          </button>
        )}
      </div>

      {/* Main Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-semibold">
                <th className="py-3 px-4">Invoice No</th>
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Client</th>
                <th className="py-3 px-4">PO Ref</th>
                <th className="py-3 px-4 text-right">Grand Total</th>
                <th className="py-3 px-4 text-right">Paid</th>
                <th className="py-3 px-4 text-right">Balance</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    No matching invoices found.
                  </td>
                </tr>
              ) : (
                filtered.map((inv) => {
                  const client = db.clients.find((c) => c.id === inv.cid);
                  const calc = calculateInvoice(inv, db.settings.rate);

                  return (
                    <tr
                      key={inv.id}
                      onClick={() => onViewInvoice(inv)}
                      className="hover:bg-teal-50/40 cursor-pointer transition-colors"
                    >
                      <td className="py-3 px-4 font-bold font-mono text-teal-800">
                        {inv.no}
                      </td>
                      <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                        {formatDateDisplay(inv.date)}
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-900 max-w-[180px] truncate">
                        {client?.name || '—'}
                      </td>
                      <td className="py-3 px-4 text-slate-500 font-mono text-[11px]">
                        {inv.poNo || '—'}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold tabular-nums text-slate-900">
                        {money(calc.total)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-emerald-700">
                        {money(calc.paid)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold">
                        {calc.bal > 0 ? (
                          <span className="text-amber-700">{money(calc.bal)}</span>
                        ) : (
                          <span className="text-slate-400">₹ 0.00</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center">
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
                        className="py-3 px-4 text-right"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => onViewInvoice(inv)}
                            className="p-1.5 text-teal-700 hover:bg-teal-50 rounded transition-colors"
                            title="View / Print Tax Invoice"
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </button>
                          {calc.bal > 0 && (
                            <button
                              type="button"
                              onClick={() => onRecordPayment(inv)}
                              className="p-1.5 text-emerald-700 hover:bg-emerald-50 rounded transition-colors"
                              title="Record Payment"
                            >
                              <CreditCard className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => onEditInvoice(inv)}
                            className="p-1.5 text-slate-600 hover:bg-slate-100 rounded transition-colors"
                            title="Edit Invoice"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteInvoice(inv.id)}
                            className="p-1.5 text-rose-600 hover:bg-rose-50 rounded transition-colors"
                            title="Delete Invoice"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

import React, { useState, useMemo } from 'react';
import { AppDatabase, Client, Invoice } from '../types/billing';
import { calculateInvoice, money, formatDateDisplay } from '../utils/formatters';
import { ConfirmModal } from './ConfirmModal';
import { Plus, Search, User, Phone, MapPin, Edit, Trash2, FileText, X } from 'lucide-react';

interface ClientsManagerProps {
  db: AppDatabase;
  onSaveClient: (client: Client) => void;
  onDeleteClient: (id: string) => void;
  onViewInvoice: (invoice: Invoice) => void;
  showToast: (msg: string) => void;
}

export const ClientsManager: React.FC<ClientsManagerProps> = ({
  db,
  onSaveClient,
  onDeleteClient,
  onViewInvoice,
  showToast
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [editingClient, setEditingClient] = useState<Partial<Client> | null>(null);
  const [viewingLedgerClient, setViewingLedgerClient] = useState<Client | null>(null);
  const [clientToDelete, setClientToDelete] = useState<{ id: string; name: string } | null>(null);

  // Filter clients
  const filteredClients = useMemo(() => {
    return db.clients.filter((c) => {
      if (!searchTerm.trim()) return true;
      const q = searchTerm.toLowerCase();
      return (
        c.name.toLowerCase().includes(q) ||
        (c.phone || '').toLowerCase().includes(q) ||
        (c.addr || '').toLowerCase().includes(q) ||
        (c.gst || '').toLowerCase().includes(q)
      );
    });
  }, [db.clients, searchTerm]);

  // Client stats mapping
  const clientStats = useMemo(() => {
    const stats: Record<string, { totalBilled: number; totalPaid: number; balance: number; invCount: number }> = {};

    db.clients.forEach((c) => {
      stats[c.id] = { totalBilled: 0, totalPaid: 0, balance: 0, invCount: 0 };
    });

    db.invoices.forEach((inv) => {
      const calc = calculateInvoice(inv, db.settings.rate);
      if (stats[inv.cid]) {
        stats[inv.cid].totalBilled += calc.total;
        stats[inv.cid].totalPaid += calc.paid;
        stats[inv.cid].balance += Math.max(0, calc.bal);
        stats[inv.cid].invCount += 1;
      }
    });

    return stats;
  }, [db.clients, db.invoices, db.settings.rate]);

  const handleOpenAddClient = () => {
    setEditingClient({
      id: '',
      name: '',
      phone: '',
      addr: '',
      gst: '',
      state: 'Karnataka',
      email: ''
    });
  };

  const handleSaveForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingClient || !editingClient.name?.trim()) {
      showToast('Client name is required');
      return;
    }

    const clientToSave: Client = {
      id: editingClient.id || 'cli-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      name: editingClient.name.trim(),
      phone: editingClient.phone?.trim() || '',
      addr: editingClient.addr?.trim() || '',
      gst: editingClient.gst?.trim().toUpperCase() || '',
      state: editingClient.state?.trim() || 'Karnataka',
      email: editingClient.email?.trim() || '',
      createdAt: editingClient.createdAt || new Date().toISOString().slice(0, 10)
    };

    onSaveClient(clientToSave);
    showToast(`Client "${clientToSave.name}" saved successfully`);
    setEditingClient(null);
  };

  const handleDelete = (id: string, name: string) => {
    const hasInvoices = db.invoices.some((inv) => inv.cid === id);
    if (hasInvoices) {
      showToast(`Cannot delete "${name}" because they have existing invoices`);
      return;
    }
    setClientToDelete({ id, name });
  };

  return (
    <div className="space-y-5 max-w-6xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 m-0">Clients Directory</h2>
          <p className="text-xs text-slate-500 mt-0.5 m-0">
            Manage your buyers, view outstanding receivables, and review transaction ledgers
          </p>
        </div>

        <button
          type="button"
          onClick={handleOpenAddClient}
          className="h-10 px-4 flex items-center gap-1.5 text-xs font-bold bg-teal-700 text-white rounded-lg hover:bg-teal-800 transition-colors shadow-sm cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Add New Client</span>
        </button>
      </div>

      {/* Search Toolbar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by client name, phone number, address, or GSTIN..."
            className="w-full h-10 pl-9 pr-3 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-teal-600"
          />
        </div>
        {searchTerm && (
          <button
            type="button"
            onClick={() => setSearchTerm('')}
            className="text-xs text-teal-700 hover:text-teal-900 font-semibold px-2 py-1"
          >
            Clear
          </button>
        )}
      </div>

      {/* Clients Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredClients.map((client) => {
          const stats = clientStats[client.id] || { totalBilled: 0, totalPaid: 0, balance: 0, invCount: 0 };

          return (
            <div
              key={client.id}
              className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs hover:shadow-xs transition-shadow flex flex-col justify-between"
            >
              <div>
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm m-0">
                      {client.name}
                    </h3>
                    <div className="text-xs text-slate-500 mt-1 flex items-center gap-1.5">
                      <Phone className="w-3 h-3 text-slate-400" />
                      <span>{client.phone || 'No phone recorded'}</span>
                    </div>
                  </div>

                  <span className="text-[11px] font-mono font-semibold bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
                    {stats.invCount} bills
                  </span>
                </div>

                <div className="text-xs text-slate-600 mt-2.5 flex items-start gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                  <span className="line-clamp-2">{client.addr || 'No address provided'}</span>
                </div>

                {client.gst && (
                  <div className="mt-2 text-[11px] font-mono text-slate-700 bg-slate-50 px-2 py-1 rounded border border-slate-200 inline-block">
                    GSTIN: <strong>{client.gst}</strong>
                  </div>
                )}
              </div>

              {/* Financial Summary Strip */}
              <div className="mt-4 pt-3 border-t border-slate-100 space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500">Total Billed:</span>
                  <span className="font-mono font-semibold text-slate-800 tabular-nums">
                    {money(stats.totalBilled)}
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500">Balance Due:</span>
                  <span
                    className={`font-mono font-bold tabular-nums ${
                      stats.balance > 0 ? 'text-amber-700' : 'text-emerald-700'
                    }`}
                  >
                    {money(stats.balance)}
                  </span>
                </div>

                {/* Actions */}
                <div className="pt-2 flex items-center justify-between gap-1 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setViewingLedgerClient(client)}
                    className="text-xs text-teal-700 hover:text-teal-900 font-semibold flex items-center gap-1 cursor-pointer py-1"
                  >
                    <FileText className="w-3 h-3" />
                    <span>Statement</span>
                  </button>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setEditingClient(client)}
                      className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded transition-colors cursor-pointer"
                      title="Edit"
                    >
                      <Edit className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(client.id, client.name)}
                      className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded transition-colors cursor-pointer"
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add / Edit Client Modal */}
      {editingClient && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
              <h3 className="font-bold text-slate-900 text-sm m-0">
                {editingClient.id ? 'Edit Client' : 'Add New Client'}
              </h3>
              <button
                type="button"
                onClick={() => setEditingClient(null)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveForm} className="p-5 space-y-3.5 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Client / Company Name *
                </label>
                <input
                  type="text"
                  required
                  value={editingClient.name || ''}
                  onChange={(e) => setEditingClient({ ...editingClient, name: e.target.value })}
                  placeholder="e.g. Apex Traders"
                  className="w-full h-9 px-3 bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-teal-600 text-xs"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Phone Number</label>
                <input
                  type="text"
                  value={editingClient.phone || ''}
                  onChange={(e) => setEditingClient({ ...editingClient, phone: e.target.value })}
                  placeholder="+91 98450 00000"
                  className="w-full h-9 px-3 bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-teal-600 text-xs"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Address</label>
                <textarea
                  rows={2}
                  value={editingClient.addr || ''}
                  onChange={(e) => setEditingClient({ ...editingClient, addr: e.target.value })}
                  placeholder="Street, Area, City, Pincode"
                  className="w-full p-2 bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-teal-600 text-xs resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">GSTIN (Optional)</label>
                  <input
                    type="text"
                    value={editingClient.gst || ''}
                    onChange={(e) => setEditingClient({ ...editingClient, gst: e.target.value })}
                    placeholder="29AAAAA0000A1Z5"
                    className="w-full h-9 px-3 bg-white border border-slate-300 rounded-lg text-slate-900 font-mono focus:outline-teal-600 text-xs"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">State</label>
                  <input
                    type="text"
                    value={editingClient.state || 'Karnataka'}
                    onChange={(e) => setEditingClient({ ...editingClient, state: e.target.value })}
                    placeholder="Karnataka"
                    className="w-full h-9 px-3 bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-teal-600 text-xs"
                  />
                </div>
              </div>

              <div className="pt-3 flex justify-end gap-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setEditingClient(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg transition-colors cursor-pointer text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white font-bold rounded-lg transition-colors cursor-pointer text-xs shadow-sm"
                >
                  Save Client
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Client Statement / Ledger Modal */}
      {viewingLedgerClient && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[85vh]">
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center shrink-0">
              <div>
                <h3 className="font-bold text-slate-900 text-sm m-0">
                  Client Statement: {viewingLedgerClient.name}
                </h3>
                <p className="text-xs text-slate-500 m-0 mt-0.5">
                  Invoice history and outstanding balance overview
                </p>
              </div>
              <button
                type="button"
                onClick={() => setViewingLedgerClient(null)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 text-xs">
              <div className="grid grid-cols-3 gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
                <div>
                  <span className="text-slate-500">Total Invoiced</span>
                  <div className="text-base font-bold font-mono text-slate-900">
                    {money(clientStats[viewingLedgerClient.id]?.totalBilled || 0)}
                  </div>
                </div>
                <div>
                  <span className="text-slate-500">Total Paid</span>
                  <div className="text-base font-bold font-mono text-emerald-700">
                    {money(clientStats[viewingLedgerClient.id]?.totalPaid || 0)}
                  </div>
                </div>
                <div>
                  <span className="text-slate-500">Balance Pending</span>
                  <div className="text-base font-bold font-mono text-amber-700">
                    {money(clientStats[viewingLedgerClient.id]?.balance || 0)}
                  </div>
                </div>
              </div>

              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="bg-slate-100 text-slate-600 font-semibold border-b border-slate-200">
                      <th className="py-2.5 px-3">Invoice #</th>
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3 text-right">Total</th>
                      <th className="py-2.5 px-3 text-right">Paid</th>
                      <th className="py-2.5 px-3 text-right">Balance</th>
                      <th className="py-2.5 px-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {db.invoices
                      .filter((i) => i.cid === viewingLedgerClient.id)
                      .slice()
                      .reverse()
                      .map((inv) => {
                        const c = calculateInvoice(inv, db.settings.rate);
                        return (
                          <tr
                            key={inv.id}
                            onClick={() => {
                              setViewingLedgerClient(null);
                              onViewInvoice(inv);
                            }}
                            className="hover:bg-teal-50/50 cursor-pointer"
                          >
                            <td className="py-2.5 px-3 font-mono font-bold text-teal-800">
                              {inv.no}
                            </td>
                            <td className="py-2.5 px-3 text-slate-600">
                              {formatDateDisplay(inv.date)}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-semibold">
                              {money(c.total)}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono text-emerald-700">
                              {money(c.paid)}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono text-amber-700">
                              {money(c.bal)}
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              <span className="text-[11px] font-semibold">{c.st}</span>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Client Deletion Confirmation Modal */}
      <ConfirmModal
        isOpen={!!clientToDelete}
        title={`Delete Client "${clientToDelete?.name}"?`}
        message={`Are you sure you want to delete "${clientToDelete?.name}"? This client has no active invoices.`}
        confirmLabel="Delete Client"
        cancelLabel="Cancel"
        isDestructive={true}
        onConfirm={() => {
          if (clientToDelete) {
            onDeleteClient(clientToDelete.id);
            showToast(`Client "${clientToDelete.name}" deleted`);
            setClientToDelete(null);
          }
        }}
        onCancel={() => setClientToDelete(null)}
      />
    </div>
  );
};

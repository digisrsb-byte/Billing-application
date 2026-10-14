import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { AppDatabase, Invoice, Client, PaymentRecord, CompanySettings } from './types/billing';
import { getDatabase, saveDatabase, resetDatabase } from './services/storage';
import { calculateInvoice } from './utils/formatters';
import { DesktopSidebar, NavView } from './components/DesktopSidebar';
import { DesktopHeader } from './components/DesktopHeader';
import { OverviewView } from './components/OverviewView';
import { DailyBoxBillingView } from './components/DailyBoxBillingView';
import { InvoicesView } from './components/InvoicesView';
import { ClientsView } from './components/ClientsView';
import { ProductsView } from './components/ProductsView';
import { PaymentsView } from './components/PaymentsView';
import { ReportsView } from './components/ReportsView';
import { SettingsView } from './components/SettingsView';
import { TaxInvoiceReport } from './components/TaxInvoiceReport';
import { NewInvoiceModal } from './components/NewInvoiceModal';
import { ConfirmModal } from './components/ConfirmModal';
import { CheckCircle2, X } from 'lucide-react';

export default function App() {
  const [db, setDb] = useState<AppDatabase>(() => getDatabase());
  const [currentView, setCurrentView] = useState<NavView>('overview');
  const [activeReportTab, setActiveReportTab] = useState<'day' | 'month' | 'payment' | 'gst'>('day');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [activeInvoiceForPrint, setActiveInvoiceForPrint] = useState<Invoice | null>(null);
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [isNewClientModalOpen, setIsNewClientModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [recordPaymentForInvoice, setRecordPaymentForInvoice] = useState<Invoice | null>(null);
  const [isGenericPaymentModalOpen, setIsGenericPaymentModalOpen] = useState(false);
  const [invoiceToDelete, setInvoiceToDelete] = useState<Invoice | null>(null);
  const [clientToDelete, setClientToDelete] = useState<{ id: string; name: string } | null>(null);

  // Toast feedback
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
  }, []);

  useEffect(() => {
    if (!toastMessage) return;
    const timer = setTimeout(() => {
      setToastMessage(null);
    }, 2400);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  // Invoice Handlers
  const handleSaveInvoice = useCallback(
    (invoice: Invoice, openPrint: boolean = true) => {
      setDb((prev) => {
        const existingIdx = prev.invoices.findIndex((i) => i.id === invoice.id);
        let nextInvoices = [...prev.invoices];
        let nextSeq = prev.settings.nextSeq;

        if (existingIdx >= 0) {
          nextInvoices[existingIdx] = invoice;
        } else {
          nextInvoices.push(invoice);
          nextSeq += 1;
        }

        const nextDb: AppDatabase = {
          ...prev,
          invoices: nextInvoices,
          settings: {
            ...prev.settings,
            nextSeq
          }
        };

        saveDatabase(nextDb);
        return nextDb;
      });

      if (openPrint) {
        setActiveInvoiceForPrint(invoice);
      }
    },
    []
  );

  // Client Handlers
  const handleSaveClient = useCallback(
    (client: Client) => {
      setDb((prev) => {
        const existingIdx = prev.clients.findIndex((c) => c.id === client.id);
        let nextClients = [...prev.clients];
        if (existingIdx >= 0) {
          nextClients[existingIdx] = client;
        } else {
          nextClients.push(client);
        }
        const nextDb: AppDatabase = { ...prev, clients: nextClients };
        saveDatabase(nextDb);
        return nextDb;
      });
      setIsNewClientModalOpen(false);
      setEditingClient(null);
    },
    []
  );

  const handleDeleteClient = useCallback(
    (id: string, name: string) => {
      const hasInvoices = db.invoices.some((inv) => inv.cid === id);
      if (hasInvoices) {
        showToast(`Cannot delete "${name}" because they have existing invoices`);
        return;
      }
      setClientToDelete({ id, name });
    },
    [db.invoices, showToast]
  );

  // Payment Recording
  const handleRecordPayment = useCallback(
    (invoiceId: string, payment: PaymentRecord) => {
      setDb((prev) => {
        const nextInvoices = prev.invoices.map((inv) => {
          if (inv.id === invoiceId) {
            return {
              ...inv,
              pay: [...(inv.pay || []), payment]
            };
          }
          return inv;
        });
        const nextDb: AppDatabase = { ...prev, invoices: nextInvoices };
        saveDatabase(nextDb);
        return nextDb;
      });
      setRecordPaymentForInvoice(null);
      setIsGenericPaymentModalOpen(false);
    },
    []
  );

  // Settings
  const handleUpdateSettings = useCallback((newSettings: CompanySettings) => {
    setDb((prev) => {
      const nextDb: AppDatabase = { ...prev, settings: newSettings };
      saveDatabase(nextDb);
      return nextDb;
    });
  }, []);

  const handleResetData = useCallback(() => {
    const fresh = resetDatabase();
    setDb(fresh);
    setCurrentView('overview');
  }, []);

  const handleImportData = useCallback((imported: AppDatabase) => {
    setDb(imported);
    saveDatabase(imported);
    setCurrentView('overview');
  }, []);

  // Keyboard shortcut listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActiveInvoiceForPrint(null);
        setIsInvoiceModalOpen(false);
        setEditingInvoice(null);
        setIsNewClientModalOpen(false);
        setEditingClient(null);
        setRecordPaymentForInvoice(null);
        setIsGenericPaymentModalOpen(false);
        setInvoiceToDelete(null);
        setClientToDelete(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Pending count for sidebar badge
  const pendingCount = useMemo(() => {
    return db.invoices.filter((i) => calculateInvoice(i, db.settings.rate).bal > 0.05).length;
  }, [db.invoices, db.settings.rate]);

  // Client for print modal
  const printClient = useMemo(() => {
    if (!activeInvoiceForPrint) return undefined;
    return db.clients.find((c) => c.id === activeInvoiceForPrint.cid);
  }, [activeInvoiceForPrint, db.clients]);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#F5F7FA] font-sans text-[#081C2D] antialiased selection:bg-[#1F7A63]/20">
      {/* Sidebar matching User Screenshots */}
      <DesktopSidebar
        currentView={currentView}
        activeReportTab={activeReportTab}
        onNavigate={(view, reportTab) => {
          setCurrentView(view);
          if (reportTab) {
            setActiveReportTab(reportTab);
          }
        }}
        pendingCount={pendingCount}
        customLogoUrl={db.settings.logoUrl}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden">
        {/* Header Bar matching User Screenshots */}
        <DesktopHeader
          currentView={currentView}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          userEmail="hello.rakshithass"
        />

        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          {currentView === 'overview' && (
            <OverviewView
              db={db}
              onCreateInvoice={() => setCurrentView('box_billing')}
              onOpenRecordPayment={() => {
                const firstPending = db.invoices.find((i) => calculateInvoice(i, db.settings.rate).bal > 0.05);
                if (firstPending) {
                  setRecordPaymentForInvoice(firstPending);
                } else if (db.invoices.length > 0) {
                  setRecordPaymentForInvoice(db.invoices[0]);
                } else {
                  showToast('Create an invoice first to record payments');
                }
              }}
              onOpenAddClient={() => {
                setEditingClient(null);
                setIsNewClientModalOpen(true);
              }}
              onNavigateToReports={(reportTab) => {
                if (reportTab) {
                  setActiveReportTab(reportTab);
                }
                setCurrentView('reports');
              }}
              onNavigateToInvoices={() => setCurrentView('invoices')}
              onViewInvoice={(inv) => setActiveInvoiceForPrint(inv)}
            />
          )}

          {currentView === 'box_billing' && (
            <DailyBoxBillingView
              db={db}
              onSaveInvoice={handleSaveInvoice}
              onOpenNewClientModal={() => {
                setEditingClient(null);
                setIsNewClientModalOpen(true);
              }}
              showToast={showToast}
            />
          )}

          {currentView === 'products' && (
            <ProductsView db={db} onUpdateSettings={handleUpdateSettings} showToast={showToast} />
          )}

          {currentView === 'invoices' && (
            <InvoicesView
              db={db}
              onCreateInvoice={() => setCurrentView('box_billing')}
              onViewInvoice={(inv) => setActiveInvoiceForPrint(inv)}
              onDeleteInvoice={(id) => {
                const target = db.invoices.find((i) => i.id === id);
                if (target) setInvoiceToDelete(target);
              }}
              onRecordPayment={(inv) => setRecordPaymentForInvoice(inv)}
            />
          )}

          {currentView === 'clients' && (
            <ClientsView
              db={db}
              onOpenAddClient={() => {
                setEditingClient(null);
                setIsNewClientModalOpen(true);
              }}
              onEditClient={(c) => {
                setEditingClient(c);
                setIsNewClientModalOpen(true);
              }}
              onDeleteClient={handleDeleteClient}
              onViewInvoice={(inv) => setActiveInvoiceForPrint(inv)}
            />
          )}

          {currentView === 'payments' && (
            <PaymentsView
              db={db}
              onOpenRecordPayment={() => {
                const firstPending = db.invoices.find((i) => calculateInvoice(i, db.settings.rate).bal > 0.05);
                if (firstPending) {
                  setRecordPaymentForInvoice(firstPending);
                } else if (db.invoices.length > 0) {
                  setRecordPaymentForInvoice(db.invoices[0]);
                } else {
                  showToast('No invoices available to record payments against');
                }
              }}
              onViewInvoice={(inv) => setActiveInvoiceForPrint(inv)}
            />
          )}

          {currentView === 'reports' && (
            <ReportsView 
              db={db} 
              initialTab={activeReportTab} 
              showToast={showToast} 
            />
          )}

          {currentView === 'settings' && (
            <SettingsView
              db={db}
              onUpdateSettings={handleUpdateSettings}
              onResetData={handleResetData}
              onImportData={handleImportData}
              showToast={showToast}
            />
          )}
        </main>
      </div>

      {/* Tax Invoice Full Print View Modal matching user PDF format */}
      {activeInvoiceForPrint && (
        <TaxInvoiceReport
          invoice={activeInvoiceForPrint}
          client={printClient}
          settings={db.settings}
          onClose={() => setActiveInvoiceForPrint(null)}
          onEdit={(inv) => {
            setActiveInvoiceForPrint(null);
            setEditingInvoice(inv);
            setIsInvoiceModalOpen(true);
          }}
          isModal={true}
        />
      )}

      {/* Create / Edit Invoice Modal */}
      {isInvoiceModalOpen && (
        <NewInvoiceModal
          db={db}
          editingInvoice={editingInvoice}
          onClose={() => {
            setIsInvoiceModalOpen(false);
            setEditingInvoice(null);
          }}
          onSave={handleSaveInvoice}
          onOpenNewClientModal={() => {
            setEditingClient(null);
            setIsNewClientModalOpen(true);
          }}
          showToast={showToast}
        />
      )}

      {/* Add / Edit Client Modal */}
      {isNewClientModalOpen && (
        <QuickAddClientModal
          initialClient={editingClient}
          onClose={() => {
            setIsNewClientModalOpen(false);
            setEditingClient(null);
          }}
          onSave={(client) => {
            handleSaveClient(client);
            showToast(`Client "${client.name}" saved`);
          }}
        />
      )}

      {/* Record Payment Modal */}
      {recordPaymentForInvoice && (
        <QuickRecordPaymentModal
          invoice={recordPaymentForInvoice}
          settings={db.settings}
          onClose={() => setRecordPaymentForInvoice(null)}
          onSave={(payment) => {
            handleRecordPayment(recordPaymentForInvoice.id, payment);
            showToast(`Payment of ₹${payment.amt} recorded for ${recordPaymentForInvoice.no}`);
          }}
        />
      )}

      {/* Invoice Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={!!invoiceToDelete}
        title={`Delete Invoice ${invoiceToDelete?.no}?`}
        message={`Are you sure you want to permanently delete invoice ${invoiceToDelete?.no}? Associated payment logs will also be removed.`}
        confirmLabel="Delete Invoice"
        cancelLabel="Cancel"
        isDestructive={true}
        onConfirm={() => {
          if (invoiceToDelete) {
            const id = invoiceToDelete.id;
            const no = invoiceToDelete.no;
            setDb((prev) => {
              const nextDb = { ...prev, invoices: prev.invoices.filter((i) => i.id !== id) };
              saveDatabase(nextDb);
              return nextDb;
            });
            showToast(`Invoice ${no} deleted`);
            setInvoiceToDelete(null);
          }
        }}
        onCancel={() => setInvoiceToDelete(null)}
      />

      {/* Client Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={!!clientToDelete}
        title={`Delete Client "${clientToDelete?.name}"?`}
        message={`Are you sure you want to delete "${clientToDelete?.name}"? This client has no active bills.`}
        confirmLabel="Delete Client"
        cancelLabel="Cancel"
        isDestructive={true}
        onConfirm={() => {
          if (clientToDelete) {
            setDb((prev) => {
              const nextDb = { ...prev, clients: prev.clients.filter((c) => c.id !== clientToDelete.id) };
              saveDatabase(nextDb);
              return nextDb;
            });
            showToast(`Client "${clientToDelete.name}" deleted`);
            setClientToDelete(null);
          }
        }}
        onCancel={() => setClientToDelete(null)}
      />

      {/* Toast Feedback */}
      {toastMessage && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-70 bg-[#081C2D] text-white px-4 py-2.5 rounded-xl shadow-lg text-sm font-medium flex items-center gap-2 pointer-events-none transition-all">
          <CheckCircle2 className="w-4 h-4 text-[#1F7A63]" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}

interface QuickAddClientModalProps {
  initialClient?: Client | null;
  onClose: () => void;
  onSave: (client: Client) => void;
}

function QuickAddClientModal({ initialClient, onClose, onSave }: QuickAddClientModalProps) {
  const [name, setName] = useState(initialClient?.name || '');
  const [phone, setPhone] = useState(initialClient?.phone || '');
  const [addr, setAddr] = useState(initialClient?.addr || '');
  const [gst, setGst] = useState(initialClient?.gst || '');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const client: Client = {
      id: initialClient?.id || 'cli-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      name: name.trim(),
      phone: phone.trim(),
      addr: addr.trim(),
      gst: gst.trim().toUpperCase(),
      state: initialClient?.state || 'Karnataka',
      createdAt: initialClient?.createdAt || new Date().toISOString().slice(0, 10)
    };
    onSave(client);
  };

  return (
    <div className="fixed inset-0 z-60 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm border border-slate-200 p-6 space-y-4">
        <div className="flex justify-between items-center pb-2 border-b border-slate-100">
          <h3 className="font-bold text-slate-900 text-sm m-0">
            {initialClient ? 'Edit Client' : 'Add New Client'}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
          <div>
            <label className="block font-bold text-slate-700 mb-1">Client Name *</label>
            <input
              type="text"
              required
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Apex Traders"
              className="w-full h-10 px-3 bg-white border border-slate-300 rounded-xl text-slate-900 focus:outline-teal-600 text-xs"
            />
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">Phone Number</label>
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+91 98450 00000"
              className="w-full h-10 px-3 bg-white border border-slate-300 rounded-xl text-slate-900 focus:outline-teal-600 text-xs"
            />
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">Address</label>
            <textarea
              rows={2}
              value={addr}
              onChange={(e) => setAddr(e.target.value)}
              placeholder="Area, City, Pincode"
              className="w-full p-2.5 bg-white border border-slate-300 rounded-xl text-slate-900 focus:outline-teal-600 text-xs resize-none"
            />
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">GSTIN (Optional)</label>
            <input
              type="text"
              value={gst}
              onChange={(e) => setGst(e.target.value)}
              placeholder="29AAAAA0000A1Z5"
              className="w-full h-10 px-3 bg-white border border-slate-300 rounded-xl text-slate-900 font-mono focus:outline-teal-600 text-xs"
            />
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-xs cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-[#1F7A63] hover:bg-[#186351] text-white font-bold rounded-xl text-xs cursor-pointer shadow-xs"
            >
              Save Client
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface QuickRecordPaymentModalProps {
  invoice: Invoice;
  settings: CompanySettings;
  onClose: () => void;
  onSave: (payment: PaymentRecord) => void;
}

function QuickRecordPaymentModal({ invoice, settings, onClose, onSave }: QuickRecordPaymentModalProps) {
  const calc = calculateInvoice(invoice, settings.rate);
  const [amt, setAmt] = useState<number>(calc.bal);
  const [mode, setMode] = useState<PaymentRecord['mode']>('Cash');
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [refNo, setRefNo] = useState<string>('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!amt || amt <= 0) return;
    const payment: PaymentRecord = {
      id: 'p-' + Date.now().toString(36),
      date,
      amt: Number(amt),
      mode,
      refNo: refNo.trim()
    };
    onSave(payment);
  };

  return (
    <div className="fixed inset-0 z-60 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm border border-slate-200 p-6 space-y-4">
        <div className="flex justify-between items-center pb-2 border-b border-slate-100">
          <div>
            <h3 className="font-bold text-slate-900 text-sm m-0">Payment for {invoice.no}</h3>
            <p className="text-xs text-slate-500 m-0">Balance due: ₹{calc.bal.toFixed(2)}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
          <div>
            <label className="block font-bold text-slate-700 mb-1">Amount (₹)</label>
            <input
              type="number"
              min="0.01"
              step="0.01"
              required
              autoFocus
              value={amt}
              onChange={(e) => setAmt(Number(e.target.value) || 0)}
              className="w-full h-11 px-3 font-mono font-bold text-base bg-white border border-slate-300 rounded-xl text-slate-900 focus:outline-teal-600"
            />
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">Mode</label>
            <div className="grid grid-cols-4 gap-1 p-1 bg-slate-100 rounded-xl">
              {(['Cash', 'UPI', 'Bank', 'Cheque'] as PaymentRecord['mode'][]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={`py-1.5 text-xs font-semibold rounded-lg transition-all ${
                    mode === m ? 'bg-white text-slate-900 shadow-2xs font-bold' : 'text-slate-600'
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
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full h-10 px-3 bg-white border border-slate-300 rounded-xl text-slate-900 focus:outline-teal-600 text-xs"
            />
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">Transaction Ref / Note</label>
            <input
              type="text"
              value={refNo}
              onChange={(e) => setRefNo(e.target.value)}
              placeholder="e.g. UPI / Cheque Ref"
              className="w-full h-10 px-3 bg-white border border-slate-300 rounded-xl text-slate-900 font-mono focus:outline-teal-600 text-xs"
            />
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-xs cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-[#1F7A63] hover:bg-[#186351] text-white font-bold rounded-xl text-xs cursor-pointer shadow-xs"
            >
              Save Payment
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

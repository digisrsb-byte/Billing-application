import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { AppDatabase, Invoice, Client, PaymentRecord, CompanySettings } from './types/billing';
import {
  getDatabase,
  saveDatabase,
  recordAudit,
  DatabaseLoadError,
  restoreFromDatabase
} from './services/storage';
import { hydrateSession, isLoggedIn, clearSession } from './services/auth';
import { applyInvoiceSave } from './services/invoiceIntegrity';
import { assertPaymentInvoiceLink, validatePaymentRecord } from './services/paymentValidation';
import {
  AppNotification,
  countUnread,
  findInvoiceForNotification,
  markAllNotificationsRead,
  markNotificationRead,
  syncNotificationsFromDatabase
} from './services/notifications';
import { findCustomerPhoneConflict, listLegacyPhoneDuplicates } from './utils/customerPhone';
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
import { RecordCustomerPaymentModal } from './components/RecordCustomerPaymentModal';
import { ConfirmModal } from './components/ConfirmModal';
import { LoginView } from './components/LoginView';
import { DatabaseRecoveryView } from './components/DatabaseRecoveryView';
import { CheckCircle2, X } from 'lucide-react';

export default function App() {
  const [authReady, setAuthReady] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [db, setDb] = useState<AppDatabase | null>(null);
  const [dbLoadError, setDbLoadError] = useState<DatabaseLoadError | null>(null);
  const [currentView, setCurrentView] = useState<NavView>('overview');
  const [activeReportTab, setActiveReportTab] = useState<'day' | 'month' | 'payment' | 'gst'>('day');
  const [searchQuery, setSearchQuery] = useState('');
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const dbRef = useRef<AppDatabase | null>(null);

  // Modals
  const [activeInvoiceForPrint, setActiveInvoiceForPrint] = useState<Invoice | null>(null);
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [isNewClientModalOpen, setIsNewClientModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [recordPaymentForInvoice, setRecordPaymentForInvoice] = useState<Invoice | null>(null);
  const [isGenericPaymentModalOpen, setIsGenericPaymentModalOpen] = useState(false);
  const [invoiceToDelete, setInvoiceToDelete] = useState<Invoice | null>(null);
  const [invoiceToVoid, setInvoiceToVoid] = useState<Invoice | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [clientToDelete, setClientToDelete] = useState<{ id: string; name: string } | null>(null);

  const commitDb = useCallback((next: AppDatabase) => {
    dbRef.current = next;
    setDb(next);
  }, []);

  // Sync billing notifications whenever the live database changes (persist read state).
  useEffect(() => {
    if (!db || !authed) return;
    let cancelled = false;
    void (async () => {
      try {
        const items = await syncNotificationsFromDatabase(db);
        if (!cancelled) setNotifications(items);
      } catch {
        /* non-fatal — header still works without notifications */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [db, authed]);

  const unreadNotificationCount = useMemo(() => countUnread(notifications), [notifications]);

  const handleNotificationClick = useCallback(
    async (n: AppNotification) => {
      try {
        const items = await markNotificationRead(n.id);
        setNotifications(items);
      } catch {
        setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      }
      const current = dbRef.current;
      if (!current) return;
      const inv = findInvoiceForNotification(current, n);
      if (inv) {
        setActiveInvoiceForPrint(inv);
      } else if (n.type === 'outstanding') {
        setCurrentView('payments');
      }
    },
    []
  );

  const handleMarkAllNotificationsRead = useCallback(async () => {
    try {
      const items = await markAllNotificationsRead();
      setNotifications(items);
    } catch {
      setNotifications((prev) => prev.map((x) => ({ ...x, read: true })));
    }
  }, []);

  const tryLoadDatabase = useCallback(async () => {
    try {
      const loaded = await getDatabase();
      commitDb(loaded);
      setDbLoadError(null);
      return true;
    } catch (e) {
      if (e instanceof DatabaseLoadError) {
        dbRef.current = null;
        setDb(null);
        setDbLoadError(e);
        return false;
      }
      throw e;
    }
  }, [commitDb]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ok = await hydrateSession();
      if (cancelled) return;
      setAuthed(ok);
      if (ok) {
        try {
          await tryLoadDatabase();
        } catch {
          clearSession();
          setAuthed(false);
          dbRef.current = null;
          setDb(null);
          setDbLoadError(null);
        }
      }
      setAuthReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [tryLoadDatabase]);

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

  // Invoice Handlers — uniqueness + finalized lock enforced before persist
  const handleSaveInvoice = useCallback(
    async (invoice: Invoice, openPrint: boolean = true) => {
      const prev = dbRef.current;
      if (!prev) return;

      const result = applyInvoiceSave(
        prev.invoices,
        prev.settings.nextSeq,
        invoice,
        prev.settings.invoicePrefix
      );

      if (!result.ok) {
        showToast(
          result.reason === 'DUPLICATE_INVOICE_NO'
            ? 'Invoice number already exists — save cancelled'
            : 'This invoice is finalized and cannot be edited'
        );
        return;
      }

      const nextDb: AppDatabase = {
        ...prev,
        invoices: result.invoices,
        settings: {
          ...prev.settings,
          nextSeq: result.nextSeq
        }
      };

      try {
        await saveDatabase(nextDb);
        commitDb(nextDb);
        if (openPrint) {
          setActiveInvoiceForPrint(result.saved);
        }
      } catch (err) {
        showToast(
          err instanceof Error && err.message === 'DUPLICATE_INVOICE_NO'
            ? 'Invoice number already exists — save cancelled'
            : 'Could not save invoice'
        );
      }
    },
    [commitDb, showToast]
  );

  // Client Handlers — phone uniqueness is authoritative here (normalized match).
  const persistClient = useCallback(
    async (client: Client): Promise<boolean> => {
      const prev = dbRef.current;
      if (!prev) return false;

      const conflict = findCustomerPhoneConflict(prev.clients, client.phone, client.id);
      if (conflict) {
        showToast(`Phone number already used by "${conflict.name}"`);
        return false;
      }

      // Report-only: never auto-rewrite legacy duplicate phones on unrelated saves.
      const legacyDupes = listLegacyPhoneDuplicates(prev.clients);
      if (legacyDupes.length > 0) {
        console.warn(
          'Legacy customer phone duplicates present (not rewritten):',
          legacyDupes.map((g) => g.normalized).join(', ')
        );
      }

      const existingIdx = prev.clients.findIndex((c) => c.id === client.id);
      let nextClients = [...prev.clients];
      if (existingIdx >= 0) {
        nextClients[existingIdx] = client;
      } else {
        nextClients.push(client);
      }
      const nextDb: AppDatabase = { ...prev, clients: nextClients };
      try {
        await saveDatabase(nextDb);
        commitDb(nextDb);
        return true;
      } catch {
        showToast('Could not save customer');
        return false;
      }
    },
    [commitDb, showToast]
  );

  const handleDeleteClient = useCallback(
    (id: string, name: string) => {
      if (!db) return;
      const hasInvoices = db.invoices.some((inv) => inv.cid === id);
      if (hasInvoices) {
        showToast(`Cannot delete "${name}" because they have existing invoices`);
        return;
      }
      setClientToDelete({ id, name });
    },
    [db, showToast]
  );

  // Payment Recording — always requires a concrete invoice ID; never saves unlinked payments.
  const handleRecordPayment = useCallback(
    async (invoiceId: string, payment: PaymentRecord): Promise<boolean> => {
      const prev = dbRef.current;
      if (!prev) return false;

      const linkCheck = assertPaymentInvoiceLink(invoiceId, payment.invoiceId);
      if (linkCheck) {
        showToast(linkCheck.message);
        return false;
      }

      const target = prev.invoices.find((inv) => inv.id === invoiceId);
      if (!target) {
        showToast('Invoice not found');
        return false;
      }

      const check = validatePaymentRecord(target, payment, prev.settings.rate);
      if (!check.ok) {
        showToast(check.message);
        return false;
      }

      const safePayment: PaymentRecord = {
        ...payment,
        amt: check.amt,
        invoiceId
      };
      const nextInvoices = prev.invoices.map((inv) => {
        if (inv.id === invoiceId) {
          return {
            ...inv,
            pay: [...(inv.pay || []), safePayment]
          };
        }
        return inv;
      });
      const nextDb: AppDatabase = { ...prev, invoices: nextInvoices };
      try {
        await saveDatabase(nextDb);
        commitDb(nextDb);
        setRecordPaymentForInvoice(null);
        setIsGenericPaymentModalOpen(false);
        return true;
      } catch {
        showToast('Could not save payment');
        return false;
      }
    },
    [commitDb, showToast]
  );

  const openPaymentInvoicePicker = useCallback(() => {
    const prev = dbRef.current;
    if (!prev) return;
    const hasPayable = prev.invoices.some(
      (i) => !i.voided && calculateInvoice(i, prev.settings.rate).bal > 0.05
    );
    if (!hasPayable) {
      showToast('No invoices with an outstanding balance');
      return;
    }
    setIsGenericPaymentModalOpen(true);
  }, [showToast]);

  // Settings
  const handleUpdateSettings = useCallback(
    async (newSettings: CompanySettings) => {
      const prev = dbRef.current;
      if (!prev) return;
      const nextDb: AppDatabase = { ...prev, settings: newSettings };
      try {
        await saveDatabase(nextDb);
        commitDb(nextDb);
      } catch {
        showToast('Could not save settings');
      }
    },
    [commitDb, showToast]
  );

  /** Confirmed restore from Settings (file or recovery key). Snapshots current DB first. */
  const handleImportData = useCallback(
    async (imported: AppDatabase, sourceLabel: string = 'file') => {
      if (!isLoggedIn()) {
        showToast('Sign in required to import data');
        throw new Error('AUTH_REQUIRED');
      }
      try {
        const result = await restoreFromDatabase(imported, true, sourceLabel);
        commitDb(result.db);
        setDbLoadError(null);
        setCurrentView('overview');
      } catch (err) {
        if (err instanceof Error && err.message === 'DUPLICATE_INVOICE_NO') {
          showToast('Import blocked — backup contains unresolved duplicate invoice numbers. Current data kept.');
        } else if (err instanceof Error && err.message === 'RESTORE_NOT_CONFIRMED') {
          showToast('Restore cancelled — confirmation required');
        } else if (err instanceof Error && err.message === 'RESTORE_SOURCE_INVALID') {
          showToast('Import blocked — backup failed validation. Current data kept.');
        } else {
          showToast('Import failed — current data was not replaced');
        }
        throw err;
      }
    },
    [commitDb, showToast]
  );

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
        setInvoiceToVoid(null);
        setClientToDelete(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Pending count for sidebar badge (voided invoices excluded)
  const pendingCount = useMemo(() => {
    if (!db) return 0;
    return db.invoices.filter(
      (i) => !i.voided && calculateInvoice(i, db.settings.rate).bal > 0.05
    ).length;
  }, [db]);

  // Client for print modal
  const printClient = useMemo(() => {
    if (!db || !activeInvoiceForPrint) return undefined;
    return db.clients.find((c) => c.id === activeInvoiceForPrint.cid);
  }, [activeInvoiceForPrint, db]);

  const handleLogout = useCallback(() => {
    clearSession();
    setAuthed(false);
    dbRef.current = null;
    setDb(null);
    setDbLoadError(null);
    setCurrentView('overview');
    setActiveInvoiceForPrint(null);
    setIsInvoiceModalOpen(false);
  }, []);

  const handleRequestRemoveInvoice = useCallback(
    (id: string) => {
      if (!db) return;
      const target = db.invoices.find((i) => i.id === id);
      if (!target) return;
      if (target.voided) {
        showToast('Invoice is already voided');
        return;
      }
      if (target.finalized) {
        setVoidReason('');
        setInvoiceToVoid(target);
        return;
      }
      setInvoiceToDelete(target);
    },
    [db, showToast]
  );

  if (!authReady) {
    return (
      <div className="min-h-screen w-screen flex items-center justify-center bg-[#F5F7FA] text-slate-600 text-sm">
        Loading…
      </div>
    );
  }

  if (!authed) {
    return (
      <LoginView
        onSuccess={() => {
          void (async () => {
            setAuthed(true);
            try {
              await tryLoadDatabase();
            } catch {
              clearSession();
              setAuthed(false);
            }
          })();
        }}
      />
    );
  }

  if (dbLoadError || !db) {
    return (
      <DatabaseRecoveryView
        error={
          dbLoadError ||
          new DatabaseLoadError('SHAPE_FAIL', 'srk_enterprises_billing_db_v2')
        }
        onRestored={(restored) => {
          commitDb(restored);
          setDbLoadError(null);
          showToast('Database restored');
        }}
        onLogout={handleLogout}
      />
    );
  }

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
        onLogout={handleLogout}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden">
        {/* Header Bar matching User Screenshots */}
        <DesktopHeader
          currentView={currentView}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          companyName={db.settings.name}
          notifications={notifications}
          unreadCount={unreadNotificationCount}
          onNotificationClick={handleNotificationClick}
          onMarkAllNotificationsRead={handleMarkAllNotificationsRead}
        />

        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          {currentView === 'overview' && (
            <OverviewView
              db={db}
              onCreateInvoice={() => setCurrentView('box_billing')}
              onOpenRecordPayment={openPaymentInvoicePicker}
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
              onSaveClient={persistClient}
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
              onDeleteInvoice={handleRequestRemoveInvoice}
              onRecordPayment={(inv) => {
                if (inv.voided) {
                  showToast('Cannot record payment on a voided invoice');
                  return;
                }
                setRecordPaymentForInvoice(inv);
              }}
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
              onOpenRecordPayment={openPaymentInvoicePicker}
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
              onImportData={handleImportData}
              onDatabaseReplaced={(restored) => {
                commitDb(restored);
                setDbLoadError(null);
              }}
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
            if (inv.finalized) {
              showToast('This invoice is finalized and cannot be edited');
              return;
            }
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
          clients={db.clients}
          initialClient={editingClient}
          onClose={() => {
            setIsNewClientModalOpen(false);
            setEditingClient(null);
          }}
          onSave={async (client) => {
            const ok = await persistClient(client);
            if (!ok) return;
            setIsNewClientModalOpen(false);
            setEditingClient(null);
            showToast(`Client "${client.name}" saved`);
          }}
        />
      )}

      {/* Record Customer Payment — Payments/Overview (must select invoice) or Invoices (pre-selected) */}
      {(isGenericPaymentModalOpen || recordPaymentForInvoice) && (
        <RecordCustomerPaymentModal
          db={db}
          initialInvoice={recordPaymentForInvoice}
          allowInvoiceChange={!recordPaymentForInvoice || isGenericPaymentModalOpen}
          onClose={() => {
            setIsGenericPaymentModalOpen(false);
            setRecordPaymentForInvoice(null);
          }}
          onSave={async (invoiceId, payment) => {
            const inv = db.invoices.find((i) => i.id === invoiceId);
            const ok = await handleRecordPayment(invoiceId, { ...payment, invoiceId });
            if (ok) {
              showToast(`Payment of ₹${payment.amt.toFixed(2)} recorded for ${inv?.no || 'invoice'}`);
            }
            return ok;
          }}
        />
      )}

      {/* Draft invoice hard-delete (non-finalized only) */}
      <ConfirmModal
        isOpen={!!invoiceToDelete}
        title={`Delete Invoice ${invoiceToDelete?.no}?`}
        message={`Are you sure you want to permanently delete draft invoice ${invoiceToDelete?.no}? Finalized invoices cannot be deleted — void them instead.`}
        confirmLabel="Delete Invoice"
        cancelLabel="Cancel"
        isDestructive={true}
        onConfirm={() => {
          if (invoiceToDelete) {
            if (invoiceToDelete.finalized) {
              showToast('Finalized invoices cannot be deleted — use Void');
              setInvoiceToDelete(null);
              return;
            }
            const id = invoiceToDelete.id;
            const no = invoiceToDelete.no;
            const prev = dbRef.current;
            if (!prev) return;
            let nextDb: AppDatabase = {
              ...prev,
              invoices: prev.invoices.filter((i) => i.id !== id)
            };
            nextDb = recordAudit(nextDb, {
              action: 'invoice_delete',
              invoiceId: id,
              invoiceNo: no,
              detail: 'Draft invoice permanently deleted'
            });
            void (async () => {
              try {
                await saveDatabase(nextDb);
                commitDb(nextDb);
                showToast(`Invoice ${no} deleted`);
              } catch {
                showToast('Could not delete invoice');
              } finally {
                setInvoiceToDelete(null);
              }
            })();
          }
        }}
        onCancel={() => setInvoiceToDelete(null)}
      />

      {/* Finalized invoice void (controlled cancellation with audit trail) */}
      {invoiceToVoid && (
        <div className="fixed inset-0 z-80 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm border border-slate-200 p-5 space-y-4">
            <h3 className="font-bold text-slate-900 text-sm m-0">Void invoice {invoiceToVoid.no}?</h3>
            <p className="text-xs text-slate-600 m-0 leading-relaxed">
              Finalized invoices cannot be permanently deleted. Voiding keeps the record for financial
              history and marks it cancelled.
            </p>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Reason (required)</label>
              <textarea
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                rows={3}
                placeholder="e.g. Issued in error / customer cancelled"
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:outline-teal-600 resize-none"
              />
            </div>
            <div className="pt-1 flex justify-end gap-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setInvoiceToVoid(null);
                  setVoidReason('');
                }}
                className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const reason = voidReason.trim();
                  if (reason.length < 3) {
                    showToast('Enter a void reason (at least 3 characters)');
                    return;
                  }
                  const target = invoiceToVoid;
                  const prev = dbRef.current;
                  if (!prev) return;
                  const nextInvoices = prev.invoices.map((inv) =>
                    inv.id === target.id
                      ? {
                          ...inv,
                          voided: true,
                          voidReason: reason,
                          voidedAt: new Date().toISOString(),
                          voidedBy: 'desk'
                        }
                      : inv
                  );
                  let nextDb: AppDatabase = { ...prev, invoices: nextInvoices };
                  nextDb = recordAudit(nextDb, {
                    action: 'invoice_void',
                    invoiceId: target.id,
                    invoiceNo: target.no,
                    reason
                  });
                  void (async () => {
                    try {
                      await saveDatabase(nextDb);
                      commitDb(nextDb);
                      showToast(`Invoice ${target.no} voided`);
                    } catch {
                      showToast('Could not void invoice');
                    } finally {
                      setInvoiceToVoid(null);
                      setVoidReason('');
                    }
                  })();
                }}
                className="px-3.5 py-2 text-xs font-bold rounded-lg bg-rose-600 hover:bg-rose-700 text-white cursor-pointer"
              >
                Void invoice
              </button>
            </div>
          </div>
        </div>
      )}

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
            const prev = dbRef.current;
            if (!prev) return;
            const nextDb = {
              ...prev,
              clients: prev.clients.filter((c) => c.id !== clientToDelete.id)
            };
            const name = clientToDelete.name;
            void (async () => {
              try {
                await saveDatabase(nextDb);
                commitDb(nextDb);
                showToast(`Client "${name}" deleted`);
              } catch {
                showToast('Could not delete customer');
              } finally {
                setClientToDelete(null);
              }
            })();
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
  clients: Client[];
  initialClient?: Client | null;
  onClose: () => void;
  onSave: (client: Client) => void | Promise<void>;
}

function QuickAddClientModal({ clients, initialClient, onClose, onSave }: QuickAddClientModalProps) {
  const [name, setName] = useState(initialClient?.name || '');
  const [phone, setPhone] = useState(initialClient?.phone || '');
  const [addr, setAddr] = useState(initialClient?.addr || '');
  const [gst, setGst] = useState(initialClient?.gst || '');
  const [state, setState] = useState(initialClient?.state || 'Karnataka');
  const [pin, setPin] = useState(initialClient?.pin || '');
  const [formError, setFormError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const id =
      initialClient?.id || 'cli-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    const conflict = findCustomerPhoneConflict(clients, phone, id);
    if (conflict) {
      setFormError(`Phone number already used by "${conflict.name}"`);
      return;
    }
    setFormError('');
    const client: Client = {
      id,
      name: name.trim(),
      phone: phone.trim(),
      addr: addr.trim(),
      gst: gst.trim().toUpperCase(),
      state: state.trim() || 'Karnataka',
      pin: pin.trim(),
      createdAt: initialClient?.createdAt || new Date().toISOString().slice(0, 10)
    };
    void onSave(client);
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
          {formError && <p className="text-rose-600 m-0 text-xs font-semibold">{formError}</p>}
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
              onChange={(e) => {
                setPhone(e.target.value);
                setFormError('');
              }}
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

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block font-bold text-slate-700 mb-1">State</label>
              <input
                type="text"
                value={state}
                onChange={(e) => setState(e.target.value)}
                className="w-full h-10 px-3 bg-white border border-slate-300 rounded-xl text-slate-900 focus:outline-teal-600 text-xs"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">PIN</label>
              <input
                type="text"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="560001"
                className="w-full h-10 px-3 bg-white border border-slate-300 rounded-xl text-slate-900 font-mono focus:outline-teal-600 text-xs"
              />
            </div>
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

import React, { useEffect, useState } from 'react';
import { AppDatabase, CompanySettings } from '../types/billing';
import {
  getActiveStorageKey,
  listRecoverySources,
  summarizeStorageBackup,
  restoreFromStorageKey,
  validateDatabaseShape,
  RecoverySource
} from '../services/storage';
import { Save, Download, Upload, Building, CreditCard, Hash, ShieldAlert } from 'lucide-react';

interface SettingsViewProps {
  db: AppDatabase;
  onUpdateSettings: (settings: CompanySettings) => void;
  /** File import after confirm — storage layer snapshots then writes */
  onImportData: (importedDb: AppDatabase, sourceLabel?: string) => void | Promise<void>;
  /** Local-key restore already persisted — only lift React state */
  onDatabaseReplaced: (db: AppDatabase) => void;
  showToast: (msg: string) => void;
}

type PendingFileRestore = {
  db: AppDatabase;
  fileName: string;
  clients: number;
  invoices: number;
};

function describeShapeFailure(
  reason: 'NOT_OBJECT' | 'MISSING_CLIENTS' | 'MISSING_INVOICES' | 'MISSING_SETTINGS'
): string {
  switch (reason) {
    case 'MISSING_CLIENTS':
      return 'Backup is incomplete — customers list is missing.';
    case 'MISSING_INVOICES':
      return 'Backup is incomplete — invoices list is missing.';
    case 'MISSING_SETTINGS':
      return 'Backup is incomplete — company settings are missing.';
    default:
      return 'Invalid backup file — not a recognized database export.';
  }
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  db,
  onUpdateSettings,
  onImportData,
  onDatabaseReplaced,
  showToast
}) => {
  const [form, setForm] = useState<CompanySettings>({ ...db.settings });
  const [pendingFile, setPendingFile] = useState<PendingFileRestore | null>(null);
  const [fileConfirm, setFileConfirm] = useState('');
  const [selectedRecovery, setSelectedRecovery] = useState<RecoverySource | null>(null);
  const [recoveryConfirm, setRecoveryConfirm] = useState('');
  const [recoveryTick, setRecoveryTick] = useState(0);

  const destKey = getActiveStorageKey();
  const [recoverySources, setRecoverySources] = useState<RecoverySource[]>([]);

  useEffect(() => {
    setForm({ ...db.settings });
  }, [db.settings]);

  useEffect(() => {
    let cancelled = false;
    void listRecoverySources(destKey).then((sources) => {
      if (!cancelled) setRecoverySources(sources);
    });
    return () => {
      cancelled = true;
    };
  }, [destKey, recoveryTick, db]);

  const handleChange = (field: keyof CompanySettings, value: string | number | boolean) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSaveAll = (e: React.FormEvent) => {
    e.preventDefault();
    // Products stay on the Products page — never rewrite catalogue from Settings.
    onUpdateSettings({ ...form, boxes: db.settings.boxes });
    showToast('Settings saved');
  };

  const handleExportBackup = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(db, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `SRK_Billing_Backup_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    showToast('Backup exported');
  };

  const handleImportBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        const shape = validateDatabaseShape(parsed);
        if (!shape.ok) {
          showToast(describeShapeFailure(shape.reason) + ' Current data was not changed.');
          return;
        }
        setPendingFile({
          db: shape.db,
          fileName: file.name,
          clients: shape.db.clients.length,
          invoices: shape.db.invoices.length
        });
        setFileConfirm('');
      } catch {
        showToast('Failed to read backup file. Current data was not changed.');
      }
    };
    reader.readAsText(file);
  };

  const confirmFileRestore = () => {
    if (!pendingFile) return;
    if (fileConfirm.trim().toUpperCase() !== 'RESTORE') {
      showToast('Type RESTORE to confirm import');
      return;
    }
    void (async () => {
      try {
        await Promise.resolve(onImportData(pendingFile.db, pendingFile.fileName));
        setForm({ ...pendingFile.db.settings });
        setPendingFile(null);
        setFileConfirm('');
        showToast('Backup restored');
        setRecoveryTick((t) => t + 1);
      } catch {
        /* App already toasted — live DB preserved / rolled back by storage layer */
      }
    })();
  };

  const currentHasRecords = db.clients.length > 0 || db.invoices.length > 0;
  const pendingIsEmpty =
    !!pendingFile && pendingFile.clients === 0 && pendingFile.invoices === 0;

  const inputCls =
    'w-full h-10 px-3 bg-white border border-slate-300 rounded-xl text-slate-900 text-sm focus:outline-teal-600';

  return (
    <div className="space-y-6 max-w-3xl mx-auto pb-16">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 m-0">Settings</h2>
          <p className="text-sm text-slate-500 mt-1 m-0">
            Company details printed on invoices. Manage products from the Products page.
          </p>
        </div>
        <button
          type="button"
          onClick={handleSaveAll}
          className="h-10 px-5 flex items-center gap-1.5 text-sm font-bold bg-[#1F7A63] text-white rounded-xl hover:bg-[#186351] cursor-pointer"
        >
          <Save className="w-4 h-4" />
          Save
        </button>
      </div>

      <form onSubmit={handleSaveAll} className="space-y-5">
        <section className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-900 pb-2 border-b border-slate-100">
            <Building className="w-4 h-4 text-[#1F7A63]" />
            Business details
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div className="sm:col-span-2">
              <label className="block font-semibold text-slate-700 mb-1">Business name</label>
              <input type="text" value={form.name} onChange={(e) => handleChange('name', e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Phone</label>
              <input type="text" value={form.phone} onChange={(e) => handleChange('phone', e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Email</label>
              <input type="email" value={form.email} onChange={(e) => handleChange('email', e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">GSTIN</label>
              <input
                type="text"
                value={form.gst}
                onChange={(e) => handleChange('gst', e.target.value.toUpperCase())}
                className={`${inputCls} font-mono`}
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">PAN</label>
              <input
                type="text"
                value={form.pan}
                onChange={(e) => handleChange('pan', e.target.value.toUpperCase())}
                className={`${inputCls} font-mono`}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block font-semibold text-slate-700 mb-1">Address</label>
              <textarea
                rows={2}
                value={form.addr}
                onChange={(e) => handleChange('addr', e.target.value)}
                className="w-full p-3 bg-white border border-slate-300 rounded-xl text-slate-900 text-sm focus:outline-teal-600 resize-none"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">State</label>
              <input type="text" value={form.state} onChange={(e) => handleChange('state', e.target.value)} className={inputCls} />
            </div>
          </div>
        </section>

        <section className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-900 pb-2 border-b border-slate-100">
            <CreditCard className="w-4 h-4 text-[#1F7A63]" />
            Bank details (on invoice)
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Bank name</label>
              <input type="text" value={form.bankName} onChange={(e) => handleChange('bankName', e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Account number</label>
              <input type="text" value={form.accountNo} onChange={(e) => handleChange('accountNo', e.target.value)} className={`${inputCls} font-mono`} />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">IFSC</label>
              <input
                type="text"
                value={form.ifsc}
                onChange={(e) => handleChange('ifsc', e.target.value.toUpperCase())}
                className={`${inputCls} font-mono`}
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Branch</label>
              <input type="text" value={form.branch} onChange={(e) => handleChange('branch', e.target.value)} className={inputCls} />
            </div>
            <div className="sm:col-span-2">
              <label className="block font-semibold text-slate-700 mb-1">UPI ID</label>
              <input type="text" value={form.upiId} onChange={(e) => handleChange('upiId', e.target.value)} className={`${inputCls} font-mono`} />
            </div>
          </div>
        </section>

        <section className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-900 pb-2 border-b border-slate-100">
            <Hash className="w-4 h-4 text-[#1F7A63]" />
            Invoice & GST defaults
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Invoice prefix</label>
              <input type="text" value={form.invoicePrefix} onChange={(e) => handleChange('invoicePrefix', e.target.value)} className={`${inputCls} font-mono`} />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Next number</label>
              <input
                type="number"
                min={1}
                value={form.nextSeq}
                onChange={(e) => handleChange('nextSeq', Math.max(1, parseInt(e.target.value) || 1))}
                className={`${inputCls} font-mono`}
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Default GST %</label>
              <select
                value={form.rate}
                onChange={(e) => handleChange('rate', Number(e.target.value))}
                className={inputCls}
              >
                <option value={1}>1%</option>
                <option value={5}>5%</option>
                <option value={12}>12%</option>
                <option value={18}>18%</option>
              </select>
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer text-sm font-medium text-slate-800">
            <input
              type="checkbox"
              checked={form.gstOn}
              onChange={(e) => handleChange('gstOn', e.target.checked)}
              className="w-4 h-4 rounded"
            />
            Add GST on new invoices by default
          </label>
        </section>

        {/* Backup & recovery */}
        <section className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-900 pb-2 border-b border-slate-100">
            <ShieldAlert className="w-4 h-4 text-[#1F7A63]" />
            Backup & recovery
          </div>
          <p className="text-xs text-slate-500 m-0">
            Destination database: <span className="font-mono">{destKey}</span>. Restores validate the backup,
            snapshot the current database, then replace only after you type RESTORE. To move browser data into the
            desktop app, Export JSON in the browser then Import here — localStorage is never read or deleted
            automatically.
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleExportBackup}
              className="h-10 px-4 bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold rounded-xl flex items-center gap-2 cursor-pointer text-sm"
            >
              <Download className="w-4 h-4" />
              Export backup
            </button>
            <label className="h-10 px-4 bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold rounded-xl flex items-center gap-2 cursor-pointer text-sm">
              <Upload className="w-4 h-4" />
              Import backup file
              <input type="file" accept=".json" onChange={handleImportBackup} className="hidden" />
            </label>
          </div>
          <p className="text-[11px] text-slate-500 m-0">
            There is no “reset all data” action in Settings. Use Export regularly. Import only replaces data after
            you confirm with RESTORE; invalid files never overwrite the live database.
          </p>

          <div className="pt-2 space-y-2">
            <div className="text-xs font-bold text-slate-700">Local recovery copies</div>
            {recoverySources.length === 0 ? (
              <p className="text-xs text-slate-500 m-0">No automatic backups or salvage copies for this key yet.</p>
            ) : (
              <ul className="space-y-2 m-0 p-0 list-none">
                {recoverySources.map((s) => {
                  const sum = summarizeStorageBackup(s.key);
                  return (
                    <li key={s.key}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedRecovery(s);
                          setRecoveryConfirm('');
                        }}
                        className={`w-full text-left px-3 py-2 rounded-xl border text-xs cursor-pointer ${
                          selectedRecovery?.key === s.key
                            ? 'border-[#1F7A63] bg-emerald-50'
                            : 'border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <div className="font-semibold text-slate-900">{s.label}</div>
                        <div className="font-mono text-slate-500 break-all mt-0.5">{s.key}</div>
                        <div className="text-slate-400 mt-0.5">
                          {s.bytes} bytes
                          {sum
                            ? ` · ${sum.clients} customers, ${sum.invoices} invoices`
                            : ' · invalid / unreadable'}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {selectedRecovery && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 space-y-2 text-xs">
              <div className="font-bold text-slate-900">Confirm restore from local copy</div>
              <div>
                Source: <span className="font-mono">{selectedRecovery.key}</span>
              </div>
              <div>
                Destination: <span className="font-mono">{destKey}</span>
              </div>
              {(() => {
                const sum = summarizeStorageBackup(selectedRecovery.key);
                return sum ? (
                  <div>
                    Validated: {sum.clients} customers, {sum.invoices} invoices
                    {sum.schemaVersion != null ? `, schema v${sum.schemaVersion}` : ''}
                  </div>
                ) : (
                  <div className="text-rose-700">This copy failed validation and cannot be restored.</div>
                );
              })()}
              <input
                type="text"
                value={recoveryConfirm}
                onChange={(e) => setRecoveryConfirm(e.target.value)}
                placeholder="Type RESTORE"
                className={`${inputCls} font-mono`}
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedRecovery(null)}
                  className="px-3 py-2 rounded-lg bg-white border border-slate-200 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <StorageRestoreButton
                  disabled={!summarizeStorageBackup(selectedRecovery.key)}
                  confirmText={recoveryConfirm}
                  sourceKey={selectedRecovery.key}
                  onDone={(restored) => {
                    onDatabaseReplaced(restored);
                    setSelectedRecovery(null);
                    setRecoveryConfirm('');
                    setForm({ ...restored.settings });
                    showToast('Local backup restored');
                    setRecoveryTick((t) => t + 1);
                  }}
                  onError={() => showToast('Restore failed — current data was not replaced')}
                />
              </div>
            </div>
          )}
        </section>
      </form>

      {/* File restore confirmation */}
      {pendingFile && (
        <div className="fixed inset-0 z-80 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md border border-slate-200 p-5 space-y-3">
            <h3 className="font-bold text-slate-900 text-sm m-0">Confirm file import</h3>
            <p className="text-xs text-slate-600 m-0">
              Source file: <span className="font-mono">{pendingFile.fileName}</span>
              <br />
              Destination: <span className="font-mono">{destKey}</span>
              <br />
              Backup contents: {pendingFile.clients} customers, {pendingFile.invoices} invoices
              <br />
              Current database: {db.clients.length} customers, {db.invoices.length} invoices
            </p>
            {currentHasRecords && pendingIsEmpty && (
              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 m-0">
                Warning: this backup has no customers or invoices. Importing will replace your current records with
                an empty database. A recovery snapshot of the current data is created first.
              </p>
            )}
            <p className="text-xs text-slate-500 m-0">
              Importing replaces existing customers, invoices, payments, and settings. The current database will be
              snapshotted before replace. Type RESTORE to continue.
            </p>
            <input
              type="text"
              value={fileConfirm}
              onChange={(e) => setFileConfirm(e.target.value)}
              placeholder="Type RESTORE"
              className={`${inputCls} font-mono`}
            />
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setPendingFile(null);
                  setFileConfirm('');
                }}
                className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-slate-100 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmFileRestore}
                className="px-3.5 py-2 text-xs font-bold rounded-lg bg-[#1F7A63] text-white cursor-pointer"
              >
                Restore file
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/** Performs a single restoreFromStorageKey then notifies parent with the resulting DB (no double-write). */
function StorageRestoreButton({
  sourceKey,
  confirmText,
  disabled,
  onDone,
  onError
}: {
  sourceKey: string;
  confirmText: string;
  disabled?: boolean;
  onDone: (db: AppDatabase) => void;
  onError: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => {
        if (confirmText.trim().toUpperCase() !== 'RESTORE') return;
        void (async () => {
          try {
            const result = await restoreFromStorageKey(sourceKey, true);
            onDone(result.db);
          } catch {
            onError();
          }
        })();
      }}
      className="px-3 py-2 rounded-lg bg-[#1F7A63] text-white font-bold cursor-pointer disabled:opacity-40"
    >
      Restore copy
    </button>
  );
}

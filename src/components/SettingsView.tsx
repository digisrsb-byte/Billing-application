import React, { useEffect, useState } from 'react';
import { AppDatabase, CompanySettings } from '../types/billing';
import { ConfirmModal } from './ConfirmModal';
import { Save, Download, Upload, RotateCcw, Building, CreditCard, Hash } from 'lucide-react';

interface SettingsViewProps {
  db: AppDatabase;
  onUpdateSettings: (settings: CompanySettings) => void;
  onResetData: () => void;
  onImportData: (importedDb: AppDatabase) => void;
  showToast: (msg: string) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  db,
  onUpdateSettings,
  onResetData,
  onImportData,
  showToast
}) => {
  const [form, setForm] = useState<CompanySettings>({ ...db.settings });
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);

  useEffect(() => {
    setForm({ ...db.settings });
  }, [db.settings]);

  const handleChange = (field: keyof CompanySettings, value: string | number | boolean) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSaveAll = (e: React.FormEvent) => {
    e.preventDefault();
    // Keep product list from live DB — products are managed only on Products page
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
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (parsed && Array.isArray(parsed.clients) && Array.isArray(parsed.invoices)) {
          onImportData(parsed);
          setForm({ ...parsed.settings });
          showToast('Backup restored');
        } else {
          showToast('Invalid backup file');
        }
      } catch {
        showToast('Failed to read backup file');
      }
    };
    reader.readAsText(file);
  };

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
        {/* Business */}
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

        {/* Bank */}
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
              <label className="block font-semibold text-slate-700 mb-1">UPI ID</label>
              <input type="text" value={form.upiId} onChange={(e) => handleChange('upiId', e.target.value)} className={`${inputCls} font-mono`} />
            </div>
          </div>
        </section>

        {/* Invoice / GST */}
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

        {/* Backup */}
        <section className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
          <div className="text-sm font-bold text-slate-900 pb-2 border-b border-slate-100">Backup & reset</div>
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
              Import backup
              <input type="file" accept=".json" onChange={handleImportBackup} className="hidden" />
            </label>
            <button
              type="button"
              onClick={() => setIsResetConfirmOpen(true)}
              className="h-10 px-4 bg-white border border-rose-200 text-rose-700 font-semibold rounded-xl flex items-center gap-2 cursor-pointer text-sm ml-auto"
            >
              <RotateCcw className="w-4 h-4" />
              Reset all data
            </button>
          </div>
        </section>
      </form>

      <ConfirmModal
        isOpen={isResetConfirmOpen}
        title="Reset all data?"
        message="This deletes all customers, invoices, and payments and restores defaults. This cannot be undone."
        confirmLabel="Reset everything"
        cancelLabel="Cancel"
        isDestructive={true}
        onConfirm={() => {
          setIsResetConfirmOpen(false);
          onResetData();
          showToast('Data reset to defaults');
        }}
        onCancel={() => setIsResetConfirmOpen(false)}
      />
    </div>
  );
};

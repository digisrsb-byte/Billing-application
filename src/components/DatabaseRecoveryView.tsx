import React, { useEffect, useState } from 'react';
import {
  DatabaseLoadError,
  listRecoverySources,
  summarizeStorageBackup,
  restoreFromStorageKey,
  getActiveStorageKey,
  RecoverySource
} from '../services/storage';
import { AppDatabase } from '../types/billing';
import { AlertTriangle } from 'lucide-react';

interface DatabaseRecoveryViewProps {
  error: DatabaseLoadError;
  onRestored: (db: AppDatabase) => void;
  onLogout: () => void;
}

export const DatabaseRecoveryView: React.FC<DatabaseRecoveryViewProps> = ({
  error,
  onRestored,
  onLogout
}) => {
  const dest = getActiveStorageKey();
  const [sources, setSources] = useState<RecoverySource[]>([]);
  const [selected, setSelected] = useState<RecoverySource | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    let cancelled = false;
    void listRecoverySources(dest).then((list) => {
      if (!cancelled) setSources(list);
    });
    return () => {
      cancelled = true;
    };
  }, [dest, error.salvageKey]);

  const summary = selected ? summarizeStorageBackup(selected.key) : null;

  const handleRestore = () => {
    if (!selected || !summary) {
      setMsg('Select a valid backup first.');
      return;
    }
    if (confirmText.trim().toUpperCase() !== 'RESTORE') {
      setMsg('Type RESTORE to confirm.');
      return;
    }
    setBusy(true);
    setMsg('');
    void (async () => {
      try {
        const result = await restoreFromStorageKey(selected.key, true);
        onRestored(result.db);
      } catch (e) {
        const code = e instanceof Error ? e.message : 'RESTORE_FAILED';
        setMsg(
          code === 'RESTORE_SOURCE_INVALID'
            ? 'That backup failed validation and was not applied.'
            : code === 'RESTORE_CROSS_NAMESPACE_FORBIDDEN'
              ? 'That backup belongs to a different storage namespace.'
              : 'Restore failed. Current data was not replaced.'
        );
        setBusy(false);
      }
    })();
  };

  return (
    <div className="min-h-screen w-screen flex items-center justify-center bg-[#F5F7FA] p-4">
      <div className="w-full max-w-lg bg-white border border-slate-200 rounded-2xl p-6 space-y-4 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-full bg-amber-100 text-amber-700">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900 m-0">Database recovery required</h1>
            <p className="text-sm text-slate-600 mt-1 m-0">{error.message}</p>
            <p className="text-xs text-slate-500 mt-2 m-0 font-mono">
              Destination: {dest}
              {error.salvageKey ? ` · Salvage: ${error.salvageKey}` : ''}
              {error.code ? ` · Code: ${error.code}` : ''}
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-xs font-bold text-slate-700 uppercase tracking-wide">Available recovery copies</div>
          {sources.length === 0 ? (
            <p className="text-sm text-slate-500 m-0">No recovery copies found for this storage key.</p>
          ) : (
            <ul className="space-y-2 m-0 p-0 list-none">
              {sources.map((s) => (
                <li key={s.key}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelected(s);
                      setConfirmText('');
                      setMsg('');
                    }}
                    className={`w-full text-left px-3 py-2.5 rounded-xl border text-sm cursor-pointer ${
                      selected?.key === s.key
                        ? 'border-[#1F7A63] bg-emerald-50'
                        : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="font-semibold text-slate-900">{s.label}</div>
                    <div className="text-xs text-slate-500 font-mono mt-0.5 break-all">{s.key}</div>
                    <div className="text-xs text-slate-400 mt-0.5">{s.bytes} bytes</div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {selected && (
          <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 text-sm space-y-1">
            <div className="font-semibold text-slate-800">Restore preview</div>
            <div className="text-slate-600">
              Source → <span className="font-mono text-xs">{selected.key}</span>
            </div>
            <div className="text-slate-600">
              Destination → <span className="font-mono text-xs">{dest}</span>
            </div>
            {summary ? (
              <div className="text-slate-600">
                Validated: {summary.clients} customers, {summary.invoices} invoices
                {summary.schemaVersion != null ? `, schema v${summary.schemaVersion}` : ''}
              </div>
            ) : (
              <div className="text-rose-600">This copy failed validation and cannot be restored.</div>
            )}
            <p className="text-xs text-slate-500 m-0 pt-1">
              Your current database (if any readable bytes remain) is snapshotted before replace. Type RESTORE to
              confirm.
            </p>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="Type RESTORE"
              className="w-full h-10 px-3 mt-1 border border-slate-300 rounded-xl text-sm font-mono"
            />
          </div>
        )}

        {msg && <p className="text-sm text-rose-600 m-0">{msg}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onLogout}
            className="px-3.5 py-2 text-sm font-semibold rounded-xl bg-slate-100 text-slate-700 cursor-pointer"
          >
            Sign out
          </button>
          <button
            type="button"
            disabled={busy || !selected || !summary}
            onClick={handleRestore}
            className="px-3.5 py-2 text-sm font-bold rounded-xl bg-[#1F7A63] text-white disabled:opacity-40 cursor-pointer"
          >
            Restore selected backup
          </button>
        </div>
      </div>
    </div>
  );
};

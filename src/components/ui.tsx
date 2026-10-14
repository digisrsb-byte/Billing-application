import React, { useEffect, useRef, useState } from 'react';
import { MoreVertical, ChevronUp, ChevronDown, Search, X } from 'lucide-react';

/* ---------- Buttons ---------- */
type BtnVariant = 'primary' | 'secondary' | 'ghost';
export const Button: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; icon?: React.ReactNode }
> = ({ variant = 'primary', icon, children, className = '', ...rest }) => {
  const styles: Record<BtnVariant, string> = {
    primary: 'bg-[#1F7A63] hover:bg-[#186351] text-white border border-[#1F7A63]',
    secondary: 'bg-white hover:bg-[#F5F7FA] text-[#081C2D] border border-[#D5DBDF]',
    ghost: 'bg-transparent hover:bg-[#F5F7FA] text-[#9AA3A8] border border-transparent'
  };
  return (
    <button
      type="button"
      {...rest}
      className={`h-10 px-4 rounded-xl text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${styles[variant]} ${className}`}
    >
      {icon}
      {children}
    </button>
  );
};

/* ---------- Layout bits ---------- */
export const Card: React.FC<{ className?: string; children: React.ReactNode }> = ({ className = '', children }) => (
  <div className={`bg-white rounded-2xl border border-[#D5DBDF] ${className}`}>{children}</div>
);

export const PageHeader: React.FC<{ title: string; subtitle?: string; action?: React.ReactNode }> = ({
  title,
  subtitle,
  action
}) => (
  <div className="flex flex-wrap items-end justify-between gap-4">
    <div>
      <h1 className="text-2xl font-bold text-[#081C2D] m-0 tracking-tight">{title}</h1>
      {subtitle && <p className="text-sm text-[#9AA3A8] mt-1 m-0">{subtitle}</p>}
    </div>
    {action}
  </div>
);

export const StatCard: React.FC<{ label: string; value: string; hint?: string; icon: React.ReactNode }> = ({
  label,
  value,
  hint,
  icon
}) => (
  <Card className="p-5">
    <div className="flex items-start justify-between">
      <span className="text-sm font-medium text-[#9AA3A8]">{label}</span>
      <span className="w-9 h-9 rounded-xl bg-[#F5F7FA] text-[#1F7A63] flex items-center justify-center">{icon}</span>
    </div>
    <div className="text-2xl font-bold text-[#081C2D] mt-3 tabular-nums">{value}</div>
    {hint && <div className="text-xs text-[#9AA3A8] mt-1">{hint}</div>}
  </Card>
);

export const StatusBadge: React.FC<{ status: 'Paid' | 'Part paid' | 'Pending' }> = ({ status }) => {
  const cls =
    status === 'Paid'
      ? 'bg-[#1F7A63] text-white'
      : status === 'Part paid'
      ? 'bg-amber-100 text-amber-800 border border-amber-200'
      : 'bg-rose-100 text-rose-800 border border-rose-200';
  return <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold ${cls}`}>{status}</span>;
};

export const EmptyState: React.FC<{
  icon: React.ReactNode;
  title: string;
  message: string;
  action?: React.ReactNode;
}> = ({ icon, title, message, action }) => (
  <div className="py-16 px-6 text-center flex flex-col items-center">
    <div className="w-12 h-12 rounded-2xl bg-[#F5F7FA] text-[#1F7A63] flex items-center justify-center mb-3">{icon}</div>
    <h3 className="text-base font-semibold text-[#081C2D] m-0">{title}</h3>
    <p className="text-sm text-[#9AA3A8] max-w-sm mt-1 mb-4">{message}</p>
    {action}
  </div>
);

/* ---------- Search box ---------- */
export const SearchBox: React.FC<{ value: string; onChange: (v: string) => void; placeholder?: string }> = ({
  value,
  onChange,
  placeholder = 'Search'
}) => (
  <div className="relative w-full max-w-sm">
    <Search className="w-4 h-4 text-[#9AA3A8] absolute left-3 top-1/2 -translate-y-1/2" />
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full h-10 pl-9 pr-8 text-sm bg-white border border-[#D5DBDF] rounded-xl text-[#081C2D] placeholder:text-[#9AA3A8] focus:outline-[#1F7A63]"
    />
    {value && (
      <button
        type="button"
        onClick={() => onChange('')}
        aria-label="Clear search"
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#9AA3A8] cursor-pointer"
      >
        <X className="w-4 h-4" />
      </button>
    )}
  </div>
);

/* ---------- Sortable table header ---------- */
export const SortTh: React.FC<{
  label: string;
  active: boolean;
  dir: 'asc' | 'desc';
  onClick: () => void;
  align?: 'left' | 'right' | 'center';
}> = ({ label, active, dir, onClick, align = 'left' }) => (
  <th className={`py-3 px-5 font-semibold text-xs uppercase tracking-wider text-[#9AA3A8] text-${align}`}>
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 cursor-pointer hover:text-[#081C2D] ${active ? 'text-[#081C2D]' : ''}`}
    >
      {label}
      {active ? (
        dir === 'asc' ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />
      ) : (
        <ChevronDown className="w-3.5 h-3.5 opacity-30" />
      )}
    </button>
  </th>
);

export function useSort<K extends string>(initial: K) {
  const [key, setKey] = useState<K>(initial);
  const [dir, setDir] = useState<'asc' | 'desc'>('asc');
  const toggle = (k: K) => {
    if (k === key) setDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setKey(k);
      setDir('asc');
    }
  };
  return { key, dir, toggle };
}

export function compare(a: string | number, b: string | number, dir: 'asc' | 'desc') {
  const r = typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b));
  return dir === 'asc' ? r : -r;
}

/* ---------- Row action menu ---------- */
export interface MenuAction {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}
export const ActionMenu: React.FC<{ actions: MenuAction[] }> = ({ actions }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);
  return (
    <div className="relative inline-block" ref={ref} onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Row actions"
        className="p-2 rounded-lg text-[#9AA3A8] hover:bg-[#F5F7FA] hover:text-[#1F7A63] cursor-pointer"
      >
        <MoreVertical className="w-4 h-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-30 w-48 bg-white border border-[#D5DBDF] rounded-xl shadow-lg py-1">
          {actions.map((a) => (
            <button
              key={a.label}
              type="button"
              onClick={() => {
                setOpen(false);
                a.onClick();
              }}
              className={`w-full text-left px-3.5 py-2 text-sm flex items-center gap-2.5 cursor-pointer hover:bg-[#F5F7FA] ${
                a.danger ? 'text-rose-700 font-semibold' : 'text-[#081C2D]'
              }`}
            >
              <span className={a.danger ? 'text-rose-600' : 'text-[#9AA3A8]'}>{a.icon}</span>
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

/* ---------- Form field ---------- */
export const Field: React.FC<{ label: string; error?: string; children: React.ReactNode }> = ({
  label,
  error,
  children
}) => (
  <div>
    <label className="block text-sm font-medium text-[#081C2D] mb-1.5">{label}</label>
    {children}
    {error && <p className="text-xs text-rose-700 font-semibold mt-1 m-0">⚠ {error}</p>}
  </div>
);
export const inputCls =
  'w-full h-10 px-3 bg-white border border-[#D5DBDF] rounded-xl text-sm text-[#081C2D] placeholder:text-[#9AA3A8] focus:outline-[#1F7A63]';

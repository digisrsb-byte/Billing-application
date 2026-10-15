import React, { useEffect, useRef, useState } from 'react';
import { NavView } from './DesktopSidebar';
import { AppNotification } from '../services/notifications';
import { companyAvatarInitials, resolveCompanyDisplayName } from '../services/notifications';
import { Search, Bell, ChevronRight, CheckCheck } from 'lucide-react';

interface DesktopHeaderProps {
  currentView: NavView;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  /** Company name from settings; falls back to SRK Enterprises. */
  companyName?: string;
  notifications?: AppNotification[];
  unreadCount?: number;
  onNotificationClick?: (notification: AppNotification) => void;
  onMarkAllNotificationsRead?: () => void;
}

export const DesktopHeader: React.FC<DesktopHeaderProps> = ({
  currentView,
  searchQuery,
  onSearchChange,
  companyName,
  notifications = [],
  unreadCount = 0,
  onNotificationClick,
  onMarkAllNotificationsRead
}) => {
  const displayName = resolveCompanyDisplayName({ name: companyName });
  const initials = companyAvatarInitials(displayName);
  const [panelOpen, setPanelOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const pageLabels: Record<NavView, string> = {
    overview: 'Dashboard',
    box_billing: 'Billing',
    invoices: 'Invoices',
    products: 'Products',
    clients: 'Customers',
    payments: 'Payments',
    reports: 'Reports',
    settings: 'Settings'
  };

  const currentLabel = pageLabels[currentView] || 'Dashboard';

  useEffect(() => {
    if (!panelOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setPanelOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPanelOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [panelOpen]);

  const visible = notifications.slice(0, 40);

  return (
    <header className="h-16 bg-white border-b border-slate-200/90 px-6 flex items-center justify-between shrink-0 z-10 print:hidden">
      {/* Breadcrumb Navigation */}
      <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
        <span>SRK Enterprises</span>
        <ChevronRight className="w-4 h-4 text-slate-400" />
        <span className="text-slate-900 font-extrabold text-base">{currentLabel}</span>
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-3.5">
        <div className="relative flex items-center">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search invoices, customers..."
            className="w-60 sm:w-72 h-10 pl-10 pr-12 text-sm bg-slate-50/90 hover:bg-slate-50 focus:bg-white border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-teal-600 transition-all font-medium"
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center pointer-events-none">
            <kbd className="px-1.5 py-0.5 text-[10.5px] font-mono text-slate-500 bg-white border border-slate-200 rounded shadow-3xs font-semibold">
              ⌘ K
            </kbd>
          </div>
        </div>

        {/* Notification bell + panel */}
        <div className="relative" ref={panelRef}>
          <button
            type="button"
            onClick={() => setPanelOpen((o) => !o)}
            className="relative p-2.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            title="Notifications"
            aria-label="Notifications"
            aria-expanded={panelOpen}
            aria-haspopup="dialog"
          >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-[#1F7A63] text-white text-[10px] font-extrabold flex items-center justify-center ring-2 ring-white tabular-nums">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>

          {panelOpen && (
            <div
              role="dialog"
              aria-label="Notifications"
              className="absolute right-0 top-[calc(100%+8px)] w-[min(380px,calc(100vw-2rem))] max-h-[min(420px,70vh)] bg-white rounded-2xl border border-slate-200 shadow-[0_16px_48px_rgba(8,28,45,0.16)] overflow-hidden z-50 flex flex-col"
            >
              <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-2 shrink-0">
                <div>
                  <div className="text-sm font-extrabold text-[#081C2D]">Notifications</div>
                  <div className="text-[11px] text-slate-500 font-medium">
                    {unreadCount === 0 ? 'All caught up' : `${unreadCount} unread`}
                  </div>
                </div>
                {unreadCount > 0 && onMarkAllNotificationsRead && (
                  <button
                    type="button"
                    onClick={() => onMarkAllNotificationsRead()}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-[#1F7A63] hover:text-[#186351] cursor-pointer bg-transparent border-0 px-2 py-1 rounded-lg hover:bg-teal-50"
                  >
                    <CheckCheck className="w-3.5 h-3.5" />
                    Mark all read
                  </button>
                )}
              </div>

              <div className="overflow-y-auto flex-1">
                {visible.length === 0 ? (
                  <div className="px-4 py-10 text-center text-sm text-slate-500">
                    No billing notifications yet.
                  </div>
                ) : (
                  <ul className="m-0 p-0 list-none divide-y divide-slate-100">
                    {visible.map((n) => (
                      <li key={n.id}>
                        <button
                          type="button"
                          onClick={() => {
                            onNotificationClick?.(n);
                            setPanelOpen(false);
                          }}
                          className={`w-full text-left px-4 py-3 cursor-pointer transition-colors border-0 bg-transparent hover:bg-slate-50 ${
                            n.read ? 'opacity-80' : 'bg-[#F5F7FA]/80'
                          }`}
                        >
                          <div className="flex items-start gap-2.5">
                            {!n.read && (
                              <span className="mt-1.5 w-2 h-2 rounded-full bg-[#1F7A63] shrink-0" aria-hidden />
                            )}
                            <div className={`min-w-0 flex-1 ${n.read ? 'pl-4' : ''}`}>
                              <div className="text-xs font-extrabold text-[#081C2D] truncate">{n.title}</div>
                              <div className="text-[11px] text-slate-600 mt-0.5 leading-snug">{n.body}</div>
                              <div className="text-[10px] text-slate-400 mt-1 font-medium">
                                {n.type === 'outstanding' ? 'Outstanding balance' : 'Payment update'}
                                {n.invoiceNo ? ` · ${n.invoiceNo}` : ''}
                              </div>
                            </div>
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Company profile pill */}
        <div className="flex items-center gap-2 pl-1.5">
          <div className="w-8 h-8 rounded-full bg-[#081C2D] text-white font-bold text-xs flex items-center justify-center shrink-0">
            {initials}
          </div>
          <span className="text-xs sm:text-sm font-bold text-slate-800 hidden sm:inline-block max-w-[160px] truncate" title={displayName}>
            {displayName}
          </span>
        </div>
      </div>
    </header>
  );
};

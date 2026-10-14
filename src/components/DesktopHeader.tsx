import React from 'react';
import { NavView } from './DesktopSidebar';
import { Search, Bell, ChevronRight } from 'lucide-react';

interface DesktopHeaderProps {
  currentView: NavView;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  userEmail?: string;
}

export const DesktopHeader: React.FC<DesktopHeaderProps> = ({
  currentView,
  searchQuery,
  onSearchChange,
  userEmail = 'hello.rakshithass'
}) => {
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
        {/* Search Bar matching screenshot */}
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

        {/* Bell Notification with orange dot */}
        <button
          type="button"
          className="relative p-2.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
          title="Notifications"
        >
          <Bell className="w-4 h-4" />
          <span className="w-2 h-2 rounded-full bg-[#1F7A63] absolute top-2 right-2 ring-2 ring-white"></span>
        </button>

        {/* User Profile Pill */}
        <div className="flex items-center gap-2 pl-1.5">
          <div className="w-8 h-8 rounded-full bg-[#081C2D] text-white font-bold text-xs flex items-center justify-center shrink-0">
            H
          </div>
          <span className="text-xs sm:text-sm font-bold text-slate-800 hidden sm:inline-block">
            {userEmail}
          </span>
        </div>
      </div>
    </header>
  );
};

import React from 'react';
import {
  LayoutGrid,
  Receipt,
  FileText,
  Package,
  Users,
  CreditCard,
  BarChart3,
  Settings,
  ShieldCheck
} from 'lucide-react';
import { BrandLogo } from './BrandLogo';

export type NavView =
  | 'overview'
  | 'box_billing'
  | 'invoices'
  | 'products'
  | 'clients'
  | 'payments'
  | 'reports'
  | 'settings';

interface DesktopSidebarProps {
  currentView: NavView;
  activeReportTab?: 'day' | 'month' | 'payment' | 'gst';
  onNavigate: (view: NavView, reportTab?: 'day' | 'month' | 'payment') => void;
  pendingCount: number;
  customLogoUrl?: string;
}

export const DesktopSidebar: React.FC<DesktopSidebarProps> = ({
  currentView,
  onNavigate,
  pendingCount,
  customLogoUrl
}) => {
  const navItems: {
    id: NavView;
    label: string;
    hint: string;
    icon: typeof LayoutGrid;
    badge?: number | null;
  }[] = [
    { id: 'overview', label: 'Dashboard', hint: 'Today at a glance', icon: LayoutGrid },
    { id: 'box_billing', label: 'Billing', hint: 'Create invoice', icon: Receipt },
    { id: 'invoices', label: 'Invoices', hint: 'All bills', icon: FileText },
    { id: 'products', label: 'Products', hint: 'Prices & stock', icon: Package },
    { id: 'clients', label: 'Customers', hint: 'Buyer list', icon: Users },
    {
      id: 'payments',
      label: 'Payments',
      hint: 'Money received',
      icon: CreditCard,
      badge: pendingCount > 0 ? pendingCount : null
    },
    { id: 'reports', label: 'Reports', hint: 'Charts & summary', icon: BarChart3 },
    { id: 'settings', label: 'Settings', hint: 'Company & GST', icon: Settings }
  ];

  return (
    <aside className="w-64 bg-[#081C2D] text-white flex flex-col justify-between shrink-0 select-none z-20 print:hidden h-full">
      <div className="flex flex-col min-h-0">
        <div className="p-4 pb-3">
          <div className="bg-white rounded-2xl overflow-hidden h-[118px] flex items-center justify-center">
            <BrandLogo size="lg" customLogoUrl={customLogoUrl} className="w-full h-full" />
          </div>
          <div className="mt-2.5 text-center text-xs font-semibold text-white/70 tracking-wide">
            Billing desk
          </div>
        </div>

        <nav className="px-3 mt-1 space-y-1 overflow-y-auto pb-4">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-left transition-colors cursor-pointer ${
                  isActive
                    ? 'bg-[#1F7A63] text-white shadow-sm'
                    : 'text-white/85 hover:bg-white/10 hover:text-white'
                }`}
              >
                <span className="flex items-center gap-3 min-w-0">
                  <Icon className="w-[18px] h-[18px] shrink-0" />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold truncate">{item.label}</span>
                    <span className={`block text-[11px] truncate ${isActive ? 'text-white/75' : 'text-white/45'}`}>
                      {item.hint}
                    </span>
                  </span>
                </span>
                {item.badge != null && (
                  <span
                    className={`px-2 py-0.5 text-xs font-bold rounded-full shrink-0 ${
                      isActive ? 'bg-white text-[#1F7A63]' : 'bg-[#1F7A63] text-white'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      <div className="p-4 border-t border-white/10">
        <div className="flex items-center gap-2 text-xs text-white/60">
          <ShieldCheck className="w-4 h-4 shrink-0 text-[#1F7A63]" />
          <span>Works offline · data saved on this PC</span>
        </div>
      </div>
    </aside>
  );
};

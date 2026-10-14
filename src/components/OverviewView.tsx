import React, { useMemo } from 'react';
import { AppDatabase, Invoice } from '../types/billing';
import { calculateInvoice, money, formatDateDisplay, todayISO } from '../utils/formatters';
import { IndianRupee, FileText, Clock, Users, Plus, CreditCard, UserPlus, ChevronRight, Calendar, BarChart3, Wallet } from 'lucide-react';
import { Button, Card, StatCard, StatusBadge, EmptyState } from './ui';

interface OverviewViewProps {
  db: AppDatabase;
  onCreateInvoice: () => void;
  onOpenRecordPayment: () => void;
  onOpenAddClient: () => void;
  onNavigateToReports: (reportTab?: 'day' | 'month' | 'payment') => void;
  onNavigateToInvoices: () => void;
  onViewInvoice: (invoice: Invoice) => void;
}

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const short = (n: number) =>
  n >= 100000 ? `₹${(n / 100000).toFixed(1)}L` : n >= 1000 ? `₹${(n / 1000).toFixed(1)}k` : `₹${Math.round(n)}`;

export const OverviewView: React.FC<OverviewViewProps> = ({
  db,
  onCreateInvoice,
  onOpenRecordPayment,
  onOpenAddClient,
  onNavigateToReports,
  onNavigateToInvoices,
  onViewInvoice
}) => {
  const rate = db.settings.rate;
  const today = todayISO();
  const month = today.slice(0, 7);

  const data = useMemo(() => {
    let totalSales = 0, pending = 0, pendingCount = 0, todaySales = 0, monthSales = 0, monthCollected = 0;
    const status = { Paid: 0, 'Part paid': 0, Pending: 0 };
    const todayPay = { Cash: 0, UPI: 0, Bank: 0 };
    db.invoices.forEach((inv) => {
      const c = calculateInvoice(inv, rate);
      totalSales += c.total;
      status[c.st] += 1;
      if (c.bal > 0.05) {
        pending += c.bal;
        pendingCount += 1;
      }
      if (inv.date === today) todaySales += c.total;
      if (inv.date.startsWith(month)) {
        monthSales += c.total;
        monthCollected += c.paid;
      }
      (inv.pay || []).forEach((p) => {
        if (p.date === today) {
          if (p.mode === 'Cash') todayPay.Cash += Number(p.amt);
          else if (p.mode === 'UPI') todayPay.UPI += Number(p.amt);
          else todayPay.Bank += Number(p.amt);
        }
      });
    });

    const days: { label: string; amount: number }[] = [];
    const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = ymd(d);
      days.push({
        label: names[d.getDay()],
        amount: db.invoices.filter((x) => x.date === key).reduce((s, x) => s + calculateInvoice(x, rate).total, 0)
      });
    }
    return { totalSales, pending, pendingCount, todaySales, monthSales, monthCollected, status, todayPay, days };
  }, [db.invoices, rate, today, month]);

  const recent = useMemo(
    () => db.invoices.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6),
    [db.invoices]
  );

  /* ----- bar chart geometry ----- */
  const W = 560, H = 210, padL = 8, padB = 28, padT = 22;
  const max = Math.max(...data.days.map((d) => d.amount), 100);
  const slot = (W - padL * 2) / data.days.length;
  const barW = Math.min(44, slot * 0.55);

  /* ----- donut geometry ----- */
  const totalInv = db.invoices.length;
  const R = 52, C = 2 * Math.PI * R;
  const segs = [
    { k: 'Paid' as const, color: '#1F7A63' },
    { k: 'Part paid' as const, color: '#C49216' },
    { k: 'Pending' as const, color: '#C04545' }
  ];
  let offset = 0;

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Greeting row */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#081C2D] m-0 tracking-tight">Dashboard</h1>
          <p className="text-sm text-[#9AA3A8] mt-1 m-0">
            {db.settings.name} · {formatDateDisplay(today)}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" icon={<UserPlus className="w-4 h-4" />} onClick={onOpenAddClient}>
            Add customer
          </Button>
          <Button icon={<Plus className="w-4 h-4" />} onClick={onCreateInvoice}>
            Create invoice
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label="Total Sales" value={money(data.totalSales)} hint={`Today ${money(data.todaySales)}`} icon={<IndianRupee className="w-4 h-4" />} />
        <StatCard label="Total Invoices" value={String(totalInv)} hint={`${money(data.monthSales)} this month`} icon={<FileText className="w-4 h-4" />} />
        <StatCard label="Pending Payments" value={money(data.pending)} hint={`${data.pendingCount} invoice${data.pendingCount === 1 ? '' : 's'} unpaid`} icon={<Clock className="w-4 h-4" />} />
        <StatCard label="Total Customers" value={String(db.clients.length)} hint="In your directory" icon={<Users className="w-4 h-4" />} />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 p-5">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h3 className="text-base font-semibold text-[#081C2D] m-0">Sales trend</h3>
              <p className="text-xs text-[#9AA3A8] m-0 mt-0.5">Invoice value over the last 7 days</p>
            </div>
            <Button variant="ghost" className="h-8 px-2.5" onClick={() => onNavigateToReports('day')}>
              Daily breakdown <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Sales for the last 7 days">
            {[0, 0.5, 1].map((g) => {
              const y = padT + (H - padT - padB) * (1 - g);
              return <line key={g} x1={padL} x2={W - padL} y1={y} y2={y} stroke="#D5DBDF" strokeWidth="1" />;
            })}
            {data.days.map((d, i) => {
              const h = d.amount > 0 ? Math.max(4, ((H - padT - padB) * d.amount) / max) : 3;
              const x = padL + slot * i + (slot - barW) / 2;
              const y = H - padB - h;
              return (
                <g key={i}>
                  <rect x={x} y={y} width={barW} height={h} rx="6" fill={d.amount > 0 ? '#1F7A63' : '#D5DBDF'} />
                  {d.amount > 0 && (
                    <text x={x + barW / 2} y={y - 6} textAnchor="middle" fontSize="11" fontWeight="600" fill="#081C2D">
                      {short(d.amount)}
                    </text>
                  )}
                  <text x={x + barW / 2} y={H - 8} textAnchor="middle" fontSize="12" fill="#9AA3A8">
                    {d.label}
                  </text>
                </g>
              );
            })}
          </svg>
        </Card>

        <Card className="p-5">
          <h3 className="text-base font-semibold text-[#081C2D] m-0">Payment status</h3>
          <p className="text-xs text-[#9AA3A8] m-0 mt-0.5">Share of all invoices</p>
          {totalInv === 0 ? (
            <p className="text-sm text-[#9AA3A8] py-10 text-center m-0">No invoices yet.</p>
          ) : (
            <div className="flex flex-col items-center mt-3 gap-4">
              <div className="relative w-40 h-40">
                <svg viewBox="0 0 140 140" className="w-full h-full -rotate-90" role="img" aria-label="Payment status split">
                  <circle cx="70" cy="70" r={R} fill="none" stroke="#F5F7FA" strokeWidth="18" />
                  {segs.map((s) => {
                    const len = (data.status[s.k] / totalInv) * C;
                    const el = len > 0 && (
                      <circle
                        key={s.k}
                        cx="70" cy="70" r={R} fill="none" stroke={s.color} strokeWidth="18"
                        strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-offset}
                      />
                    );
                    offset += len;
                    return el;
                  })}
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <div className="text-2xl font-bold text-[#081C2D]">{totalInv}</div>
                  <div className="text-xs text-[#9AA3A8]">invoices</div>
                </div>
              </div>
              <div className="w-full space-y-1.5">
                {segs.map((s) => (
                  <div key={s.k} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 text-[#081C2D]">
                      <span className="w-2.5 h-2.5 rounded-full border border-[#D5DBDF]" style={{ background: s.color }} />
                      {s.k}
                    </span>
                    <span className="font-semibold text-[#081C2D] tabular-nums">{data.status[s.k]}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* Reports + quick actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {[
          { tab: 'day' as const, title: 'Day report', icon: Calendar, line: `Sales ${money(data.todaySales)}`, sub: `Cash ${money(data.todayPay.Cash)} · UPI ${money(data.todayPay.UPI)} · Bank ${money(data.todayPay.Bank)}` },
          { tab: 'month' as const, title: 'Monthly report', icon: BarChart3, line: `Sales ${money(data.monthSales)}`, sub: `Collected ${money(data.monthCollected)}` },
          { tab: 'payment' as const, title: 'Payment report', icon: Wallet, line: `Outstanding ${money(data.pending)}`, sub: `${data.pendingCount} unpaid invoice${data.pendingCount === 1 ? '' : 's'}` }
        ].map((r) => {
          const Icon = r.icon;
          return (
            <button
              key={r.tab}
              type="button"
              onClick={() => onNavigateToReports(r.tab)}
              className="text-left bg-white rounded-2xl border border-[#D5DBDF] p-5 hover:border-[#1F7A63] transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2 text-[#1F7A63] font-semibold text-sm">
                <Icon className="w-4 h-4" /> {r.title}
              </div>
              <div className="text-lg font-bold text-[#081C2D] mt-2 tabular-nums">{r.line}</div>
              <div className="text-xs text-[#9AA3A8] mt-1">{r.sub}</div>
            </button>
          );
        })}
      </div>

      {/* Recent invoices */}
      <Card className="overflow-hidden">
        <div className="px-5 py-4 flex items-center justify-between border-b border-[#D5DBDF]">
          <h3 className="text-base font-semibold text-[#081C2D] m-0">Recent invoices</h3>
          <div className="flex gap-2">
            <Button variant="secondary" className="h-9" icon={<CreditCard className="w-4 h-4" />} onClick={onOpenRecordPayment}>
              Record payment
            </Button>
            <Button variant="ghost" className="h-9" onClick={onNavigateToInvoices}>
              View all
            </Button>
          </div>
        </div>
        {recent.length === 0 ? (
          <EmptyState
            icon={<FileText className="w-6 h-6" />}
            title="No invoices yet"
            message="Create your first invoice and it will show up here."
            action={<Button icon={<Plus className="w-4 h-4" />} onClick={onCreateInvoice}>Create invoice</Button>}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="bg-[#F5F7FA] text-xs uppercase tracking-wider text-[#9AA3A8]">
                  <th className="py-3 px-5 font-semibold">Invoice</th>
                  <th className="py-3 px-5 font-semibold">Customer</th>
                  <th className="py-3 px-5 font-semibold">Date</th>
                  <th className="py-3 px-5 font-semibold text-right">Amount</th>
                  <th className="py-3 px-5 font-semibold text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#D5DBDF]">
                {recent.map((inv) => {
                  const c = calculateInvoice(inv, rate);
                  const client = db.clients.find((x) => x.id === inv.cid);
                  return (
                    <tr key={inv.id} onClick={() => onViewInvoice(inv)} className="hover:bg-[#F5F7FA] cursor-pointer">
                      <td className="py-3.5 px-5 font-mono font-semibold text-[#1F7A63]">{inv.no}</td>
                      <td className="py-3.5 px-5 text-[#081C2D] font-medium">{client?.name || '—'}</td>
                      <td className="py-3.5 px-5 text-[#9AA3A8]">{formatDateDisplay(inv.date)}</td>
                      <td className="py-3.5 px-5 text-right font-semibold text-[#081C2D] tabular-nums">{money(c.total)}</td>
                      <td className="py-3.5 px-5 text-center"><StatusBadge status={c.st} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};

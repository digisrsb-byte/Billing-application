import React, { useMemo, useState, useEffect } from 'react';
import { AppDatabase } from '../types/billing';
import { calculateInvoice, money, todayISO, formatDateDisplay } from '../utils/formatters';
import { Calendar, BarChart3, Wallet, Download } from 'lucide-react';

export type ReportTab = 'day' | 'month' | 'payment' | 'gst';

interface ReportsViewProps {
  db: AppDatabase;
  initialTab?: ReportTab;
  showToast: (msg: string) => void;
}

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Simple horizontal bar row */
function HBar({ label, value, max, color = '#1F7A63' }: { label: string; value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.max(value > 0 ? 4 : 0, Math.round((value / max) * 100)) : 0;
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="w-28 shrink-0 font-semibold text-slate-700 truncate" title={label}>
        {label}
      </span>
      <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="w-24 text-right font-mono font-bold text-slate-900 tabular-nums shrink-0">{money(value)}</span>
    </div>
  );
}

/** Vertical bar chart for last N days / months */
function VBarChart({
  items
}: {
  items: { label: string; value: number; sub?: string }[];
}) {
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <div className="flex items-end gap-2 h-48 pt-2">
      {items.map((item) => {
        const h = Math.max(item.value > 0 ? 8 : 2, Math.round((item.value / max) * 160));
        return (
          <div key={item.label} className="flex-1 flex flex-col items-center gap-1 min-w-0 h-full justify-end">
            <span className="text-[10px] font-mono font-bold text-slate-600 tabular-nums truncate max-w-full">
              {item.value > 0 ? (item.value >= 1000 ? `₹${(item.value / 1000).toFixed(0)}k` : `₹${Math.round(item.value)}`) : '—'}
            </span>
            <div
              className="w-full max-w-[40px] rounded-t-md bg-[#1F7A63]"
              style={{ height: h }}
              title={`${item.label}: ${money(item.value)}`}
            />
            <span className="text-[11px] font-semibold text-slate-600 truncate w-full text-center">{item.label}</span>
          </div>
        );
      })}
    </div>
  );
}

export const ReportsView: React.FC<ReportsViewProps> = ({ db, initialTab = 'day', showToast }) => {
  const today = todayISO();
  const [tab, setTab] = useState<'sales' | 'payments' | 'products'>(
    initialTab === 'payment' ? 'payments' : 'sales'
  );
  const [selectedDay, setSelectedDay] = useState(today);
  const [selectedMonth, setSelectedMonth] = useState(today.slice(0, 7));

  useEffect(() => {
    if (initialTab === 'payment') setTab('payments');
    else if (initialTab === 'day' || initialTab === 'month' || initialTab === 'gst') setTab('sales');
  }, [initialTab]);

  const rate = db.settings.rate;

  const last7Days = useMemo(() => {
    const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const out: { label: string; value: number; key: string }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = ymd(d);
      const value = db.invoices
        .filter((inv) => inv.date === key)
        .reduce((s, inv) => s + calculateInvoice(inv, rate).total, 0);
      out.push({ label: names[d.getDay()], value, key });
    }
    return out;
  }, [db.invoices, rate]);

  const monthSales = useMemo(() => {
    let billed = 0;
    let collected = 0;
    let pending = 0;
    let count = 0;
    const byClient: Record<string, { name: string; billed: number }> = {};
    const byProduct: Record<string, { name: string; qty: number; amount: number }> = {};

    db.invoices
      .filter((inv) => inv.date.startsWith(selectedMonth))
      .forEach((inv) => {
        const c = calculateInvoice(inv, rate);
        billed += c.total;
        collected += c.paid;
        pending += Math.max(0, c.bal);
        count += 1;
        const client = db.clients.find((cl) => cl.id === inv.cid);
        const name = client?.name || 'Customer';
        if (!byClient[inv.cid]) byClient[inv.cid] = { name, billed: 0 };
        byClient[inv.cid].billed += c.total;

        inv.items.forEach((it) => {
          const key = it.n;
          if (!byProduct[key]) byProduct[key] = { name: it.n, qty: 0, amount: 0 };
          byProduct[key].qty += Number(it.q) || 0;
          byProduct[key].amount += (Number(it.q) || 0) * (Number(it.r) || 0);
        });
      });

    return {
      billed,
      collected,
      pending,
      count,
      clients: Object.values(byClient).sort((a, b) => b.billed - a.billed).slice(0, 8),
      products: Object.values(byProduct).sort((a, b) => b.amount - a.amount)
    };
  }, [db.invoices, db.clients, rate, selectedMonth]);

  const dayStats = useMemo(() => {
    const invs = db.invoices.filter((i) => i.date === selectedDay);
    let sales = 0;
    let items = 0;
    invs.forEach((inv) => {
      sales += calculateInvoice(inv, rate).total;
      items += inv.items.reduce((s, it) => s + (Number(it.q) || 0), 0);
    });
    return { sales, items, count: invs.length };
  }, [db.invoices, selectedDay, rate]);

  const paymentChart = useMemo(() => {
    const from = selectedMonth + '-01';
    const toDate = new Date(Number(selectedMonth.slice(0, 4)), Number(selectedMonth.slice(5, 7)), 0);
    const to = ymd(toDate);
    const totals = { Cash: 0, UPI: 0, Bank: 0, Cheque: 0 };
    db.invoices.forEach((inv) => {
      (inv.pay || []).forEach((p) => {
        if (p.date < from || p.date > to) return;
        if (p.mode === 'Cash') totals.Cash += Number(p.amt);
        else if (p.mode === 'UPI') totals.UPI += Number(p.amt);
        else if (p.mode === 'Bank') totals.Bank += Number(p.amt);
        else if (p.mode === 'Cheque') totals.Cheque += Number(p.amt);
      });
    });
    const rows = Object.entries(totals).map(([label, value]) => ({ label, value }));
    const max = Math.max(...rows.map((r) => r.value), 1);
    const total = rows.reduce((s, r) => s + r.value, 0);
    return { rows, max, total };
  }, [db.invoices, selectedMonth]);

  const handleExport = () => {
    let csv = '';
    let filename = '';
    if (tab === 'sales') {
      filename = `SRK_Sales_${selectedMonth}.csv`;
      csv = ['Client,Billed'].concat(monthSales.clients.map((c) => `"${c.name}",${c.billed.toFixed(2)}`)).join('\n');
    } else if (tab === 'payments') {
      filename = `SRK_Payments_${selectedMonth}.csv`;
      csv = ['Mode,Amount'].concat(paymentChart.rows.map((r) => `${r.label},${r.value.toFixed(2)}`)).join('\n');
    } else {
      filename = `SRK_Products_${selectedMonth}.csv`;
      csv = ['Product,Qty,Amount']
        .concat(monthSales.products.map((p) => `"${p.name}",${p.qty},${p.amount.toFixed(2)}`))
        .join('\n');
    }
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`Exported ${filename}`);
  };

  const tabs = [
    { id: 'sales' as const, label: 'Sales', icon: BarChart3 },
    { id: 'payments' as const, label: 'Payments', icon: Wallet },
    { id: 'products' as const, label: 'Products sold', icon: Calendar }
  ];

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-16">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#081C2D] m-0">Reports</h1>
          <p className="text-sm text-slate-500 mt-1 m-0">Simple charts — pick a month and see sales, payments, or products.</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            Month
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="h-10 px-3 rounded-xl border border-slate-300 bg-white text-sm font-mono font-semibold"
            />
          </label>
          <button
            type="button"
            onClick={handleExport}
            className="h-10 px-4 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-800 hover:bg-slate-50 flex items-center gap-2 cursor-pointer"
          >
            <Download className="w-4 h-4" />
            Export
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 p-1 bg-slate-100 rounded-xl w-fit">
        {tabs.map((t) => {
          const Icon = t.icon;
          const on = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`h-10 px-4 rounded-lg text-sm font-bold flex items-center gap-2 cursor-pointer ${
                on ? 'bg-white text-[#1F7A63] shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Icon className="w-4 h-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'sales' && (
        <div className="space-y-5">
          {/* KPI strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: 'Month sales', value: money(monthSales.billed) },
              { label: 'Collected', value: money(monthSales.collected) },
              { label: 'Pending', value: money(monthSales.pending) },
              { label: 'Invoices', value: String(monthSales.count) }
            ].map((k) => (
              <div key={k.label} className="bg-white rounded-2xl border border-slate-200 p-4">
                <div className="text-xs font-bold uppercase tracking-wide text-slate-500">{k.label}</div>
                <div className="text-xl font-black font-mono text-[#081C2D] mt-1 tabular-nums">{k.value}</div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <h3 className="text-base font-bold text-slate-900 m-0">Last 7 days sales</h3>
              <p className="text-xs text-slate-500 mt-0.5 mb-3">Daily invoice totals</p>
              <VBarChart items={last7Days.map((d) => ({ label: d.label, value: d.value }))} />
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <h3 className="text-base font-bold text-slate-900 m-0">Top customers this month</h3>
              <p className="text-xs text-slate-500 mt-0.5 mb-4">Who was billed the most</p>
              {monthSales.clients.length === 0 ? (
                <p className="text-sm text-slate-400 py-8 text-center m-0">No sales in this month yet.</p>
              ) : (
                <div className="space-y-3">
                  {monthSales.clients.map((c) => (
                    <HBar
                      key={c.name}
                      label={c.name}
                      value={c.billed}
                      max={monthSales.clients[0]?.billed || 1}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Today peek */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-wrap items-center gap-4 justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-900 m-0">Today’s sales</h3>
              <p className="text-xs text-slate-500 mt-0.5 m-0">{formatDateDisplay(selectedDay)}</p>
            </div>
            <input
              type="date"
              value={selectedDay}
              onChange={(e) => setSelectedDay(e.target.value)}
              className="h-10 px-3 rounded-xl border border-slate-300 text-sm font-mono font-semibold"
            />
            <div className="flex gap-6">
              <div>
                <div className="text-xs text-slate-500 font-bold">Sales</div>
                <div className="text-lg font-black font-mono text-[#1F7A63]">{money(dayStats.sales)}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500 font-bold">Bills</div>
                <div className="text-lg font-black font-mono text-slate-900">{dayStats.count}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500 font-bold">Items</div>
                <div className="text-lg font-black font-mono text-slate-900">{dayStats.items}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'payments' && (
        <div className="space-y-5">
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <div className="flex flex-wrap justify-between gap-3 mb-5">
              <div>
                <h3 className="text-base font-bold text-slate-900 m-0">Collections by mode</h3>
                <p className="text-xs text-slate-500 mt-0.5 m-0">Cash, UPI, bank for {selectedMonth}</p>
              </div>
              <div className="text-right">
                <div className="text-xs font-bold text-slate-500 uppercase">Total collected</div>
                <div className="text-2xl font-black font-mono text-[#1F7A63]">{money(paymentChart.total)}</div>
              </div>
            </div>
            <div className="space-y-4">
              {paymentChart.rows.map((r) => (
                <HBar key={r.label} label={r.label} value={r.value} max={paymentChart.max} />
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'products' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <h3 className="text-base font-bold text-slate-900 m-0">Products sold this month</h3>
          <p className="text-xs text-slate-500 mt-0.5 mb-4">Quantity and amount by product</p>
          {monthSales.products.length === 0 ? (
            <p className="text-sm text-slate-400 py-10 text-center m-0">No products sold in this month.</p>
          ) : (
            <div className="space-y-4">
              {monthSales.products.map((p) => (
                <div key={p.name} className="flex items-center gap-3 text-sm">
                  <span className="w-40 shrink-0 font-semibold text-slate-800 truncate">{p.name}</span>
                  <span className="w-16 shrink-0 text-slate-500 font-mono">{p.qty} pcs</span>
                  <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-[#1F7A63]"
                      style={{
                        width: `${Math.max(
                          4,
                          Math.round((p.amount / (monthSales.products[0]?.amount || 1)) * 100)
                        )}%`
                      }}
                    />
                  </div>
                  <span className="w-24 text-right font-mono font-bold tabular-nums">{money(p.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

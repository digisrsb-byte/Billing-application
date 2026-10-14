import React, { useState, useMemo } from 'react';
import { AppDatabase, Invoice, PaymentMode, InvoiceItem } from '../types/billing';
import { calculateInvoice, money, todayISO, generateInvoiceNo, formatDateDisplay } from '../utils/formatters';
import { Plus, Minus, Receipt } from 'lucide-react';

interface DailyBoxBillingViewProps {
  db: AppDatabase;
  onSaveInvoice: (invoice: Invoice, openPrint?: boolean) => void;
  onOpenNewClientModal: () => void;
  onOpenFullInvoice?: () => void;
  showToast: (msg: string) => void;
}

export const DailyBoxBillingView: React.FC<DailyBoxBillingViewProps> = ({
  db,
  onSaveInvoice,
  onOpenNewClientModal,
  showToast
}) => {
  const today = todayISO();
  const [selectedClientId, setSelectedClientId] = useState<string>(db.clients[0]?.id || '');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMode>('Cash');
  const [qtyMap, setQtyMap] = useState<Record<string, number>>({});

  const getQty = (id: string) => qtyMap[id] || 0;

  const setQty = (id: string, qty: number) => {
    const q = Math.max(0, Math.floor(qty) || 0);
    setQtyMap((p) => ({ ...p, [id]: q }));
  };

  const activeItems = useMemo<InvoiceItem[]>(
    () =>
      db.settings.boxes
        .filter((b) => (qtyMap[b.id] || 0) > 0)
        .map((b) => ({
          id: 'box-' + b.id,
          n: b.n,
          hsn: b.hsn || db.settings.defaultHsn || '481910',
          q: qtyMap[b.id] || 0,
          r: b.p
        })),
    [db.settings.boxes, db.settings.defaultHsn, qtyMap]
  );

  const totalQty = activeItems.reduce((a, i) => a + i.q, 0);

  const calc = useMemo(
    () =>
      calculateInvoice(
        { items: activeItems, disc: 0, gstOn: db.settings.gstOn, gstRate: db.settings.rate },
        db.settings.rate
      ),
    [activeItems, db.settings.gstOn, db.settings.rate]
  );

  const handleGenerate = () => {
    if (!selectedClientId) return showToast('Select a customer first');
    if (activeItems.length === 0) return showToast('Enter quantity for at least one product');

    const client = db.clients.find((c) => c.id === selectedClientId);
    const no = generateInvoiceNo(db.settings.invoicePrefix, db.settings.nextSeq);

    const inv: Invoice = {
      id: 'inv-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      no,
      cid: selectedClientId,
      date: today,
      items: activeItems,
      disc: 0,
      gstOn: db.settings.gstOn,
      gstRate: db.settings.rate,
      isInterState: false,
      poNo: '',
      poDate: '',
      state: client?.state || db.settings.state || 'Karnataka (29)',
      hsnCode: db.settings.defaultHsn || '481910',
      mode: paymentMethod,
      pay: [],
      notes: '',
      createdAt: new Date().toISOString()
    };

    if (paymentMethod !== 'Credit' && calc.total > 0) {
      inv.pay.push({
        id: 'p-' + Math.random().toString(36).slice(2, 7),
        date: today,
        amt: calc.total,
        mode: paymentMethod,
        notes: `${paymentMethod} payment`
      });
    }

    setQtyMap({});
    onSaveInvoice(inv, true);
    showToast(`Invoice ${no} created`);
  };

  const paymentOptions: { v: PaymentMode; label: string }[] = [
    { v: 'Cash', label: 'Cash' },
    { v: 'UPI', label: 'UPI' },
    { v: 'Bank', label: 'Bank' },
    { v: 'Credit', label: 'Pay later' }
  ];

  return (
    <div className="space-y-5 max-w-4xl mx-auto pb-16">
      <div>
        <h1 className="text-2xl font-bold text-[#081C2D] m-0 tracking-tight">Billing</h1>
        <p className="text-sm text-[#9AA3A8] mt-1 m-0">
          1) Choose customer → 2) Enter quantity → 3) Pick payment → 4) Create invoice
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {/* Step 1: Customer */}
        <div className="p-5 border-b border-slate-200 flex flex-wrap items-end gap-4">
          <div className="flex-1 min-w-[240px]">
            <div className="flex justify-between items-center mb-1.5">
              <label className="text-sm font-semibold text-[#081C2D]">1. Customer</label>
              <button
                type="button"
                onClick={onOpenNewClientModal}
                className="text-xs font-bold text-[#1F7A63] hover:underline flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> New customer
              </button>
            </div>
            <select
              value={selectedClientId}
              onChange={(e) => setSelectedClientId(e.target.value)}
              className="w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-900 focus:outline-teal-600"
            >
              <option value="">Select customer</option>
              {db.clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.phone ? `(${c.phone})` : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="px-3 h-11 flex items-center bg-slate-100 text-slate-700 rounded-xl text-sm font-bold">
            {formatDateDisplay(today)}
          </div>
        </div>

        {/* Step 2: Products */}
        <div className="px-5 pt-4 pb-2">
          <div className="text-sm font-semibold text-[#081C2D]">2. Products & quantity</div>
          <p className="text-xs text-slate-500 m-0 mt-0.5">
            Prices come from Products. Change price there if needed.
          </p>
        </div>

        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="bg-slate-50 text-slate-600 text-xs font-bold uppercase tracking-wider border-y border-slate-200">
              <th className="py-3 px-5">Product</th>
              <th className="py-3 px-3 text-right w-28">Rate</th>
              <th className="py-3 px-3 text-center w-48">Quantity</th>
              <th className="py-3 px-5 text-right w-36">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {db.settings.boxes.map((b) => {
              const q = getQty(b.id);
              const amount = q * b.p;
              const unit = (b.n || '').toLowerCase().includes('can') ? 'can' : 'box';
              return (
                <tr key={b.id} className={q > 0 ? 'bg-[#F5F7FA]' : 'hover:bg-slate-50/60'}>
                  <td className="py-3.5 px-5">
                    <div className="text-base font-bold text-slate-900">{b.n}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{b.pack || unit}</div>
                  </td>
                  <td className="py-3.5 px-3 text-right font-mono text-sm text-slate-700 tabular-nums">
                    {money(b.p)}
                  </td>
                  <td className="py-3.5 px-3">
                    <div className="flex items-center justify-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setQty(b.id, q - 1)}
                        className="w-9 h-9 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 flex items-center justify-center cursor-pointer"
                        aria-label={`Decrease ${b.n}`}
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <input
                        type="number"
                        min="0"
                        value={q === 0 ? '' : q}
                        placeholder="0"
                        onChange={(e) => setQty(b.id, parseInt(e.target.value))}
                        className="w-16 h-9 text-center font-mono font-bold bg-white border border-slate-200 rounded-lg text-sm focus:outline-teal-600"
                      />
                      <button
                        type="button"
                        onClick={() => setQty(b.id, q + 1)}
                        className="w-9 h-9 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 flex items-center justify-center cursor-pointer"
                        aria-label={`Increase ${b.n}`}
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                  <td className="py-3.5 px-5 text-right font-mono font-bold text-base tabular-nums text-slate-900">
                    {amount > 0 ? money(amount) : <span className="text-slate-300">—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Totals — composition GST: amount is in Total only (no GST line shown) */}
        <div className="border-t-2 border-slate-200 bg-slate-50 px-5 py-4">
          <div className="flex justify-between items-baseline">
            <div>
              <span className="text-lg font-extrabold text-[#081C2D]">Total</span>
              {totalQty > 0 && (
                <span className="ml-2 text-sm font-medium text-[#9AA3A8]">
                  ({totalQty} {totalQty === 1 ? 'item' : 'items'})
                </span>
              )}
            </div>
            <span className="text-3xl font-black font-mono tabular-nums text-[#1F7A63]">{money(calc.total)}</span>
          </div>
        </div>

        {/* Step 3 + 4 */}
        <div className="p-5 border-t border-slate-200 space-y-4">
          <div>
            <div className="text-sm font-semibold text-[#081C2D] mb-2">3. Payment</div>
            <div className="flex flex-wrap items-center gap-2">
              {paymentOptions.map((o) => (
                <button
                  key={o.v}
                  type="button"
                  onClick={() => setPaymentMethod(o.v)}
                  className={`h-10 px-4 rounded-lg text-sm font-bold border transition-colors cursor-pointer ${
                    paymentMethod === o.v
                      ? 'bg-[#1F7A63] border-[#1F7A63] text-white'
                      : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={handleGenerate}
            className="w-full sm:w-auto h-12 px-8 rounded-xl bg-[#1F7A63] hover:bg-[#186351] text-white font-extrabold text-base shadow-sm flex items-center justify-center gap-2 cursor-pointer"
          >
            <Receipt className="w-5 h-5" />
            4. Create invoice
          </button>
        </div>
      </div>
    </div>
  );
};

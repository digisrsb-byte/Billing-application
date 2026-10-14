import React, { useState, useMemo, useEffect } from 'react';
import { AppDatabase, Invoice, PaymentMode, InvoiceItem, Client } from '../types/billing';
import { calculateInvoice, money, todayISO, formatDateDisplay } from '../utils/formatters';
import { allocateInvoiceNo } from '../services/invoiceIntegrity';
import { buildBuyerSnapshot, buildBuyerSnapshotFromClient, buildSellerSnapshot, extractPin } from '../utils/invoiceSnapshot';
import { Plus, Minus, Receipt } from 'lucide-react';

interface DailyBoxBillingViewProps {
  db: AppDatabase;
  onSaveInvoice: (invoice: Invoice, openPrint?: boolean) => void;
  onSaveClient?: (client: Client) => void;
  onOpenNewClientModal: () => void;
  onOpenFullInvoice?: () => void;
  showToast: (msg: string) => void;
}

type CustomerMode = 'existing' | 'onetime';

export const DailyBoxBillingView: React.FC<DailyBoxBillingViewProps> = ({
  db,
  onSaveInvoice,
  onSaveClient,
  onOpenNewClientModal,
  showToast
}) => {
  const today = todayISO();
  const previewNo = allocateInvoiceNo(
    db.settings.invoicePrefix,
    db.settings.nextSeq,
    db.invoices
  ).no;

  const [customerMode, setCustomerMode] = useState<CustomerMode>('existing');
  const [selectedClientId, setSelectedClientId] = useState<string>(db.clients[0]?.id || '');
  const [invoiceDate, setInvoiceDate] = useState(today);
  const [poNo, setPoNo] = useState('');
  const [poDate, setPoDate] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMode>('Cash');
  const [qtyMap, setQtyMap] = useState<Record<string, number>>({});
  const [saveOnetimeCustomer, setSaveOnetimeCustomer] = useState(false);

  // Populated from selected customer or one-time entry
  const [custName, setCustName] = useState('');
  const [custPhone, setCustPhone] = useState('');
  const [custAddr, setCustAddr] = useState('');
  const [custGst, setCustGst] = useState('');
  const [custState, setCustState] = useState('Karnataka');
  const [custPin, setCustPin] = useState('');

  const selectedClient = useMemo(
    () => db.clients.find((c) => c.id === selectedClientId),
    [db.clients, selectedClientId]
  );

  // Auto-fill when selecting an existing customer
  useEffect(() => {
    if (customerMode !== 'existing' || !selectedClient) return;
    setCustName(selectedClient.name || '');
    setCustPhone(selectedClient.phone || '');
    setCustAddr(selectedClient.addr || '');
    setCustGst(selectedClient.gst || '');
    setCustState(selectedClient.state || 'Karnataka');
    setCustPin(extractPin(selectedClient.addr || '', selectedClient.pin));
  }, [customerMode, selectedClientId, selectedClient]);

  const clearOnetimeFields = () => {
    setCustName('');
    setCustPhone('');
    setCustAddr('');
    setCustGst('');
    setCustState('Karnataka');
    setCustPin('');
    setSaveOnetimeCustomer(false);
  };

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
    if (!custName.trim()) return showToast('Enter customer name');
    if (!custPhone.trim()) return showToast('Enter customer phone number');
    if (customerMode === 'existing' && !selectedClientId) return showToast('Select a customer');
    if (activeItems.length === 0) return showToast('Enter quantity for at least one product');

    let clientId = selectedClientId;
    const phone = custPhone.trim();
    const pin = extractPin(custAddr, custPin);

    if (customerMode === 'onetime') {
      if (saveOnetimeCustomer && onSaveClient) {
        const newClient: Client = {
          id: 'cli-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
          name: custName.trim(),
          phone,
          addr: custAddr.trim(),
          gst: custGst.trim().toUpperCase(),
          state: custState.trim() || 'Karnataka',
          pin,
          createdAt: todayISO()
        };
        onSaveClient(newClient);
        clientId = newClient.id;
      } else {
        clientId = '';
      }
    } else if (selectedClient && onSaveClient) {
      // Keep customer profile in sync (not PO — PO stays on invoice only)
      const next: Client = {
        ...selectedClient,
        name: custName.trim(),
        phone,
        addr: custAddr.trim(),
        gst: custGst.trim().toUpperCase(),
        state: custState.trim() || selectedClient.state || 'Karnataka',
        pin
      };
      onSaveClient(next);
      clientId = selectedClient.id;
    }

    const buyerSnapshot =
      customerMode === 'existing' && selectedClient
        ? buildBuyerSnapshotFromClient(
            {
              ...selectedClient,
              name: custName.trim(),
              phone,
              addr: custAddr.trim(),
              gst: custGst.trim().toUpperCase(),
              state: custState.trim(),
              pin
            },
            phone
          )
        : buildBuyerSnapshot({
            name: custName,
            phone,
            addr: custAddr,
            gst: custGst,
            state: custState,
            pin
          });

    const { no } = allocateInvoiceNo(
      db.settings.invoicePrefix,
      db.settings.nextSeq,
      db.invoices
    );

    const inv: Invoice = {
      id: 'inv-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      no,
      cid: clientId,
      date: invoiceDate || today,
      items: activeItems,
      disc: 0,
      gstOn: db.settings.gstOn,
      gstRate: db.settings.rate,
      isInterState: false,
      poNo: poNo.trim(),
      poDate: poDate.trim(),
      customerPhone: phone,
      state: buyerSnapshot.state || db.settings.state || 'Karnataka (29)',
      hsnCode: db.settings.defaultHsn || '481910',
      mode: paymentMethod,
      pay: [],
      notes: '',
      createdAt: new Date().toISOString(),
      finalized: true,
      buyerSnapshot,
      sellerSnapshot: buildSellerSnapshot(db.settings)
    };

    if (paymentMethod !== 'Credit' && calc.total > 0) {
      inv.pay.push({
        id: 'p-' + Math.random().toString(36).slice(2, 7),
        date: invoiceDate || today,
        amt: calc.total,
        mode: paymentMethod,
        notes: `${paymentMethod} payment`
      });
    }

    setQtyMap({});
    setPoNo('');
    setPoDate('');
    setInvoiceDate(todayISO());
    if (customerMode === 'onetime') clearOnetimeFields();
    onSaveInvoice(inv, true);
    showToast(`Invoice ${no} created`);
  };

  const paymentOptions: { v: PaymentMode; label: string }[] = [
    { v: 'Cash', label: 'Cash' },
    { v: 'UPI', label: 'UPI' },
    { v: 'Bank', label: 'Bank' },
    { v: 'Credit', label: 'Pay later' }
  ];

  const fieldCls =
    'w-full h-11 px-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-900 focus:outline-teal-600 focus:bg-white';

  return (
    <div className="space-y-5 max-w-4xl mx-auto pb-16">
      <div>
        <h1 className="text-2xl font-bold text-[#081C2D] m-0 tracking-tight">Billing</h1>
        <p className="text-sm text-[#9AA3A8] mt-1 m-0">
          Customer & invoice details → products → payment → create invoice
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {/* Step 1 */}
        <div className="p-5 border-b border-slate-200 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="text-sm font-semibold text-[#081C2D]">1. Customer & invoice details</label>
            <div className="text-xs font-bold font-mono text-[#1F7A63] bg-[#F5F7FA] border border-[#D5DBDF] px-3 py-1.5 rounded-lg">
              Next invoice: {previewNo}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setCustomerMode('existing')}
              className={`h-9 px-3 rounded-lg text-xs font-bold border cursor-pointer ${
                customerMode === 'existing'
                  ? 'bg-[#1F7A63] border-[#1F7A63] text-white'
                  : 'bg-white border-slate-300 text-slate-700'
              }`}
            >
              Existing customer
            </button>
            <button
              type="button"
              onClick={() => {
                setCustomerMode('onetime');
                clearOnetimeFields();
              }}
              className={`h-9 px-3 rounded-lg text-xs font-bold border cursor-pointer ${
                customerMode === 'onetime'
                  ? 'bg-[#1F7A63] border-[#1F7A63] text-white'
                  : 'bg-white border-slate-300 text-slate-700'
              }`}
            >
              One-time / manual entry
            </button>
            {customerMode === 'existing' && (
              <button
                type="button"
                onClick={onOpenNewClientModal}
                className="h-9 px-3 rounded-lg text-xs font-bold text-[#1F7A63] hover:underline flex items-center gap-1 cursor-pointer ml-auto"
              >
                <Plus className="w-3.5 h-3.5" /> New customer
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {customerMode === 'existing' && (
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-slate-600 mb-1">Select customer *</label>
                <select
                  value={selectedClientId}
                  onChange={(e) => setSelectedClientId(e.target.value)}
                  className={fieldCls}
                >
                  <option value="">Select customer</option>
                  {db.clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.phone ? `(${c.phone})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-600 mb-1">Customer name *</label>
              <input
                value={custName}
                onChange={(e) => setCustName(e.target.value)}
                placeholder="Customer / firm name"
                className={fieldCls}
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Phone *</label>
              <input
                type="tel"
                value={custPhone}
                onChange={(e) => setCustPhone(e.target.value)}
                placeholder="Customer phone"
                className={fieldCls}
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">GSTIN</label>
              <input
                value={custGst}
                onChange={(e) => setCustGst(e.target.value.toUpperCase())}
                placeholder="Optional GSTIN"
                className={`${fieldCls} font-mono`}
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-600 mb-1">Billing address</label>
              <textarea
                rows={2}
                value={custAddr}
                onChange={(e) => setCustAddr(e.target.value)}
                placeholder="Area, city, PIN"
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-900 focus:outline-teal-600 focus:bg-white resize-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">State</label>
              <input value={custState} onChange={(e) => setCustState(e.target.value)} className={fieldCls} />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">PIN code</label>
              <input
                value={custPin}
                onChange={(e) => setCustPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="6-digit PIN"
                className={`${fieldCls} font-mono`}
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Invoice date *</label>
              <input
                type="date"
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
                className={fieldCls}
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Invoice number</label>
              <div className="h-11 px-3 flex items-center bg-slate-100 text-slate-800 rounded-xl text-sm font-bold font-mono">
                {previewNo}
                <span className="ml-2 text-[11px] font-semibold text-slate-500 normal-case tracking-normal">
                  (auto)
                </span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">PO number (optional)</label>
              <input
                type="text"
                value={poNo}
                onChange={(e) => setPoNo(e.target.value)}
                placeholder="Per invoice only"
                className={fieldCls}
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">PO date (optional)</label>
              <input type="date" value={poDate} onChange={(e) => setPoDate(e.target.value)} className={fieldCls} />
            </div>

            {customerMode === 'onetime' && (
              <label className="sm:col-span-2 flex items-center gap-2 text-sm font-medium text-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={saveOnetimeCustomer}
                  onChange={(e) => setSaveOnetimeCustomer(e.target.checked)}
                  className="w-4 h-4 rounded"
                />
                Save this customer for next time
              </label>
            )}
          </div>
        </div>

        {/* Step 2: Products */}
        <div className="px-5 pt-4 pb-2">
          <div className="text-sm font-semibold text-[#081C2D]">2. Products & quantity</div>
          <p className="text-xs text-slate-500 m-0 mt-0.5">Rates load from Products. Totals use existing tax rules.</p>
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
              const q = qtyMap[b.id] || 0;
              const amount = q * b.p;
              const unit = (b.n || '').toLowerCase().includes('can') ? 'can' : 'box';
              return (
                <tr key={b.id} className={q > 0 ? 'bg-[#F5F7FA]' : 'hover:bg-slate-50/60'}>
                  <td className="py-3.5 px-5">
                    <div className="text-base font-bold text-slate-900">{b.n}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{b.pack || unit}</div>
                  </td>
                  <td className="py-3.5 px-3 text-right font-mono text-sm text-slate-700 tabular-nums">{money(b.p)}</td>
                  <td className="py-3.5 px-3">
                    <div className="flex items-center justify-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setQty(b.id, q - 1)}
                        className="w-9 h-9 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 flex items-center justify-center cursor-pointer"
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

        <div className="border-t-2 border-slate-200 bg-slate-50 px-5 py-4 space-y-1">
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
          {paymentMethod !== 'Credit' ? (
            <div className="flex justify-between text-sm text-emerald-700 font-semibold pt-1">
              <span>Amount paid (on create)</span>
              <span className="font-mono">{money(calc.total)}</span>
            </div>
          ) : (
            <div className="flex justify-between text-sm text-amber-700 font-semibold pt-1">
              <span>Outstanding balance</span>
              <span className="font-mono">{money(calc.total)}</span>
            </div>
          )}
        </div>

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

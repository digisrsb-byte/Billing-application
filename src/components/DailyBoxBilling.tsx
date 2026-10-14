import React, { useState, useMemo } from 'react';
import { AppDatabase, Client, Invoice, PaymentMode, InvoiceItem } from '../types/billing';
import { calculateInvoice, money, todayISO, formatDateDisplay, generateInvoiceNo } from '../utils/formatters';
import { Plus, Minus, Check, ArrowRight, UserPlus, Receipt, CreditCard, ShieldCheck } from 'lucide-react';

interface DailyBoxBillingProps {
  db: AppDatabase;
  onSaveInvoice: (invoice: Invoice, openPrint?: boolean) => void;
  onOpenNewClientModal: () => void;
  onViewInvoice: (invoice: Invoice) => void;
  onEditInvoice: (invoice: Invoice) => void;
  onDeleteInvoice: (id: string) => void;
  onRecordPayment: (invoice: Invoice) => void;
  showToast: (msg: string) => void;
}

interface BoxRowState {
  boxId: string;
  qty: number;
  selected: boolean;
}

export const DailyBoxBilling: React.FC<DailyBoxBillingProps> = ({
  db,
  onSaveInvoice,
  onOpenNewClientModal,
  onViewInvoice,
  onEditInvoice,
  onDeleteInvoice,
  onRecordPayment,
  showToast
}) => {
  const [selectedClientId, setSelectedClientId] = useState<string>(db.clients[0]?.id || '');
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('Cash');
  const [poNo, setPoNo] = useState<string>('');

  // Local state for box rows
  const [boxRows, setBoxRows] = useState<BoxRowState[]>(() => {
    return db.settings.boxes.map((b) => ({
      boxId: b.id,
      qty: 0,
      selected: false
    }));
  });

  // Keep boxRows synchronized with db.settings.boxes
  React.useEffect(() => {
    setBoxRows((prev) => {
      return db.settings.boxes.map((b) => {
        const found = prev.find((p) => p.boxId === b.id);
        return found || { boxId: b.id, qty: 0, selected: false };
      });
    });
  }, [db.settings.boxes]);

  const selectedClient = useMemo(() => {
    return db.clients.find((c) => c.id === selectedClientId);
  }, [db.clients, selectedClientId]);

  // Today's metrics
  const today = todayISO();
  const todayInvoices = useMemo(() => {
    return db.invoices.filter((i) => i.date === today);
  }, [db.invoices, today]);

  const todayBoxesCount = useMemo(() => {
    return todayInvoices.reduce((sum, inv) => {
      return sum + inv.items.reduce((s, it) => s + (Number(it.q) || 0), 0);
    }, 0);
  }, [todayInvoices]);

  const todaySalesAmount = useMemo(() => {
    return todayInvoices.reduce((sum, inv) => {
      return sum + calculateInvoice(inv, db.settings.rate).total;
    }, 0);
  }, [todayInvoices, db.settings.rate]);

  const totalPendingAmount = useMemo(() => {
    return db.invoices.reduce((sum, inv) => {
      const c = calculateInvoice(inv, db.settings.rate);
      return sum + Math.max(0, c.bal);
    }, 0);
  }, [db.invoices, db.settings.rate]);

  const todayPaymentsReceived = useMemo(() => {
    return db.invoices.flatMap((i) => i.pay || [])
      .filter((p) => p.date === today)
      .reduce((sum, p) => sum + (Number(p.amt) || 0), 0);
  }, [db.invoices, today]);

  // Compute selected items & total
  const selectedSummary = useMemo(() => {
    const activeItems: InvoiceItem[] = [];
    let totalBoxes = 0;

    boxRows.forEach((r) => {
      if (r.selected && r.qty > 0) {
        const boxCfg = db.settings.boxes.find((b) => b.id === r.boxId);
        if (boxCfg) {
          activeItems.push({
            id: 'it-' + Math.random().toString(36).slice(2, 7),
            n: boxCfg.n,
            hsn: boxCfg.hsn || db.settings.defaultHsn,
            q: r.qty,
            r: boxCfg.p
          });
          totalBoxes += r.qty;
        }
      }
    });

    const tempInvoice: Partial<Invoice> = {
      items: activeItems,
      disc: 0,
      gstOn: db.settings.gstOn,
      gstRate: db.settings.rate
    };

    const calc = calculateInvoice(tempInvoice, db.settings.rate);

    return {
      activeItems,
      totalBoxes,
      calc
    };
  }, [boxRows, db.settings.boxes, db.settings.gstOn, db.settings.rate, db.settings.defaultHsn]);

  const handleQtyChange = (boxId: string, val: number) => {
    const safeQty = Math.max(0, val);
    setBoxRows((prev) =>
      prev.map((r) => {
        if (r.boxId === boxId) {
          return {
            ...r,
            qty: safeQty,
            selected: safeQty > 0
          };
        }
        return r;
      })
    );
  };

  const handleToggleSelect = (boxId: string) => {
    setBoxRows((prev) =>
      prev.map((r) => {
        if (r.boxId === boxId) {
          const nextSelected = !r.selected;
          const nextQty = nextSelected && r.qty === 0 ? 1 : r.qty;
          return {
            ...r,
            selected: nextSelected,
            qty: nextQty
          };
        }
        return r;
      })
    );
  };

  const handleGenerateInvoice = (openPrint: boolean = true) => {
    if (!selectedClientId) {
      showToast('Please select a client first');
      return;
    }

    if (selectedSummary.activeItems.length === 0) {
      showToast('Please enter quantity and select at least one box type');
      return;
    }

    const nextNo = generateInvoiceNo(db.settings.invoicePrefix, db.settings.nextSeq);
    const invoiceTotal = selectedSummary.calc.total;

    const newInv: Invoice = {
      id: 'inv-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      no: nextNo,
      cid: selectedClientId,
      date: today,
      items: selectedSummary.activeItems,
      disc: 0,
      gstOn: db.settings.gstOn,
      gstRate: db.settings.rate,
      isInterState: false,
      poNo: poNo.trim(),
      poDate: poNo.trim() ? today : '',
      state: selectedClient?.state || 'Karnataka (29)',
      hsnCode: db.settings.defaultHsn,
      mode: paymentMode,
      pay: [],
      notes: 'Generated via Daily Box Billing',
      createdAt: new Date().toISOString()
    };

    // If payment mode is not Credit, record instant payment
    if (paymentMode !== 'Credit' && invoiceTotal > 0) {
      newInv.pay.push({
        id: 'p-' + Math.random().toString(36).slice(2, 7),
        date: today,
        amt: invoiceTotal,
        mode: paymentMode,
        notes: `Instant ${paymentMode} payment on delivery`
      });
    }

    // Reset daily entries
    setBoxRows((prev) => prev.map((r) => ({ ...r, qty: 0, selected: false })));
    setPoNo('');

    onSaveInvoice(newInv, openPrint);
    showToast(`Invoice ${newInv.no} created successfully!`);
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      {/* Top Desktop Metrics Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-4 border border-slate-200/80 shadow-xs">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Today's Boxes
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">
            {todayBoxesCount}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">Dispatched today</div>
        </div>

        <div className="bg-white rounded-xl p-4 border border-slate-200/80 shadow-xs">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Today's Sales
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-teal-800 mt-1">
            {money(todaySalesAmount)}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">{todayInvoices.length} invoices generated</div>
        </div>

        <div className="bg-white rounded-xl p-4 border border-slate-200/80 shadow-xs">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Received Today
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-emerald-700 mt-1">
            {money(todayPaymentsReceived)}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">Cash / UPI / Bank</div>
        </div>

        <div className="bg-white rounded-xl p-4 border border-slate-200/80 shadow-xs">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Pending Balance
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-amber-700 mt-1">
            {money(totalPendingAmount)}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">Total client dues</div>
        </div>
      </div>

      {/* Main Billing Card */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Header Strip */}
        <div className="p-5 sm:p-6 bg-slate-50/50 border-b border-slate-200 flex flex-wrap justify-between items-center gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900 m-0">Daily Box Billing</h2>
            <p className="text-xs text-slate-500 mt-0.5 m-0">
              Select client and enter quantities for fast dispatch invoice generation
            </p>
          </div>
          <div className="text-xs font-mono bg-teal-50 text-teal-800 border border-teal-200/60 px-3 py-1.5 rounded-lg font-semibold">
            Next Invoice: {generateInvoiceNo(db.settings.invoicePrefix, db.settings.nextSeq)}
          </div>
        </div>

        <div className="p-5 sm:p-6 space-y-5">
          {/* Client Selection Row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Client / Customer
              </label>
              <div className="flex gap-2">
                <select
                  value={selectedClientId}
                  onChange={(e) => setSelectedClientId(e.target.value)}
                  className="flex-1 h-11 px-3.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 font-medium focus:outline-teal-600 focus:ring-1 focus:ring-teal-600"
                >
                  {db.clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.phone ? `(${c.phone})` : ''}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={onOpenNewClientModal}
                  className="h-11 px-3.5 flex items-center gap-1.5 text-xs font-semibold bg-teal-50 text-teal-800 border border-teal-200 rounded-lg hover:bg-teal-100 transition-colors shrink-0 cursor-pointer"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>New Client</span>
                </button>
              </div>

              {/* Client Info Micro-Bar */}
              {selectedClient && (
                <div className="mt-2 text-xs text-slate-500 flex flex-wrap items-center gap-2">
                  <span>Phone: <strong className="text-slate-700">{selectedClient.phone || 'N/A'}</strong></span>
                  <span>·</span>
                  <span className="truncate max-w-sm">Address: {selectedClient.addr || 'N/A'}</span>
                  <span>·</span>
                  <span>GST: <strong className="text-slate-700 font-mono">{selectedClient.gst || 'Unregistered'}</strong></span>
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                PO / Order Reference (Optional)
              </label>
              <input
                type="text"
                value={poNo}
                onChange={(e) => setPoNo(e.target.value)}
                placeholder="e.g. PO-8890"
                className="w-full h-11 px-3.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-teal-600 focus:ring-1 focus:ring-teal-600 font-mono"
              />
            </div>
          </div>

          {/* Box Types Table */}
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="bg-slate-100/70 border-b border-slate-200 text-xs font-bold text-slate-600 uppercase tracking-wider">
                    <th className="py-3 px-4">Box Type</th>
                    <th className="py-3 px-4 w-48 text-center">Quantity</th>
                    <th className="py-3 px-4 w-28 text-center">Select</th>
                    <th className="py-3 px-4 w-36 text-right">Amount (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-sm">
                  {db.settings.boxes.map((b) => {
                    const row = boxRows.find((r) => r.boxId === b.id) || {
                      boxId: b.id,
                      qty: 0,
                      selected: false
                    };
                    const lineAmount = row.selected && row.qty > 0 ? row.qty * b.p : 0;

                    return (
                      <tr
                        key={b.id}
                        className={`transition-colors ${
                          row.selected ? 'bg-teal-50/30' : 'hover:bg-slate-50/50'
                        }`}
                      >
                        <td className="py-3.5 px-4">
                          <div className="font-semibold text-slate-900">{b.n}</div>
                          <div className="text-xs text-slate-500 mt-0.5">
                            {b.p > 0 ? `${money(b.p)} per box` : 'Rate: ₹ 0 (set in Settings)'}
                            {b.hsn && ` · HSN ${b.hsn}`}
                          </div>
                        </td>

                        <td className="py-3.5 px-4">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleQtyChange(b.id, row.qty - 1)}
                              className="w-9 h-9 rounded-md bg-slate-100 hover:bg-slate-200 active:bg-slate-300 flex items-center justify-center text-slate-700 transition-colors cursor-pointer"
                              title="Decrease"
                            >
                              <Minus className="w-4 h-4" />
                            </button>
                            <input
                              type="number"
                              min="0"
                              value={row.qty === 0 ? '' : row.qty}
                              onChange={(e) => handleQtyChange(b.id, parseInt(e.target.value) || 0)}
                              placeholder="0"
                              className="w-20 h-9 text-center font-mono font-bold text-slate-900 bg-white border border-slate-300 rounded-md focus:outline-teal-600 focus:ring-1 focus:ring-teal-600 text-base"
                            />
                            <button
                              type="button"
                              onClick={() => handleQtyChange(b.id, row.qty + 1)}
                              className="w-9 h-9 rounded-md bg-slate-100 hover:bg-slate-200 active:bg-slate-300 flex items-center justify-center text-slate-700 transition-colors cursor-pointer"
                              title="Increase"
                            >
                              <Plus className="w-4 h-4" />
                            </button>
                          </div>
                        </td>

                        <td className="py-3.5 px-4 text-center">
                          <button
                            type="button"
                            onClick={() => handleToggleSelect(b.id)}
                            className={`w-7 h-7 rounded-md inline-flex items-center justify-center transition-all cursor-pointer ${
                              row.selected
                                ? 'bg-teal-700 text-white shadow-xs'
                                : 'border border-slate-300 bg-white hover:border-slate-400'
                            }`}
                            aria-label={`Select ${b.n}`}
                          >
                            {row.selected && <Check className="w-4 h-4 stroke-[3]" />}
                          </button>
                        </td>

                        <td className="py-3.5 px-4 text-right font-mono font-bold text-slate-900 tabular-nums">
                          {lineAmount > 0 ? money(lineAmount) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Real-time Order Summary Card */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 flex flex-wrap justify-between items-center gap-4">
            <div>
              <div className="text-xs text-slate-500 font-medium">Selected Box Quantity</div>
              <div className="text-xl font-bold font-mono text-slate-900 mt-0.5">
                {selectedSummary.totalBoxes} boxes
              </div>
            </div>

            <div className="text-right">
              <div className="text-xs text-slate-500 font-medium">
                Total Amount {db.settings.gstOn ? `(incl. ${db.settings.rate}% GST)` : '(Non-GST)'}
              </div>
              <div className="text-2xl font-extrabold font-mono text-teal-800 tabular-nums mt-0.5">
                {money(selectedSummary.calc.total)}
              </div>
            </div>
          </div>

          {/* Payment Mode Selector & Generate Action */}
          <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <span className="text-xs font-bold text-slate-700 shrink-0">Payment Mode:</span>
              <div className="grid grid-cols-4 gap-1 p-1 bg-slate-100 rounded-lg w-full sm:w-auto">
                {(['Cash', 'UPI', 'Bank', 'Credit'] as PaymentMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setPaymentMode(mode)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer whitespace-nowrap ${
                      paymentMode === mode
                        ? 'bg-white text-teal-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
              <button
                type="button"
                onClick={() => handleGenerateInvoice(false)}
                className="h-11 px-4 text-xs font-semibold rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer w-full sm:w-auto"
              >
                Save Only
              </button>
              <button
                type="button"
                onClick={() => handleGenerateInvoice(true)}
                className="h-11 px-6 text-sm font-bold rounded-lg bg-teal-700 hover:bg-teal-800 text-white shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer w-full sm:w-auto"
              >
                <Receipt className="w-4 h-4" />
                <span>Generate & Print Tax Invoice</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Invoices Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-200 flex justify-between items-center">
          <h3 className="text-sm font-bold text-slate-900 m-0">Recent Invoices</h3>
          <span className="text-xs text-slate-500 font-mono">
            {db.invoices.length} total issued
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="bg-slate-50/70 border-b border-slate-200 text-slate-500 font-semibold">
                <th className="py-2.5 px-3.5">Invoice #</th>
                <th className="py-2.5 px-3.5">Date</th>
                <th className="py-2.5 px-3.5">Client</th>
                <th className="py-2.5 px-3.5 text-right">Total</th>
                <th className="py-2.5 px-3.5 text-right">Paid</th>
                <th className="py-2.5 px-3.5 text-right">Balance</th>
                <th className="py-2.5 px-3.5">Status</th>
                <th className="py-2.5 px-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {db.invoices.slice(-6).reverse().map((inv) => {
                const client = db.clients.find((c) => c.id === inv.cid);
                const calc = calculateInvoice(inv, db.settings.rate);

                return (
                  <tr
                    key={inv.id}
                    onClick={() => onViewInvoice(inv)}
                    className="hover:bg-teal-50/40 cursor-pointer transition-colors"
                  >
                    <td className="py-2.5 px-3.5 font-bold font-mono text-teal-800">
                      {inv.no}
                    </td>
                    <td className="py-2.5 px-3.5 text-slate-600">
                      {formatDateDisplay(inv.date)}
                    </td>
                    <td className="py-2.5 px-3.5 font-medium text-slate-900">
                      {client?.name || '—'}
                    </td>
                    <td className="py-2.5 px-3.5 text-right font-mono tabular-nums font-bold text-slate-900">
                      {money(calc.total)}
                    </td>
                    <td className="py-2.5 px-3.5 text-right font-mono tabular-nums text-slate-700">
                      {money(calc.paid)}
                    </td>
                    <td className="py-2.5 px-3.5 text-right font-mono tabular-nums font-semibold text-slate-800">
                      {calc.bal > 0 ? (
                        <span className="text-amber-700">{money(calc.bal)}</span>
                      ) : (
                        <span className="text-slate-400">₹ 0.00</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3.5">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                          calc.st === 'Paid'
                            ? 'bg-emerald-100 text-emerald-800'
                            : calc.st === 'Part paid'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {calc.st}
                      </span>
                    </td>
                    <td
                      className="py-2.5 px-3.5 text-right"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => onViewInvoice(inv)}
                          className="px-2 py-1 text-[11px] font-semibold text-teal-700 hover:bg-teal-50 rounded transition-colors"
                        >
                          View / Print
                        </button>
                        {calc.bal > 0 && (
                          <button
                            type="button"
                            onClick={() => onRecordPayment(inv)}
                            className="px-2 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-50 rounded transition-colors"
                          >
                            Pay
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onEditInvoice(inv)}
                          className="px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-100 rounded transition-colors"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteInvoice(inv.id)}
                          className="px-2 py-1 text-[11px] font-semibold text-rose-600 hover:bg-rose-50 rounded transition-colors"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

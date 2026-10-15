import React, { useState, useMemo } from 'react';
import { AppDatabase, Client, Invoice, PaymentMode, InvoiceItem } from '../types/billing';
import { calculateInvoice, money, formatNumber, todayISO, formatDateDisplay, generateInvoiceNo } from '../utils/formatters';
import { Plus, Minus, Check, UserPlus, Receipt, Trash2, Printer, CreditCard } from 'lucide-react';

interface BillingWorkspaceProps {
  db: AppDatabase;
  onSaveInvoice: (invoice: Invoice, openPrint?: boolean) => void;
  onOpenNewClientModal: () => void;
  onViewInvoice: (invoice: Invoice) => void;
  onEditInvoice: (invoice: Invoice) => void;
  onDeleteInvoice: (id: string) => void;
  onRecordPayment: (invoice: Invoice) => void;
  showToast: (msg: string) => void;
}

interface CustomItemRow {
  id: string;
  name: string;
  qty: number;
  rate: number;
  hsn: string;
}

export const BillingWorkspace: React.FC<BillingWorkspaceProps> = ({
  db,
  onSaveInvoice,
  onOpenNewClientModal,
  onViewInvoice,
  onEditInvoice,
  onDeleteInvoice,
  onRecordPayment,
  showToast
}) => {
  const today = todayISO();

  // Form State
  const [selectedClientId, setSelectedClientId] = useState<string>(db.clients[0]?.id || '');
  const [invoiceDate, setInvoiceDate] = useState<string>(today);
  const [poNo, setPoNo] = useState<string>('');
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('Cash');
  const [gstEnabled, setGstEnabled] = useState<boolean>(db.settings.gstOn);
  const [discountAmt, setDiscountAmt] = useState<number>(0);

  // Box quantities state: Map of boxId -> quantity
  const [boxQuantities, setBoxQuantities] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {};
    db.settings.boxes.forEach((b) => {
      initial[b.id] = 0;
    });
    return initial;
  });

  // Additional custom items (if customer wants something other than standard boxes)
  const [customItems, setCustomItems] = useState<CustomItemRow[]>([]);

  // Selected client details
  const selectedClient = useMemo(() => {
    return db.clients.find((c) => c.id === selectedClientId);
  }, [db.clients, selectedClientId]);

  // Handle Box Quantity Change
  const updateBoxQty = (boxId: string, delta: number) => {
    setBoxQuantities((prev) => {
      const current = prev[boxId] || 0;
      const next = Math.max(0, current + delta);
      return { ...prev, [boxId]: next };
    });
  };

  const setBoxQtyDirect = (boxId: string, val: number) => {
    setBoxQuantities((prev) => ({
      ...prev,
      [boxId]: Math.max(0, val)
    }));
  };

  // Custom Item Handlers
  const addCustomItem = () => {
    setCustomItems((prev) => [
      ...prev,
      {
        id: 'cust-' + Math.random().toString(36).slice(2, 7),
        name: '',
        qty: 1,
        rate: 0,
        hsn: db.settings.defaultHsn || '481910'
      }
    ]);
  };

  const updateCustomItem = (id: string, field: keyof CustomItemRow, value: any) => {
    setCustomItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item))
    );
  };

  const removeCustomItem = (id: string) => {
    setCustomItems((prev) => prev.filter((item) => item.id !== id));
  };

  // Compile all active items for the bill
  const activeItems = useMemo<InvoiceItem[]>(() => {
    const items: InvoiceItem[] = [];

    // 1. Box items
    db.settings.boxes.forEach((box) => {
      const qty = boxQuantities[box.id] || 0;
      if (qty > 0) {
        items.push({
          id: 'box-item-' + box.id,
          n: box.n,
          hsn: box.hsn || db.settings.defaultHsn || '481910',
          q: qty,
          r: box.p
        });
      }
    });

    // 2. Custom items
    customItems.forEach((ci) => {
      if (ci.name.trim() && ci.qty > 0) {
        items.push({
          id: ci.id,
          n: ci.name.trim(),
          hsn: ci.hsn,
          q: ci.qty,
          r: ci.rate
        });
      }
    });

    return items;
  }, [db.settings.boxes, boxQuantities, customItems, db.settings.defaultHsn]);

  // Total boxes count
  const totalBoxesCount = useMemo(() => {
    return Object.values(boxQuantities).reduce((acc, q) => acc + (q || 0), 0);
  }, [boxQuantities]);

  // Live Bill Calculation
  const billCalc = useMemo(() => {
    const draft: Partial<Invoice> = {
      items: activeItems,
      disc: discountAmt,
      gstOn: gstEnabled,
      gstRate: db.settings.rate
    };
    return calculateInvoice(draft, db.settings.rate, {
      cgstSplit: db.settings.cgstSplit,
      sgstSplit: db.settings.sgstSplit
    });
  }, [activeItems, discountAmt, gstEnabled, db.settings.rate, db.settings.cgstSplit, db.settings.sgstSplit]);

  // Reset current bill form
  const handleResetForm = () => {
    const fresh: Record<string, number> = {};
    db.settings.boxes.forEach((b) => {
      fresh[b.id] = 0;
    });
    setBoxQuantities(fresh);
    setCustomItems([]);
    setPoNo('');
    setDiscountAmt(0);
    setPaymentMode('Cash');
    setInvoiceDate(today);
  };

  // Generate Invoice Action
  const handleGenerate = (openPrint: boolean = true) => {
    if (!selectedClientId) {
      showToast('Please select a customer first');
      return;
    }

    if (activeItems.length === 0) {
      showToast('Please enter quantity for at least one box or item');
      return;
    }

    const nextNo = generateInvoiceNo(db.settings.invoicePrefix, db.settings.nextSeq);
    const invoiceTotal = billCalc.total;

    const newInvoice: Invoice = {
      id: 'inv-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      no: nextNo,
      cid: selectedClientId,
      date: invoiceDate,
      items: activeItems,
      disc: discountAmt,
      gstOn: gstEnabled,
      gstRate: db.settings.rate,
      isInterState: false,
      poNo: poNo.trim(),
      poDate: poNo.trim() ? invoiceDate : '',
      state: selectedClient?.state || 'Karnataka (29)',
      hsnCode: db.settings.defaultHsn || '481910',
      mode: paymentMode,
      pay: [],
      notes: 'Generated via SRK Billing Workspace',
      createdAt: new Date().toISOString()
    };

    // Auto record payment if mode is not Credit
    if (paymentMode !== 'Credit' && invoiceTotal > 0) {
      newInvoice.pay.push({
        id: 'p-' + Math.random().toString(36).slice(2, 7),
        date: invoiceDate,
        amt: invoiceTotal,
        mode: paymentMode,
        notes: `Instant ${paymentMode} payment on dispatch`
      });
    }

    onSaveInvoice(newInvoice, openPrint);
    handleResetForm();
    showToast(`Invoice ${newInvoice.no} created successfully!`);
  };

  // Today's Aggregate Metrics
  const todayInvoices = useMemo(() => {
    return db.invoices.filter((i) => i.date === today);
  }, [db.invoices, today]);

  const todayDispatchedBoxes = useMemo(() => {
    return todayInvoices.reduce((sum, inv) => {
      return sum + inv.items.reduce((acc, it) => acc + (Number(it.q) || 0), 0);
    }, 0);
  }, [todayInvoices]);

  const todayTotalSales = useMemo(() => {
    return todayInvoices.reduce((sum, inv) => {
      return sum + calculateInvoice(inv, db.settings.rate).total;
    }, 0);
  }, [todayInvoices, db.settings.rate]);

  const totalOutstandingBalance = useMemo(() => {
    return db.invoices.reduce((sum, inv) => {
      const c = calculateInvoice(inv, db.settings.rate);
      return sum + Math.max(0, c.bal);
    }, 0);
  }, [db.invoices, db.settings.rate]);

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-16">
      {/* 4 Clean Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        <div className="bg-white rounded-lg p-4 border border-slate-200 shadow-2xs">
          <div className="text-xs font-semibold text-slate-500">Today's Boxes</div>
          <div className="text-2xl font-bold font-mono text-slate-900 mt-1 tabular-nums">
            {todayDispatchedBoxes}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">Dispatched</div>
        </div>

        <div className="bg-white rounded-lg p-4 border border-slate-200 shadow-2xs">
          <div className="text-xs font-semibold text-slate-500">Today's Sales</div>
          <div className="text-2xl font-bold font-mono text-teal-800 mt-1 tabular-nums">
            {money(todayTotalSales)}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">{todayInvoices.length} bills today</div>
        </div>

        <div className="bg-white rounded-lg p-4 border border-slate-200 shadow-2xs">
          <div className="text-xs font-semibold text-slate-500">Next Invoice No</div>
          <div className="text-2xl font-bold font-mono text-slate-900 mt-1">
            {generateInvoiceNo(db.settings.invoicePrefix, db.settings.nextSeq)}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">Auto-generated</div>
        </div>

        <div className="bg-white rounded-lg p-4 border border-slate-200 shadow-2xs">
          <div className="text-xs font-semibold text-slate-500">Total Pending Dues</div>
          <div className="text-2xl font-bold font-mono text-amber-700 mt-1 tabular-nums">
            {money(totalOutstandingBalance)}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">Across all clients</div>
        </div>
      </div>

      {/* Main Billing Form Card */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Section Header */}
        <div className="px-6 py-4 bg-slate-50/70 border-b border-slate-200 flex flex-wrap justify-between items-center gap-2">
          <div>
            <h2 className="text-base font-bold text-slate-900 m-0">Create Tax Invoice</h2>
            <p className="text-xs text-slate-500 m-0 mt-0.5">
              Select customer, enter box quantities, and generate printable invoice in one click
            </p>
          </div>

          {activeItems.length > 0 && (
            <button
              type="button"
              onClick={handleResetForm}
              className="text-xs text-slate-500 hover:text-rose-600 font-semibold px-2 py-1 rounded transition-colors"
            >
              Clear Form
            </button>
          )}
        </div>

        <div className="p-6 space-y-6">
          {/* Row 1: Customer Selection & Invoice Info */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2 space-y-1.5">
              <label className="block text-xs font-bold text-slate-700">
                Customer / Client *
              </label>
              <div className="flex gap-2">
                <select
                  value={selectedClientId}
                  onChange={(e) => setSelectedClientId(e.target.value)}
                  className="flex-1 h-10 px-3.5 bg-white border border-slate-300 rounded-lg text-sm font-semibold text-slate-900 focus:outline-teal-600"
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
                  className="h-10 px-3.5 flex items-center gap-1.5 text-xs font-bold bg-teal-50 text-teal-800 border border-teal-200 rounded-lg hover:bg-teal-100 transition-colors shrink-0 cursor-pointer"
                  title="Add new customer"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>+ New Client</span>
                </button>
              </div>

              {selectedClient && (
                <div className="text-xs text-slate-500 flex flex-wrap items-center gap-2 pt-0.5">
                  <span>Phone: <strong className="text-slate-700">{selectedClient.phone || 'N/A'}</strong></span>
                  <span>·</span>
                  <span className="truncate max-w-sm">Address: {selectedClient.addr || 'N/A'}</span>
                  <span>·</span>
                  <span>GSTIN: <strong className="text-slate-700 font-mono">{selectedClient.gst || 'Unregistered'}</strong></span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Date
                </label>
                <input
                  type="date"
                  value={invoiceDate}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                  className="w-full h-10 px-3 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 font-mono focus:outline-teal-600"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  PO Ref (Opt.)
                </label>
                <input
                  type="text"
                  value={poNo}
                  onChange={(e) => setPoNo(e.target.value)}
                  placeholder="e.g. PO-88"
                  className="w-full h-10 px-3 bg-white border border-slate-300 rounded-lg text-xs font-mono text-slate-900 placeholder:text-slate-400 focus:outline-teal-600"
                />
              </div>
            </div>
          </div>

          {/* Row 2: Box Items Table */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Box Dispatch Items
              </label>
              <span className="text-xs text-slate-500">
                Standard pricing from Settings
              </span>
            </div>

            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-200 font-bold text-slate-700">
                    <th className="py-2.5 px-4">Box Type</th>
                    <th className="py-2.5 px-4 w-28 text-right">Rate</th>
                    <th className="py-2.5 px-4 w-48 text-center">Quantity</th>
                    <th className="py-2.5 px-4 w-36 text-right">Line Total (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {db.settings.boxes.map((b) => {
                    const qty = boxQuantities[b.id] || 0;
                    const lineTotal = qty * b.p;

                    return (
                      <tr
                        key={b.id}
                        className={`transition-colors ${qty > 0 ? 'bg-teal-50/40' : 'hover:bg-slate-50/60'}`}
                      >
                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-900">{b.n}</div>
                          {b.hsn && (
                            <div className="text-[11px] text-slate-400 font-mono">
                              HSN: {b.hsn}
                            </div>
                          )}
                        </td>

                        <td className="py-3 px-4 text-right font-mono font-semibold text-slate-700 tabular-nums">
                          {money(b.p)}
                        </td>

                        <td className="py-3 px-4">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => updateBoxQty(b.id, -1)}
                              className="w-8 h-8 rounded-md bg-slate-100 hover:bg-slate-200 active:bg-slate-300 flex items-center justify-center text-slate-700 transition-colors cursor-pointer"
                              title="Decrease"
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>

                            <input
                              type="number"
                              min="0"
                              value={qty === 0 ? '' : qty}
                              onChange={(e) => setBoxQtyDirect(b.id, parseInt(e.target.value) || 0)}
                              placeholder="0"
                              className="w-16 h-8 text-center font-mono font-bold text-slate-900 bg-white border border-slate-300 rounded-md focus:outline-teal-600 text-sm"
                            />

                            <button
                              type="button"
                              onClick={() => updateBoxQty(b.id, 1)}
                              className="w-8 h-8 rounded-md bg-slate-100 hover:bg-slate-200 active:bg-slate-300 flex items-center justify-center text-slate-700 transition-colors cursor-pointer"
                              title="Increase"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>

                        <td className="py-3 px-4 text-right font-mono font-bold text-slate-900 tabular-nums">
                          {lineTotal > 0 ? money(lineTotal) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Optional: Custom items */}
          {customItems.length > 0 && (
            <div className="space-y-2 pt-1">
              <div className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Additional / Custom Items
              </div>
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-200 font-bold text-slate-700">
                      <th className="py-2 px-3">Item Name</th>
                      <th className="py-2 px-3 w-28 text-center">Qty</th>
                      <th className="py-2 px-3 w-32 text-right">Rate (₹)</th>
                      <th className="py-2 px-3 w-32 text-right">Total (₹)</th>
                      <th className="py-2 px-2 w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {customItems.map((ci) => (
                      <tr key={ci.id}>
                        <td className="py-2 px-3">
                          <input
                            type="text"
                            value={ci.name}
                            onChange={(e) => updateCustomItem(ci.id, 'name', e.target.value)}
                            placeholder="Custom item description..."
                            className="w-full h-8 px-2 bg-white border border-slate-300 rounded text-xs text-slate-900 focus:outline-teal-600"
                          />
                        </td>
                        <td className="py-2 px-3">
                          <input
                            type="number"
                            min="1"
                            value={ci.qty}
                            onChange={(e) => updateCustomItem(ci.id, 'qty', Math.max(1, parseInt(e.target.value) || 1))}
                            className="w-full h-8 px-2 text-center font-mono font-bold text-xs bg-white border border-slate-300 rounded focus:outline-teal-600"
                          />
                        </td>
                        <td className="py-2 px-3">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={ci.rate}
                            onChange={(e) => updateCustomItem(ci.id, 'rate', Math.max(0, parseFloat(e.target.value) || 0))}
                            className="w-full h-8 px-2 text-right font-mono font-bold text-xs bg-white border border-slate-300 rounded focus:outline-teal-600"
                          />
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-bold text-slate-900 tabular-nums">
                          {money(ci.qty * ci.rate)}
                        </td>
                        <td className="py-2 px-2 text-center">
                          <button
                            type="button"
                            onClick={() => removeCustomItem(ci.id)}
                            className="text-slate-400 hover:text-rose-600 p-1 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={addCustomItem}
              className="text-xs font-semibold text-teal-700 hover:text-teal-900 flex items-center gap-1 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Add Non-Box Custom Item</span>
            </button>

            <div className="text-xs font-mono text-slate-500 font-semibold">
              Selected: {totalBoxesCount} boxes · {activeItems.length} line items
            </div>
          </div>

          {/* Row 3: Tax, Discounts & Financial Calculations */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-slate-50/70 border border-slate-200 rounded-lg">
            {/* Left: Toggles & Discounts */}
            <div className="space-y-3 text-xs">
              <div className="font-bold text-slate-700 uppercase tracking-wider">
                Taxes & Deductions
              </div>

              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 cursor-pointer font-semibold text-slate-800">
                  <input
                    type="checkbox"
                    checked={gstEnabled}
                    onChange={(e) => setGstEnabled(e.target.checked)}
                    className="w-4 h-4 rounded text-teal-700 focus:ring-teal-600"
                  />
                  <span>Add GST ({db.settings.rate}%: 0.5% CGST + 0.5% SGST)</span>
                </label>
              </div>

              <div className="flex items-center gap-2 max-w-xs">
                <span className="text-slate-600 font-medium shrink-0">Discount (₹):</span>
                <input
                  type="number"
                  min="0"
                  value={discountAmt === 0 ? '' : discountAmt}
                  onChange={(e) => setDiscountAmt(Math.max(0, parseFloat(e.target.value) || 0))}
                  placeholder="0.00"
                  className="w-28 h-8 px-2.5 font-mono text-xs bg-white border border-slate-300 rounded focus:outline-teal-600"
                />
              </div>

              <div className="pt-2">
                <span className="block text-slate-700 font-bold mb-1.5">Payment Terms:</span>
                <div className="grid grid-cols-4 gap-1 p-1 bg-white border border-slate-200 rounded-lg max-w-sm">
                  {(['Cash', 'UPI', 'Bank', 'Credit'] as PaymentMode[]).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setPaymentMode(mode)}
                      className={`py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                        paymentMode === mode
                          ? 'bg-teal-700 text-white shadow-2xs font-bold'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                      }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Right: Live Total Calculation Strip */}
            <div className="flex flex-col justify-between space-y-2 text-xs border-t md:border-t-0 md:border-l border-slate-200 pt-3 md:pt-0 md:pl-4">
              <div className="space-y-1.5">
                <div className="flex justify-between text-slate-600">
                  <span>Subtotal:</span>
                  <span className="font-mono tabular-nums font-semibold text-slate-800">
                    {money(billCalc.sub)}
                  </span>
                </div>

                {billCalc.disc > 0 && (
                  <div className="flex justify-between text-amber-700">
                    <span>Discount:</span>
                    <span className="font-mono tabular-nums">- {money(billCalc.disc)}</span>
                  </div>
                )}

                {gstEnabled ? (
                  <>
                    <div className="flex justify-between text-slate-600">
                      <span>CGST 0.5%:</span>
                      <span className="font-mono tabular-nums">{money(billCalc.cgst)}</span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>SGST 0.5%:</span>
                      <span className="font-mono tabular-nums">{money(billCalc.sgst)}</span>
                    </div>
                  </>
                ) : (
                  <div className="flex justify-between text-slate-400 italic">
                    <span>GST (Tax Exempt):</span>
                    <span>₹ 0.00</span>
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-between items-baseline">
                <div>
                  <div className="text-xs text-slate-500 font-semibold uppercase">Grand Total</div>
                  <div className="text-2xl font-extrabold font-mono text-teal-800 tabular-nums">
                    {money(billCalc.total)}
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-[11px] text-slate-400 font-mono">
                    Mode: {paymentMode}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Row 4: Action Buttons */}
          <div className="pt-2 flex flex-col sm:flex-row items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => handleGenerate(false)}
              className="w-full sm:w-auto h-11 px-5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs transition-colors cursor-pointer"
            >
              Save Invoice Only
            </button>

            <button
              type="button"
              onClick={() => handleGenerate(true)}
              className="w-full sm:w-auto h-11 px-8 rounded-lg bg-teal-700 hover:bg-teal-800 active:bg-teal-900 text-white font-bold text-sm shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <Receipt className="w-4 h-4" />
              <span>Generate & Print Tax Invoice</span>
            </button>
          </div>
        </div>
      </div>

      {/* Row 5: Recent Invoices Table (Clean & Accessible) */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 flex justify-between items-center">
          <h3 className="font-bold text-slate-900 text-sm m-0">Recent Invoices</h3>
          <span className="text-xs text-slate-500 font-mono">
            {db.invoices.length} total issued
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                <th className="py-2.5 px-4">Invoice #</th>
                <th className="py-2.5 px-4">Date</th>
                <th className="py-2.5 px-4">Customer</th>
                <th className="py-2.5 px-4 text-right">Total</th>
                <th className="py-2.5 px-4 text-right">Paid</th>
                <th className="py-2.5 px-4 text-right">Balance</th>
                <th className="py-2.5 px-4 text-center">Status</th>
                <th className="py-2.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {db.invoices.slice(-5).reverse().map((inv) => {
                const client = db.clients.find((c) => c.id === inv.cid);
                const calc = calculateInvoice(inv, db.settings.rate);

                return (
                  <tr
                    key={inv.id}
                    onClick={() => onViewInvoice(inv)}
                    className="hover:bg-teal-50/40 cursor-pointer transition-colors"
                  >
                    <td className="py-2.5 px-4 font-bold font-mono text-teal-800">
                      {inv.no}
                    </td>
                    <td className="py-2.5 px-4 text-slate-600">
                      {formatDateDisplay(inv.date)}
                    </td>
                    <td className="py-2.5 px-4 font-semibold text-slate-900">
                      {client?.name || '—'}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono font-bold tabular-nums text-slate-900">
                      {money(calc.total)}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums text-emerald-700">
                      {money(calc.paid)}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold">
                      {calc.bal > 0 ? (
                        <span className="text-amber-700">{money(calc.bal)}</span>
                      ) : (
                        <span className="text-slate-400">₹ 0.00</span>
                      )}
                    </td>
                    <td className="py-2.5 px-4 text-center">
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
                      className="py-2.5 px-4 text-right"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => onViewInvoice(inv)}
                          className="px-2.5 py-1 text-[11px] font-semibold text-teal-800 hover:bg-teal-50 rounded transition-colors"
                        >
                          View / Print
                        </button>
                        {calc.bal > 0 && (
                          <button
                            type="button"
                            onClick={() => onRecordPayment(inv)}
                            className="px-2.5 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-50 rounded transition-colors"
                          >
                            Pay
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onEditInvoice(inv)}
                          className="px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-100 rounded transition-colors"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteInvoice(inv.id)}
                          className="px-2 py-1 text-[11px] text-rose-600 hover:bg-rose-50 rounded transition-colors"
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

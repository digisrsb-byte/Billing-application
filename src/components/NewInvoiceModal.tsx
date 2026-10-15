import React, { useState, useMemo, useEffect } from 'react';
import { AppDatabase, Invoice, InvoiceItem, PaymentMode } from '../types/billing';
import { calculateInvoice, money, formatNumber, todayISO } from '../utils/formatters';
import { allocateInvoiceNo } from '../services/invoiceIntegrity';
import {
  buildInitialPaymentRecord,
  CreatePaymentChoice,
  CreatePaymentMethod,
  previewCreatePaymentAmounts,
  resolveCreatePaymentPlan
} from '../services/invoiceCreatePayment';
import { buildBuyerSnapshotFromClient, buildSellerSnapshot } from '../utils/invoiceSnapshot';
import { Plus, Trash2, X, Receipt, UserPlus, ChevronDown, ChevronUp } from 'lucide-react';

interface NewInvoiceModalProps {
  db: AppDatabase;
  editingInvoice?: Invoice | null;
  onClose: () => void;
  onSave: (invoice: Invoice, openPrint?: boolean) => void;
  onOpenNewClientModal: () => void;
  showToast: (msg: string) => void;
}

const inputCls =
  'w-full h-11 px-3 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-teal-600';
const labelCls = 'block text-sm font-semibold text-slate-700 mb-1.5';

const StepTitle: React.FC<{ n: number; title: string; hint?: string }> = ({ n, title, hint }) => (
  <div className="flex items-center gap-3 mb-3">
    <div className="w-7 h-7 rounded-full bg-[#1F7A63] text-white text-sm font-bold flex items-center justify-center shrink-0">
      {n}
    </div>
    <div>
      <div className="text-base font-bold text-slate-900 leading-tight">{title}</div>
      {hint && <div className="text-xs text-slate-500">{hint}</div>}
    </div>
  </div>
);

export const NewInvoiceModal: React.FC<NewInvoiceModalProps> = ({
  db,
  editingInvoice,
  onClose,
  onSave,
  onOpenNewClientModal,
  showToast
}) => {
  const isEditing = !!editingInvoice;
  const boxes = db.settings.boxes;

  const [clientId, setClientId] = useState<string>(editingInvoice?.cid || db.clients[0]?.id || '');
  const [date, setDate] = useState<string>(editingInvoice?.date || todayISO());
  const [poNo, setPoNo] = useState<string>(editingInvoice?.poNo || '');
  const [poDate, setPoDate] = useState<string>(editingInvoice?.poDate || '');
  const [state, setState] = useState<string>(editingInvoice?.state || db.settings.state || 'Karnataka (29)');
  const [hsnCode, setHsnCode] = useState<string>(editingInvoice?.hsnCode || db.settings.defaultHsn || '481910');
  const [disc, setDisc] = useState<number>(editingInvoice?.disc || 0);
  const [gstOn, setGstOn] = useState<boolean>(editingInvoice ? editingInvoice.gstOn : db.settings.gstOn);
  const [gstRate, setGstRate] = useState<number>(
    editingInvoice?.gstRate !== undefined ? editingInvoice.gstRate : db.settings.rate
  );
  const [isInterState, setIsInterState] = useState<boolean>(editingInvoice?.isInterState || false);
  const [paymentChoice, setPaymentChoice] = useState<CreatePaymentChoice>('later');
  const [mode, setMode] = useState<CreatePaymentMethod>('Cash');
  const [receivedAmt, setReceivedAmt] = useState<string>('');
  const [notes, setNotes] = useState<string>(editingInvoice?.notes || '');
  const [showMore, setShowMore] = useState(false);
  const [error, setError] = useState('');
  const previewNo =
    editingInvoice?.no ||
    allocateInvoiceNo(db.settings.invoicePrefix, db.settings.nextSeq, db.invoices).no;

  const newId = () => 'it-' + Math.random().toString(36).slice(2, 8);

  const [items, setItems] = useState<InvoiceItem[]>(() => {
    if (editingInvoice && editingInvoice.items.length > 0) return JSON.parse(JSON.stringify(editingInvoice.items));
    return [{ id: newId(), n: boxes[0]?.n || '', hsn: db.settings.defaultHsn, q: 1, r: boxes[0]?.p || 0 }];
  });

  // Rows where the user chose "Other (type name)" – so the text box stays visible while typing
  const [customRows, setCustomRows] = useState<Set<string>>(() => {
    const s = new Set<string>();
    items.forEach((it) => {
      if (it.n && !boxes.some((b) => b.n === it.n)) s.add(it.id);
    });
    return s;
  });

  const selectedClient = useMemo(() => db.clients.find((c) => c.id === clientId), [db.clients, clientId]);

  const calc = useMemo(
    () =>
      calculateInvoice(
        { items, disc, gstOn, gstRate, isInterState, pay: editingInvoice?.pay || [] },
        gstRate,
        { cgstSplit: db.settings.cgstSplit, sgstSplit: db.settings.sgstSplit }
      ),
    [items, disc, gstOn, gstRate, isInterState, editingInvoice, db.settings.cgstSplit, db.settings.sgstSplit]
  );

  const updateItem = (id: string, patch: Partial<InvoiceItem>) =>
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));

  const handleProductSelect = (id: string, value: string) => {
    if (value === '__custom') {
      setCustomRows((p) => new Set(p).add(id));
      updateItem(id, { n: '', r: 0 });
      return;
    }
    setCustomRows((p) => {
      const s = new Set(p);
      s.delete(id);
      return s;
    });
    const box = boxes.find((b) => b.id === value);
    // Snapshot current catalogue rate onto the line — later catalogue edits do not rewrite issued invoices.
    if (box) updateItem(id, { n: box.n, r: box.p, hsn: box.hsn || hsnCode });
    else updateItem(id, { n: '', r: 0 });
  };

  const addItem = () =>
    setItems((prev) => [...prev, { id: newId(), n: '', hsn: hsnCode, q: 1, r: 0 }]);

  const removeItem = (id: string) => {
    if (items.length <= 1) return showToast('At least one item is required');
    setItems((prev) => prev.filter((it) => it.id !== id));
  };

  const handleSave = (openPrint: boolean) => {
    if (!clientId) return setError('Please select a customer.');
    const validItems = items.filter((it) => it.n.trim() && it.q > 0);
    if (validItems.length === 0) return setError('Add at least one product with a name and a quantity above 0.');
    setError('');

    const invoiceNo =
      editingInvoice?.no ||
      allocateInvoiceNo(db.settings.invoicePrefix, db.settings.nextSeq, db.invoices).no;
    const payments = editingInvoice ? [...editingInvoice.pay] : [];
    const invoiceId = editingInvoice?.id || 'inv-' + Date.now().toString(36);

    let invoiceMode: PaymentMode = editingInvoice?.mode || 'Credit';
    if (!isEditing) {
      const draftTotal = calculateInvoice(
        {
          items: validItems,
          disc: Number(disc) || 0,
          gstOn,
          gstRate: Number(gstRate) || 0,
          isInterState,
          pay: []
        },
        Number(gstRate) || db.settings.rate,
        { cgstSplit: db.settings.cgstSplit, sgstSplit: db.settings.sgstSplit }
      ).total;
      const plan = resolveCreatePaymentPlan(paymentChoice, draftTotal, receivedAmt, mode);
      if (!plan.ok) {
        setError(plan.message);
        return;
      }
      invoiceMode = plan.invoiceMode;
      if (plan.createPayment) {
        payments.length = 0;
        payments.push(
          buildInitialPaymentRecord({
            invoiceId,
            amount: plan.received,
            mode,
            date,
            notes: `${plan.choice === 'full' ? 'Full' : 'Partial'} payment at invoice creation`
          })
        );
      }
    }

    const selectedClient = db.clients.find((c) => c.id === clientId);
    const invoice: Invoice = {
      id: invoiceId,
      no: invoiceNo,
      cid: clientId,
      date,
      items: validItems,
      disc: Number(disc) || 0,
      gstOn,
      gstRate: Number(gstRate) || 0,
      isInterState,
      poNo: poNo.trim(),
      poDate: poDate.trim(),
      customerPhone: selectedClient?.phone || editingInvoice?.customerPhone || '',
      state: state.trim(),
      hsnCode: hsnCode.trim(),
      mode: invoiceMode,
      pay: payments,
      notes: notes.trim(),
      createdAt: editingInvoice?.createdAt || new Date().toISOString(),
      finalized: editingInvoice?.finalized ?? true,
      buyerSnapshot:
        editingInvoice?.buyerSnapshot ||
        (selectedClient ? buildBuyerSnapshotFromClient(selectedClient) : undefined),
      sellerSnapshot: editingInvoice?.sellerSnapshot || buildSellerSnapshot(db.settings)
    };

    onSave(invoice, openPrint);
    showToast(`Invoice ${invoiceNo} ${isEditing ? 'updated' : 'saved'} successfully!`);
    onClose();
  };

  const selectPaymentChoice = (choice: CreatePaymentChoice) => {
    setPaymentChoice(choice);
    setError('');
    if (choice === 'full') {
      setReceivedAmt(calc.total > 0 ? calc.total.toFixed(2) : '0.00');
    } else {
      setReceivedAmt('');
    }
  };

  useEffect(() => {
    if (paymentChoice === 'full') {
      setReceivedAmt(calc.total > 0 ? calc.total.toFixed(2) : '0.00');
    }
  }, [calc.total, paymentChoice]);

  const previewPay = previewCreatePaymentAmounts(paymentChoice, calc.total, receivedAmt);
  const choiceCards: { v: CreatePaymentChoice; label: string; hint: string }[] = [
    { v: 'full', label: 'Full Payment', hint: 'Collect the entire total now' },
    { v: 'partial', label: 'Partial Payment', hint: 'Collect part; rest stays due' },
    { v: 'later', label: 'Pay Later', hint: '₹0 paid · Pending' }
  ];
  const methodOptions: CreatePaymentMethod[] = ['Cash', 'UPI', 'Bank'];

  return (
    <div className="fixed inset-0 z-50 bg-[#081C2D]/50 flex items-center justify-center p-3 sm:p-6">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl border border-slate-200 overflow-hidden flex flex-col max-h-[94vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center shrink-0">
          <div>
            <h2 className="text-lg font-bold text-slate-900 m-0">
              {isEditing ? `Edit invoice ${editingInvoice!.no}` : 'New invoice'}
            </h2>
            <p className="text-sm text-slate-500 m-0 mt-0.5">
              Invoice no. <span className="font-mono font-semibold text-[#1F7A63]">{previewNo}</span> · Fill in the 3 steps, then save.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-8">
          {/* STEP 1 */}
          <section>
            <StepTitle n={1} title="Who is this invoice for?" />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-2">
                <label className={labelCls}>Customer</label>
                <div className="flex gap-2">
                  <select value={clientId} onChange={(e) => setClientId(e.target.value)} className={inputCls}>
                    {db.clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} {c.phone ? `(${c.phone})` : ''}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={onOpenNewClientModal}
                    className="px-3 h-11 flex items-center gap-1.5 text-sm font-semibold bg-white border border-slate-300 rounded-lg text-teal-800 hover:bg-teal-50 shrink-0 cursor-pointer"
                  >
                    <UserPlus className="w-4 h-4" /> New customer
                  </button>
                </div>
                {selectedClient && (
                  <div className="mt-2 text-xs text-slate-500 leading-relaxed">
                    {selectedClient.addr || 'No address'}
                    {selectedClient.gst ? ` · GSTIN ${selectedClient.gst}` : ' · Unregistered'}
                  </div>
                )}
              </div>
              <div>
                <label className={labelCls}>Invoice date</label>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
              </div>
            </div>
          </section>

          {/* STEP 2 */}
          <section>
            <StepTitle n={2} title="What are you selling?" hint="Pick a product — the rate fills in automatically." />
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="hidden sm:grid grid-cols-[1fr_88px_110px_120px_36px] gap-2 px-3 py-2 bg-slate-50 text-xs font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                <div>Product</div>
                <div className="text-center">Quantity</div>
                <div className="text-right">Rate (₹)</div>
                <div className="text-right">Amount</div>
                <div />
              </div>
              <div className="divide-y divide-slate-100">
                {items.map((it) => {
                  const isCustom = customRows.has(it.id);
                  const matched = boxes.find((b) => b.n === it.n);
                  const selectValue = isCustom ? '__custom' : matched?.id || '';
                  return (
                    <div
                      key={it.id}
                      className="grid grid-cols-2 sm:grid-cols-[1fr_88px_110px_120px_36px] gap-2 px-3 py-3 items-center"
                    >
                      <div className="col-span-2 sm:col-span-1 space-y-1.5">
                        <select
                          value={selectValue}
                          onChange={(e) => handleProductSelect(it.id, e.target.value)}
                          className="w-full h-10 px-2.5 bg-white border border-slate-300 rounded-lg text-sm font-semibold text-slate-900 focus:outline-teal-600"
                        >
                          <option value="">Choose product…</option>
                          {boxes.map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.n}
                              {b.pack ? ` (${b.pack})` : b.unitsPerBox ? ` (${b.unitsPerBox}/box)` : ''} — ₹{b.p}
                            </option>
                          ))}
                          <option value="__custom">Other (type name)…</option>
                        </select>
                        {isCustom && (
                          <input
                            type="text"
                            value={it.n}
                            onChange={(e) => updateItem(it.id, { n: e.target.value })}
                            placeholder="Type product name"
                            className="w-full h-10 px-2.5 bg-white border border-slate-300 rounded-lg text-sm focus:outline-teal-600"
                          />
                        )}
                      </div>
                      <input
                        type="number"
                        min="1"
                        value={it.q === 0 ? '' : it.q}
                        onChange={(e) => updateItem(it.id, { q: Math.max(0, Number(e.target.value) || 0) })}
                        aria-label="Quantity"
                        placeholder="Qty"
                        className="h-10 px-2 text-center font-mono font-bold bg-white border border-slate-300 rounded-lg text-sm focus:outline-teal-600"
                      />
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={it.r === 0 ? '' : it.r}
                        onChange={(e) => updateItem(it.id, { r: Math.max(0, Number(e.target.value) || 0) })}
                        aria-label="Rate"
                        placeholder="Rate"
                        className="h-10 px-2 text-right font-mono bg-white border border-slate-300 rounded-lg text-sm focus:outline-teal-600"
                      />
                      <div className="text-right font-mono font-bold text-slate-900 tabular-nums text-sm">
                        {money(it.q * it.r)}
                      </div>
                      <button
                        type="button"
                        onClick={() => removeItem(it.id)}
                        title="Remove"
                        aria-label="Remove item"
                        className="justify-self-end text-slate-400 hover:text-rose-600 p-2 rounded cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
            <button
              type="button"
              onClick={addItem}
              className="mt-3 px-3.5 h-10 text-sm font-semibold bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" /> Add another product
            </button>
          </section>

          {/* STEP 3 */}
          {!isEditing && (
            <section>
              <StepTitle n={3} title="How is the customer paying?" />
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {choiceCards.map((o) => (
                  <button
                    key={o.v}
                    type="button"
                    onClick={() => selectPaymentChoice(o.v)}
                    className={`text-left rounded-xl border-2 px-3.5 py-3 transition-colors cursor-pointer ${
                      paymentChoice === o.v
                        ? 'border-[#1F7A63] bg-[#1F7A63]/08 shadow-sm'
                        : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div
                      className={`text-sm font-extrabold ${
                        paymentChoice === o.v ? 'text-[#1F7A63]' : 'text-[#081C2D]'
                      }`}
                    >
                      {o.label}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5 leading-snug">{o.hint}</div>
                  </button>
                ))}
              </div>

              {paymentChoice !== 'later' && (
                <div className="mt-4">
                  <div className={labelCls}>Payment method</div>
                  <div className="flex flex-wrap gap-2">
                    {methodOptions.map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setMode(m)}
                        className={`h-10 px-4 rounded-lg text-sm font-bold border cursor-pointer transition-colors ${
                          mode === m
                            ? 'bg-[#081C2D] border-[#081C2D] text-white'
                            : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {paymentChoice === 'full' && (
                <div className="mt-4 max-w-sm rounded-xl border border-[#1F7A63]/25 bg-[#F5F7FA] px-4 py-3">
                  <div className="text-xs font-bold text-slate-600 mb-1">Amount received now</div>
                  <div className="text-xl font-mono font-extrabold tabular-nums text-[#081C2D]">
                    {money(calc.total)}
                  </div>
                  <p className="text-xs text-slate-500 mt-1.5 mb-0">
                    Paid {money(previewPay.paidNow)} · Balance due {money(previewPay.balanceDue)}
                  </p>
                </div>
              )}

              {paymentChoice === 'partial' && (
                <div className="mt-4 max-w-xs">
                  <label className={labelCls}>Amount received now</label>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={receivedAmt}
                    onChange={(e) => {
                      setReceivedAmt(e.target.value);
                      setError('');
                    }}
                    placeholder="0.00"
                    className={inputCls + ' font-mono'}
                  />
                  <p className="text-xs text-slate-500 mt-1 mb-0">
                    Must be greater than ₹0 and less than ₹{formatNumber(calc.total)}. Balance due:{' '}
                    {money(previewPay.balanceDue)}
                  </p>
                </div>
              )}

              {paymentChoice === 'later' && (
                <p className="text-sm text-slate-500 mt-3 mb-0">
                  Nothing collected now — invoice is created with ₹0 paid and {money(calc.total)} outstanding
                  (Pending).
                </p>
              )}
            </section>
          )}

          {/* Optional extras */}
          <section className="border-t border-slate-200 pt-4">
            <button
              type="button"
              onClick={() => setShowMore((v) => !v)}
              className="flex items-center gap-1.5 text-sm font-bold text-[#1F7A63] cursor-pointer"
            >
              {showMore ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              {showMore ? 'Hide' : 'Show'} tax, discount &amp; other options
              <span className="font-normal text-slate-500">
                ({gstOn ? `GST ${gstRate}%` : 'No GST'}
                {calc.disc > 0 ? `, discount ${money(calc.disc)}` : ''})
              </span>
            </button>

            {showMore && (
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2 flex flex-wrap items-center gap-x-6 gap-y-2">
                  <label className="flex items-center gap-2 text-sm font-medium text-slate-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={gstOn}
                      onChange={(e) => setGstOn(e.target.checked)}
                      className="w-4 h-4"
                    />
                    Charge GST
                  </label>
                  {gstOn && (
                    <>
                      <select
                        value={gstRate}
                        onChange={(e) => setGstRate(Number(e.target.value))}
                        className="h-10 px-2 bg-white border border-slate-300 rounded-lg text-sm font-semibold text-slate-800"
                      >
                        <option value="1">1%</option>
                        <option value="5">5%</option>
                        <option value="12">12%</option>
                        <option value="18">18%</option>
                        <option value="28">28%</option>
                        <option value="0">0% (Exempt)</option>
                      </select>
                      <label className="flex items-center gap-2 text-sm font-medium text-slate-800 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isInterState}
                          onChange={(e) => setIsInterState(e.target.checked)}
                          className="w-4 h-4"
                        />
                        Customer is in another state (IGST)
                      </label>
                    </>
                  )}
                </div>

                <div>
                  <label className={labelCls}>Discount (₹)</label>
                  <input
                    type="number"
                    min="0"
                    value={disc === 0 ? '' : disc}
                    onChange={(e) => setDisc(Math.max(0, Number(e.target.value) || 0))}
                    placeholder="0"
                    className={inputCls + ' font-mono'}
                  />
                </div>
                <div>
                  <label className={labelCls}>State &amp; code</label>
                  <input value={state} onChange={(e) => setState(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>PO number</label>
                  <input value={poNo} onChange={(e) => setPoNo(e.target.value)} placeholder="Optional" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>PO date</label>
                  <input type="date" value={poDate} onChange={(e) => setPoDate(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>HSN code</label>
                  <input value={hsnCode} onChange={(e) => setHsnCode(e.target.value)} className={inputCls + ' font-mono'} />
                </div>
                <div>
                  <label className={labelCls}>Note on invoice</label>
                  <input
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="e.g. Goods once sold will not be taken back"
                    className={inputCls}
                  />
                </div>
              </div>
            )}
          </section>
        </div>

        {error && (
          <div role="alert" className="shrink-0 px-6 py-2.5 bg-[#F5F7FA] border-t border-[#D5DBDF] text-sm font-semibold text-[#1F7A63]">
            ⚠ {error}
          </div>
        )}

        {/* Sticky footer: totals + actions */}
        <div className="shrink-0 border-t-2 border-slate-200 bg-slate-50 px-6 py-4 flex flex-wrap items-center justify-between gap-4">
          <div className="text-sm space-y-0.5 min-w-[220px]">
            <div className="flex justify-between gap-6 text-slate-600">
              <span>Subtotal</span>
              <span className="font-mono tabular-nums">{money(calc.sub)}</span>
            </div>
            {calc.disc > 0 && (
              <div className="flex justify-between gap-6 text-amber-700">
                <span>Discount</span>
                <span className="font-mono tabular-nums">- {money(calc.disc)}</span>
              </div>
            )}
            {gstOn && (
              <div className="flex justify-between gap-6 text-slate-600">
                <span>GST ({gstRate}%{isInterState ? ' IGST' : ''})</span>
                <span className="font-mono tabular-nums">{money(calc.gst)}</span>
              </div>
            )}
            <div className="flex justify-between items-baseline gap-6 pt-1 border-t border-slate-300">
              <span className="font-extrabold text-slate-900">Total</span>
              <span className="text-2xl font-black font-mono tabular-nums text-[#1F7A63]">{money(calc.total)}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-11 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-200 rounded-lg cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => handleSave(false)}
              className="h-11 px-4 text-sm font-semibold bg-white border border-slate-300 hover:bg-slate-100 text-slate-800 rounded-lg cursor-pointer"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => handleSave(true)}
              className="h-11 px-5 bg-[#1F7A63] hover:bg-[#186351] text-white font-bold rounded-lg shadow-sm flex items-center gap-2 text-sm cursor-pointer"
            >
              <Receipt className="w-4 h-4" /> Save &amp; preview / print
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

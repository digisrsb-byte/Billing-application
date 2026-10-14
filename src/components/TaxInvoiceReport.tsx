import React, { useRef } from 'react';
import { Invoice, Client, CompanySettings } from '../types/billing';
import { calculateInvoice, formatDateDisplay, money, formatNumber } from '../utils/formatters';
import { numberToIndianWords } from '../utils/numberToWords';
import { BrandLogo } from './BrandLogo';
import { Printer, X, Download, Share2, Check, Copy } from 'lucide-react';

interface TaxInvoiceReportProps {
  invoice: Invoice;
  client?: Client;
  settings: CompanySettings;
  onClose?: () => void;
  onEdit?: (invoice: Invoice) => void;
  isModal?: boolean;
}

export const TaxInvoiceReport: React.FC<TaxInvoiceReportProps> = ({
  invoice,
  client,
  settings,
  onClose,
  onEdit,
  isModal = true
}) => {
  const calc = calculateInvoice(invoice, settings.rate);
  const [copied, setCopied] = React.useState(false);
  const printContainerRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    window.print();
  };

  const handleCopySummary = () => {
    const text = `TAX INVOICE: ${invoice.no}\nClient: ${client?.name || 'Customer'}\nDate: ${formatDateDisplay(invoice.date)}\nTotal: ${money(calc.total)}\nStatus: ${calc.st}\nSRK Enterprises | +91 6362595002`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Ensure table has at least 6 visual rows to replicate the physical invoice grid
  const items = invoice.items || [];
  const minRows = Math.max(6, items.length);
  const emptyRowsCount = Math.max(0, minRows - items.length);

  const cgstLabel = `CGST ${invoice.gstOn ? (calc.gstRate / 2).toFixed(1) : '0.5'}%`;
  const sgstLabel = `SGST ${invoice.gstOn ? (calc.gstRate / 2).toFixed(1) : '0.5'}%`;

  return (
    <div className={isModal ? 'fixed inset-0 z-50 overflow-y-auto bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 print:p-0 print:bg-white print:static' : 'w-full'}>
      {/* Actions Toolbar - Hidden in Print */}
      {isModal && (
        <div className="fixed top-4 right-4 sm:top-6 sm:right-6 flex items-center gap-2 print:hidden z-60">
          <button
            onClick={handleCopySummary}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-white/95 text-slate-800 shadow-md hover:bg-white transition-all cursor-pointer border border-slate-200"
            title="Copy text summary"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-slate-600" />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
          
          {onEdit && (
            <button
              onClick={() => onEdit(invoice)}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-white/95 text-slate-800 shadow-md hover:bg-white transition-all cursor-pointer border border-slate-200"
            >
              Edit
            </button>
          )}

          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-teal-700 text-white shadow-md hover:bg-teal-800 transition-all cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>Print / PDF</span>
          </button>

          {onClose && (
            <button
              onClick={onClose}
              className="p-2 rounded-lg bg-white/95 text-slate-700 shadow-md hover:bg-slate-100 transition-all cursor-pointer border border-slate-200"
              aria-label="Close modal"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {/* Actual Printable Invoice Document matching PDF layout */}
      <div
        ref={printContainerRef}
        id="tax-invoice-printable"
        className="w-full max-w-[820px] bg-white text-slate-900 rounded-sm shadow-2xl p-6 sm:p-10 my-auto text-[13px] leading-tight font-sans border border-slate-200 print:border-0 print:shadow-none print:p-0 print:m-0 print:max-w-none"
      >
        {/* Top Header Row: GSTIN and PAN */}
        <div className="flex justify-between items-center text-xs font-semibold text-slate-800 pb-3 border-b border-slate-200">
          <div>
            <span>GSTIN: </span>
            <span className="font-mono">{settings.gst || '29DLDPK4054H1Z0'}</span>
          </div>
          <div>
            <span>PAN: </span>
            <span className="font-mono">{settings.pan || 'DLDPK4054H'}</span>
          </div>
        </div>

        {/* Company Header: Logo & Address */}
        <div className="flex items-center gap-6 py-5 border-b border-slate-200">
          <div className="shrink-0 w-[240px] flex items-center justify-center">
            <BrandLogo size="invoice" customLogoUrl={settings.logoUrl} />
          </div>
          <div className="flex-1 min-w-0 border-l border-slate-200 pl-6">
            <h1 className="text-xl sm:text-2xl font-extrabold text-[#081C2D] tracking-tight m-0 leading-tight">
              {settings.name || 'SRK Enterprises'}
            </h1>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#1F7A63] mt-1 m-0">
              Pure Water · Reliable Supply
            </p>
            <p className="text-slate-600 text-xs sm:text-[12.5px] mt-2.5 leading-relaxed">
              {settings.addr || 'No.41, MM Lane, Gangarapete, Bangalore North, Bangalore, Bangalore Corporation Building S.O, Karnataka, India - 560002'}
            </p>
            <div className="text-slate-700 text-xs mt-2 font-medium flex flex-wrap gap-x-3 gap-y-1">
              <span>Phone: {settings.phone || '+91 6362595002'}</span>
              <span className="text-slate-300">|</span>
              <span>Email: {settings.email || 'srkenterprises.blr@gmail.com'}</span>
            </div>
          </div>
        </div>

        {/* TAX INVOICE Solid Teal Banner */}
        <div className="w-full bg-[#1F7A63] text-white py-2 text-center my-3 rounded-xs print:rounded-none">
          <h2 className="text-base sm:text-lg font-bold tracking-widest uppercase m-0">
            TAX INVOICE
          </h2>
        </div>

        {/* Client (To) and Invoice Meta Split Box */}
        <div className="grid grid-cols-1 sm:grid-cols-2 border border-slate-300 divide-y sm:divide-y-0 sm:divide-x divide-slate-300 my-3">
          {/* Bill To Box */}
          <div className="p-3 flex flex-col justify-between">
            <div>
              <div className="text-xs font-bold text-slate-900 mb-1">To</div>
              <div className="font-bold text-sm text-slate-900">
                {client?.name || '[Client name]'}
              </div>
              <div className="text-slate-600 text-xs mt-1 whitespace-pre-line leading-relaxed">
                {client?.addr || '[Client address]'}
              </div>
            </div>
            <div className="mt-3 pt-2 border-t border-slate-200 text-xs">
              <span className="text-slate-600 font-medium">GSTIN: </span>
              <span className="font-mono font-semibold text-slate-800">
                {client?.gst || invoice.cid ? (client?.gst || 'Unregistered') : '[Client GSTIN]'}
              </span>
              {client?.phone && (
                <div className="text-slate-600 mt-0.5">Phone: {client.phone}</div>
              )}
            </div>
          </div>

          {/* Invoice Meta Table */}
          <div className="divide-y divide-slate-200">
            <div className="grid grid-cols-2 p-1.5 px-3">
              <span className="font-bold text-slate-800 text-xs">Invoice No.</span>
              <span className="font-mono font-bold text-slate-900 text-xs">{invoice.no}</span>
            </div>
            <div className="grid grid-cols-2 p-1.5 px-3">
              <span className="font-bold text-slate-800 text-xs">Date</span>
              <span className="text-slate-800 text-xs">{formatDateDisplay(invoice.date)}</span>
            </div>
            <div className="grid grid-cols-2 p-1.5 px-3">
              <span className="font-bold text-slate-800 text-xs">PO No.</span>
              <span className="text-slate-800 text-xs">{invoice.poNo || '[enter]'}</span>
            </div>
            <div className="grid grid-cols-2 p-1.5 px-3">
              <span className="font-bold text-slate-800 text-xs">PO Date</span>
              <span className="text-slate-800 text-xs">{invoice.poDate ? formatDateDisplay(invoice.poDate) : '[enter]'}</span>
            </div>
            <div className="grid grid-cols-2 p-1.5 px-3">
              <span className="font-bold text-slate-800 text-xs">State</span>
              <span className="text-slate-800 text-xs">{invoice.state || client?.state || 'Karnataka (29)'}</span>
            </div>
            <div className="grid grid-cols-2 p-1.5 px-3">
              <span className="font-bold text-slate-800 text-xs">HSN Code</span>
              <span className="text-slate-800 text-xs">{invoice.hsnCode || settings.defaultHsn || '[enter]'}</span>
            </div>
          </div>
        </div>

        {/* Particulars / Items Table */}
        <div className="w-full border border-slate-300 mt-3 overflow-hidden">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="bg-[#1F7A63] text-white">
                <th className="py-2 px-3 text-center w-14 font-semibold border-r border-teal-600">Sl No</th>
                <th className="py-2 px-3 text-left font-semibold border-r border-teal-600">Particular</th>
                <th className="py-2 px-3 text-center w-20 font-semibold border-r border-teal-600">Qty</th>
                <th className="py-2 px-3 text-right w-28 font-semibold border-r border-teal-600">Rate (₹)</th>
                <th className="py-2 px-3 text-right w-28 font-semibold">Total (₹)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {items.map((it, idx) => (
                <tr key={it.id || idx} className="hover:bg-slate-50/50">
                  <td className="py-2 px-3 text-center font-mono text-slate-700 border-r border-slate-200">
                    {idx + 1}
                  </td>
                  <td className="py-2 px-3 text-slate-900 font-medium border-r border-slate-200">
                    {it.n}
                    {it.hsn && <span className="text-[11px] text-slate-500 ml-1.5">(HSN: {it.hsn})</span>}
                  </td>
                  <td className="py-2 px-3 text-center font-mono text-slate-800 border-r border-slate-200">
                    {it.q}
                  </td>
                  <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-800 border-r border-slate-200">
                    {formatNumber(it.r)}
                  </td>
                  <td className="py-2 px-3 text-right font-mono tabular-nums font-semibold text-slate-900">
                    {formatNumber((Number(it.q) || 0) * (Number(it.r) || 0))}
                  </td>
                </tr>
              ))}

              {/* Pad remaining rows to keep consistent invoice height */}
              {Array.from({ length: emptyRowsCount }).map((_, idx) => (
                <tr key={`empty-${idx}`} className="h-7">
                  <td className="border-r border-slate-200">&nbsp;</td>
                  <td className="border-r border-slate-200">&nbsp;</td>
                  <td className="border-r border-slate-200">&nbsp;</td>
                  <td className="border-r border-slate-200">&nbsp;</td>
                  <td>&nbsp;</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Summary & Bank Details Section */}
        <div className="grid grid-cols-1 sm:grid-cols-2 border border-slate-300 divide-y sm:divide-y-0 sm:divide-x divide-slate-300 mt-3">
          {/* Bank Details (Left) */}
          <div className="p-3 text-xs leading-relaxed flex flex-col justify-between">
            <div>
              <div className="font-bold text-[#1F7A63] mb-2 text-sm">Bank details</div>
              <div className="text-slate-700 space-y-1">
                <div>
                  <span className="font-semibold text-slate-800">Bank name: </span>
                  <span>{settings.bankName || '[enter]'}</span>
                </div>
                <div>
                  <span className="font-semibold text-slate-800">A/c no.: </span>
                  <span className="font-mono font-medium">{settings.accountNo || '[enter]'}</span>
                </div>
                <div>
                  <span className="font-semibold text-slate-800">IFSC: </span>
                  <span className="font-mono font-medium">{settings.ifsc || '[enter]'}</span>
                </div>
                {settings.branch && (
                  <div>
                    <span className="font-semibold text-slate-800">Branch: </span>
                    <span>{settings.branch}</span>
                  </div>
                )}
                {settings.upiId && (
                  <div>
                    <span className="font-semibold text-slate-800">UPI ID: </span>
                    <span className="font-mono">{settings.upiId}</span>
                  </div>
                )}
              </div>
            </div>

            {invoice.notes && (
              <div className="mt-3 pt-2 border-t border-slate-200 text-[11.5px] text-slate-500 italic">
                Note: {invoice.notes}
              </div>
            )}
          </div>

          {/* Tax Breakdown & Grand Total (Right) */}
          <div className="divide-y divide-slate-200 text-xs">
            <div className="flex justify-between items-center p-2 px-3">
              <span className="font-bold text-slate-800">Total</span>
              <span className="font-mono font-bold text-slate-900 tabular-nums">{formatNumber(calc.sub)}</span>
            </div>

            {calc.disc > 0 && (
              <div className="flex justify-between items-center p-2 px-3 text-amber-800">
                <span>Discount</span>
                <span className="font-mono tabular-nums">- {formatNumber(calc.disc)}</span>
              </div>
            )}

            {invoice.gstOn ? (
              calc.isInterState ? (
                <div className="flex justify-between items-center p-2 px-3">
                  <span className="text-slate-700">IGST {calc.gstRate}%</span>
                  <span className="font-mono tabular-nums text-slate-900">{formatNumber(calc.igst)}</span>
                </div>
              ) : (
                <>
                  <div className="flex justify-between items-center p-2 px-3">
                    <span className="text-slate-700">{cgstLabel}</span>
                    <span className="font-mono tabular-nums text-slate-900">{formatNumber(calc.cgst)}</span>
                  </div>
                  <div className="flex justify-between items-center p-2 px-3">
                    <span className="text-slate-700">{sgstLabel}</span>
                    <span className="font-mono tabular-nums text-slate-900">{formatNumber(calc.sgst)}</span>
                  </div>
                </>
              )
            ) : (
              <div className="flex justify-between items-center p-2 px-3 text-slate-500 italic">
                <span>GST (Tax Exempt / Non-GST)</span>
                <span className="font-mono">0.00</span>
              </div>
            )}

            {/* Highlighted Grand Total Bar */}
            <div className="flex justify-between items-center p-2.5 px-3 bg-[#1F7A63] text-white">
              <span className="font-bold text-sm">Grand total (₹)</span>
              <span className="font-mono font-bold text-base tabular-nums">{formatNumber(calc.total)}</span>
            </div>
          </div>
        </div>

        {/* Amount in words */}
        <div className="border border-slate-300 p-2.5 px-3 mt-3 bg-teal-50/40 text-xs">
          <div className="font-bold text-[#1F7A63] text-[11px] uppercase tracking-wider">
            Amount in words
          </div>
          <div className="text-slate-900 font-semibold mt-0.5 text-xs sm:text-[13px]">
            {numberToIndianWords(calc.total)}
          </div>
        </div>

        {/* Payment Received / Outstanding summary if recorded */}
        {calc.paid > 0 && (
          <div className="flex justify-between items-center text-xs text-slate-600 mt-2 px-1">
            <span>Payment Received: <b className="text-emerald-700 font-mono">{money(calc.paid)}</b> ({invoice.mode})</span>
            {calc.bal > 0 ? (
              <span>Balance Due: <b className="text-amber-700 font-mono">{money(calc.bal)}</b></span>
            ) : (
              <span className="text-emerald-700 font-bold">Status: Fully Paid</span>
            )}
          </div>
        )}

        {/* Signatures & Footer Note */}
        <div className="mt-8 flex justify-between items-end pt-4">
          <div className="text-center w-full">
            <div className="text-right pr-4">
              <div className="font-bold text-slate-900 text-xs">For {settings.name || 'SRK Enterprises'}</div>
              <div className="h-12 flex items-center justify-end">
                <span className="text-[11px] text-slate-400 italic font-mono">[Authorized Signatory]</span>
              </div>
              <div className="text-xs font-semibold text-slate-700 border-t border-slate-300 inline-block pt-1 pl-4">
                Digital Signature
              </div>
            </div>
            
            <div className="mt-8 text-center text-[11px] text-slate-400">
              This is a computer-generated tax invoice.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

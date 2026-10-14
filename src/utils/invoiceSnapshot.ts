import { Client, CompanySettings, InvoiceBuyerSnapshot, InvoiceSellerSnapshot } from '../types/billing';

/** Extract a 6-digit Indian PIN from free-text address when pin field is empty. */
export function extractPin(addr: string, pin?: string): string {
  if (pin && /^\d{6}$/.test(pin.trim())) return pin.trim();
  const m = (addr || '').match(/(?:^|\D)(\d{6})(?:\D|$)/);
  return m ? m[1] : '';
}

export function buildBuyerSnapshot(input: {
  name: string;
  phone: string;
  addr: string;
  gst: string;
  state: string;
  pin?: string;
}): InvoiceBuyerSnapshot {
  return {
    name: input.name.trim(),
    phone: input.phone.trim(),
    addr: input.addr.trim(),
    gst: input.gst.trim().toUpperCase(),
    state: input.state.trim(),
    pin: extractPin(input.addr, input.pin)
  };
}

export function buildBuyerSnapshotFromClient(client: Client, phoneOverride?: string): InvoiceBuyerSnapshot {
  return buildBuyerSnapshot({
    name: client.name,
    phone: phoneOverride ?? client.phone,
    addr: client.addr,
    gst: client.gst,
    state: client.state || 'Karnataka',
    pin: client.pin
  });
}

export function buildSellerSnapshot(settings: CompanySettings): InvoiceSellerSnapshot {
  return {
    name: settings.name,
    addr: settings.addr,
    phone: settings.phone,
    email: settings.email,
    gst: settings.gst,
    pan: settings.pan,
    state: settings.state,
    bankName: settings.bankName,
    accountNo: settings.accountNo,
    ifsc: settings.ifsc,
    branch: settings.branch,
    upiId: settings.upiId,
    logoUrl: settings.logoUrl || '',
    signatureUrl: settings.signatureUrl || ''
  };
}

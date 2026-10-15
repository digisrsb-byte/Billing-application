import { Client } from '../types/billing';

/**
 * Normalize a customer phone for uniqueness comparison.
 * - Strips non-digits
 * - Drops a leading country code 91 when the remainder is a 10-digit Indian mobile
 * - Drops a single leading 0 trunk prefix when the remainder is 10 digits
 *
 * Distinct from login auth.normalizePhone only in documenting customer-domain use;
 * digit rules are intentionally aligned so +91 / spacing variants match.
 * Blank / non-digit input → '' (not treated as a duplicate key).
 */
export function normalizeCustomerPhone(raw: string | null | undefined): string {
  let digits = String(raw ?? '').replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('0')) {
    digits = digits.slice(1);
  }
  digits = digits.replace(/^91(?=\d{10}$)/, '');
  return digits;
}

/**
 * Find another client that already owns this normalized phone.
 * Blank phones never conflict. excludeId skips the record being updated.
 */
export function findCustomerPhoneConflict(
  clients: Client[],
  phone: string | null | undefined,
  excludeId?: string | null
): Client | null {
  const norm = normalizeCustomerPhone(phone);
  if (!norm) return null;
  for (const c of clients) {
    if (excludeId && c.id === excludeId) continue;
    if (normalizeCustomerPhone(c.phone) === norm) return c;
  }
  return null;
}

export interface LegacyPhoneDuplicateGroup {
  normalized: string;
  clientIds: string[];
  names: string[];
}

/**
 * Report-only: groups of existing clients that share a normalized phone.
 * Does not rewrite records.
 */
export function listLegacyPhoneDuplicates(clients: Client[]): LegacyPhoneDuplicateGroup[] {
  const map = new Map<string, Client[]>();
  for (const c of clients) {
    const norm = normalizeCustomerPhone(c.phone);
    if (!norm) continue;
    const list = map.get(norm) || [];
    list.push(c);
    map.set(norm, list);
  }
  const out: LegacyPhoneDuplicateGroup[] = [];
  for (const [normalized, group] of map) {
    if (group.length < 2) continue;
    out.push({
      normalized,
      clientIds: group.map((c) => c.id),
      names: group.map((c) => c.name)
    });
  }
  return out;
}

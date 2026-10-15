import { AppDatabase, Invoice } from '../types/billing';
import { calculateInvoice, invoiceCustomerName, money } from '../utils/formatters';
import { kvGetItem, kvSetItem } from './kvStore';

export const NOTIFICATIONS_KEY = 'srk_billing_notifications_v1';

export type NotificationType = 'outstanding' | 'payment';

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
  invoiceId?: string;
  invoiceNo?: string;
}

interface NotificationStore {
  v: 1;
  items: AppNotification[];
}

/** Company label for the header — settings name, else SRK Enterprises. */
export function resolveCompanyDisplayName(settings?: { name?: string } | null): string {
  const n = settings?.name?.trim();
  return n || 'SRK Enterprises';
}

/** Avatar initials from company name (e.g. "SRK Enterprises" → "SE"). */
export function companyAvatarInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  }
  const one = parts[0] || 'S';
  return one.slice(0, 2).toUpperCase();
}

function emptyStore(): NotificationStore {
  return { v: 1, items: [] };
}

function readRaw(): string | null {
  try {
    return kvGetItem(NOTIFICATIONS_KEY);
  } catch {
    try {
      return localStorage.getItem(NOTIFICATIONS_KEY);
    } catch {
      return null;
    }
  }
}

async function writeRaw(raw: string): Promise<void> {
  try {
    await kvSetItem(NOTIFICATIONS_KEY, raw);
    return;
  } catch {
    try {
      localStorage.setItem(NOTIFICATIONS_KEY, raw);
    } catch {
      /* ignore persistence failure — in-memory sync still works for the session */
    }
  }
}

export function loadNotificationStore(): NotificationStore {
  try {
    const raw = readRaw();
    if (!raw) return emptyStore();
    const parsed = JSON.parse(raw) as NotificationStore;
    if (parsed?.v !== 1 || !Array.isArray(parsed.items)) return emptyStore();
    return {
      v: 1,
      items: parsed.items.filter(
        (n) =>
          n &&
          typeof n.id === 'string' &&
          (n.type === 'outstanding' || n.type === 'payment') &&
          typeof n.title === 'string'
      )
    };
  } catch {
    return emptyStore();
  }
}

export async function saveNotificationStore(store: NotificationStore): Promise<void> {
  await writeRaw(JSON.stringify({ v: 1, items: store.items }));
}

function outstandingId(invoiceId: string): string {
  return `outstanding:${invoiceId}`;
}

function paymentId(payId: string): string {
  return `payment:${payId}`;
}

/**
 * Merge DB-derived billing events into the notification list.
 * Deterministic IDs prevent duplicates. Read state is preserved across syncs/restarts.
 * Outstanding alerts are dropped when the invoice is settled or voided.
 */
export function mergeNotificationsFromDatabase(
  db: AppDatabase,
  previous: AppNotification[] = []
): AppNotification[] {
  const prevById = new Map(previous.map((n) => [n.id, n]));
  const nextById = new Map<string, AppNotification>();
  const rate = db.settings.rate;

  for (const inv of db.invoices) {
    if (inv.voided) continue;
    const calc = calculateInvoice(inv, rate);
    if (calc.bal <= 0.05) continue;

    const id = outstandingId(inv.id);
    const customer = invoiceCustomerName(inv, db.clients);
    const prev = prevById.get(id);
    nextById.set(id, {
      id,
      type: 'outstanding',
      title: `Outstanding · ${inv.no}`,
      body: `${customer} owes ${money(calc.bal)} (total ${money(calc.total)})`,
      createdAt: prev?.createdAt || inv.createdAt || inv.date || new Date().toISOString(),
      read: prev?.read ?? false,
      invoiceId: inv.id,
      invoiceNo: inv.no
    });
  }

  for (const inv of db.invoices) {
    for (const p of inv.pay || []) {
      if (!p?.id) continue;
      const id = paymentId(p.id);
      const prev = prevById.get(id);
      const customer = invoiceCustomerName(inv, db.clients);
      nextById.set(id, {
        id,
        type: 'payment',
        title: `Payment · ${inv.no}`,
        body: `${money(p.amt)} via ${p.mode} from ${customer}`,
        createdAt: prev?.createdAt || p.date || inv.createdAt || new Date().toISOString(),
        read: prev?.read ?? false,
        invoiceId: inv.id,
        invoiceNo: inv.no
      });
    }
  }

  return [...nextById.values()].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export function countUnread(items: AppNotification[]): number {
  return items.reduce((n, i) => n + (i.read ? 0 : 1), 0);
}

/** Load → merge with DB → persist. Returns the synced list. */
export async function syncNotificationsFromDatabase(db: AppDatabase): Promise<AppNotification[]> {
  const store = loadNotificationStore();
  const items = mergeNotificationsFromDatabase(db, store.items);
  await saveNotificationStore({ v: 1, items });
  return items;
}

export async function markNotificationRead(notificationId: string): Promise<AppNotification[]> {
  const store = loadNotificationStore();
  const items = store.items.map((n) => (n.id === notificationId ? { ...n, read: true } : n));
  await saveNotificationStore({ v: 1, items });
  return items;
}

export async function markAllNotificationsRead(): Promise<AppNotification[]> {
  const store = loadNotificationStore();
  const items = store.items.map((n) => ({ ...n, read: true }));
  await saveNotificationStore({ v: 1, items });
  return items;
}

/** Test helper: resolve invoice for a notification click. */
export function findInvoiceForNotification(
  db: AppDatabase,
  notification: Pick<AppNotification, 'invoiceId'>
): Invoice | null {
  if (!notification.invoiceId) return null;
  return db.invoices.find((i) => i.id === notification.invoiceId) || null;
}

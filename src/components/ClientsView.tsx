import React, { useMemo, useState } from 'react';
import { AppDatabase, Client, Invoice } from '../types/billing';
import { calculateInvoice, money, formatDateDisplay } from '../utils/formatters';
import { Plus, Users, FileText, Pencil, Trash2, X } from 'lucide-react';
import { Button, Card, PageHeader, SearchBox, SortTh, useSort, compare, ActionMenu, EmptyState, StatusBadge } from './ui';

interface ClientsViewProps {
  db: AppDatabase;
  onOpenAddClient: () => void;
  onEditClient: (client: Client) => void;
  onDeleteClient: (id: string, name: string) => void;
  onViewInvoice: (invoice: Invoice) => void;
}

type SortKey = 'name' | 'phone' | 'addr' | 'bal';

export const ClientsView: React.FC<ClientsViewProps> = ({
  db,
  onOpenAddClient,
  onEditClient,
  onDeleteClient,
  onViewInvoice
}) => {
  const [statementClient, setStatementClient] = useState<Client | null>(null);
  const [query, setQuery] = useState('');
  const sort = useSort<SortKey>('name');

  const stats = useMemo(() => {
    const map: Record<string, { bal: number; count: number }> = {};
    db.clients.forEach((c) => (map[c.id] = { bal: 0, count: 0 }));
    db.invoices.forEach((inv) => {
      const calc = calculateInvoice(inv, db.settings.rate);
      if (map[inv.cid]) {
        map[inv.cid].bal += Math.max(0, calc.bal);
        map[inv.cid].count += 1;
      }
    });
    return map;
  }, [db.clients, db.invoices, db.settings.rate]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return db.clients
      .filter((c) => !q || c.name.toLowerCase().includes(q) || c.phone.toLowerCase().includes(q) || c.addr.toLowerCase().includes(q))
      .slice()
      .sort((a, b) => {
        const get = (c: Client) =>
          sort.key === 'name' ? c.name : sort.key === 'phone' ? c.phone : sort.key === 'addr' ? c.addr : stats[c.id]?.bal || 0;
        return compare(get(a), get(b), sort.dir);
      });
  }, [db.clients, query, sort.key, sort.dir, stats]);

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      <PageHeader
        title="Customers"
        subtitle="Everyone you bill, with their contact details and outstanding balance."
        action={<Button icon={<Plus className="w-4 h-4" />} onClick={onOpenAddClient}>Add customer</Button>}
      />

      <Card className="overflow-hidden">
        <div className="p-4 border-b border-[#D5DBDF] flex items-center justify-between gap-3 flex-wrap">
          <SearchBox value={query} onChange={setQuery} placeholder="Search name, phone or address" />
          <span className="text-sm text-[#9AA3A8]">{rows.length} of {db.clients.length} customers</span>
        </div>

        {rows.length === 0 ? (
          <EmptyState
            icon={<Users className="w-6 h-6" />}
            title={query ? 'No matching customers' : 'No customers yet'}
            message={query ? 'Try a different search.' : 'Add your first customer to start creating invoices.'}
            action={!query && <Button icon={<Plus className="w-4 h-4" />} onClick={onOpenAddClient}>Add customer</Button>}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="bg-[#F5F7FA] border-b border-[#D5DBDF]">
                  <SortTh label="Name" active={sort.key === 'name'} dir={sort.dir} onClick={() => sort.toggle('name')} />
                  <SortTh label="Phone" active={sort.key === 'phone'} dir={sort.dir} onClick={() => sort.toggle('phone')} />
                  <SortTh label="Address" active={sort.key === 'addr'} dir={sort.dir} onClick={() => sort.toggle('addr')} />
                  <SortTh label="Balance due" align="right" active={sort.key === 'bal'} dir={sort.dir} onClick={() => sort.toggle('bal')} />
                  <th className="py-3 px-5 w-16" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[#D5DBDF]">
                {rows.map((c) => (
                  <tr key={c.id} className="hover:bg-[#F5F7FA]">
                    <td className="py-3.5 px-5">
                      <div className="font-semibold text-[#081C2D]">{c.name}</div>
                      <div className="text-xs text-[#9AA3A8]">{stats[c.id]?.count || 0} invoices{c.gst ? ` · ${c.gst}` : ''}</div>
                    </td>
                    <td className="py-3.5 px-5 text-[#081C2D] whitespace-nowrap">{c.phone || '—'}</td>
                    <td className="py-3.5 px-5 text-[#9AA3A8] max-w-xs truncate" title={c.addr}>{c.addr || '—'}</td>
                    <td className="py-3.5 px-5 text-right tabular-nums font-semibold text-[#081C2D]">
                      {stats[c.id]?.bal > 0 ? money(stats[c.id].bal) : <span className="text-[#9AA3A8] font-normal">Nil</span>}
                    </td>
                    <td className="py-2 px-3 text-right">
                      <ActionMenu
                        actions={[
                          { label: 'View statement', icon: <FileText className="w-4 h-4" />, onClick: () => setStatementClient(c) },
                          { label: 'Edit', icon: <Pencil className="w-4 h-4" />, onClick: () => onEditClient(c) },
                          { label: 'Delete', icon: <Trash2 className="w-4 h-4" />, onClick: () => onDeleteClient(c.id, c.name), danger: true }
                        ]}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {statementClient && (
        <div className="fixed inset-0 z-60 bg-[#081C2D]/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl border border-[#D5DBDF] max-h-[85vh] flex flex-col">
            <div className="px-6 py-4 border-b border-[#D5DBDF] flex justify-between items-center">
              <div>
                <h3 className="font-semibold text-[#081C2D] text-base m-0">Statement: {statementClient.name}</h3>
                <p className="text-xs text-[#9AA3A8] m-0 mt-0.5">Billing history and balances</p>
              </div>
              <button onClick={() => setStatementClient(null)} aria-label="Close" className="text-[#9AA3A8] hover:text-[#081C2D] cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-y-auto p-4 space-y-2 flex-1">
              {db.invoices.filter((i) => i.cid === statementClient.id).length === 0 && (
                <p className="text-sm text-[#9AA3A8] text-center py-8 m-0">No invoices for this customer yet.</p>
              )}
              {db.invoices
                .filter((i) => i.cid === statementClient.id)
                .slice()
                .reverse()
                .map((inv) => {
                  const calc = calculateInvoice(inv, db.settings.rate);
                  return (
                    <div
                      key={inv.id}
                      onClick={() => {
                        setStatementClient(null);
                        onViewInvoice(inv);
                      }}
                      className="p-3 rounded-xl border border-[#D5DBDF] hover:border-[#1F7A63] hover:bg-[#F5F7FA] cursor-pointer flex justify-between items-center"
                    >
                      <div>
                        <div className="font-mono font-semibold text-[#1F7A63] text-sm">{inv.no}</div>
                        <div className="text-xs text-[#9AA3A8]">{formatDateDisplay(inv.date)}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold text-[#081C2D] text-sm tabular-nums">{money(calc.total)}</div>
                        <div className="mt-1"><StatusBadge status={calc.st} /></div>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

import React, { useMemo, useState } from 'react';
import { AppDatabase, BoxConfig, CompanySettings } from '../types/billing';
import { money } from '../utils/formatters';
import { Package, Plus, Pencil, Trash2, X } from 'lucide-react';
import { Button, Card, PageHeader, SearchBox, SortTh, useSort, compare, ActionMenu, EmptyState, Field, inputCls } from './ui';
import { ConfirmModal } from './ConfirmModal';

interface ProductsViewProps {
  db: AppDatabase;
  onUpdateSettings: (s: CompanySettings) => void;
  showToast: (msg: string) => void;
}

type SortKey = 'n' | 'pack' | 'qty' | 'p';

export const ProductsView: React.FC<ProductsViewProps> = ({ db, onUpdateSettings, showToast }) => {
  const [query, setQuery] = useState('');
  const sort = useSort<SortKey>('n');
  const [editing, setEditing] = useState<BoxConfig | 'new' | null>(null);
  const [toDelete, setToDelete] = useState<BoxConfig | null>(null);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return db.settings.boxes
      .filter((b) => !q || b.n.toLowerCase().includes(q) || (b.pack || '').toLowerCase().includes(q))
      .slice()
      .sort((a, b) => {
        const get = (x: BoxConfig) => (sort.key === 'n' ? x.n : sort.key === 'pack' ? x.pack || '' : sort.key === 'qty' ? x.qty ?? 0 : x.p);
        return compare(get(a), get(b), sort.dir);
      });
  }, [db.settings.boxes, query, sort.key, sort.dir]);

  const save = (box: BoxConfig) => {
    const exists = db.settings.boxes.some((b) => b.id === box.id);
    const boxes = exists ? db.settings.boxes.map((b) => (b.id === box.id ? box : b)) : [...db.settings.boxes, box];
    onUpdateSettings({ ...db.settings, boxes });
    showToast(`Product "${box.n}" ${exists ? 'updated' : 'added'}`);
    setEditing(null);
  };

  const remove = () => {
    if (!toDelete) return;
    onUpdateSettings({ ...db.settings, boxes: db.settings.boxes.filter((b) => b.id !== toDelete.id) });
    showToast(`Product "${toDelete.n}" deleted`);
    setToDelete(null);
  };

  const tryDelete = (b: BoxConfig) => {
    if (db.settings.boxes.length <= 1) return showToast('At least one product is required');
    setToDelete(b);
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      <PageHeader
        title="Products"
        subtitle="Add or edit items and prices here only. Billing uses these rates automatically."
        action={<Button icon={<Plus className="w-4 h-4" />} onClick={() => setEditing('new')}>Add product</Button>}
      />

      <Card className="overflow-hidden">
        <div className="p-4 border-b border-[#D5DBDF] flex items-center justify-between gap-3 flex-wrap">
          <SearchBox value={query} onChange={setQuery} placeholder="Search products or pack size" />
          <span className="text-sm text-[#9AA3A8]">{rows.length} of {db.settings.boxes.length} products</span>
        </div>

        {rows.length === 0 ? (
          <EmptyState
            icon={<Package className="w-6 h-6" />}
            title={query ? 'No matching products' : 'No products yet'}
            message={query ? 'Try a different name or clear the search.' : 'Add your first product to start billing.'}
            action={!query && <Button icon={<Plus className="w-4 h-4" />} onClick={() => setEditing('new')}>Add product</Button>}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="bg-[#F5F7FA] border-b border-[#D5DBDF]">
                  <SortTh label="Product name" active={sort.key === 'n'} dir={sort.dir} onClick={() => sort.toggle('n')} />
                  <SortTh label="Pack size" active={sort.key === 'pack'} dir={sort.dir} onClick={() => sort.toggle('pack')} />
                  <SortTh label="Quantity" align="right" active={sort.key === 'qty'} dir={sort.dir} onClick={() => sort.toggle('qty')} />
                  <SortTh label="Price" align="right" active={sort.key === 'p'} dir={sort.dir} onClick={() => sort.toggle('p')} />
                  <th className="py-3 px-5 w-16" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[#D5DBDF]">
                {rows.map((b) => (
                  <tr key={b.id} className="hover:bg-[#F5F7FA]">
                    <td className="py-3.5 px-5 font-semibold text-[#081C2D]">{b.n}</td>
                    <td className="py-3.5 px-5 text-[#9AA3A8]">{b.pack || '—'}</td>
                    <td className="py-3.5 px-5 text-right tabular-nums text-[#081C2D]">{b.qty ?? '—'}</td>
                    <td className="py-3.5 px-5 text-right tabular-nums font-semibold text-[#081C2D]">{money(b.p)}</td>
                    <td className="py-2 px-3 text-right">
                      <ActionMenu
                        actions={[
                          { label: 'Edit', icon: <Pencil className="w-4 h-4" />, onClick: () => setEditing(b) },
                          { label: 'Delete', icon: <Trash2 className="w-4 h-4" />, onClick: () => tryDelete(b), danger: true }
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

      {editing && (
        <ProductForm
          initial={editing === 'new' ? null : editing}
          defaultHsn={db.settings.defaultHsn}
          onClose={() => setEditing(null)}
          onSave={save}
        />
      )}

      <ConfirmModal
        isOpen={!!toDelete}
        title={`Delete "${toDelete?.n}"?`}
        message="This removes the product from the list. Existing invoices are not affected."
        confirmLabel="Delete product"
        onConfirm={remove}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
};

const ProductForm: React.FC<{
  initial: BoxConfig | null;
  defaultHsn: string;
  onClose: () => void;
  onSave: (b: BoxConfig) => void;
}> = ({ initial, defaultHsn, onClose, onSave }) => {
  const [n, setN] = useState(initial?.n || '');
  const [pack, setPack] = useState(initial?.pack || '');
  const [qty, setQty] = useState(initial?.qty !== undefined ? String(initial.qty) : '');
  const [price, setPrice] = useState(initial ? String(initial.p) : '');
  const [hsn, setHsn] = useState(initial?.hsn || defaultHsn || '');
  const [tried, setTried] = useState(false);

  const errors = {
    n: !n.trim() ? 'Enter a product name' : '',
    price: price.trim() === '' || Number(price) < 0 || isNaN(Number(price)) ? 'Enter a valid price' : '',
    qty: qty.trim() !== '' && (isNaN(Number(qty)) || Number(qty) < 0) ? 'Quantity must be 0 or more' : ''
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (errors.n || errors.price || errors.qty) return;
    onSave({
      id: initial?.id || 'b' + Date.now().toString(36),
      n: n.trim(),
      pack: pack.trim() || undefined,
      qty: qty.trim() === '' ? undefined : Math.floor(Number(qty)),
      p: Number(price),
      hsn: hsn.trim() || undefined
    });
  };

  return (
    <div className="fixed inset-0 z-60 bg-[#081C2D]/50 flex items-center justify-center p-4">
      <form onSubmit={submit} className="bg-white rounded-2xl w-full max-w-md border border-[#D5DBDF] shadow-xl">
        <div className="px-6 py-4 border-b border-[#D5DBDF] flex items-center justify-between">
          <h3 className="m-0 text-base font-semibold text-[#081C2D]">{initial ? 'Edit product' : 'Add product'}</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="text-[#9AA3A8] hover:text-[#081C2D] cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <Field label="Product name *" error={tried ? errors.n : ''}>
            <input autoFocus value={n} onChange={(e) => setN(e.target.value)} placeholder="e.g. 20 Litre Can" className={inputCls} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Pack size">
              <input value={pack} onChange={(e) => setPack(e.target.value)} placeholder="e.g. 20 Litre" className={inputCls} />
            </Field>
            <Field label="Quantity in stock" error={tried ? errors.qty : ''}>
              <input type="number" min="0" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="0" className={inputCls} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Price (₹) *" error={tried ? errors.price : ''}>
              <input type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.00" className={inputCls} />
            </Field>
            <Field label="HSN code">
              <input value={hsn} onChange={(e) => setHsn(e.target.value)} className={inputCls} />
            </Field>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-[#D5DBDF] flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit">{initial ? 'Save changes' : 'Add product'}</Button>
        </div>
      </form>
    </div>
  );
};

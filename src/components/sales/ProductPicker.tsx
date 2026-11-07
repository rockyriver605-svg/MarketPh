import { useMemo, useState } from 'react';
import { Plus, Search, PencilLine, Package } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { formatCurrency } from '@/lib/utils';
import {
  type CalcLine,
  type CatalogProduct,
  parsePesoInput,
  parseQuantityInput,
} from '@/lib/salesCalculator';

interface ProductPickerProps {
  products: CatalogProduct[];
  onAddLine: (line: CalcLine) => void;
}

export function ProductPicker({ products, onAddLine }: ProductPickerProps) {
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [variantId, setVariantId] = useState<string>('');
  const [quantityText, setQuantityText] = useState('1');
  const [error, setError] = useState<string | null>(null);
  const [customName, setCustomName] = useState('');
  const [customPriceText, setCustomPriceText] = useState('');
  const [customQuantityText, setCustomQuantityText] = useState('1');
  const [customError, setCustomError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return products;
    return products.filter((p) => p.title.toLowerCase().includes(term));
  }, [products, search]);

  const selected = products.find((p) => p.id === selectedId) ?? null;
  const selectedVariant = selected?.variants.find((v) => v.id === variantId) ?? null;
  const unitCentavos = selectedVariant?.unitCentavos ?? selected?.unitCentavos ?? 0;
  const availableStock = selectedVariant?.stock ?? selected?.stock ?? 0;

  const selectProduct = (id: string) => {
    setSelectedId(id);
    setError(null);
    const product = products.find((p) => p.id === id);
    setVariantId(product?.variants.length === 1 ? product.variants[0].id : '');
    setQuantityText('1');
  };

  const addCatalogItem = () => {
    if (!selected) return setError('Choose a product first.');
    if (selected.variants.length > 0 && !selectedVariant) return setError('Choose a variation.');
    const quantity = parseQuantityInput(quantityText);
    if (quantity === null) return setError('Quantity must be a whole number of at least 1.');
    if (availableStock <= 0) return setError('This item is out of stock.');
    if (quantity > availableStock) return setError(`Only ${availableStock} in stock.`);
    setError(null);
    onAddLine({
      id: crypto.randomUUID(),
      source: 'catalog',
      title: selected.title,
      variantLabel: selectedVariant?.label ?? null,
      unitCentavos,
      quantity,
      maxQuantity: availableStock,
      discount: null,
    });
    setQuantityText('1');
  };

  const addCustomItem = () => {
    const name = customName.trim();
    if (!name) return setCustomError('Enter a name for the item.');
    const priceCentavos = parsePesoInput(customPriceText);
    if (priceCentavos === null || priceCentavos <= 0) return setCustomError('Enter a price greater than zero.');
    const quantity = parseQuantityInput(customQuantityText);
    if (quantity === null) return setCustomError('Quantity must be a whole number of at least 1.');
    setCustomError(null);
    onAddLine({
      id: crypto.randomUUID(),
      source: 'custom',
      title: name,
      variantLabel: null,
      unitCentavos: priceCentavos,
      quantity,
      maxQuantity: null,
      discount: null,
    });
    setCustomName('');
    setCustomPriceText('');
    setCustomQuantityText('1');
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-brand-100 p-4 sm:p-5 space-y-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search your products..."
            className="w-full h-11 pl-10 pr-4 rounded-xl border border-brand-200 bg-white text-sm text-brand-900 placeholder:text-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
          />
        </div>

        {filtered.length === 0 ? (
          <p className="text-sm text-brand-500 py-4 text-center">No products match your search.</p>
        ) : (
          <ul className="max-h-64 overflow-y-auto divide-y divide-brand-50 rounded-lg border border-brand-100">
            {filtered.map((p) => (
              <li key={p.id}>
                <button
                  onClick={() => selectProduct(p.id)}
                  className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left text-sm transition-colors ${
                    p.id === selectedId ? 'bg-brand-50' : 'hover:bg-cream-50'
                  }`}
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <Package className="h-4 w-4 text-brand-400 shrink-0" />
                    <span className="truncate font-medium text-brand-900">{p.title}</span>
                  </span>
                  <span className="text-xs text-brand-500 shrink-0">
                    {formatCurrency(p.unitCentavos / 100)} · {p.variants.length > 0 ? `${p.variants.length} variations` : `${p.stock} in stock`}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {selected && (
          <div className="rounded-xl bg-cream-50 border border-brand-100 p-4 space-y-3">
            <p className="text-sm font-semibold text-brand-900">{selected.title}</p>
            {selected.variants.length > 0 && (
              <div>
                <label className="block text-xs font-medium text-brand-600 mb-1">Variation</label>
                <select
                  value={variantId}
                  onChange={(e) => { setVariantId(e.target.value); setError(null); }}
                  className="w-full h-10 px-3 rounded-lg border border-brand-200 bg-white text-sm text-brand-900"
                >
                  <option value="">Choose a variation</option>
                  {selected.variants.map((v) => (
                    <option key={v.id} value={v.id} disabled={v.stock <= 0}>
                      {v.label} · {formatCurrency(v.unitCentavos / 100)}{v.stock <= 0 ? ' (out of stock)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="flex flex-col sm:flex-row sm:items-end gap-3">
              <div className="flex-1">
                <label className="block text-xs font-medium text-brand-600 mb-1">Quantity</label>
                <input
                  inputMode="numeric"
                  value={quantityText}
                  onChange={(e) => setQuantityText(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg border border-brand-200 bg-white text-sm text-brand-900"
                />
              </div>
              <Button onClick={addCatalogItem} disabled={selected.variants.length > 0 && !selectedVariant}>
                <Plus className="h-4 w-4" /> Add to calculation
              </Button>
            </div>
            <p className="text-xs text-brand-500">
              Price {formatCurrency(unitCentavos / 100)} · {availableStock} in stock
            </p>
            {error && <p className="text-xs text-red-600">{error}</p>}
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-dashed border-brand-200 p-4 sm:p-5 space-y-3">
        <div className="flex items-center gap-2">
          <PencilLine className="h-4 w-4 text-brand-500" />
          <p className="text-sm font-semibold text-brand-900">Manual item</p>
        </div>
        <p className="text-xs text-brand-500">
          Manual items are only used in this calculation. They are not added to your product catalog.
        </p>
        <div className="grid sm:grid-cols-3 gap-3">
          <input
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
            placeholder="Item name"
            aria-label="Manual item name"
            className="h-10 px-3 rounded-lg border border-brand-200 bg-white text-sm text-brand-900 placeholder:text-brand-400"
          />
          <input
            inputMode="decimal"
            value={customPriceText}
            onChange={(e) => setCustomPriceText(e.target.value)}
            placeholder="Price (₱)"
            aria-label="Manual item price"
            className="h-10 px-3 rounded-lg border border-brand-200 bg-white text-sm text-brand-900 placeholder:text-brand-400"
          />
          <input
            inputMode="numeric"
            value={customQuantityText}
            onChange={(e) => setCustomQuantityText(e.target.value)}
            placeholder="Qty"
            aria-label="Manual item quantity"
            className="h-10 px-3 rounded-lg border border-brand-200 bg-white text-sm text-brand-900 placeholder:text-brand-400"
          />
        </div>
        <div className="flex items-center justify-between gap-3">
          {customError ? <p className="text-xs text-red-600">{customError}</p> : <span />}
          <Button variant="secondary" onClick={addCustomItem}>Add manual item</Button>
        </div>
      </div>
    </div>
  );
}

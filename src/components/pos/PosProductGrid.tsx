import { useMemo, useState } from 'react';
import { Package, Plus, Search } from 'lucide-react';
import type { SellerCatalogItem } from '@/lib/sellerCatalog';
import { formatCurrency } from '@/lib/utils';
import { Button } from '@/components/ui/Button';

const ALL_CATEGORIES = 'all';

interface PosProductGridProps {
  products: SellerCatalogItem[];
  onAdd: (product: SellerCatalogItem, variantId: string | null) => void;
}

export function PosProductGrid({ products, onAdd }: PosProductGridProps) {
  const [query, setQuery] = useState('');
  const [categoryId, setCategoryId] = useState(ALL_CATEGORIES);
  const [variantChoice, setVariantChoice] = useState<Record<string, string>>({});

  const categories = useMemo(() => {
    const map = new Map<string, string>();
    products.forEach((p) => {
      if (p.categoryId && p.categoryName) map.set(p.categoryId, p.categoryName);
    });
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [products]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter(
      (p) => (categoryId === ALL_CATEGORIES || p.categoryId === categoryId) && (!q || p.title.toLowerCase().includes(q)),
    );
  }, [products, query, categoryId]);

  return (
    <section className="space-y-4 min-w-0">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-brand-400" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search your products"
          className="w-full h-11 pl-9 pr-3 rounded-lg border border-brand-200 bg-white text-sm text-brand-900 placeholder:text-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>

      {categories.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {[[ALL_CATEGORIES, 'All'] as const, ...categories].map(([id, name]) => (
            <button
              key={id}
              type="button"
              onClick={() => setCategoryId(id)}
              className={`shrink-0 h-8 px-3 rounded-full text-xs font-medium transition-colors ${
                categoryId === id ? 'bg-brand-600 text-white' : 'bg-white border border-brand-200 text-brand-700 hover:bg-brand-50'
              }`}
            >
              {name}
            </button>
          ))}
        </div>
      )}

      {visible.length === 0 ? (
        <p className="text-sm text-brand-500 bg-white rounded-xl border border-brand-100 p-6 text-center">
          No products match your search.
        </p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
          {visible.map((product) => {
            const variant = product.variants.length > 0
              ? product.variants.find((v) => v.id === (variantChoice[product.id] ?? '')) ?? product.variants.find((v) => v.stock > 0) ?? product.variants[0]
              : undefined;
            const stock = variant ? variant.stock : product.stock;
            const unitCentavos = variant ? variant.unitCentavos : product.unitCentavos;
            const canAdd = stock > 0 && (product.variants.length === 0 || variant !== undefined);

            return (
              <article key={product.id} className="bg-white rounded-xl border border-brand-100 overflow-hidden flex flex-col">
                <div className="aspect-square bg-brand-50 flex items-center justify-center overflow-hidden">
                  {product.imageUrl ? (
                    <img src={product.imageUrl} alt={product.title} loading="lazy" className="h-full w-full object-cover" />
                  ) : (
                    <Package className="h-8 w-8 text-brand-300" />
                  )}
                </div>
                <div className="p-3 flex flex-col gap-2 flex-1">
                  <h3 className="text-sm font-semibold text-brand-900 line-clamp-2">{product.title}</h3>
                  <p className="text-sm font-bold text-brand-700">{formatCurrency(unitCentavos / 100)}</p>
                  <p className={`text-xs ${stock > 0 ? 'text-brand-500' : 'text-red-600'}`}>
                    {stock > 0 ? `${stock} in stock` : 'Out of stock'}
                  </p>
                  {product.variants.length > 0 && (
                    <select
                      aria-label={`Variation for ${product.title}`}
                      value={variant?.id ?? ''}
                      onChange={(e) => setVariantChoice((prev) => ({ ...prev, [product.id]: e.target.value }))}
                      className="h-9 rounded-lg border border-brand-200 bg-white px-2 text-xs text-brand-900"
                    >
                      {product.variants.map((v) => (
                        <option key={v.id} value={v.id} disabled={v.stock <= 0}>
                          {v.label}{v.stock > 0 ? '' : ' (out of stock)'}
                        </option>
                      ))}
                    </select>
                  )}
                  <Button
                    size="sm"
                    className="mt-auto w-full"
                    disabled={!canAdd}
                    onClick={() => onAdd(product, variant?.id ?? null)}
                  >
                    <Plus className="h-4 w-4" /> Add
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Calculator, LogIn, RotateCcw, Trash2, Package } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { navigate } from '@/lib/router';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatCurrency } from '@/lib/utils';
import {
  type CalcLine,
  type CatalogProduct,
  type Discount,
  computeSalesTotals,
  parsePesoInput,
  toCentavos,
} from '@/lib/salesCalculator';
import { ProductPicker } from '@/components/sales/ProductPicker';
import { CalculationRows } from '@/components/sales/CalculationRows';
import { DiscountEditor } from '@/components/sales/DiscountEditor';

interface VariantRow {
  id: string;
  name: string;
  value: string;
  price_override: number | string | null;
  stock: number;
}

interface ProductRow {
  id: string;
  title: string;
  price: number | string;
  sale_price: number | string | null;
  stock: number;
  product_variants: VariantRow[] | null;
}

type LoadState =
  | { status: 'loading' }
  | { status: 'signed-out' }
  | { status: 'no-seller' }
  | { status: 'error'; message: string }
  | { status: 'ready'; products: CatalogProduct[] };

function toCatalogProduct(row: ProductRow): CatalogProduct {
  const baseCentavos = toCentavos(Number(row.sale_price ?? row.price));
  const variants = (row.product_variants ?? []).map((v) => ({
    id: v.id,
    label: `${v.name}: ${v.value}`,
    unitCentavos: v.price_override != null ? toCentavos(Number(v.price_override)) : baseCentavos,
    stock: v.stock,
  }));
  return {
    id: row.id,
    title: row.title,
    unitCentavos: baseCentavos,
    stock: row.stock,
    variants,
  };
}

export function SalesCalculatorPage() {
  const { user } = useAuth();
  const [load, setLoad] = useState<LoadState>({ status: 'loading' });
  const [lines, setLines] = useState<CalcLine[]>([]);
  const [transactionDiscount, setTransactionDiscount] = useState<Discount | null>(null);
  const [chargesText, setChargesText] = useState('');

  const loadCatalog = useCallback(async () => {
    if (!user) {
      setLoad({ status: 'signed-out' });
      return;
    }
    setLoad({ status: 'loading' });
    const { data: sp, error: spError } = await supabase
      .from('seller_profiles')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();
    if (spError) {
      setLoad({ status: 'error', message: 'Your seller account could not be loaded. Please try again.' });
      return;
    }
    if (!sp) {
      setLoad({ status: 'no-seller' });
      return;
    }
    const { data, error } = await supabase
      .from('products')
      .select('id, title, price, sale_price, stock, product_variants(id, name, value, price_override, stock)')
      .eq('seller_id', sp.id)
      .eq('status', 'published')
      .order('title');
    if (error || !Array.isArray(data)) {
      setLoad({ status: 'error', message: 'Your products could not be loaded. Please try again.' });
      return;
    }
    setLoad({ status: 'ready', products: (data as ProductRow[]).map(toCatalogProduct) });
  }, [user]);

  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  const chargesCentavos = parsePesoInput(chargesText) ?? 0;
  const chargesInvalid = chargesText.trim() !== '' && parsePesoInput(chargesText) === null;

  const totals = useMemo(
    () => computeSalesTotals(lines, transactionDiscount, chargesCentavos),
    [lines, transactionDiscount, chargesCentavos],
  );

  const addLine = (line: CalcLine) => setLines((prev) => [...prev, line]);

  const changeQuantity = (id: string, quantity: number) => {
    setLines((prev) =>
      prev.map((line) => {
        if (line.id !== id) return line;
        if (quantity < 1) return line;
        if (line.maxQuantity !== null && quantity > line.maxQuantity) return line;
        return { ...line, quantity };
      }),
    );
  };

  const removeLine = (id: string) => setLines((prev) => prev.filter((line) => line.id !== id));

  const setLineDiscount = (id: string, discount: Discount | null) => {
    setLines((prev) => prev.map((line) => (line.id === id ? { ...line, discount } : line)));
  };

  const clearCalculation = () => setLines([]);

  const resetCalculator = () => {
    setLines([]);
    setTransactionDiscount(null);
    setChargesText('');
  };

  const hasLines = lines.length > 0;

  return (
    <div className="container-app py-8 animate-fade-in">
      <button
        onClick={() => navigate('/seller/tools')}
        className="flex items-center gap-1 text-sm text-brand-600 hover:text-brand-800 mb-4 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Business Tools
      </button>

      <div className="flex items-center gap-3 mb-2">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600 text-white">
          <Calculator className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-brand-900">Smart Sales Calculator</h1>
          <p className="text-sm text-brand-500">Estimate totals. Nothing is recorded as a sale.</p>
        </div>
      </div>

      {load.status === 'loading' && (
        <div className="bg-white rounded-xl border border-brand-100 p-8 text-center text-sm text-brand-500 mt-6">
          Loading your products...
        </div>
      )}

      {load.status === 'signed-out' && (
        <EmptyState
          icon={<LogIn className="h-8 w-8" />}
          title="Sign in to use the calculator"
          description="The calculator uses your seller catalog, so you need to sign in with your seller account first."
          action={<Button onClick={() => navigate('/signin')}>Sign In</Button>}
        />
      )}

      {load.status === 'no-seller' && (
        <EmptyState
          icon={<Package className="h-8 w-8" />}
          title="No seller store yet"
          description="Set up your store and add products to your catalog before using catalog items in the calculator. You can still enter manual items after that."
          action={<Button onClick={() => navigate('/seller/setup')}>Set Up Your Store</Button>}
        />
      )}

      {load.status === 'error' && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-5 mt-6 flex flex-col sm:flex-row sm:items-center gap-3">
          <p className="text-sm text-red-700 flex-1">{load.message}</p>
          <Button variant="outline" size="sm" onClick={loadCatalog}>Try again</Button>
        </div>
      )}

      {load.status === 'ready' && (
        <div className="grid lg:grid-cols-[1fr_360px] gap-6 mt-6 items-start">
          <div className="space-y-6 min-w-0">
            {load.products.length === 0 && (
              <EmptyState
                icon={<Package className="h-8 w-8" />}
                title="No published products yet"
                description="Products must be added and published in your catalog before they can be selected here. You can still enter manual items below."
              />
            )}
            <ProductPicker products={load.products} onAddLine={addLine} />

            <section className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-base font-semibold text-brand-900">Calculation items</h2>
                {hasLines && (
                  <Button variant="ghost" size="sm" onClick={clearCalculation}>
                    <Trash2 className="h-4 w-4" /> Clear items
                  </Button>
                )}
              </div>
              {hasLines ? (
                <CalculationRows
                  lines={lines}
                  lineTotals={totals.lines}
                  onQuantityChange={changeQuantity}
                  onRemove={removeLine}
                  onDiscountChange={setLineDiscount}
                />
              ) : (
                <p className="text-sm text-brand-500 bg-white rounded-xl border border-brand-100 p-6 text-center">
                  No items yet. Add a product or a manual item to start a calculation.
                </p>
              )}
            </section>
          </div>

          <aside className="bg-white rounded-xl border border-brand-100 p-5 space-y-5 lg:sticky lg:top-24">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-brand-900">Summary</h2>
              <span className="text-xs text-brand-500">{totals.totalQuantity} item{totals.totalQuantity === 1 ? '' : 's'}</span>
            </div>

            <dl className="space-y-2 text-sm">
              <SummaryRow label="Subtotal" value={formatCurrency(totals.subtotal / 100)} />
              <SummaryRow label="Item discounts" value={`-${formatCurrency(totals.itemDiscounts / 100)}`} muted={totals.itemDiscounts === 0} />
              <SummaryRow label="Whole-sale discount" value={`-${formatCurrency(totals.transactionDiscount / 100)}`} muted={totals.transactionDiscount === 0} />
              <SummaryRow label="Additional charges" value={`+${formatCurrency(totals.charges / 100)}`} muted={totals.charges === 0} />
            </dl>

            <div className="border-t border-brand-100 pt-4 flex items-end justify-between">
              <span className="text-sm font-semibold text-brand-700">Final payable (estimate)</span>
              <span className="text-2xl font-bold text-brand-900">{formatCurrency(totals.finalTotal / 100)}</span>
            </div>

            <div className="space-y-3 border-t border-brand-100 pt-4">
              <DiscountEditor
                label="Whole-sale discount"
                baseCentavos={totals.afterItemDiscounts}
                value={transactionDiscount}
                onChange={setTransactionDiscount}
              />
              <div className="space-y-1">
                <label htmlFor="charges-input" className="text-xs font-semibold text-brand-700">Additional charges (₱)</label>
                <input
                  id="charges-input"
                  inputMode="decimal"
                  value={chargesText}
                  onChange={(e) => setChargesText(e.target.value)}
                  placeholder="e.g. 50 for delivery"
                  className="w-full h-10 px-3 rounded-lg border border-brand-200 bg-white text-sm text-brand-900 placeholder:text-brand-400"
                />
                {chargesInvalid && <p className="text-xs text-red-600">Enter an amount in pesos such as 50 or 99.50.</p>}
              </div>
            </div>

            <div className="flex gap-2 border-t border-brand-100 pt-4">
              <Button variant="outline" className="flex-1" onClick={clearCalculation} disabled={!hasLines}>
                Clear items
              </Button>
              <Button variant="ghost" className="flex-1" onClick={resetCalculator}>
                <RotateCcw className="h-4 w-4" /> Reset all
              </Button>
            </div>

            <p className="text-xs text-brand-500">
              This is an estimate only. It is not saved as a sale and does not change your stock.
            </p>
          </aside>
        </div>
      )}
    </div>
  );
}

function SummaryRow({ label, value, muted = false }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className={muted ? 'text-brand-400' : 'text-brand-600'}>{label}</dt>
      <dd className={`font-medium ${muted ? 'text-brand-400' : 'text-brand-900'}`}>{value}</dd>
    </div>
  );
}

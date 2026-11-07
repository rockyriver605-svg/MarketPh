import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, LogIn, Package, RotateCcw, ShoppingCart, Store } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { navigate } from '@/lib/router';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { formatCurrency } from '@/lib/utils';
import {
  type CalcLine,
  type Discount,
  computeSalesTotals,
  parsePesoInput,
} from '@/lib/salesCalculator';
import { type SellerCatalogItem, type SellerCatalogResult, loadSellerCatalog } from '@/lib/sellerCatalog';
import { type SalePayload, isSalePayload, toRpcDiscount } from '@/lib/posSale';
import { CalculationRows } from '@/components/sales/CalculationRows';
import { DiscountEditor } from '@/components/sales/DiscountEditor';
import { PosProductGrid } from '@/components/pos/PosProductGrid';
import { SaleReceipt } from '@/components/pos/SaleReceipt';

interface PosLine extends CalcLine {
  productId: string;
  variantId: string | null;
}

type LoadState = { kind: 'loading' } | { kind: 'signed-out' } | SellerCatalogResult;

interface SaleAttempt {
  reference: string;
  signature: string;
}

export function PosPage() {
  const { user } = useAuth();
  const [load, setLoad] = useState<LoadState>({ kind: 'loading' });
  const [cart, setCart] = useState<PosLine[]>([]);
  const [discount, setDiscount] = useState<Discount | null>(null);
  const [cashText, setCashText] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [saleError, setSaleError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<SalePayload | null>(null);
  const [attempt, setAttempt] = useState<SaleAttempt | null>(null);

  const refresh = useCallback(async () => {
    if (!user) {
      setLoad({ kind: 'signed-out' });
      return;
    }
    setLoad({ kind: 'loading' });
    setLoad(await loadSellerCatalog(user.id));
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const totals = useMemo(() => computeSalesTotals(cart, discount, 0), [cart, discount]);
  const cashCentavos = parsePesoInput(cashText);
  const cashInvalid = cashText.trim() !== '' && cashCentavos === null;
  const cashShort = cashCentavos !== null && cashCentavos < totals.finalTotal;
  const change = cashCentavos !== null && !cashShort ? cashCentavos - totals.finalTotal : 0;
  const canComplete = cart.length > 0 && totals.finalTotal > 0 && cashCentavos !== null && !cashShort;

  const addToCart = (product: SellerCatalogItem, variantId: string | null) => {
    const variant = variantId ? product.variants.find((v) => v.id === variantId) : undefined;
    const stock = variant ? variant.stock : product.stock;
    if (stock <= 0) return;

    setCart((prev) => {
      const existing = prev.find((l) => l.productId === product.id && l.variantId === variantId);
      if (existing) {
        return prev.map((l) => (l.id === existing.id ? { ...l, quantity: Math.min(l.quantity + 1, stock) } : l));
      }
      return [
        ...prev,
        {
          id: crypto.randomUUID(),
          source: 'catalog',
          productId: product.id,
          variantId,
          title: product.title,
          variantLabel: variant?.label ?? null,
          unitCentavos: variant?.unitCentavos ?? product.unitCentavos,
          quantity: 1,
          maxQuantity: stock,
          discount: null,
        },
      ];
    });
    setSaleError(null);
  };

  const changeQuantity = (id: string, quantity: number) => {
    setCart((prev) =>
      prev.map((l) => {
        if (l.id !== id || quantity < 1 || (l.maxQuantity !== null && quantity > l.maxQuantity)) return l;
        return { ...l, quantity };
      }),
    );
  };

  const removeLine = (id: string) => setCart((prev) => prev.filter((l) => l.id !== id));

  const setLineDiscount = (id: string, value: Discount | null) => {
    setCart((prev) => prev.map((l) => (l.id === id ? { ...l, discount: value } : l)));
  };

  const cancelTransaction = () => {
    setCart([]);
    setDiscount(null);
    setCashText('');
    setSaleError(null);
    setAttempt(null);
  };

  const completeSale = async () => {
    if (!canComplete || cashCentavos === null || submitting) return;

    const items = cart.map((l) => ({
      product_id: l.productId,
      variant_id: l.variantId,
      quantity: l.quantity,
      discount: toRpcDiscount(l.discount),
    }));
    const body = {
      p_items: items,
      p_discount: toRpcDiscount(discount),
      p_amount_received: cashCentavos / 100,
    };
    const signature = JSON.stringify(body);
    const reference = attempt && attempt.signature === signature ? attempt.reference : crypto.randomUUID();
    setAttempt({ reference, signature });
    setSubmitting(true);
    setSaleError(null);

    const { data, error } = await supabase.rpc('create_pos_sale', {
      ...body,
      p_customer_id: null,
      p_client_reference: reference,
      p_notes: null,
    });
    setSubmitting(false);

    if (error) {
      const isServerRejection = Boolean(error.code);
      setSaleError(
        isServerRejection
          ? error.message
          : 'The connection was interrupted, so the sale is not confirmed yet. Press Record sale again to retry safely.',
      );
      if (isServerRejection) setAttempt(null);
      return;
    }

    if (!isSalePayload(data)) {
      setSaleError('The sale could not be confirmed. Check your sales history before trying again.');
      return;
    }

    setAttempt(null);
    setConfirmOpen(false);
    setReceipt(data);
    setCart([]);
    setDiscount(null);
    setCashText('');
  };

  const startNewSale = () => {
    setReceipt(null);
    setSaleError(null);
  };

  return (
    <div className="container-app py-8 animate-fade-in">
      <button
        onClick={() => navigate('/seller/tools')}
        className="flex items-center gap-1 text-sm text-brand-600 hover:text-brand-800 mb-4 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Business Tools
      </button>

      <div className="flex items-center gap-3 mb-6">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600 text-white">
          <Store className="h-6 w-6" />
        </div>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-brand-900">Point of Sale</h1>
          <p className="text-sm text-brand-500 truncate">
            {load.kind === 'ready' ? load.shop.name : 'Record in-store cash sales'}
          </p>
        </div>
      </div>

      {load.kind === 'loading' && (
        <div className="bg-white rounded-xl border border-brand-100 p-8 text-center text-sm text-brand-500">
          Loading your products...
        </div>
      )}

      {load.kind === 'signed-out' && (
        <EmptyState
          icon={<LogIn className="h-8 w-8" />}
          title="Sign in to use the POS"
          description="Sales are recorded for your seller account, so sign in first."
          action={<Button onClick={() => navigate('/signin')}>Sign In</Button>}
        />
      )}

      {load.kind === 'no-seller' && (
        <EmptyState
          icon={<Package className="h-8 w-8" />}
          title="No seller store yet"
          description="Set up your store and publish products before you can make sales."
          action={<Button onClick={() => navigate('/seller/setup')}>Set Up Your Store</Button>}
        />
      )}

      {load.kind === 'error' && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center gap-3">
          <p className="text-sm text-red-700 flex-1">{load.message}</p>
          <Button variant="outline" size="sm" onClick={refresh}>Try again</Button>
        </div>
      )}

      {load.kind === 'ready' && receipt && <SaleReceipt sale={receipt} onNewSale={startNewSale} />}

      {load.kind === 'ready' && !receipt && (
        <div className="grid lg:grid-cols-[1fr_380px] gap-6 items-start">
          <PosProductGrid products={load.products} onAdd={addToCart} />

          <aside className="bg-white rounded-xl border border-brand-100 p-5 space-y-5 lg:sticky lg:top-24">
            <div className="flex items-center gap-2">
              <ShoppingCart className="h-4 w-4 text-brand-600" />
              <h2 className="text-base font-semibold text-brand-900">Current sale</h2>
            </div>

            {cart.length === 0 ? (
              <p className="text-sm text-brand-500 py-4 text-center">Tap Add on a product to start a sale.</p>
            ) : (
              <CalculationRows
                lines={cart}
                lineTotals={totals.lines}
                onQuantityChange={changeQuantity}
                onRemove={removeLine}
                onDiscountChange={setLineDiscount}
              />
            )}

            <DiscountEditor
              label="Whole-sale discount"
              baseCentavos={totals.afterItemDiscounts}
              value={discount}
              onChange={setDiscount}
            />

            <dl className="space-y-2 text-sm border-t border-brand-100 pt-4">
              <div className="flex justify-between"><dt className="text-brand-600">Subtotal</dt><dd>{formatCurrency(totals.subtotal / 100)}</dd></div>
              <div className="flex justify-between"><dt className="text-brand-600">Discounts</dt><dd>-{formatCurrency((totals.itemDiscounts + totals.transactionDiscount) / 100)}</dd></div>
              <div className="flex justify-between items-end pt-2">
                <dt className="text-sm font-semibold text-brand-700">Total due</dt>
                <dd className="text-2xl font-bold text-brand-900">{formatCurrency(totals.finalTotal / 100)}</dd>
              </div>
            </dl>

            <div className="space-y-1 border-t border-brand-100 pt-4">
              <label htmlFor="cash-received" className="text-xs font-semibold text-brand-700">Cash received (₱)</label>
              <input
                id="cash-received"
                inputMode="decimal"
                value={cashText}
                onChange={(e) => setCashText(e.target.value)}
                placeholder="0.00"
                className="w-full h-11 px-3 rounded-lg border border-brand-200 bg-white text-base text-brand-900 placeholder:text-brand-400"
              />
              {cashInvalid && <p className="text-xs text-red-600">Enter an amount in pesos such as 500 or 99.50.</p>}
              {cashShort && <p className="text-xs text-red-600">Cash received is less than the total due.</p>}
              {cashCentavos !== null && !cashShort && (
                <p className="text-sm font-semibold text-green-700">Change: {formatCurrency(change / 100)}</p>
              )}
            </div>

            {saleError && !confirmOpen && <p className="text-sm text-red-600">{saleError}</p>}

            <div className="space-y-2">
              <Button className="w-full" disabled={!canComplete} onClick={() => setConfirmOpen(true)}>
                Review and record sale
              </Button>
              <Button variant="ghost" className="w-full" onClick={cancelTransaction} disabled={cart.length === 0 && cashText === ''}>
                <RotateCcw className="h-4 w-4" /> Cancel transaction
              </Button>
            </div>
          </aside>
        </div>
      )}

      <Modal open={confirmOpen} onClose={() => !submitting && setConfirmOpen(false)} title="Confirm sale" size="sm">
        <div className="space-y-4">
          <ul className="space-y-2 text-sm max-h-60 overflow-y-auto">
            {cart.map((l) => (
              <li key={l.id} className="flex justify-between gap-3">
                <span className="text-brand-800">{l.quantity} x {l.title}{l.variantLabel ? ` (${l.variantLabel})` : ''}</span>
                <span className="shrink-0">{formatCurrency((totals.lines.find((t) => t.id === l.id)?.net ?? 0) / 100)}</span>
              </li>
            ))}
          </ul>
          <div className="border-t border-brand-100 pt-3 space-y-1 text-sm">
            <div className="flex justify-between font-bold text-brand-900"><span>Total due</span><span>{formatCurrency(totals.finalTotal / 100)}</span></div>
            <div className="flex justify-between text-brand-600"><span>Cash received</span><span>{formatCurrency((cashCentavos ?? 0) / 100)}</span></div>
            <div className="flex justify-between text-brand-600"><span>Change</span><span>{formatCurrency(change / 100)}</span></div>
          </div>
          {saleError && <p className="text-sm text-red-600">{saleError}</p>}
          <p className="text-xs text-brand-500">This records a real sale and reduces your stock.</p>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setConfirmOpen(false)} disabled={submitting}>Back</Button>
            <Button className="flex-1" onClick={completeSale} disabled={submitting}>
              {submitting ? 'Recording...' : attempt ? 'Record sale again' : 'Record sale'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

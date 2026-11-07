import { CheckCircle2, Printer } from 'lucide-react';
import type { SalePayload } from '@/lib/posSale';
import { formatCurrency } from '@/lib/utils';
import { Button } from '@/components/ui/Button';

interface SaleReceiptProps {
  sale: SalePayload;
  onNewSale: () => void;
}

export function SaleReceipt({ sale, onNewSale }: SaleReceiptProps) {
  const pesos = (value: number) => formatCurrency(value);
  const discountLabel = sale.discount_type === 'percent' && sale.discount_value !== null
    ? `${sale.discount_value}% off`
    : 'Discount';

  return (
    <div className="max-w-lg mx-auto space-y-5">
      <div className="flex items-center gap-2 text-green-700 print:hidden">
        <CheckCircle2 className="h-5 w-5" />
        <p className="text-sm font-semibold">Sale recorded</p>
      </div>

      <article className="bg-white rounded-xl border border-brand-100 p-6 space-y-4 print:border-0">
        <header className="text-center space-y-1">
          <h2 className="text-lg font-bold text-brand-900">{sale.store.name ?? 'Store receipt'}</h2>
          {sale.store.phone && <p className="text-xs text-brand-500">{sale.store.phone}</p>}
          {sale.store.email && <p className="text-xs text-brand-500">{sale.store.email}</p>}
        </header>

        <div className="text-xs text-brand-500 flex justify-between gap-2 border-y border-dashed border-brand-200 py-3">
          <span>Ref: <span className="font-mono text-brand-800">{sale.transaction_number}</span></span>
          <span>{new Date(sale.created_at).toLocaleString('en-PH')}</span>
        </div>

        <ul className="space-y-3 text-sm">
          {sale.items.map((item, index) => (
            <li key={`${item.product_title}-${index}`} className="flex justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-brand-900">{item.product_title}</p>
                {item.variant_label && <p className="text-xs text-brand-500">{item.variant_label}</p>}
                <p className="text-xs text-brand-500">{item.quantity} x {pesos(item.unit_price)}</p>
                {item.discount_amount > 0 && <p className="text-xs text-green-700">Discount -{pesos(item.discount_amount)}</p>}
              </div>
              <p className="font-medium text-brand-900 shrink-0">{pesos(item.subtotal - item.discount_amount)}</p>
            </li>
          ))}
        </ul>

        <dl className="space-y-1.5 text-sm border-t border-dashed border-brand-200 pt-3">
          <div className="flex justify-between"><dt className="text-brand-600">Subtotal</dt><dd>{pesos(sale.subtotal)}</dd></div>
          {sale.discount_amount > 0 && (
            <div className="flex justify-between"><dt className="text-brand-600">{discountLabel}</dt><dd>-{pesos(sale.discount_amount)}</dd></div>
          )}
          <div className="flex justify-between text-base font-bold text-brand-900 pt-1"><dt>Total</dt><dd>{pesos(sale.total_amount)}</dd></div>
          <div className="flex justify-between"><dt className="text-brand-600">Payment</dt><dd className="capitalize">{sale.payment_method}</dd></div>
          <div className="flex justify-between"><dt className="text-brand-600">Amount received</dt><dd>{pesos(sale.amount_paid)}</dd></div>
          <div className="flex justify-between"><dt className="text-brand-600">Change</dt><dd>{pesos(sale.change_due)}</dd></div>
        </dl>
      </article>

      <div className="flex gap-2 print:hidden">
        <Button variant="outline" className="flex-1" onClick={() => window.print()}>
          <Printer className="h-4 w-4" /> Print receipt
        </Button>
        <Button className="flex-1" onClick={onNewSale}>New sale</Button>
      </div>
    </div>
  );
}

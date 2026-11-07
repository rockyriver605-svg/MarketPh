import { useState } from 'react';
import { Minus, Plus, Trash2, Tag } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { formatCurrency } from '@/lib/utils';
import type { CalcLine, LineTotal, Discount } from '@/lib/salesCalculator';
import { DiscountEditor } from '@/components/sales/DiscountEditor';

interface CalculationRowsProps {
  lines: CalcLine[];
  lineTotals: LineTotal[];
  onQuantityChange: (id: string, quantity: number) => void;
  onRemove: (id: string) => void;
  onDiscountChange: (id: string, discount: Discount | null) => void;
}

export function CalculationRows({ lines, lineTotals, onQuantityChange, onRemove, onDiscountChange }: CalculationRowsProps) {
  return (
    <ul className="space-y-3">
      {lines.map((line) => {
        const totals = lineTotals.find((t) => t.id === line.id);
        return (
          <CalculationRow
            key={line.id}
            line={line}
            subtotal={totals?.subtotal ?? 0}
            discount={totals?.discount ?? 0}
            net={totals?.net ?? 0}
            onQuantityChange={onQuantityChange}
            onRemove={onRemove}
            onDiscountChange={onDiscountChange}
          />
        );
      })}
    </ul>
  );
}

interface CalculationRowProps {
  line: CalcLine;
  subtotal: number;
  discount: number;
  net: number;
  onQuantityChange: (id: string, quantity: number) => void;
  onRemove: (id: string) => void;
  onDiscountChange: (id: string, discount: Discount | null) => void;
}

function CalculationRow({ line, subtotal, discount, net, onQuantityChange, onRemove, onDiscountChange }: CalculationRowProps) {
  const [showDiscount, setShowDiscount] = useState(false);
  const atMax = line.maxQuantity !== null && line.quantity >= line.maxQuantity;

  return (
    <li className="bg-white rounded-xl border border-brand-100 p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-brand-900 truncate">{line.title}</p>
            {line.source === 'custom' && <Badge variant="info">Manual item</Badge>}
          </div>
          {line.variantLabel && <p className="text-xs text-brand-500 mt-0.5">{line.variantLabel}</p>}
          <p className="text-xs text-brand-400 mt-0.5">{formatCurrency(line.unitCentavos / 100)} each</p>
        </div>
        <button
          onClick={() => onRemove(line.id)}
          aria-label={`Remove ${line.title}`}
          className="p-2 rounded-lg text-brand-400 hover:text-red-600 hover:bg-red-50 transition-colors shrink-0"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <button
            onClick={() => onQuantityChange(line.id, line.quantity - 1)}
            disabled={line.quantity <= 1}
            aria-label="Decrease quantity"
            className="h-9 w-9 rounded-lg border border-brand-200 flex items-center justify-center text-brand-700 hover:bg-brand-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Minus className="h-4 w-4" />
          </button>
          <span className="w-10 text-center text-sm font-semibold text-brand-900">{line.quantity}</span>
          <button
            onClick={() => onQuantityChange(line.id, line.quantity + 1)}
            disabled={atMax}
            aria-label="Increase quantity"
            className="h-9 w-9 rounded-lg border border-brand-200 flex items-center justify-center text-brand-700 hover:bg-brand-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Plus className="h-4 w-4" />
          </button>
          {line.maxQuantity !== null && <span className="text-xs text-brand-400 ml-1">of {line.maxQuantity} in stock</span>}
        </div>

        <div className="text-right">
          {discount > 0 && (
            <p className="text-xs text-accent-700">
              Subtotal {formatCurrency(subtotal / 100)} · Discount -{formatCurrency(discount / 100)}
            </p>
          )}
          <p className="text-base font-bold text-brand-900">{formatCurrency(net / 100)}</p>
        </div>
      </div>

      <div>
        <Button size="sm" variant="ghost" onClick={() => setShowDiscount((v) => !v)}>
          <Tag className="h-4 w-4" /> {line.discount ? 'Edit item discount' : 'Add item discount'}
        </Button>
        {showDiscount && (
          <div className="mt-3 rounded-xl bg-cream-50 p-3">
            <DiscountEditor
              label="Item discount"
              baseCentavos={subtotal}
              value={line.discount}
              onChange={(d) => onDiscountChange(line.id, d)}
            />
          </div>
        )}
      </div>
    </li>
  );
}

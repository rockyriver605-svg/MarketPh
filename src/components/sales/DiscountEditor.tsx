import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { formatCurrency } from '@/lib/utils';
import {
  type Discount,
  discountAmount,
  parsePercentInput,
  parsePesoInput,
  validateDiscount,
} from '@/lib/salesCalculator';

interface DiscountEditorProps {
  label: string;
  baseCentavos: number;
  value: Discount | null;
  onChange: (discount: Discount | null) => void;
}

export function DiscountEditor({ label, baseCentavos, value, onChange }: DiscountEditorProps) {
  const [type, setType] = useState<Discount['type']>(value?.type ?? 'percent');
  const [amountText, setAmountText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const apply = () => {
    let next: Discount | null = null;
    if (type === 'percent') {
      const percent = parsePercentInput(amountText);
      if (percent === null) return setError('Enter a percentage such as 10 or 12.5.');
      next = { type: 'percent', percent };
    } else {
      const centavos = parsePesoInput(amountText);
      if (centavos === null) return setError('Enter an amount in pesos such as 50 or 99.50.');
      next = { type: 'fixed', centavos };
    }
    const problem = validateDiscount(baseCentavos, next);
    if (problem) return setError(problem);
    setError(null);
    setAmountText('');
    onChange(next);
  };

  const remove = () => {
    setError(null);
    setAmountText('');
    onChange(null);
  };

  const applied = discountAmount(baseCentavos, value);

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-brand-700">{label}</p>
      {value && (
        <div className="flex items-center justify-between gap-2 rounded-lg bg-accent-50 px-3 py-2 text-sm">
          <span className="text-accent-700">
            {value.type === 'percent' ? `${value.percent}% off` : `${formatCurrency(value.centavos / 100)} off`}
          </span>
          <span className="font-semibold text-accent-700">-{formatCurrency(applied / 100)}</span>
        </div>
      )}
      <div className="flex flex-col sm:flex-row gap-2">
        <select
          aria-label={`${label} type`}
          value={type}
          onChange={(e) => setType(e.target.value as Discount['type'])}
          className="h-10 px-3 rounded-lg border border-brand-200 bg-white text-sm text-brand-900"
        >
          <option value="percent">Percent (%)</option>
          <option value="fixed">Fixed (₱)</option>
        </select>
        <input
          inputMode="decimal"
          value={amountText}
          onChange={(e) => setAmountText(e.target.value)}
          placeholder={type === 'percent' ? 'e.g. 10' : 'e.g. 50'}
          aria-label={`${label} amount`}
          className="h-10 flex-1 px-3 rounded-lg border border-brand-200 bg-white text-sm text-brand-900 placeholder:text-brand-400"
        />
        <div className="flex gap-2">
          <Button size="sm" onClick={apply} disabled={!amountText.trim()}>Apply</Button>
          {value && <Button size="sm" variant="outline" onClick={remove}>Remove</Button>}
        </div>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

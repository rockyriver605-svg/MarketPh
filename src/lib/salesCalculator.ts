export type Discount =
  | { type: 'percent'; percent: number }
  | { type: 'fixed'; centavos: number };

export interface CatalogVariant {
  id: string;
  label: string;
  unitCentavos: number;
  stock: number;
}

export interface CatalogProduct {
  id: string;
  title: string;
  unitCentavos: number;
  stock: number;
  variants: CatalogVariant[];
}

export interface CalcLine {
  id: string;
  source: 'catalog' | 'custom';
  title: string;
  variantLabel: string | null;
  unitCentavos: number;
  quantity: number;
  maxQuantity: number | null;
  discount: Discount | null;
}

export interface LineTotal {
  id: string;
  subtotal: number;
  discount: number;
  net: number;
}

export interface SalesTotals {
  lines: LineTotal[];
  totalQuantity: number;
  subtotal: number;
  itemDiscounts: number;
  afterItemDiscounts: number;
  transactionDiscount: number;
  charges: number;
  finalTotal: number;
}

const PESO_PATTERN = /^\d+(\.\d{1,2})?$/;
const PERCENT_PATTERN = /^\d+(\.\d{1,2})?$/;
const QUANTITY_PATTERN = /^\d+$/;

export function toCentavos(pesos: number): number {
  return Math.round(pesos * 100);
}

export function parsePesoInput(raw: string): number | null {
  const trimmed = raw.trim();
  if (!PESO_PATTERN.test(trimmed)) return null;
  return toCentavos(Number(trimmed));
}

export function parsePercentInput(raw: string): number | null {
  const trimmed = raw.trim();
  if (!PERCENT_PATTERN.test(trimmed)) return null;
  return Number(trimmed);
}

export function parseQuantityInput(raw: string): number | null {
  const trimmed = raw.trim();
  if (!QUANTITY_PATTERN.test(trimmed)) return null;
  const value = Number(trimmed);
  return value >= 1 ? value : null;
}

export function validateDiscount(baseCentavos: number, discount: Discount): string | null {
  if (discount.type === 'percent') {
    if (discount.percent < 0 || discount.percent > 100) return 'Percentage must be between 0 and 100.';
    return null;
  }
  if (discount.centavos < 0) return 'Discount cannot be negative.';
  if (discount.centavos > baseCentavos) return 'Discount cannot be more than the amount it applies to.';
  return null;
}

export function discountAmount(baseCentavos: number, discount: Discount | null): number {
  if (!discount) return 0;
  if (discount.type === 'percent') return Math.round((baseCentavos * discount.percent) / 100);
  return Math.min(discount.centavos, baseCentavos);
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

export function computeSalesTotals(
  lines: CalcLine[],
  transactionDiscount: Discount | null,
  chargesCentavos: number,
): SalesTotals {
  const lineTotals: LineTotal[] = lines.map((line) => {
    const subtotal = line.unitCentavos * line.quantity;
    const discount = discountAmount(subtotal, line.discount);
    return { id: line.id, subtotal, discount, net: subtotal - discount };
  });

  const subtotal = sum(lineTotals.map((line) => line.subtotal));
  const itemDiscounts = sum(lineTotals.map((line) => line.discount));
  const afterItemDiscounts = subtotal - itemDiscounts;
  const transactionDiscountAmount = discountAmount(afterItemDiscounts, transactionDiscount);

  return {
    lines: lineTotals,
    totalQuantity: sum(lines.map((line) => line.quantity)),
    subtotal,
    itemDiscounts,
    afterItemDiscounts,
    transactionDiscount: transactionDiscountAmount,
    charges: chargesCentavos,
    finalTotal: afterItemDiscounts - transactionDiscountAmount + chargesCentavos,
  };
}

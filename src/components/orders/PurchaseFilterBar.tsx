import { Search, SlidersHorizontal, X } from 'lucide-react';
import { Input, Select } from '@/components/ui/Input';
import {
  DEFAULT_PURCHASE_FILTERS,
  PURCHASE_SECTIONS,
  PURCHASE_SORT_OPTIONS,
  hasNarrowingFilters,
  type PurchaseFilters,
  type PurchaseSection,
} from '@/lib/purchaseHistory';

interface PurchaseFilterBarProps {
  filters: PurchaseFilters;
  onChange: (patch: Partial<PurchaseFilters>) => void;
  sellers: { id: string; shop_name: string }[];
  municipalities: { id: string; name: string }[];
  sectionCounts: Record<PurchaseSection, number>;
}

const PAYMENT_OPTIONS = [
  { value: 'pending', label: 'Pending' },
  { value: 'paid', label: 'Paid' },
  { value: 'partial', label: 'Partial' },
  { value: 'failed', label: 'Failed' },
  { value: 'refunded', label: 'Refunded' },
  { value: 'none', label: 'No payment record' },
];

export function PurchaseFilterBar({ filters, onChange, sellers, municipalities, sectionCounts }: PurchaseFilterBarProps) {
  return (
    <div className="space-y-4 mb-6">
      <div className="flex flex-wrap gap-2 overflow-x-auto pb-1">
        {PURCHASE_SECTIONS.map((section) => {
          const active = filters.section === section.value;
          return (
            <button
              key={section.value}
              type="button"
              onClick={() => onChange({ section: section.value })}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-full text-sm font-medium transition-colors shrink-0 ${
                active ? 'bg-brand-600 text-white' : 'bg-white border border-brand-100 text-brand-700 hover:bg-brand-50'
              }`}
            >
              {section.label}
              <span className={`text-xs rounded-full px-1.5 ${active ? 'bg-white/20' : 'bg-brand-50 text-brand-500'}`}>
                {sectionCounts[section.value]}
              </span>
            </button>
          );
        })}
      </div>

      <div className="bg-white rounded-xl border border-brand-100 p-4 space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-brand-400 pointer-events-none" />
            <Input
              aria-label="Search purchases"
              placeholder="Search order number, product, store, or reference"
              value={filters.search}
              onChange={(e) => onChange({ search: e.target.value })}
              className="pl-9"
            />
          </div>
          <div className="w-full sm:w-52">
            <Select aria-label="Sort purchases" value={filters.sort} onChange={(e) => onChange({ sort: e.target.value as PurchaseFilters['sort'] })}>
              {PURCHASE_SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs font-semibold text-brand-500 uppercase tracking-wide">
          <SlidersHorizontal className="h-3.5 w-3.5" /> Filters
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Select aria-label="Payment status" value={filters.paymentStatus} onChange={(e) => onChange({ paymentStatus: e.target.value })}>
            <option value="">Any payment status</option>
            {PAYMENT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
          <Select aria-label="Seller" value={filters.sellerId} onChange={(e) => onChange({ sellerId: e.target.value })}>
            <option value="">All sellers</option>
            {sellers.map((s) => <option key={s.id} value={s.id}>{s.shop_name}</option>)}
          </Select>
          <Select aria-label="Municipality" value={filters.municipalityId} onChange={(e) => onChange({ municipalityId: e.target.value })}>
            <option value="">All municipalities</option>
            {municipalities.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </Select>
          <Select aria-label="Fulfillment method" value={filters.fulfillment} onChange={(e) => onChange({ fulfillment: e.target.value as PurchaseFilters['fulfillment'] })}>
            <option value="">Delivery or pickup</option>
            <option value="delivery">Delivery</option>
            <option value="pickup">Pickup</option>
          </Select>
          <Input aria-label="Date from" type="date" value={filters.dateFrom} onChange={(e) => onChange({ dateFrom: e.target.value })} />
          <Input aria-label="Date to" type="date" value={filters.dateTo} onChange={(e) => onChange({ dateTo: e.target.value })} />
          <Input aria-label="Minimum amount" type="number" min="0" step="0.01" placeholder="Min amount (PHP)" value={filters.minAmount} onChange={(e) => onChange({ minAmount: e.target.value })} />
          <Input aria-label="Maximum amount" type="number" min="0" step="0.01" placeholder="Max amount (PHP)" value={filters.maxAmount} onChange={(e) => onChange({ maxAmount: e.target.value })} />
        </div>

        {(hasNarrowingFilters(filters) || filters.section !== DEFAULT_PURCHASE_FILTERS.section) && (
          <button
            type="button"
            onClick={() => onChange({ ...DEFAULT_PURCHASE_FILTERS, sort: filters.sort })}
            className="inline-flex items-center gap-1 text-sm text-brand-600 hover:text-brand-800 transition-colors"
          >
            <X className="h-3.5 w-3.5" /> Clear filters
          </button>
        )}
      </div>
    </div>
  );
}

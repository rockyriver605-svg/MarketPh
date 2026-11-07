import { Search, LayoutGrid, List, SlidersHorizontal } from 'lucide-react';
import { Input, Select } from '@/components/ui/Input';
import { SORT_OPTIONS, AVAILABILITY_LABELS, type WishlistFilters, type Availability } from '@/lib/wishlistView';

interface Option {
  value: string;
  label: string;
}

interface WishlistToolbarProps {
  filters: WishlistFilters;
  onChange: (next: WishlistFilters) => void;
  layout: 'grid' | 'list';
  onLayoutChange: (layout: 'grid' | 'list') => void;
  categories: Option[];
  conditions: Option[];
  municipalities: Option[];
  shops: Option[];
  resultCount: number;
  totalCount: number;
}

export function WishlistToolbar({
  filters,
  onChange,
  layout,
  onLayoutChange,
  categories,
  conditions,
  municipalities,
  shops,
  resultCount,
  totalCount,
}: WishlistToolbarProps) {
  const set = (patch: Partial<WishlistFilters>) => onChange({ ...filters, ...patch });

  return (
    <div className="space-y-3 rounded-xl border border-brand-100 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-end">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-400" />
          <Input
            type="search"
            aria-label="Search your wishlist"
            placeholder="Search by name, seller, category, or town"
            value={filters.query}
            onChange={(e) => set({ query: e.target.value })}
            className="pl-9"
          />
        </div>
        <div className="flex gap-3">
          <div className="w-full md:w-56">
            <Select aria-label="Sort wishlist" value={filters.sort} onChange={(e) => set({ sort: e.target.value as WishlistFilters['sort'] })}>
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </Select>
          </div>
          <div className="flex shrink-0 rounded-lg border border-brand-200 p-1" role="group" aria-label="Layout">
            <button
              type="button"
              onClick={() => onLayoutChange('grid')}
              aria-pressed={layout === 'grid'}
              className={`rounded-md p-2 transition-colors ${layout === 'grid' ? 'bg-brand-100 text-brand-800' : 'text-brand-500 hover:text-brand-800'}`}
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => onLayoutChange('list')}
              aria-pressed={layout === 'list'}
              className={`rounded-md p-2 transition-colors ${layout === 'list' ? 'bg-brand-100 text-brand-800' : 'text-brand-500 hover:text-brand-800'}`}
            >
              <List className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        <Select aria-label="Filter by category" value={filters.categoryId} onChange={(e) => set({ categoryId: e.target.value })}>
          <option value="all">All categories</option>
          {categories.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
        <Select aria-label="Filter by condition" value={filters.condition} onChange={(e) => set({ condition: e.target.value })}>
          <option value="all">Any condition</option>
          {conditions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
        <Select aria-label="Filter by municipality" value={filters.municipalityId} onChange={(e) => set({ municipalityId: e.target.value })}>
          <option value="all">All municipalities</option>
          {municipalities.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
        <Select aria-label="Filter by seller" value={filters.shop} onChange={(e) => set({ shop: e.target.value })}>
          <option value="all">All sellers</option>
          {shops.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
        <Select aria-label="Filter by availability" value={filters.availability} onChange={(e) => set({ availability: e.target.value as 'all' | Availability })}>
          <option value="all">Any availability</option>
          {(Object.keys(AVAILABILITY_LABELS) as Availability[]).map((key) => (
            <option key={key} value={key}>{AVAILABILITY_LABELS[key]}</option>
          ))}
        </Select>
        <Input
          type="number"
          min={0}
          inputMode="decimal"
          aria-label="Minimum price"
          placeholder="Min PHP"
          value={filters.minPrice}
          onChange={(e) => set({ minPrice: e.target.value })}
        />
        <Input
          type="number"
          min={0}
          inputMode="decimal"
          aria-label="Maximum price"
          placeholder="Max PHP"
          value={filters.maxPrice}
          onChange={(e) => set({ maxPrice: e.target.value })}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-brand-500">
        <span className="flex items-center gap-1.5">
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Showing {resultCount} of {totalCount} saved {totalCount === 1 ? 'item' : 'items'}
        </span>
      </div>
    </div>
  );
}

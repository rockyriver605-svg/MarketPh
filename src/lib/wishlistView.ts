import type { WishlistItem } from '@/lib/wishlist';

export type Availability = 'available' | 'out_of_stock' | 'unavailable';
export type SortKey = 'recent' | 'oldest' | 'price_asc' | 'price_desc' | 'title';

export interface WishlistFilters {
  query: string;
  categoryId: string;
  condition: string;
  municipalityId: string;
  shop: string;
  availability: 'all' | Availability;
  minPrice: string;
  maxPrice: string;
  sort: SortKey;
}

export const DEFAULT_FILTERS: WishlistFilters = {
  query: '',
  categoryId: 'all',
  condition: 'all',
  municipalityId: 'all',
  shop: 'all',
  availability: 'all',
  minPrice: '',
  maxPrice: '',
  sort: 'recent',
};

export const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'recent', label: 'Recently saved' },
  { value: 'oldest', label: 'Oldest saved' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
  { value: 'title', label: 'Name (A to Z)' },
];

export const AVAILABILITY_LABELS: Record<Availability, string> = {
  available: 'Available',
  out_of_stock: 'Out of stock',
  unavailable: 'Unavailable',
};

export function effectivePrice(item: WishlistItem): number {
  return item.sale_price ?? item.price;
}

export function getAvailability(item: WishlistItem): Availability {
  if (item.status !== 'published' || !item.seller_active) return 'unavailable';
  if (item.stock <= 0) return 'out_of_stock';
  return 'available';
}

export function unavailableReason(item: WishlistItem): string | null {
  const availability = getAvailability(item);
  if (availability === 'available') return null;
  if (availability === 'out_of_stock') return 'Out of stock';
  if (!item.seller_active) return 'Seller is not active';
  return UNLISTED_STATUS_LABELS[item.status] ?? 'Not currently listed';
}

const UNLISTED_STATUS_LABELS: Record<string, string> = {
  draft: 'Not yet listed',
  pending_review: 'Awaiting review',
  rejected: 'Rejected',
  paused: 'Paused by seller',
  sold_out: 'Sold out',
  archived: 'Archived',
};

function parsePesos(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function applyWishlistView(
  items: WishlistItem[],
  filters: WishlistFilters,
  collectionFavoriteIds: Set<string> | null,
): WishlistItem[] {
  const query = filters.query.trim().toLowerCase();
  const min = parsePesos(filters.minPrice);
  const max = parsePesos(filters.maxPrice);

  const filtered = items.filter((item) => {
    if (collectionFavoriteIds && !collectionFavoriteIds.has(item.favorite_id)) return false;
    if (query) {
      const haystack = [item.title, item.shop_name, item.category_name, item.municipality_name]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    if (filters.categoryId !== 'all' && item.category_id !== filters.categoryId) return false;
    if (filters.condition !== 'all' && item.condition !== filters.condition) return false;
    if (filters.municipalityId !== 'all' && item.municipality_id !== filters.municipalityId) return false;
    if (filters.shop !== 'all' && item.shop_name !== filters.shop) return false;
    if (filters.availability !== 'all' && getAvailability(item) !== filters.availability) return false;
    const price = effectivePrice(item);
    if (min !== null && price < min) return false;
    if (max !== null && price > max) return false;
    return true;
  });

  const sorted = [...filtered];
  switch (filters.sort) {
    case 'oldest':
      sorted.sort((a, b) => a.saved_at.localeCompare(b.saved_at));
      break;
    case 'price_asc':
      sorted.sort((a, b) => effectivePrice(a) - effectivePrice(b));
      break;
    case 'price_desc':
      sorted.sort((a, b) => effectivePrice(b) - effectivePrice(a));
      break;
    case 'title':
      sorted.sort((a, b) => a.title.localeCompare(b.title));
      break;
    default:
      sorted.sort((a, b) => b.saved_at.localeCompare(a.saved_at));
  }
  return sorted;
}

export function distinctOptions<T extends string>(
  items: WishlistItem[],
  pick: (item: WishlistItem) => T | null,
): T[] {
  const values = new Set<T>();
  for (const item of items) {
    const value = pick(item);
    if (value) values.add(value);
  }
  return Array.from(values).sort((a, b) => a.localeCompare(b));
}

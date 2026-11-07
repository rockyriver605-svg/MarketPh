import { useMemo, useState } from 'react';
import { Star, Search, MessageSquare } from 'lucide-react';
import type { ProductRatingSummary, ReviewWithRelations } from '@/types';
import { ReviewCard } from '@/components/reviews/ReviewCard';
import { Input, Select } from '@/components/ui/Input';
import { EmptyState } from '@/components/ui/EmptyState';
import { sortAndFilterReviews, type ReviewFilter, type ReviewSortKey } from '@/lib/reviews';

interface ReviewSectionProps {
  summary: ProductRatingSummary | null;
  reviews: ReviewWithRelations[];
  loading: boolean;
  sellerShopName?: string;
}

export function ReviewSection({ summary, reviews, loading, sellerShopName }: ReviewSectionProps) {
  const [filter, setFilter] = useState<ReviewFilter>('all');
  const [sort, setSort] = useState<ReviewSortKey>('recent');
  const [search, setSearch] = useState('');

  const visibleReviews = useMemo(
    () => sortAndFilterReviews(reviews, { filter, sort, search }),
    [reviews, filter, sort, search],
  );

  if (loading) {
    return <div className="py-8 animate-pulse"><div className="h-32 rounded-xl bg-cream-100" /></div>;
  }

  if (!summary || summary.total_reviews === 0) {
    return (
      <div className="py-8">
        <EmptyState
          icon={<MessageSquare className="h-8 w-8" />}
          title="No reviews yet"
          description="Be the first verified buyer to review this product."
        />
      </div>
    );
  }

  const distribution = [
    { stars: 5, count: summary.five_star },
    { stars: 4, count: summary.four_star },
    { stars: 3, count: summary.three_star },
    { stars: 2, count: summary.two_star },
    { stars: 1, count: summary.one_star },
  ];

  return (
    <div className="space-y-5">
      {/* Rating summary */}
      <div className="rounded-xl border border-brand-100 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <div className="flex flex-col items-center sm:w-48 shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-4xl font-bold text-brand-900">{summary.avg_rating}</span>
              <span className="text-sm text-brand-400">/ 5</span>
            </div>
            <div className="mt-1 flex">
              {[1, 2, 3, 4, 5].map((s) => (
                <Star key={s} className={`h-4 w-4 ${s <= Math.round(summary.avg_rating) ? 'fill-amber-400 text-amber-400' : 'fill-brand-100 text-brand-200'}`} />
              ))}
            </div>
            <p className="mt-1 text-xs text-brand-400">{summary.total_reviews} {summary.total_reviews === 1 ? 'review' : 'reviews'}</p>
          </div>
          <div className="flex-1 space-y-1.5">
            {distribution.map(({ stars, count }) => {
              const pct = summary.total_reviews > 0 ? (count / summary.total_reviews) * 100 : 0;
              return (
                <div key={stars} className="flex items-center gap-2 text-xs">
                  <span className="w-12 text-brand-500">{stars} star</span>
                  <div className="flex-1 h-2 rounded-full bg-brand-100 overflow-hidden">
                    <div className="h-full rounded-full bg-amber-400" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="w-8 text-right text-brand-400">{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Filters and sorting */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-400" />
          <Input
            type="search"
            placeholder="Search reviews"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-2">
          <Select value={filter} onChange={(e) => setFilter(e.target.value as ReviewFilter)} className="w-auto">
            <option value="all">All ratings</option>
            <option value="5">5 stars</option>
            <option value="4">4 stars</option>
            <option value="3">3 stars</option>
            <option value="2">2 stars</option>
            <option value="1">1 star</option>
            <option value="photos">With photos</option>
            <option value="verified">Verified only</option>
          </Select>
          <Select value={sort} onChange={(e) => setSort(e.target.value as ReviewSortKey)} className="w-auto">
            <option value="recent">Most recent</option>
            <option value="oldest">Oldest</option>
            <option value="highest">Highest rating</option>
            <option value="lowest">Lowest rating</option>
            <option value="helpful">Most helpful</option>
          </Select>
        </div>
      </div>

      {/* Review list */}
      {visibleReviews.length > 0 ? (
        <div className="space-y-3">
          {visibleReviews.map((review) => (
            <ReviewCard key={review.id} review={review} sellerShopName={sellerShopName} />
          ))}
        </div>
      ) : (
        <EmptyState title="No reviews match these filters" description="Try a different filter or search." />
      )}
    </div>
  );
}

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Star, Store, ArrowLeft, MessageSquare, Search, Send } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { navigate } from '@/lib/router';
import { supabase } from '@/lib/supabase';
import type { ReviewWithRelations } from '@/types';
import { fetchSellerReviews, submitReviewResponse, updateReviewResponse, deleteReviewResponse } from '@/lib/reviews';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { Textarea, Select } from '@/components/ui/Input';
import { ReviewCard } from '@/components/reviews/ReviewCard';

export function SellerReviewsPage() {
  const { user } = useAuth();
  const [reviews, setReviews] = useState<ReviewWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterRating, setFilterRating] = useState('all');
  const [filterProduct, setFilterProduct] = useState('all');
  const [search, setSearch] = useState('');
  const [respondReview, setRespondReview] = useState<ReviewWithRelations | null>(null);
  const [responseBody, setResponseBody] = useState('');
  const [responseBusy, setResponseBusy] = useState(false);
  const [responseError, setResponseError] = useState<string | null>(null);
  const [editResponseReview, setEditResponseReview] = useState<ReviewWithRelations | null>(null);
  const [editResponseId, setEditResponseId] = useState<string | null>(null);
  const [editResponseBody, setEditResponseBody] = useState('');

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const { data: sellerProfile } = await supabase
        .from('seller_profiles')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();
      if (!sellerProfile) {
        setError('You need a seller account to view reviews.');
        setLoading(false);
        return;
      }
      const data = await fetchSellerReviews(sellerProfile.id);
      setReviews(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load reviews for your products.');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const productMap = useMemo(() => {
    const map = new Map<string, string>();
    reviews.forEach((r) => {
      if (!map.has(r.product_id)) {
        map.set(r.product_id, `Product ${r.product_id.slice(0, 8)}`);
      }
    });
    return map;
  }, [reviews]);

  const filteredReviews = useMemo(() => {
    let result = [...reviews];
    if (filterRating !== 'all') {
      result = result.filter((r) => r.rating === Number(filterRating));
    }
    if (filterProduct !== 'all') {
      result = result.filter((r) => r.product_id === filterProduct);
    }
    const q = search.trim().toLowerCase();
    if (q) {
      result = result.filter((r) =>
        (r.body ?? '').toLowerCase().includes(q) ||
        (r.title ?? '').toLowerCase().includes(q),
      );
    }
    return result;
  }, [reviews, filterRating, filterProduct, search]);

  const avgRating = useMemo(() => {
    if (reviews.length === 0) return 0;
    return reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
  }, [reviews]);

  const handleRespond = async () => {
    if (!respondReview || !responseBody.trim()) return;
    setResponseBusy(true);
    setResponseError(null);
    try {
      await submitReviewResponse(respondReview.id, responseBody.trim());
      setRespondReview(null);
      setResponseBody('');
      await load();
    } catch (err) {
      setResponseError(err instanceof Error ? err.message : 'Could not submit your response.');
    } finally {
      setResponseBusy(false);
    }
  };

  const handleEditResponse = async () => {
    if (!editResponseReview || !editResponseId || !editResponseBody.trim()) return;
    setResponseBusy(true);
    setResponseError(null);
    try {
      await updateReviewResponse(editResponseId, editResponseBody.trim());
      setEditResponseReview(null);
      setEditResponseId(null);
      setEditResponseBody('');
      await load();
    } catch (err) {
      setResponseError(err instanceof Error ? err.message : 'Could not update your response.');
    } finally {
      setResponseBusy(false);
    }
  };

  const handleDeleteResponse = async (responseId: string) => {
    try {
      await deleteReviewResponse(responseId);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete your response.');
    }
  };

  const handleSellerResponse = (review: ReviewWithRelations) => {
    setResponseError(null);
    setResponseBody('');
    setRespondReview(review);
  };

  const handleSellerEditResponse = (_review: ReviewWithRelations, responseId: string, body: string) => {
    setResponseError(null);
    setEditResponseId(responseId);
    setEditResponseBody(body);
    setEditResponseReview(_review);
  };

  if (!user) {
    return <div className="container-app py-16 text-center"><Button onClick={() => navigate('/signin')}>Sign In</Button></div>;
  }

  if (loading) {
    return <div className="container-app py-12 animate-pulse space-y-4"><div className="h-8 bg-cream-100 rounded w-1/3" /><div className="h-40 bg-cream-100 rounded-xl" /></div>;
  }

  return (
    <div className="container-app py-8 animate-fade-in max-w-4xl">
      <button onClick={() => navigate('/seller/dashboard')} className="flex items-center gap-1 text-sm text-brand-600 hover:text-brand-800 mb-4 transition-colors">
        <ArrowLeft className="h-4 w-4" /> Back to dashboard
      </button>

      <div className="flex items-center gap-3 mb-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-100 text-brand-600">
          <Store className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-brand-900">Product Reviews</h1>
          <p className="text-sm text-brand-500">Reviews from buyers of your products</p>
        </div>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 text-sm text-red-700">{error}</div>
      )}

      {reviews.length > 0 && (
        <div className="mb-5 rounded-xl border border-brand-100 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="flex flex-col items-center">
              <span className="text-3xl font-bold text-brand-900">{avgRating.toFixed(1)}</span>
              <div className="flex mt-1">
                {[1, 2, 3, 4, 5].map((s) => (
                  <Star key={s} className={`h-3.5 w-3.5 ${s <= Math.round(avgRating) ? 'fill-amber-400 text-amber-400' : 'fill-brand-100 text-brand-200'}`} />
                ))}
              </div>
            </div>
            <div className="text-sm text-brand-500">
              <p className="font-medium text-brand-700">{reviews.length} total {reviews.length === 1 ? 'review' : 'reviews'}</p>
              <p className="text-xs mt-0.5">Across {productMap.size} {productMap.size === 1 ? 'product' : 'products'}</p>
            </div>
          </div>
        </div>
      )}

      {reviews.length === 0 ? (
        <EmptyState
          icon={<MessageSquare className="h-8 w-8" />}
          title="No reviews yet"
          description="When buyers review your products, their feedback will appear here."
        />
      ) : (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center mb-5">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-400" />
              <input
                type="search"
                placeholder="Search reviews"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full h-10 rounded-lg border border-brand-200 bg-white pl-9 pr-3 text-sm text-brand-900"
              />
            </div>
            <Select value={filterProduct} onChange={(e) => setFilterProduct(e.target.value)} className="w-auto">
              <option value="all">All products</option>
              {Array.from(productMap.entries()).map(([id, name]) => (
                <option key={id} value={id}>{name}</option>
              ))}
            </Select>
            <Select value={filterRating} onChange={(e) => setFilterRating(e.target.value)} className="w-auto">
              <option value="all">All ratings</option>
              <option value="5">5 stars</option>
              <option value="4">4 stars</option>
              <option value="3">3 stars</option>
              <option value="2">2 stars</option>
              <option value="1">1 star</option>
            </Select>
          </div>

          {filteredReviews.length > 0 ? (
            <div className="space-y-3">
              {filteredReviews.map((review) => (
                <ReviewCard
                  key={review.id}
                  review={review}
                  sellerShopName={undefined}
                  onSellerResponse={handleSellerResponse}
                  onSellerEditResponse={handleSellerEditResponse}
                  onSellerDeleteResponse={handleDeleteResponse}
                />
              ))}
            </div>
          ) : (
            <EmptyState title="No reviews match these filters" description="Try a different filter or search term." />
          )}
        </>
      )}

      {respondReview && (
        <Modal open={!!respondReview} onClose={() => { if (!responseBusy) setRespondReview(null); }} title="Respond to Review" size="md">
          <div className="space-y-4">
            <div className="rounded-lg bg-cream-50 p-3">
              <div className="flex items-center gap-2 mb-1">
                <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                <span className="text-sm font-semibold text-brand-900">{respondReview.rating}/5</span>
              </div>
              {respondReview.title && <p className="text-sm font-medium text-brand-800">{respondReview.title}</p>}
              <p className="text-sm text-brand-600">{respondReview.body}</p>
            </div>
            <Textarea
              label="Your response"
              value={responseBody}
              onChange={(e) => setResponseBody(e.target.value)}
              rows={4}
              placeholder="Thank the buyer or address their feedback professionally."
            />
            {responseError && <p className="text-sm text-red-600">{responseError}</p>}
            <div className="flex justify-end gap-3">
              <Button variant="ghost" onClick={() => setRespondReview(null)} disabled={responseBusy}>Cancel</Button>
              <Button onClick={handleRespond} loading={responseBusy} disabled={!responseBody.trim()}>
                <Send className="h-4 w-4" /> Post Response
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {editResponseReview && (
        <Modal open={!!editResponseReview} onClose={() => { if (!responseBusy) setEditResponseReview(null); }} title="Edit Your Response" size="md">
          <div className="space-y-4">
            <Textarea
              label="Your response"
              value={editResponseBody}
              onChange={(e) => setEditResponseBody(e.target.value)}
              rows={4}
            />
            {responseError && <p className="text-sm text-red-600">{responseError}</p>}
            <div className="flex justify-end gap-3">
              <Button variant="ghost" onClick={() => setEditResponseReview(null)} disabled={responseBusy}>Cancel</Button>
              <Button onClick={handleEditResponse} loading={responseBusy} disabled={!editResponseBody.trim()}>
                Save Changes
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

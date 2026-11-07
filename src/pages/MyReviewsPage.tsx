import { useCallback, useEffect, useState } from 'react';
import { Star, Package, ArrowLeft, Pencil, Trash2, MessageSquare, AlertTriangle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { navigate } from '@/lib/router';
import type { ReviewWithRelations } from '@/types';
import { fetchMyReviews, updateReview, deleteReview, REVIEW_EDIT_WINDOW_DAYS } from '@/lib/reviews';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { ReviewForm } from '@/components/reviews/ReviewForm';
import { ReviewCard } from '@/components/reviews/ReviewCard';
import { StarRating } from '@/components/reviews/StarRating';
import { formatDateTime } from '@/lib/utils';

export function MyReviewsPage() {
  const { user } = useAuth();
  const [reviews, setReviews] = useState<ReviewWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editReview, setEditReview] = useState<ReviewWithRelations | null>(null);
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [deleteReviewTarget, setDeleteReviewTarget] = useState<ReviewWithRelations | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchMyReviews(user.id);
      setReviews(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your reviews.');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const handleEditSubmit = async (rating: number, title: string, body: string) => {
    if (!editReview) return;
    setEditBusy(true);
    setEditError(null);
    try {
      await updateReview(editReview.id, rating, title, body);
      setEditReview(null);
      await load();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Could not update your review.');
    } finally {
      setEditBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteReviewTarget) return;
    setDeleteBusy(true);
    try {
      await deleteReview(deleteReviewTarget.id);
      setDeleteReviewTarget(null);
      await load();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Could not delete your review.');
    } finally {
      setDeleteBusy(false);
    }
  };

  const isWithinEditWindow = (review: ReviewWithRelations) => {
    const created = new Date(review.created_at).getTime();
    return Date.now() - created < REVIEW_EDIT_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  };

  if (!user) {
    return <div className="container-app py-16 text-center"><Button onClick={() => navigate('/signin')}>Sign In</Button></div>;
  }

  if (loading) {
    return <div className="container-app py-12 animate-pulse space-y-4"><div className="h-8 bg-cream-100 rounded w-1/3" /><div className="h-40 bg-cream-100 rounded-xl" /></div>;
  }

  return (
    <div className="container-app py-8 animate-fade-in max-w-4xl">
      <button onClick={() => navigate('/profile')} className="flex items-center gap-1 text-sm text-brand-600 hover:text-brand-800 mb-4 transition-colors">
        <ArrowLeft className="h-4 w-4" /> Back to profile
      </button>

      <div className="flex items-center gap-3 mb-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-100 text-brand-600">
          <Star className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-brand-900">My Reviews</h1>
          <p className="text-sm text-brand-500">Manage reviews you have submitted for your purchases</p>
        </div>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 text-sm text-red-700">{error}</div>
      )}

      {reviews.length === 0 ? (
        <EmptyState
          icon={<MessageSquare className="h-8 w-8" />}
          title="No reviews yet"
          description="After you receive a completed order, you can review the products you purchased."
          action={<Button onClick={() => navigate('/orders')}>View my orders</Button>}
        />
      ) : (
        <div className="space-y-4">
          {reviews.map((review) => {
            const canEdit = isWithinEditWindow(review);
            return (
              <div key={review.id} className="space-y-2">
                <div className="flex items-center justify-between rounded-lg bg-cream-50 border border-brand-100 px-4 py-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Package className="h-4 w-4 text-brand-400 shrink-0" />
                    <button
                      onClick={() => navigate(`/product/${review.product_id}`)}
                      className="text-sm font-medium text-brand-700 hover:text-brand-900 truncate"
                    >
                      View product
                    </button>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {review.status !== 'published' && (
                      <Badge variant={review.status === 'hidden' ? 'warning' : 'default'}>{review.status}</Badge>
                    )}
                    {canEdit ? (
                      <>
                        <button onClick={() => { setEditError(null); setEditReview(review); }} className="flex items-center gap-1 text-xs font-medium text-brand-500 hover:text-brand-800">
                          <Pencil className="h-3 w-3" /> Edit
                        </button>
                        <button onClick={() => setDeleteReviewTarget(review)} className="flex items-center gap-1 text-xs font-medium text-red-500 hover:text-red-700">
                          <Trash2 className="h-3 w-3" /> Delete
                        </button>
                      </>
                    ) : (
                      <span className="text-xs text-brand-400">Edit window expired</span>
                    )}
                  </div>
                </div>
                <ReviewCard review={review} />
                {review.edited_at && (
                  <p className="text-xs text-brand-400 px-1">Last edited {formatDateTime(review.edited_at)}</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {editReview && (
        <Modal
          open={!!editReview}
          onClose={() => { if (!editBusy) setEditReview(null); }}
          title="Edit Your Review"
          size="md"
        >
          <ReviewForm
            productTitle={`Review #${editReview.id.slice(0, 8)}`}
            productImage={null}
            shopName={null}
            initialRating={editReview.rating}
            initialTitle={editReview.title}
            initialBody={editReview.body}
            submitLabel="Save Changes"
            busy={editBusy}
            error={editError}
            onSubmit={handleEditSubmit}
            onCancel={() => setEditReview(null)}
          />
          <div className="mt-3 flex items-center gap-2 text-xs text-brand-400">
            <StarRating rating={editReview.rating} size={12} />
            <span>Edit window: {REVIEW_EDIT_WINDOW_DAYS} days from original submission</span>
          </div>
        </Modal>
      )}

      {deleteReviewTarget && (
        <Modal open={!!deleteReviewTarget} onClose={() => { if (!deleteBusy) setDeleteReviewTarget(null); }} title="Delete Review" size="sm">
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-lg bg-amber-50 border border-amber-200 p-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-sm text-amber-800">
                Are you sure you want to delete this review? This action cannot be undone. The review and its audit history will be permanently removed.
              </p>
            </div>
            {editError && <p className="text-sm text-red-600">{editError}</p>}
            <div className="flex justify-end gap-3">
              <Button variant="ghost" onClick={() => setDeleteReviewTarget(null)} disabled={deleteBusy}>Cancel</Button>
              <Button variant="danger" onClick={handleDelete} loading={deleteBusy}>Delete Review</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

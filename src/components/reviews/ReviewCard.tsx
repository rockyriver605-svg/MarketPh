import { useState } from 'react';
import { ThumbsUp, Flag, Store, BadgeCheck, Pencil, Trash2, Calendar } from 'lucide-react';
import type { ReviewWithRelations } from '@/types';
import { formatDateTime } from '@/lib/utils';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { StarRating } from '@/components/reviews/StarRating';
import { toggleReviewVote, reportReview, getRatingLabel } from '@/lib/reviews';
import { useAuth } from '@/contexts/AuthContext';
import { navigate } from '@/lib/router';

interface ReviewCardProps {
  review: ReviewWithRelations;
  sellerShopName?: string;
  onSellerResponse?: (review: ReviewWithRelations) => void;
  onSellerEditResponse?: (review: ReviewWithRelations, responseId: string, body: string) => void;
  onSellerDeleteResponse?: (responseId: string) => void;
  onEdit?: (review: ReviewWithRelations) => void;
  onDelete?: (review: ReviewWithRelations) => void;
}

const REPORT_REASONS = [
  { value: 'spam', label: 'Spam' },
  { value: 'harassment', label: 'Harassment' },
  { value: 'abusive', label: 'Abusive language' },
  { value: 'personal_info', label: 'Personal information' },
  { value: 'fake', label: 'Fake or fraudulent' },
  { value: 'irrelevant', label: 'Irrelevant content' },
  { value: 'manipulation', label: 'Suspected manipulation' },
  { value: 'other', label: 'Other' },
];

export function ReviewCard({ review, sellerShopName, onSellerResponse, onSellerEditResponse, onSellerDeleteResponse, onEdit, onDelete }: ReviewCardProps) {
  const { user } = useAuth();
  const [voteCount, setVoteCount] = useState(review.review_votes?.length ?? 0);
  const [hasVoted, setHasVoted] = useState(review.review_votes?.some((v) => v.user_id === user?.id) ?? false);
  const [voting, setVoting] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [reportReason, setReportReason] = useState('spam');
  const [reportDesc, setReportDesc] = useState('');
  const [reporting, setReporting] = useState(false);
  const [reportMsg, setReportMsg] = useState<string | null>(null);

  const response = review.review_responses?.[0] ?? null;
  const isOwnReview = user?.id === review.reviewer_id;
  const canRespond = onSellerResponse && !response && !isOwnReview;

  const handleVote = async () => {
    if (!user) { navigate('/signin'); return; }
    setVoting(true);
    try {
      const voted = await toggleReviewVote(review.id);
      setHasVoted(voted);
      setVoteCount((c) => voted ? c + 1 : c - 1);
    } catch (err) {
      setReportMsg(err instanceof Error ? err.message : 'Could not vote.');
    } finally {
      setVoting(false);
    }
  };

  const handleReport = async () => {
    if (!user) { navigate('/signin'); return; }
    setReporting(true);
    setReportMsg(null);
    try {
      await reportReview(review.id, reportReason, reportDesc);
      setReportMsg('Thank you. Your report has been submitted for review.');
      setShowReport(false);
      setReportDesc('');
    } catch (err) {
      setReportMsg(err instanceof Error ? err.message : 'Could not submit report.');
    } finally {
      setReporting(false);
    }
  };

  return (
    <div className="rounded-xl border border-brand-100 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-600">
            {review.reviewer?.display_name?.charAt(0).toUpperCase() ?? '?'}
          </div>
          <div>
            <p className="text-sm font-semibold text-brand-900">{review.reviewer?.display_name ?? 'Anonymous'}</p>
            <div className="flex items-center gap-2">
              <StarRating rating={review.rating} size={14} />
              <span className="text-xs text-brand-400">{getRatingLabel(review.rating)}</span>
            </div>
          </div>
        </div>
        {review.order_item_id && (
          <Badge variant="success"><BadgeCheck className="h-3 w-3" /> Verified Purchase</Badge>
        )}
      </div>

      {review.title && <h4 className="mt-3 text-sm font-semibold text-brand-800">{review.title}</h4>}
      {review.body && <p className="mt-1 text-sm text-brand-600 whitespace-pre-wrap">{review.body}</p>}

      {review.review_images && review.review_images.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {review.review_images.map((img) => (
            <img key={img.id} src={img.image_url} alt="Review photo" loading="lazy" className="h-20 w-20 rounded-lg object-cover border border-brand-100" />
          ))}
        </div>
      )}

      <div className="mt-3 flex items-center gap-3 text-xs text-brand-400">
        <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {formatDateTime(review.created_at)}</span>
        {review.edited_at && <span className="italic">(edited)</span>}
      </div>

      {response && (
        <div className="mt-3 rounded-lg bg-cream-50 border border-brand-100 p-3">
          <div className="flex items-center gap-2 mb-1">
            <Store className="h-3.5 w-3.5 text-brand-600" />
            <span className="text-xs font-semibold text-brand-700">Seller Response</span>
            {sellerShopName && <span className="text-xs text-brand-400">from {sellerShopName}</span>}
            {response.edited_at && <span className="text-xs italic text-brand-400">(edited)</span>}
          </div>
          <p className="text-sm text-brand-600">{response.body}</p>
          {onSellerEditResponse && (
            <button onClick={() => onSellerEditResponse(review, response.id, response.body)} className="mt-2 text-xs text-brand-500 hover:text-brand-800">
              Edit response
            </button>
          )}
          {onSellerDeleteResponse && (
            <button onClick={() => onSellerDeleteResponse(response.id)} className="ml-3 text-xs text-red-500 hover:text-red-700">
              Delete response
            </button>
          )}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-brand-50 pt-3">
        <button
          onClick={handleVote}
          disabled={voting || isOwnReview}
          className={`flex items-center gap-1.5 text-xs font-medium transition-colors ${hasVoted ? 'text-brand-700' : 'text-brand-500 hover:text-brand-800'} ${isOwnReview ? 'cursor-not-allowed opacity-50' : ''}`}
        >
          <ThumbsUp className={`h-3.5 w-3.5 ${hasVoted ? 'fill-current' : ''}`} />
          Helpful ({voteCount})
        </button>

        {canRespond && (
          <button onClick={() => onSellerResponse?.(review)} className="text-xs font-medium text-brand-500 hover:text-brand-800">
            Respond
          </button>
        )}

        {isOwnReview && onEdit && (
          <button onClick={() => onEdit(review)} className="flex items-center gap-1 text-xs font-medium text-brand-500 hover:text-brand-800">
            <Pencil className="h-3 w-3" /> Edit
          </button>
        )}
        {isOwnReview && onDelete && (
          <button onClick={() => onDelete(review)} className="flex items-center gap-1 text-xs font-medium text-red-500 hover:text-red-700">
            <Trash2 className="h-3 w-3" /> Delete
          </button>
        )}

        {!isOwnReview && (
          <button onClick={() => setShowReport(!showReport)} className="flex items-center gap-1 text-xs font-medium text-brand-400 hover:text-red-600">
            <Flag className="h-3 w-3" /> Report
          </button>
        )}
      </div>

      {showReport && (
        <div className="mt-3 rounded-lg border border-brand-100 bg-cream-50 p-3 space-y-2">
          <select
            value={reportReason}
            onChange={(e) => setReportReason(e.target.value)}
            className="w-full h-9 rounded-lg border border-brand-200 bg-white px-3 text-sm text-brand-900"
          >
            {REPORT_REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
          <textarea
            value={reportDesc}
            onChange={(e) => setReportDesc(e.target.value)}
            placeholder="Optional: describe the issue"
            rows={2}
            className="w-full rounded-lg border border-brand-200 bg-white p-2 text-sm text-brand-900"
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={handleReport} loading={reporting}>Submit report</Button>
            <Button size="sm" variant="ghost" onClick={() => setShowReport(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {reportMsg && <p className="mt-2 text-xs text-brand-500">{reportMsg}</p>}
    </div>
  );
}

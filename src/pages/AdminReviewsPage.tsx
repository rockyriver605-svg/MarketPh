import { useCallback, useEffect, useMemo, useState } from 'react';
import { Shield, ArrowLeft, MessageSquare, Search, Eye, EyeOff, Trash2, Flag } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { navigate } from '@/lib/router';
import type { ReviewWithRelations } from '@/types';
import { fetchAdminReviews, fetchReviewReports, moderateReview } from '@/lib/reviews';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { Textarea, Select } from '@/components/ui/Input';
import { ReviewCard } from '@/components/reviews/ReviewCard';
import { formatDateTime } from '@/lib/utils';

interface ReportRow {
  id: string;
  review_id: string | null;
  reporter_id: string;
  reason: string;
  description: string;
  status: string;
  created_at: string;
}

export function AdminReviewsPage() {
  const { user } = useAuth();
  const [reviews, setReviews] = useState<ReviewWithRelations[]>([]);
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'reviews' | 'reports'>('reports');
  const [modTarget, setModTarget] = useState<ReviewWithRelations | null>(null);
  const [modAction, setModAction] = useState<'hide' | 'approve' | 'reject'>('hide');
  const [modReason, setModReason] = useState('');
  const [modBusy, setModBusy] = useState(false);
  const [modError, setModError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [reviewData, reportData] = await Promise.all([
        fetchAdminReviews(statusFilter === 'all' ? undefined : statusFilter),
        fetchReviewReports(),
      ]);
      setReviews(reviewData);
      setReports(reportData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load moderation data.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  const filteredReviews = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return reviews;
    return reviews.filter((r) =>
      (r.body ?? '').toLowerCase().includes(q) ||
      (r.title ?? '').toLowerCase().includes(q) ||
      (r.reviewer?.display_name ?? '').toLowerCase().includes(q),
    );
  }, [reviews, search]);

  const pendingReports = useMemo(() => reports.filter((r) => r.status === 'pending'), [reports]);

  const handleModerate = async () => {
    if (!modTarget || !modReason.trim()) return;
    setModBusy(true);
    setModError(null);
    try {
      await moderateReview(modTarget.id, modAction, modReason.trim());
      setModTarget(null);
      setModReason('');
      setModAction('hide');
      await load();
    } catch (err) {
      setModError(err instanceof Error ? err.message : 'Moderation action failed.');
    } finally {
      setModBusy(false);
    }
  };

  const openModerate = (review: ReviewWithRelations, action: 'hide' | 'approve' | 'reject') => {
    setModError(null);
    setModTarget(review);
    setModAction(action);
    setModReason('');
  };

  if (!user) {
    return <div className="container-app py-16 text-center"><Button onClick={() => navigate('/signin')}>Sign In</Button></div>;
  }

  if (loading) {
    return <div className="container-app py-12 animate-pulse space-y-4"><div className="h-8 bg-cream-100 rounded w-1/3" /><div className="h-40 bg-cream-100 rounded-xl" /></div>;
  }

  return (
    <div className="container-app py-8 animate-fade-in max-w-4xl">
      <button onClick={() => navigate('/admin')} className="flex items-center gap-1 text-sm text-brand-600 hover:text-brand-800 mb-4 transition-colors">
        <ArrowLeft className="h-4 w-4" /> Back to admin
      </button>

      <div className="flex items-center gap-3 mb-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-100 text-brand-600">
          <Shield className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-brand-900">Review Moderation</h1>
          <p className="text-sm text-brand-500">Moderate reported reviews and manage review status</p>
        </div>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 text-sm text-red-700">{error}</div>
      )}

      <div className="flex gap-2 mb-5">
        <button
          onClick={() => setTab('reports')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'reports' ? 'bg-brand-600 text-white' : 'bg-white border border-brand-200 text-brand-700 hover:border-brand-400'}`}
        >
          <Flag className="inline h-4 w-4 mr-1.5" />
          Reports{pendingReports.length > 0 && <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-red-500 text-white text-xs px-1.5 py-0.5">{pendingReports.length}</span>}
        </button>
        <button
          onClick={() => setTab('reviews')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'reviews' ? 'bg-brand-600 text-white' : 'bg-white border border-brand-200 text-brand-700 hover:border-brand-400'}`}
        >
          <MessageSquare className="inline h-4 w-4 mr-1.5" />
          All Reviews
        </button>
      </div>

      {tab === 'reports' && (
        <>
          {pendingReports.length === 0 ? (
            <EmptyState
              icon={<Flag className="h-8 w-8" />}
              title="No pending reports"
              description="When users report reviews, they will appear here for moderation."
            />
          ) : (
            <div className="space-y-4">
              {pendingReports.map((report) => {
                const linkedReview = reviews.find((r) => r.id === report.review_id);
                return (
                  <div key={report.id} className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <Badge variant="warning">{report.reason}</Badge>
                      <span className="text-xs text-brand-400">{formatDateTime(report.created_at)}</span>
                    </div>
                    {report.description && <p className="text-sm text-amber-800">{report.description}</p>}
                    {linkedReview ? (
                      <>
                        <ReviewCard review={linkedReview} />
                        <div className="flex gap-2 pt-2 border-t border-amber-200">
                          <Button size="sm" variant="outline" onClick={() => openModerate(linkedReview, 'hide')}>
                            <EyeOff className="h-4 w-4" /> Hide review
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => openModerate(linkedReview, 'approve')}>
                            <Eye className="h-4 w-4" /> Keep published
                          </Button>
                          <Button size="sm" variant="danger" onClick={() => openModerate(linkedReview, 'reject')}>
                            <Trash2 className="h-4 w-4" /> Reject review
                          </Button>
                        </div>
                      </>
                    ) : (
                      <p className="text-sm text-brand-400">The review may have been deleted.</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {tab === 'reviews' && (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center mb-5">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-400" />
              <input
                type="search"
                placeholder="Search by content or reviewer"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full h-10 rounded-lg border border-brand-200 bg-white pl-9 pr-3 text-sm text-brand-900"
              />
            </div>
            <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-auto">
              <option value="all">All statuses</option>
              <option value="published">Published</option>
              <option value="hidden">Hidden</option>
              <option value="rejected">Rejected</option>
            </Select>
          </div>

          {filteredReviews.length > 0 ? (
            <div className="space-y-3">
              {filteredReviews.map((review) => (
                <div key={review.id} className="space-y-2">
                  <div className="flex items-center justify-between rounded-lg bg-cream-50 border border-brand-100 px-4 py-2">
                    <Badge variant={review.status === 'published' ? 'success' : review.status === 'hidden' ? 'warning' : 'default'}>
                      {review.status}
                    </Badge>
                    <div className="flex gap-2">
                      {review.status !== 'published' && (
                        <Button size="sm" variant="outline" onClick={() => openModerate(review, 'approve')}>
                          <Eye className="h-3.5 w-3.5" /> Publish
                        </Button>
                      )}
                      {review.status !== 'hidden' && (
                        <Button size="sm" variant="outline" onClick={() => openModerate(review, 'hide')}>
                          <EyeOff className="h-3.5 w-3.5" /> Hide
                        </Button>
                      )}
                      {review.status !== 'rejected' && (
                        <Button size="sm" variant="danger" onClick={() => openModerate(review, 'reject')}>
                          <Trash2 className="h-3.5 w-3.5" /> Reject
                        </Button>
                      )}
                    </div>
                  </div>
                  <ReviewCard review={review} />
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="No reviews found" description="No reviews match the current filters." />
          )}
        </>
      )}

      {modTarget && (
        <Modal open={!!modTarget} onClose={() => { if (!modBusy) setModTarget(null); }} title={`Moderation: ${modAction}`} size="sm">
          <div className="space-y-4">
            <div className="rounded-lg bg-cream-50 p-3">
              <p className="text-sm font-medium text-brand-800">{modTarget.title || 'Untitled review'}</p>
              <p className="text-sm text-brand-600 mt-1 line-clamp-3">{modTarget.body}</p>
              <p className="text-xs text-brand-400 mt-2">Rating: {modTarget.rating}/5</p>
            </div>
            <Textarea
              label="Moderation reason (required)"
              value={modReason}
              onChange={(e) => setModReason(e.target.value)}
              rows={3}
              placeholder="Explain why this action is being taken. This will be recorded in the audit log."
            />
            {modError && <p className="text-sm text-red-600">{modError}</p>}
            <div className="flex justify-end gap-3">
              <Button variant="ghost" onClick={() => setModTarget(null)} disabled={modBusy}>Cancel</Button>
              <Button
                onClick={handleModerate}
                loading={modBusy}
                disabled={!modReason.trim()}
                variant={modAction === 'approve' ? 'primary' : 'danger'}
              >
                Confirm {modAction}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

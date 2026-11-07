import { supabase } from '@/lib/supabase';
import type { ProductRatingSummary, ReviewWithRelations } from '@/types';

export const REVIEW_EDIT_WINDOW_DAYS = 7;
export const MAX_REVIEW_PHOTOS = 5;
export const MAX_REVIEW_BODY_LENGTH = 2000;
export const MAX_REVIEW_TITLE_LENGTH = 120;

export async function fetchProductRatingSummary(productId: string): Promise<ProductRatingSummary | null> {
  const { data, error } = await supabase.rpc('get_product_rating_summary', { p_product_id: productId });
  if (error || !data || !Array.isArray(data) || data.length === 0) return null;
  const row = data[0] as {
    avg_rating: number; total_reviews: number;
    five_star: number; four_star: number; three_star: number; two_star: number; one_star: number;
  };
  return {
    avg_rating: Number(row.avg_rating) || 0,
    total_reviews: Number(row.total_reviews) || 0,
    five_star: Number(row.five_star) || 0,
    four_star: Number(row.four_star) || 0,
    three_star: Number(row.three_star) || 0,
    two_star: Number(row.two_star) || 0,
    one_star: Number(row.one_star) || 0,
  };
}

export async function fetchProductReviews(productId: string): Promise<ReviewWithRelations[]> {
  const { data, error } = await supabase
    .from('reviews')
    .select(`
      *,
      reviewer:profiles!reviewer_id(id, display_name, username, avatar_url),
      review_images(*),
      review_votes(*),
      review_responses(*)
    `)
    .eq('product_id', productId)
    .eq('status', 'published')
    .order('created_at', { ascending: false });
  if (error) throw new Error('Reviews could not be loaded.');
  return (data ?? []) as unknown as ReviewWithRelations[];
}

export async function fetchMyReviews(userId: string): Promise<ReviewWithRelations[]> {
  const { data, error } = await supabase
    .from('reviews')
    .select(`
      *,
      reviewer:profiles!reviewer_id(id, display_name, username, avatar_url),
      review_images(*),
      review_responses(*)
    `)
    .eq('reviewer_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw new Error('Your reviews could not be loaded.');
  return (data ?? []) as unknown as ReviewWithRelations[];
}

export async function fetchSellerReviews(sellerId: string): Promise<ReviewWithRelations[]> {
  const { data, error } = await supabase
    .from('reviews')
    .select(`
      *,
      reviewer:profiles!reviewer_id(id, display_name, username, avatar_url),
      review_images(*),
      review_votes(*),
      review_responses(*)
    `)
    .eq('seller_id', sellerId)
    .order('created_at', { ascending: false });
  if (error) throw new Error('Reviews could not be loaded.');
  return (data ?? []) as unknown as ReviewWithRelations[];
}

export async function fetchAdminReviews(status?: string): Promise<ReviewWithRelations[]> {
  let query = supabase
    .from('reviews')
    .select(`
      *,
      reviewer:profiles!reviewer_id(id, display_name, username, avatar_url),
      review_images(*),
      review_votes(*),
      review_responses(*)
    `)
    .order('created_at', { ascending: false });
  if (status && status !== 'all') query = query.eq('status', status);
  const { data, error } = await query;
  if (error) throw new Error('Reviews could not be loaded.');
  return (data ?? []) as unknown as ReviewWithRelations[];
}

export async function fetchReviewReports(): Promise<{ id: string; review_id: string | null; reporter_id: string; reason: string; description: string; status: string; created_at: string }[]> {
  const { data, error } = await supabase
    .from('review_reports')
    .select('id, review_id, reporter_id, reason, description, status, created_at')
    .order('created_at', { ascending: false });
  if (error) throw new Error('Reports could not be loaded.');
  return (data ?? []) as { id: string; review_id: string | null; reporter_id: string; reason: string; description: string; status: string; created_at: string }[];
}

export async function submitReview(orderItemId: string, rating: number, title: string, body: string): Promise<string> {
  const { data, error } = await supabase.rpc('submit_review', {
    p_order_item_id: orderItemId,
    p_rating: rating,
    p_title: title,
    p_body: body,
  });
  if (error) throw new Error(error.message.replace(/^ERROR:\s*/, ''));
  return data as string;
}

export async function updateReview(reviewId: string, rating: number, title: string, body: string): Promise<void> {
  const { error } = await supabase.rpc('update_review', {
    p_review_id: reviewId,
    p_rating: rating,
    p_title: title,
    p_body: body,
  });
  if (error) throw new Error(error.message.replace(/^ERROR:\s*/, ''));
}

export async function deleteReview(reviewId: string): Promise<void> {
  const { error } = await supabase.rpc('delete_review', { p_review_id: reviewId });
  if (error) throw new Error(error.message.replace(/^ERROR:\s*/, ''));
}

export async function toggleReviewVote(reviewId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('toggle_review_vote', { p_review_id: reviewId });
  if (error) throw new Error(error.message.replace(/^ERROR:\s*/, ''));
  return data as boolean;
}

export async function submitReviewResponse(reviewId: string, body: string): Promise<void> {
  const { error } = await supabase.rpc('submit_review_response', { p_review_id: reviewId, p_body: body });
  if (error) throw new Error(error.message.replace(/^ERROR:\s*/, ''));
}

export async function updateReviewResponse(responseId: string, body: string): Promise<void> {
  const { error } = await supabase.rpc('update_review_response', { p_response_id: responseId, p_body: body });
  if (error) throw new Error(error.message.replace(/^ERROR:\s*/, ''));
}

export async function deleteReviewResponse(responseId: string): Promise<void> {
  const { error } = await supabase.rpc('delete_review_response', { p_response_id: responseId });
  if (error) throw new Error(error.message.replace(/^ERROR:\s*/, ''));
}

export async function reportReview(reviewId: string, reason: string, description: string): Promise<void> {
  const { error } = await supabase.rpc('report_review', {
    p_review_id: reviewId,
    p_reason: reason,
    p_description: description,
  });
  if (error) throw new Error(error.message.replace(/^ERROR:\s*/, ''));
}

export async function moderateReview(reviewId: string, action: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc('moderate_review', {
    p_review_id: reviewId,
    p_action: action,
    p_reason: reason,
  });
  if (error) throw new Error(error.message.replace(/^ERROR:\s*/, ''));
}

export async function uploadReviewImage(reviewId: string, file: File, sortOrder: number): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
  const path = `${reviewId}/${crypto.randomUUID()}.${ext}`;
  const { error: uploadError } = await supabase.storage.from('review-photos').upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (uploadError) throw new Error('The photo could not be uploaded. Please try again.');

  const { data: urlData } = supabase.storage.from('review-photos').getPublicUrl(path);
  const imageUrl = urlData.publicUrl;

  const { error: insertError } = await supabase
    .from('review_images')
    .insert({ review_id: reviewId, image_url: imageUrl, sort_order: sortOrder });
  if (insertError) throw new Error('The photo was uploaded but could not be saved to the review.');

  return imageUrl;
}

export async function deleteReviewImage(imageId: string, imageUrl: string): Promise<void> {
  const path = imageUrl.split('/review-photos/')[1];
  if (path) {
    await supabase.storage.from('review-photos').remove([path]);
  }
  const { error } = await supabase.from('review_images').delete().eq('id', imageId);
  if (error) throw new Error('The photo could not be removed.');
}

export function getRatingLabel(rating: number): string {
  switch (rating) {
    case 5: return 'Excellent';
    case 4: return 'Good';
    case 3: return 'Average';
    case 2: return 'Poor';
    case 1: return 'Very Poor';
    default: return '';
  }
}

export type ReviewSortKey = 'recent' | 'oldest' | 'highest' | 'lowest' | 'helpful';
export type ReviewFilter = 'all' | '5' | '4' | '3' | '2' | '1' | 'photos' | 'verified';

export interface ReviewViewState {
  filter: ReviewFilter;
  sort: ReviewSortKey;
  search: string;
}

export function sortAndFilterReviews(reviews: ReviewWithRelations[], state: ReviewViewState): ReviewWithRelations[] {
  let result = [...reviews];

  if (state.filter !== 'all' && state.filter !== 'photos' && state.filter !== 'verified') {
    const star = Number(state.filter);
    result = result.filter((r) => r.rating === star);
  }
  if (state.filter === 'photos') {
    result = result.filter((r) => (r.review_images?.length ?? 0) > 0);
  }
  if (state.filter === 'verified') {
    result = result.filter((r) => r.order_item_id !== null);
  }

  const search = state.search.trim().toLowerCase();
  if (search) {
    result = result.filter((r) =>
      (r.body ?? '').toLowerCase().includes(search) ||
      (r.title ?? '').toLowerCase().includes(search),
    );
  }

  switch (state.sort) {
    case 'oldest':
      result.sort((a, b) => a.created_at.localeCompare(b.created_at));
      break;
    case 'highest':
      result.sort((a, b) => b.rating - a.rating);
      break;
    case 'lowest':
      result.sort((a, b) => a.rating - b.rating);
      break;
    case 'helpful':
      result.sort((a, b) => (b.review_votes?.length ?? 0) - (a.review_votes?.length ?? 0));
      break;
    default:
      result.sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
  return result;
}

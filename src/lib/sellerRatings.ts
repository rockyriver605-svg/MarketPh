import { supabase } from '@/lib/supabase';

export interface SellerRatingSummary {
  avg_rating: number;
  total_reviews: number;
}

export async function fetchSellerRatingSummary(sellerId: string): Promise<SellerRatingSummary | null> {
  const { data, error } = await supabase.rpc('get_seller_rating_summary', { p_seller_id: sellerId });
  if (error || !data || !Array.isArray(data) || data.length === 0) return null;
  const row = data[0] as { avg_rating: number | null; total_reviews: number | string };
  return {
    avg_rating: Number(row.avg_rating) || 0,
    total_reviews: Number(row.total_reviews) || 0,
  };
}

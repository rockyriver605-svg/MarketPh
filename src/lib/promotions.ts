/**
 * Promotions & Coupons data-access layer.
 *
 * All operations go through Supabase with RLS enforcing ownership.
 * Coupon validation and redemption use SECURITY DEFINER RPCs for
 * concurrency safety and tamper prevention.
 */

import { supabase } from '@/lib/supabase';

export type PromotionType =
  | 'percentage' | 'fixed_amount' | 'buy_one_get_one' | 'buy_more_save_more'
  | 'bundle' | 'free_delivery' | 'product_specific' | 'storewide';

export type PromotionStatus = 'draft' | 'pending_review' | 'active' | 'paused' | 'expired' | 'rejected';
export type CouponDiscountType = 'percentage' | 'fixed_amount';
export type CouponStatus = 'active' | 'inactive' | 'expired';

export interface Promotion {
  id: string;
  seller_id: string;
  name: string;
  description: string | null;
  type: PromotionType;
  discount_value: number;
  min_purchase: number;
  max_discount: number | null;
  max_redemptions: number | null;
  per_buyer_limit: number;
  start_at: string;
  end_at: string;
  status: PromotionStatus;
  visibility: 'public' | 'storefront_only';
  municipality_id: string | null;
  terms: string | null;
  total_redemptions: number;
  created_at: string;
  updated_at: string;
}

export interface Coupon {
  id: string;
  promotion_id: string | null;
  seller_id: string;
  code: string;
  description: string | null;
  discount_type: CouponDiscountType;
  discount_value: number;
  min_purchase: number;
  max_discount: number | null;
  start_at: string;
  end_at: string;
  max_redemptions: number | null;
  per_buyer_limit: number;
  status: CouponStatus;
  total_redemptions: number;
  created_at: string;
  updated_at: string;
}

export interface CouponWithSeller extends Coupon {
  seller?: { shop_name: string; slug: string } | null;
}

export interface CouponRedemption {
  id: string;
  coupon_id: string;
  buyer_id: string;
  order_id: string;
  discount_amount: number;
  status: 'redeemed' | 'released';
  created_at: string;
}

export interface ValidateCouponResult {
  valid: boolean;
  coupon_id: string | null;
  seller_id: string | null;
  discount_amount: number;
  discount_type: string | null;
  reason: string | null;
}

export const PROMOTION_TYPE_LABELS: Record<PromotionType, string> = {
  percentage: 'Percentage Discount',
  fixed_amount: 'Fixed Amount Off',
  buy_one_get_one: 'Buy One Get One',
  buy_more_save_more: 'Buy More Save More',
  bundle: 'Bundle Discount',
  free_delivery: 'Free Delivery',
  product_specific: 'Product-Specific',
  storewide: 'Storewide',
};

export const PROMOTION_STATUS_LABELS: Record<PromotionStatus, string> = {
  draft: 'Draft',
  pending_review: 'Pending Review',
  active: 'Active',
  paused: 'Paused',
  expired: 'Expired',
  rejected: 'Rejected',
};

export async function fetchSellerPromotions(sellerId: string): Promise<Promotion[]> {
  const { data, error } = await supabase
    .from('promotions')
    .select('*')
    .eq('seller_id', sellerId)
    .order('created_at', { ascending: false });
  if (error) throw new Error('Could not load promotions.');
  return (data ?? []) as Promotion[];
}

export async function fetchSellerCoupons(sellerId: string): Promise<Coupon[]> {
  const { data, error } = await supabase
    .from('coupons')
    .select('*')
    .eq('seller_id', sellerId)
    .order('created_at', { ascending: false });
  if (error) throw new Error('Could not load coupons.');
  return (data ?? []) as Coupon[];
}

export async function fetchActivePublicPromotions(municipalityId?: string): Promise<(Promotion & { seller?: { shop_name: string; slug: string } })[]> {
  let q = supabase
    .from('promotions')
    .select(`
      *,
      seller:seller_profiles(shop_name, slug)
    `)
    .eq('status', 'active')
    .eq('visibility', 'public')
    .lte('start_at', new Date().toISOString())
    .gte('end_at', new Date().toISOString())
    .order('created_at', { ascending: false });
  if (municipalityId) q = q.eq('municipality_id', municipalityId);
  const { data, error } = await q;
  if (error) throw new Error('Could not load promotions.');
  return (data ?? []) as (Promotion & { seller?: { shop_name: string; slug: string } })[];
}

export async function fetchActivePublicCoupons(): Promise<CouponWithSeller[]> {
  const couponQ = supabase
    .from('coupons')
    .select(`
      *,
      seller:seller_profiles!coupons_seller_id_fkey(shop_name, slug)
    `)
    .eq('status', 'active')
    .lte('start_at', new Date().toISOString())
    .gte('end_at', new Date().toISOString())
    .order('created_at', { ascending: false });
  const { data, error } = await couponQ;
  if (error) throw new Error('Could not load coupons.');
  return (data ?? []) as CouponWithSeller[];
}

export async function fetchSavedCouponIds(buyerId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('buyer_saved_coupons')
    .select('coupon_id')
    .eq('buyer_id', buyerId);
  if (error) return new Set();
  return new Set((data ?? []).map((r: { coupon_id: string }) => r.coupon_id));
}

export async function saveCoupon(buyerId: string, couponId: string): Promise<void> {
  const { error } = await supabase
    .from('buyer_saved_coupons')
    .insert({ buyer_id: buyerId, coupon_id: couponId });
  if (error) throw new Error('Could not save coupon.');
}

export async function unsaveCoupon(buyerId: string, couponId: string): Promise<void> {
  const { error } = await supabase
    .from('buyer_saved_coupons')
    .delete()
    .eq('buyer_id', buyerId)
    .eq('coupon_id', couponId);
  if (error) throw new Error('Could not remove saved coupon.');
}

export async function validateCouponCode(
  code: string,
  buyerId: string,
  sellerSubtotal: number,
): Promise<ValidateCouponResult> {
  const { data, error } = await supabase.rpc('validate_coupon', {
    p_code: code,
    p_buyer_id: buyerId,
    p_seller_subtotal: sellerSubtotal,
  });
  if (error) throw new Error(error.message);
  const row = (data as ValidateCouponResult[][])?.[0] ?? (data as ValidateCouponResult);
  if (Array.isArray(row)) return row[0];
  return row;
}

export async function redeemCoupon(
  couponId: string,
  buyerId: string,
  orderId: string,
  discountAmount: number,
): Promise<{ success: boolean; reason: string | null }> {
  const { data, error } = await supabase.rpc('redeem_coupon', {
    p_coupon_id: couponId,
    p_buyer_id: buyerId,
    p_order_id: orderId,
    p_discount_amount: discountAmount,
  });
  if (error) throw new Error(error.message);
  const row = (data as { success: boolean; reason: string | null }[][])?.[0] ?? (data as { success: boolean; reason: string | null });
  if (Array.isArray(row)) return row[0];
  return row;
}

export async function createPromotion(
  sellerId: string,
  input: Omit<Promotion, 'id' | 'seller_id' | 'total_redemptions' | 'created_at' | 'updated_at'>,
): Promise<Promotion> {
  const { data, error } = await supabase
    .from('promotions')
    .insert({ ...input, seller_id: sellerId })
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data as Promotion;
}

export async function updatePromotion(id: string, patch: Partial<Promotion>): Promise<void> {
  const { error } = await supabase
    .from('promotions')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deletePromotion(id: string): Promise<void> {
  const { error } = await supabase.from('promotions').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function createCoupon(
  sellerId: string,
  input: Omit<Coupon, 'id' | 'seller_id' | 'total_redemptions' | 'created_at' | 'updated_at' | 'promotion_id'> & { promotion_id?: string | null },
): Promise<Coupon> {
  const { data, error } = await supabase
    .from('coupons')
    .insert({ ...input, seller_id: sellerId, code: input.code.toUpperCase() })
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data as Coupon;
}

export async function updateCoupon(id: string, patch: Partial<Coupon>): Promise<void> {
  const { error } = await supabase
    .from('coupons')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteCoupon(id: string): Promise<void> {
  const { error } = await supabase.from('coupons').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function fetchPromotionProducts(promotionId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('promotion_products')
    .select('product_id')
    .eq('promotion_id', promotionId);
  if (error) return [];
  return (data ?? []).map((r: { product_id: string }) => r.product_id);
}

export async function setPromotionProducts(promotionId: string, productIds: string[]): Promise<void> {
  await supabase.from('promotion_products').delete().eq('promotion_id', promotionId);
  if (productIds.length > 0) {
    const rows = productIds.map((pid) => ({ promotion_id: promotionId, product_id: pid }));
    const { error } = await supabase.from('promotion_products').insert(rows);
    if (error) throw new Error(error.message);
  }
}

export async function fetchCouponRedemptions(sellerId: string): Promise<(CouponRedemption & { coupon?: { code: string } })[]> {
  const { data, error } = await supabase
    .from('coupon_redemptions')
    .select(`
      *,
      coupon:coupons!coupon_redemptions_coupon_id_fkey(code)
    `)
    .in('coupon_id', (
      await supabase.from('coupons').select('id').eq('seller_id', sellerId)
    ).data?.map((c: { id: string }) => c.id) ?? [])
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) return [];
  return (data ?? []) as (CouponRedemption & { coupon?: { code: string } })[];
}

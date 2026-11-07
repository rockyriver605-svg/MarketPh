/**
 * Rider Network — data access service.
 *
 * Thin Supabase wrappers. All functions return real rows only; none fabricate
 * records. They are ready to call once the rider_* migrations are applied.
 */

import { supabase } from '@/lib/supabase';
import { RIDER_TABLES } from '@/rider-network/schemas/tables';
import type { RiderProfile, DeliveryRequest, RiderQuotation, RiderReview, RiderEarning } from '@/rider-network/types';

export async function fetchRiderProfileByUserId(userId: string): Promise<RiderProfile | null> {
  const { data, error } = await supabase
    .from(RIDER_TABLES.riderProfiles)
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error('Could not load rider profile.');
  return data as RiderProfile | null;
}

export async function fetchOpenDeliveryRequests(municipalityId?: string): Promise<DeliveryRequest[]> {
  let query = supabase
    .from(RIDER_TABLES.deliveryRequests)
    .select('*')
    .eq('status', 'open')
    .order('created_at', { ascending: false });
  if (municipalityId) {
    query = query.or(`pickup_municipality_id.eq.${municipalityId},dropoff_municipality_id.eq.${municipalityId}`);
  }
  const { data, error } = await query;
  if (error) throw new Error('Could not load delivery requests.');
  return (data ?? []) as DeliveryRequest[];
}

export async function fetchRiderReviews(riderId: string): Promise<RiderReview[]> {
  const { data, error } = await supabase
    .from(RIDER_TABLES.riderReviews)
    .select('*')
    .eq('rider_id', riderId)
    .order('created_at', { ascending: false });
  if (error) throw new Error('Could not load rider reviews.');
  return (data ?? []) as RiderReview[];
}

export async function fetchRiderEarnings(riderId: string): Promise<RiderEarning[]> {
  const { data, error } = await supabase
    .from(RIDER_TABLES.riderEarnings)
    .select('*')
    .eq('rider_id', riderId)
    .order('created_at', { ascending: false });
  if (error) throw new Error('Could not load rider earnings.');
  return (data ?? []) as RiderEarning[];
}

export async function submitQuotation(
  deliveryRequestId: string,
  riderId: string,
  quotedPricePhp: number,
  estimatedMinutes: number | null,
  message: string | null,
  expiresAt: string | null,
): Promise<RiderQuotation> {
  const { data, error } = await supabase
    .from(RIDER_TABLES.riderQuotations)
    .insert({
      delivery_request_id: deliveryRequestId,
      rider_id: riderId,
      quoted_price_php: quotedPricePhp,
      estimated_minutes: estimatedMinutes,
      message,
      expires_at: expiresAt,
      status: 'pending',
    })
    .select('*')
    .single();
  if (error || !data) throw new Error('Could not submit quotation.');
  return data as RiderQuotation;
}

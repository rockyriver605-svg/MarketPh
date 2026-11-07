/**
 * Rider Network — Supabase Realtime integration.
 *
 * Subscribes to rider-specific channels. No private seller inventory or
 * rider personal data is exposed on public channels — subscriptions are
 * scoped to the authenticated user and the tables' RLS policies.
 */

import { supabase } from '@/lib/supabase';
import { RIDER_REALTIME_CHANNELS, RIDER_TABLES } from '@/rider-network/schemas/tables';

export function subscribeToDeliveryRequests(onChange: () => void) {
  return supabase
    .channel(RIDER_REALTIME_CHANNELS.deliveryRequests)
    .on('postgres_changes', { event: '*', schema: 'public', table: RIDER_TABLES.deliveryRequests }, onChange)
    .subscribe();
}

export function subscribeToRiderAvailability(riderId: string, onChange: () => void) {
  return supabase
    .channel(RIDER_REALTIME_CHANNELS.availability)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: RIDER_TABLES.riderAvailabilityLog, filter: `rider_id=eq.${riderId}` },
      onChange,
    )
    .subscribe();
}

export function subscribeToDeliveryTracking(deliveryId: string, onChange: () => void) {
  return supabase
    .channel(`${RIDER_REALTIME_CHANNELS.deliveryTracking}:${deliveryId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: RIDER_TABLES.deliveryTracking, filter: `delivery_id=eq.${deliveryId}` },
      onChange,
    )
    .subscribe();
}

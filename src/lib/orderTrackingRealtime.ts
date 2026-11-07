import { supabase } from '@/lib/supabase';

export type RealtimeState = 'connecting' | 'live' | 'offline';

export function subscribeToOrderTracking(
  orderId: string,
  onChange: () => void,
  onState: (state: RealtimeState) => void,
): () => void {
  const channel = supabase
    .channel(`order-tracking-${orderId}`)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${orderId}` }, onChange)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'order_status_history', filter: `order_id=eq.${orderId}` }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'deliveries', filter: `order_id=eq.${orderId}` }, onChange)
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        onState('live');
        onChange();
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        onState('offline');
      } else {
        onState('connecting');
      }
    });

  return () => {
    supabase.removeChannel(channel);
  };
}

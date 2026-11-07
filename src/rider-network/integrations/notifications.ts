/**
 * Rider Network — notification integration.
 *
 * Reuses the existing MariMarket notifications table. Rider-specific events
 * are inserted as real rows; no notifications are generated without an
 * authenticated user and a real triggering event.
 */

import { supabase } from '@/lib/supabase';
import type { NotificationType } from '@/types';

export interface RiderNotificationPayload {
  userId: string;
  type: NotificationType | 'rider';
  title: string;
  body: string;
  link: string;
  data?: Record<string, unknown>;
}

export async function sendRiderNotification(payload: RiderNotificationPayload): Promise<void> {
  const { error } = await supabase.from('notifications').insert({
    user_id: payload.userId,
    type: payload.type,
    title: payload.title,
    body: payload.body,
    link: payload.link,
    data: payload.data ?? {},
    is_read: false,
  });
  if (error) throw new Error('Could not send rider notification.');
}

/**
 * Rider Network — useRiderAvailability hook.
 *
 * Tracks the rider's online/offline/busy state in React and syncs to the
 * rider_profiles table. The authoritative state lives in Supabase; this
 * hook only mirrors it. Realtime updates are wired once the table exists.
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { RIDER_TABLES } from '@/rider-network/schemas/tables';
import type { RiderAvailability } from '@/rider-network/types';

export interface UseRiderAvailabilityResult {
  availability: RiderAvailability;
  setAvailability: (next: RiderAvailability) => Promise<void>;
  busy: boolean;
}

export function useRiderAvailability(riderId: string | null): UseRiderAvailabilityResult {
  const [availability, setAvailabilityState] = useState<RiderAvailability>('offline');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!riderId) return;
    (async () => {
      const { data } = await supabase
        .from(RIDER_TABLES.riderProfiles)
        .select('availability')
        .eq('id', riderId)
        .maybeSingle();
      if (data) setAvailabilityState(data.availability as RiderAvailability);
    })();
  }, [riderId]);

  const setAvailability = useCallback(async (next: RiderAvailability) => {
    if (!riderId) return;
    setBusy(true);
    try {
      const { error } = await supabase
        .from(RIDER_TABLES.riderProfiles)
        .update({ availability: next, is_available: next === 'online', updated_at: new Date().toISOString() })
        .eq('id', riderId);
      if (!error) setAvailabilityState(next);
    } finally {
      setBusy(false);
    }
  }, [riderId]);

  return { availability, setAvailability, busy };
}

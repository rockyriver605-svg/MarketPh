/**
 * Rider Network — useRiderProfile hook.
 *
 * Loads the authenticated user's rider profile from Supabase. Returns null
 * when the user has not applied as a rider — no fake profile is synthesized.
 */

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { fetchRiderProfileByUserId } from '@/rider-network/services/riderService';
import type { RiderProfile } from '@/rider-network/types';

export interface UseRiderProfileResult {
  profile: RiderProfile | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

export function useRiderProfile(): UseRiderProfileResult {
  const { user } = useAuth();
  const [profile, setProfile] = useState<RiderProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (!user) {
      setProfile(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await fetchRiderProfileByUserId(user.id);
      setProfile(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load rider profile.');
      setProfile(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  return { profile, loading, error, reload: load };
}

/**
 * Rider Network — availability toggle.
 *
 * Lets a verified rider switch between Online / Busy / Offline. Calls the
 * useRiderAvailability hook, which writes the authoritative state to Supabase.
 * Renders nothing when no rider profile is loaded.
 */

import { Bike, Clock, Power } from 'lucide-react';
import { useRiderAvailability } from '@/rider-network/hooks/useRiderAvailability';
import { RIDER_AVAILABILITY_LABELS } from '@/rider-network/constants';
import type { RiderAvailability } from '@/rider-network/types';

const OPTIONS: { value: RiderAvailability; icon: typeof Bike; tone: string }[] = [
  { value: 'online', icon: Bike, tone: 'bg-green-600 text-white' },
  { value: 'busy', icon: Clock, tone: 'bg-amber-500 text-white' },
  { value: 'offline', icon: Power, tone: 'bg-brand-200 text-brand-700' },
];

export function RiderAvailabilityToggle({ riderId }: { riderId: string }) {
  const { availability, setAvailability, busy } = useRiderAvailability(riderId);

  return (
    <div className="bg-white rounded-xl border border-brand-100 p-4">
      <p className="text-xs font-medium text-brand-500 mb-3">Your availability</p>
      <div className="grid grid-cols-3 gap-2">
        {OPTIONS.map((opt) => {
          const Icon = opt.icon;
          const isActive = availability === opt.value;
          return (
            <button
              key={opt.value}
              disabled={busy}
              onClick={() => void setAvailability(opt.value)}
              className={`flex flex-col items-center gap-1.5 py-3 rounded-lg text-xs font-medium transition-all ${
                isActive ? opt.tone : 'bg-cream-50 text-brand-600 hover:bg-cream-100'
              } ${busy ? 'opacity-60' : ''}`}
            >
              <Icon className="h-5 w-5" />
              {RIDER_AVAILABILITY_LABELS[opt.value]}
            </button>
          );
        })}
      </div>
    </div>
  );
}

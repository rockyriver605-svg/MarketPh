/**
 * Rider Network — Hanap Rider (find a rider) placeholder.
 *
 * Shows the six municipalities as filter chips and an honest empty state.
 * No riders are fabricated; the list will populate from Supabase once
 * verified rider profiles exist.
 */

import { MapPinned } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { RiderLayout } from '@/rider-network/layouts/RiderLayout';
import { RIDER_MUNICIPALITIES } from '@/rider-network/constants';

export function HanapRiderPage() {
  return (
    <RiderLayout active="hanap">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-brand-900 mb-1">Hanap Rider</h1>
        <p className="text-sm text-brand-500">Find available riders across Marinduque.</p>
      </div>
      <div className="flex flex-wrap gap-2 mb-6">
        {RIDER_MUNICIPALITIES.map((name) => (
          <span key={name} className="text-xs font-medium px-3 py-1.5 rounded-full bg-white border border-brand-200 text-brand-700">
            {name}
          </span>
        ))}
      </div>
      <EmptyState
        icon={<MapPinned className="h-8 w-8" />}
        title="No available riders yet"
        description="Once riders are verified and set themselves online, they'll appear here by municipality."
      />
    </RiderLayout>
  );
}

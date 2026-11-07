/**
 * Rider Network — rider dashboard placeholder.
 *
 * Renders an honest empty state until the rider has a profile. Uses the
 * useRiderProfile hook so a real profile (when it exists) is loaded.
 */

import { Bike, ArrowLeft } from 'lucide-react';
import { navigate } from '@/lib/router';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { RiderLayout } from '@/rider-network/layouts/RiderLayout';
import { useRiderProfile } from '@/rider-network/hooks/useRiderProfile';
import { RiderAvailabilityToggle } from '@/rider-network/components/RiderAvailabilityToggle';
import { RIDER_NETWORK_ROUTE_PREFIX } from '@/rider-network/constants';

export function RiderDashboardPage() {
  const { user } = useAuth();
  const { profile, loading } = useRiderProfile();

  if (!user) {
    return (
      <RiderLayout active="dashboard">
        <EmptyState
          icon={<Bike className="h-8 w-8" />}
          title="Sign in to access your rider dashboard"
          description="Rider tools are available to verified MariMarket rider partners."
          action={<Button onClick={() => navigate('/signin')}>Sign In</Button>}
        />
      </RiderLayout>
    );
  }

  if (loading) {
    return <RiderLayout active="dashboard"><div className="h-40 bg-cream-100 rounded-xl animate-pulse" /></RiderLayout>;
  }

  if (!profile) {
    return (
      <RiderLayout active="dashboard">
        <button onClick={() => navigate(RIDER_NETWORK_ROUTE_PREFIX)} className="flex items-center gap-1 text-sm text-brand-600 hover:text-brand-800 mb-4 transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back to Rider Network
        </button>
        <EmptyState
          icon={<Bike className="h-8 w-8" />}
          title="You're not a rider yet"
          description="Rider registration will open here once the verification flow is available. Your existing MariMarket account will be reused."
        />
      </RiderLayout>
    );
  }

  return (
    <RiderLayout active="dashboard">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-brand-900">Rider Dashboard</h1>
          <p className="text-sm text-brand-500">Welcome back, {profile.display_name}.</p>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <RiderAvailabilityToggle riderId={profile.id} />
        <div className="bg-white rounded-xl border border-brand-100 p-4">
          <p className="text-xs font-medium text-brand-500 mb-1">Completed deliveries</p>
          <p className="text-2xl font-bold text-brand-900">{profile.completed_deliveries}</p>
          <p className="text-xs text-brand-400 mt-1">Rating: {profile.rating_average.toFixed(1)} ({profile.rating_count})</p>
        </div>
      </div>
      <EmptyState
        icon={<Bike className="h-8 w-8" />}
        title="No active deliveries"
        description="Open delivery requests will appear here once the marketplace is live."
      />
    </RiderLayout>
  );
}

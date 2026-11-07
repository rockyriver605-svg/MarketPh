/**
 * Rider Network — public hub page.
 *
 * Entry point for the Rider Partner Network. Shows what the network is, the
 * six Marinduque municipalities it serves, and the roadmap of features. No
 * fabricated riders, stats, or availability are shown.
 */

import { Bike, UserPlus, MapPinned, Wallet, Star, ShieldCheck, PackageCheck, MessageSquare, AlertTriangle, BarChart3, CalendarClock, Truck, Repeat, Users, Receipt, BadgeCheck } from 'lucide-react';
import { navigate } from '@/lib/router';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { RiderLayout } from '@/rider-network/layouts/RiderLayout';
import { RiderFeatureCard } from '@/rider-network/components/RiderFeatureCard';
import { RIDER_MUNICIPALITIES, RIDER_NETWORK_ROUTE_PREFIX } from '@/rider-network/constants';

const FEATURES = [
  { icon: UserPlus, title: 'Rider Registration', description: 'Apply to become a verified MariMarket rider partner using your existing account.', status: 'coming_soon' as const },
  { icon: ShieldCheck, title: 'Rider Verification', description: 'Admins review documents and approve riders before they accept deliveries.', status: 'coming_soon' as const },
  { icon: BadgeCheck, title: 'Rider Public Profiles', description: 'Each verified rider gets a public profile showing service areas and rating.', status: 'coming_soon' as const },
  { icon: Bike, title: 'Rider Dashboard', description: 'Manage availability, active deliveries, and earnings from one screen.', status: 'coming_soon' as const },
  { icon: MapPinned, title: 'Hanap Rider', description: 'Customers find available riders across the six municipalities of Marinduque.', status: 'coming_soon' as const },
  { icon: PackageCheck, title: 'Delivery Request Marketplace', description: 'Open delivery requests that nearby riders can quote on.', status: 'coming_soon' as const },
  { icon: Receipt, title: 'Rider Quotations', description: 'Riders send price quotes; customers accept the one that fits.', status: 'coming_soon' as const },
  { icon: Bike, title: 'Pabili Service', description: 'Ask a rider to buy items for you and deliver them.', status: 'coming_soon' as const },
  { icon: Truck, title: 'May Bakanteng Biyahe', description: 'Riders post empty trips so others can book the spare capacity.', status: 'coming_soon' as const },
  { icon: Repeat, title: 'Return Trip Booking', description: 'Book a rider who is already heading back to your area.', status: 'coming_soon' as const },
  { icon: Users, title: 'Group Pabili', description: 'Neighbors combine pabili orders to share a rider and the cost.', status: 'coming_soon' as const },
  { icon: CalendarClock, title: 'Scheduled Deliveries', description: 'Book a delivery for a future date and time.', status: 'coming_soon' as const },
  { icon: Truck, title: 'Delivery Tracking', description: 'Realtime tracking from pickup to drop-off.', status: 'coming_soon' as const },
  { icon: PackageCheck, title: 'Proof of Delivery', description: 'Photo, signature, or code confirmation on completion.', status: 'coming_soon' as const },
  { icon: Wallet, title: 'Rider Earnings', description: 'Transparent per-delivery earnings and tips.', status: 'coming_soon' as const },
  { icon: Star, title: 'Customer Tips', description: 'Add a tip to thank a rider for great service.', status: 'coming_soon' as const },
  { icon: Star, title: 'Reviews and Ratings', description: 'Two-way reviews keep the network trustworthy.', status: 'coming_soon' as const },
  { icon: MessageSquare, title: 'Notifications', description: 'Riders and customers get notified about request and status changes.', status: 'coming_soon' as const },
  { icon: AlertTriangle, title: 'Emergency and Dispute Support', description: 'Report issues and get help when a delivery goes wrong.', status: 'coming_soon' as const },
  { icon: ShieldCheck, title: 'Administrator Management', description: 'Admins moderate riders, disputes, and verify documents.', status: 'coming_soon' as const },
  { icon: BarChart3, title: 'Marinduque Rider Analytics', description: 'Aggregate, real-data analytics for the rider network.', status: 'coming_soon' as const },
];

export function RiderHubPage() {
  const { user } = useAuth();

  return (
    <RiderLayout active="home">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand-700 to-brand-900 text-white p-6 sm:p-10 mb-8">
        <div className="absolute -right-8 -top-8 opacity-10">
          <Bike className="h-40 w-40" />
        </div>
        <div className="relative max-w-2xl">
          <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-white/15 backdrop-blur px-3 py-1 rounded-full mb-4">
            <Bike className="h-3.5 w-3.5" /> Rider Partner Network
          </span>
          <h1 className="text-2xl sm:text-3xl font-bold font-display mb-3">
            Deliver across Marinduque
          </h1>
          <p className="text-sm sm:text-base text-cream-100/90 leading-relaxed mb-5">
            The MariMarket Rider Network connects customers with local riders for
            deliveries, pabili, padala, and shared trips across all six municipalities.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => navigate(user ? `${RIDER_NETWORK_ROUTE_PREFIX}/dashboard` : '/signup')}>
              {user ? 'Go to Rider Dashboard' : 'Become a Rider'}
            </Button>
            <Button variant="outline" className="bg-white/10 border-white/30 text-white hover:bg-white/20" onClick={() => navigate(`${RIDER_NETWORK_ROUTE_PREFIX}/hanap`)}>
              <MapPinned className="h-4 w-4" /> Find a Rider
            </Button>
          </div>
        </div>
      </div>

      {/* Service areas */}
      <div className="mb-8">
        <h2 className="text-sm font-semibold text-brand-900 mb-3">Serving all six municipalities</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {RIDER_MUNICIPALITIES.map((name) => (
            <div key={name} className="bg-white rounded-lg border border-brand-100 px-3 py-2.5 text-center">
              <p className="text-sm font-medium text-brand-800">{name}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Feature roadmap */}
      <div className="mb-8">
        <h2 className="text-sm font-semibold text-brand-900 mb-3">What's coming</h2>
        <p className="text-xs text-brand-500 mb-4">
          The Rider Network is being built in stages. Listed features are planned and
          will appear here as they become available — no sample riders or bookings are shown.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map((f) => (
            <RiderFeatureCard key={f.title} {...f} />
          ))}
        </div>
      </div>

      {/* Honest empty state for the network until riders exist */}
      <EmptyState
        icon={<Bike className="h-8 w-8" />}
        title="No verified riders yet"
        description="Once riders are approved, you'll find them here. The network is being prepared."
      />
    </RiderLayout>
  );
}

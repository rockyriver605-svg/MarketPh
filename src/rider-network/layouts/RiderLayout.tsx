/**
 * Rider Network — shared layout.
 *
 * Wraps rider pages in MariMarket's container and adds a mobile-first
 * sub-navigation bar. Reuses the existing Header/Footer from the app shell.
 */

import { type ReactNode } from 'react';
import { Bike, LayoutDashboard, MapPinned, Wallet, Star } from 'lucide-react';
import { navigate } from '@/lib/router';
import { useRiderProfile } from '@/rider-network/hooks/useRiderProfile';
import { RIDER_NETWORK_ROUTE_PREFIX } from '@/rider-network/constants';

interface RiderLayoutProps {
  children: ReactNode;
  active?: 'home' | 'dashboard' | 'hanap' | 'earnings' | 'reviews';
}

const TABS = [
  { key: 'home', label: 'Riders', path: RIDER_NETWORK_ROUTE_PREFIX, icon: Bike },
  { key: 'dashboard', label: 'Dashboard', path: `${RIDER_NETWORK_ROUTE_PREFIX}/dashboard`, icon: LayoutDashboard },
  { key: 'hanap', label: 'Hanap Rider', path: `${RIDER_NETWORK_ROUTE_PREFIX}/hanap`, icon: MapPinned },
  { key: 'earnings', label: 'Earnings', path: `${RIDER_NETWORK_ROUTE_PREFIX}/earnings`, icon: Wallet },
  { key: 'reviews', label: 'Reviews', path: `${RIDER_NETWORK_ROUTE_PREFIX}/reviews`, icon: Star },
] as const;

export function RiderLayout({ children, active = 'home' }: RiderLayoutProps) {
  const { profile, loading } = useRiderProfile();

  return (
    <div className="container-app py-6 animate-fade-in">
      {children}

      {/* Mobile-first sticky bottom tab bar */}
      <nav className="fixed bottom-0 inset-x-0 z-30 md:hidden bg-white border-t border-brand-100 grid grid-cols-5">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = active === tab.key;
          const disabled = loading || (!profile && tab.key !== 'home' && tab.key !== 'hanap');
          return (
            <button
              key={tab.key}
              disabled={disabled}
              onClick={() => navigate(tab.path)}
              className={`flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium transition-colors ${
                isActive ? 'text-brand-700' : 'text-brand-400'
              } ${disabled ? 'opacity-40' : 'hover:text-brand-600'}`}
            >
              <Icon className="h-5 w-5" />
              {tab.label}
            </button>
          );
        })}
      </nav>
    </div>
  );
}

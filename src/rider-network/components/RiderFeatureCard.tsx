/**
 * Rider Network — feature card.
 *
 * Presentational component used by the hub page to list upcoming features.
 * Renders only the metadata passed in; no fabricated counts or statuses.
 */

import { type LucideIcon, ArrowRight } from 'lucide-react';

export interface RiderFeatureCardProps {
  icon: LucideIcon;
  title: string;
  description: string;
  status: 'available' | 'coming_soon';
  onClick?: () => void;
}

export function RiderFeatureCard({ icon: Icon, title, description, status, onClick }: RiderFeatureCardProps) {
  const clickable = status === 'available' && onClick;
  return (
    <div
      className={`bg-white rounded-xl border border-brand-100 p-5 flex flex-col ${
        clickable ? 'cursor-pointer hover:border-brand-300 hover:shadow-sm transition-all' : ''
      }`}
      onClick={clickable ? onClick : undefined}
      role={clickable ? 'button' : undefined}
    >
      <div className="flex items-center gap-3 mb-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600 shrink-0">
          <Icon className="h-5 w-5" />
        </div>
        <h3 className="text-sm font-semibold text-brand-900">{title}</h3>
      </div>
      <p className="text-xs text-brand-500 leading-relaxed flex-1">{description}</p>
      <div className="flex items-center justify-between mt-4">
        <span
          className={`text-[11px] font-medium ${
            status === 'available' ? 'text-green-600' : 'text-brand-400'
          }`}
        >
          {status === 'available' ? 'Available' : 'Coming soon'}
        </span>
        {clickable && <ArrowRight className="h-4 w-4 text-brand-400" />}
      </div>
    </div>
  );
}

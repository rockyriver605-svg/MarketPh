import { AlertTriangle, Check, Circle } from 'lucide-react';
import { formatDateTime } from '@/lib/utils';
import { type OrderTimeline as OrderTimelineData, getActorLabel, getStepLabel } from '@/lib/orderTracking';

interface OrderTimelineProps {
  timeline: OrderTimelineData;
}

export function OrderTimeline({ timeline }: OrderTimelineProps) {
  return (
    <div className="space-y-6">
      <ol aria-label="Order progress" className="relative space-y-6">
        {timeline.steps.map((step, index) => {
          const isLast = index === timeline.steps.length - 1;
          return (
            <li key={step.status} className="relative flex gap-4">
              {!isLast && (
                <span
                  aria-hidden="true"
                  className={`absolute left-[15px] top-8 h-[calc(100%-8px)] w-0.5 ${step.reached ? 'bg-brand-500' : 'bg-brand-100'}`}
                />
              )}
              <span
                className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                  step.reached ? 'bg-brand-600 text-white' : 'border border-brand-200 bg-white text-brand-300'
                }`}
              >
                {step.reached ? <Check className="h-4 w-4" aria-hidden="true" /> : <Circle className="h-3 w-3" aria-hidden="true" />}
              </span>
              <div className="min-w-0 pb-1">
                <p className={`text-sm font-semibold ${step.reached ? 'text-brand-900' : 'text-brand-400'}`}>
                  {getStepLabel(step.status)}
                </p>
                {step.reached ? (
                  <>
                    <p className="text-xs text-brand-600">
                      {step.at ? formatDateTime(step.at) : 'Time not recorded'}
                      {step.actorRole && ` by ${getActorLabel(step.actorRole)}`}
                    </p>
                    {step.note && <p className="mt-1 text-sm text-brand-700">{step.note}</p>}
                  </>
                ) : (
                  <p className="text-xs text-brand-400">Not reached yet</p>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {timeline.exceptions.length > 0 && (
        <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-amber-900">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" /> Order changes
          </p>
          <ul className="space-y-2">
            {timeline.exceptions.map((event) => (
              <li key={`${event.status}-${event.at}`} className="text-sm text-amber-900">
                <span className="font-semibold">{getStepLabel(event.status)}</span>
                <span className="text-amber-800"> on {formatDateTime(event.at)} by {getActorLabel(event.actorRole)}</span>
                {event.note && <p className="text-amber-800">{event.note}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

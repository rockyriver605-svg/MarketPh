import { RotateCcw } from 'lucide-react';
import type { OrderStatusHistory, Payment } from '@/types';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import { getActorLabel } from '@/lib/orderTracking';

interface RefundSummaryProps {
  orderStatus: string;
  payment: Payment | null;
  history: OrderStatusHistory[];
}

export function RefundSummary({ orderStatus, payment, history }: RefundSummaryProps) {
  const isRefunded = orderStatus === 'refunded' || payment?.status === 'refunded';
  if (!isRefunded) return null;

  const refundEvent = [...history].reverse().find((h) => h.new_status === 'refunded') ?? null;

  return (
    <div className="rounded-lg border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900 space-y-2">
      <div className="flex items-center gap-2 font-semibold">
        <RotateCcw className="h-4 w-4" /> Refund
      </div>
      <div className="grid gap-1">
        <p>Amount refunded: {payment ? formatCurrency(payment.amount) : 'Not recorded'} (PHP)</p>
        <p>Reason: {refundEvent?.reason ?? 'No reason was recorded.'}</p>
        <p>Recorded by: {refundEvent ? getActorLabel(refundEvent.actor_role) : 'Not recorded'}</p>
        <p>Date: {refundEvent ? formatDateTime(refundEvent.created_at) : 'Not recorded'}</p>
      </div>
    </div>
  );
}

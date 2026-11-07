import type { Payment } from '@/types';

export type TransactionTone = 'success' | 'warning' | 'error' | 'info' | 'default';

export interface TransactionState {
  label: string;
  description: string;
  tone: TransactionTone;
}

export function getTransactionState(payment: Payment | null): TransactionState {
  if (!payment) {
    return {
      label: 'No payment record yet',
      description: 'No payment has been recorded for this order. It is not marked as paid.',
      tone: 'default',
    };
  }
  if (payment.method === 'cod' && payment.status !== 'paid' && payment.status !== 'refunded') {
    return {
      label: 'Cash on delivery',
      description: 'Payment is collected when the order is received. Not yet marked as paid.',
      tone: 'info',
    };
  }
  switch (payment.status) {
    case 'paid':
      return { label: 'Payment successful', description: 'The payment has been verified.', tone: 'success' };
    case 'pending':
      return { label: 'Payment pending', description: 'Waiting for the payment to be verified.', tone: 'warning' };
    case 'partial':
      return { label: 'Partially paid', description: 'Only part of the amount has been verified.', tone: 'warning' };
    case 'failed':
      return { label: 'Payment failed', description: 'The payment was not completed. Contact the seller or try again.', tone: 'error' };
    case 'refunded':
      return { label: 'Payment refunded', description: 'The payment was refunded. Refund details are shown below.', tone: 'info' };
    default:
      return { label: payment.status, description: '', tone: 'default' };
  }
}

export function isVerifiedReceipt(payment: Payment | null): boolean {
  return payment?.status === 'paid';
}

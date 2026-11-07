import { type ReactNode } from 'react';

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(date));
}

export function formatDateTime(date: string | Date): string {
  return new Intl.DateTimeFormat('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(date));
}

export function timeAgo(date: string | Date): string {
  const now = new Date();
  const past = new Date(date);
  const diffMs = now.getTime() - past.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDate(date);
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function getConditionLabel(condition: string): string {
  const labels: Record<string, string> = {
    brand_new: 'Brand New',
    new: 'Brand New',
    like_new: 'Like New',
    gently_used: 'Gently Used',
    good: 'Gently Used',
    used: 'Used',
    fair: 'Used',
    poor: 'Used',
    refurbished: 'Refurbished',
    handmade: 'Handmade',
    locally_produced: 'Locally Produced',
    perishable: 'Perishable',
    made_to_order: 'Made to Order',
  };
  return labels[condition] ?? condition;
}

const secondhandConditions = ['like_new', 'gently_used', 'used', 'refurbished'];

export function isSecondhandCondition(condition: string): boolean {
  return secondhandConditions.includes(condition);
}

export function getOrderStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    pending: 'Pending',
    confirmed: 'Confirmed',
    processing: 'Processing',
    ready_for_pickup: 'Ready for Pickup',
    paid: 'Paid',
    shipped: 'Shipped',
    delivered: 'Delivered',
    completed: 'Completed',
    cancelled: 'Cancelled',
    refunded: 'Refunded',
    disputed: 'Disputed',
  };
  return labels[status] ?? status;
}

export function getPaymentMethodLabel(method: string): string {
  const labels: Record<string, string> = {
    cod: 'Cash on Delivery',
    gcash: 'GCash',
    bank_transfer: 'Bank Transfer',
    maya: 'Maya',
    card: 'Credit/Debit Card',
  };
  return labels[method] ?? method;
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export function renderStars(rating: number): ReactNode {
  return '★'.repeat(rating) + '☆'.repeat(5 - rating);
}

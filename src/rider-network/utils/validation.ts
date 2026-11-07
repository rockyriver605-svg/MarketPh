/**
 * Rider Network — client-side validation helpers.
 *
 * Boundary validation only (form input). Server-side enforcement is the
 * authoritative check and will be added with the future migrations.
 */

import { RIDER_MUNICIPALITIES, MIN_TIP_PHP, MAX_TIP_PHP, type RiderMunicipality } from '@/rider-network/constants';

export function isKnownMunicipality(value: string): value is RiderMunicipality {
  return (RIDER_MUNICIPALITIES as readonly string[]).includes(value);
}

export function isValidPlate(value: string): boolean {
  const trimmed = value.trim().toUpperCase();
  return /^[A-Z0-9]{4,10}$/.test(trimmed);
}

export function isValidTipAmount(value: number): boolean {
  return Number.isFinite(value) && value >= MIN_TIP_PHP && value <= MAX_TIP_PHP;
}

export function isValidPhoneNumber(value: string): boolean {
  const trimmed = value.replace(/[\s-]/g, '');
  return /^(09|\+639)\d{9}$/.test(trimmed);
}

export function isFutureOrNow(value: string): boolean {
  const parsed = new Date(value).getTime();
  if (Number.isNaN(parsed)) return false;
  return parsed >= Date.now();
}

export function sanitizeFreeText(value: string, max = 500): string {
  return value.replace(/<[^>]*>/g, '').trim().slice(0, max);
}

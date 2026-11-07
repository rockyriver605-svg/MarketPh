/**
 * Rider Network — distance and fare estimation helpers.
 *
 * Pure functions only; no network calls. Results are estimates shown to the
 * rider/customer and are not authoritative — the final price is the accepted
 * quotation stored in Supabase.
 */

import type { DeliveryServiceType } from '@/rider-network/types';

export interface LatLng {
  lat: number;
  lng: number;
}

export function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

const BASE_FARE_PHP = 40;
const PER_KM_PHP = 12;

export function estimateFare(km: number, serviceType: DeliveryServiceType): number {
  const base = BASE_FARE_PHP + Math.ceil(km) * PER_KM_PHP;
  const multiplier = serviceType === 'pabili' ? 1.2
    : serviceType === 'group_pabili' ? 1.35
    : serviceType === 'scheduled' ? 1.1
    : serviceType === 'empty_trip' ? 0.8
    : 1;
  return Math.round(base * multiplier);
}

export function estimateMinutes(km: number): number {
  return Math.max(10, Math.round(km * 3.5));
}

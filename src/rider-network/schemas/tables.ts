/**
 * Rider Network — Supabase table names and storage buckets.
 *
 * Centralized so services and schemas reference a single source of truth.
 * Tables are not yet created; they will be introduced by future migrations
 * that reuse the existing profiles, municipalities, and notifications tables.
 */

export const RIDER_TABLES = {
  riderProfiles: 'rider_profiles',
  deliveryRequests: 'delivery_requests',
  riderQuotations: 'rider_quotations',
  deliveryTracking: 'delivery_tracking_events',
  proofOfDelivery: 'proof_of_deliveries',
  riderEarnings: 'rider_earnings',
  riderReviews: 'rider_reviews',
  riderDisputes: 'rider_disputes',
  riderAvailabilityLog: 'rider_availability_log',
  riderServiceAreas: 'rider_service_areas',
} as const;

export const RIDER_STORAGE_BUCKETS = {
  riderDocuments: 'rider-documents',
  proofOfDelivery: 'proof-of-delivery',
} as const;

export const RIDER_REALTIME_CHANNELS = {
  availability: 'rider:availability',
  deliveryTracking: 'rider:delivery_tracking',
  deliveryRequests: 'rider:delivery_requests',
} as const;

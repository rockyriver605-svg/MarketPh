/**
 * Rider Network — domain types.
 *
 * These describe the future rider-partner feature shapes. They intentionally
 * carry no hardcoded data; every field is populated from real Supabase rows.
 */

export type RiderApplicationStatus =
  | 'draft'
  | 'submitted'
  | 'under_review'
  | 'approved'
  | 'rejected'
  | 'suspended';

export type RiderAvailability = 'offline' | 'online' | 'busy';

export type VehicleType = 'motorcycle' | 'bicycle' | 'tricycle' | 'car' | 'van' | 'multicab';

export type DeliveryServiceType =
  | 'standard'
  | 'pabili'
  | 'padala'
  | 'return_trip'
  | 'group_pabili'
  | 'scheduled'
  | 'empty_trip';

export type DeliveryRequestStatus =
  | 'open'
  | 'quoted'
  | 'accepted'
  | 'picked_up'
  | 'in_transit'
  | 'delivered'
  | 'completed'
  | 'cancelled'
  | 'failed'
  | 'disputed';

export type QuotationStatus = 'pending' | 'accepted' | 'rejected' | 'expired' | 'withdrawn';

export type ProofOfDeliveryType = 'signature' | 'photo' | 'code';

export type EarningType = 'delivery_fee' | 'tip' | 'bonus' | 'adjustment' | 'refund';

export type DisputeParty = 'customer' | 'rider' | 'system';

export interface RiderProfile {
  id: string;
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  phone: string | null;
  municipality_id: string | null;
  barangay_id: string | null;
  vehicle_type: VehicleType | null;
  vehicle_plate: string | null;
  vehicle_description: string | null;
  license_url: string | null;
  government_id_url: string | null;
  application_status: RiderApplicationStatus;
  is_verified: boolean;
  is_available: boolean;
  availability: RiderAvailability;
  rating_average: number;
  rating_count: number;
  completed_deliveries: number;
  bio: string | null;
  service_areas: string[];
  created_at: string;
  updated_at: string;
}

export interface DeliveryRequest {
  id: string;
  customer_id: string;
  service_type: DeliveryServiceType;
  pickup_address: string;
  pickup_municipality_id: string | null;
  pickup_barangay_id: string | null;
  dropoff_address: string;
  dropoff_municipality_id: string | null;
  dropoff_barangay_id: string | null;
  item_description: string | null;
  estimated_weight_kg: number | null;
  scheduled_for: string | null;
  budget_php: number | null;
  status: DeliveryRequestStatus;
  assigned_rider_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface RiderQuotation {
  id: string;
  delivery_request_id: string;
  rider_id: string;
  quoted_price_php: number;
  estimated_minutes: number | null;
  message: string | null;
  status: QuotationStatus;
  expires_at: string | null;
  created_at: string;
}

export interface DeliveryTrackingEvent {
  id: string;
  delivery_id: string;
  status: DeliveryRequestStatus;
  latitude: number | null;
  longitude: number | null;
  note: string | null;
  recorded_by: string;
  created_at: string;
}

export interface ProofOfDelivery {
  id: string;
  delivery_id: string;
  proof_type: ProofOfDeliveryType;
  photo_url: string | null;
  recipient_name: string | null;
  confirmation_code: string | null;
  recorded_at: string;
}

export interface RiderEarning {
  id: string;
  rider_id: string;
  delivery_id: string | null;
  type: EarningType;
  amount_php: number;
  description: string | null;
  created_at: string;
}

export interface RiderReview {
  id: string;
  rider_id: string;
  reviewer_id: string;
  delivery_id: string | null;
  rating: number;
  body: string | null;
  created_at: string;
}

export interface RiderDispute {
  id: string;
  delivery_id: string;
  opened_by: DisputeParty;
  reason: string;
  description: string;
  status: 'open' | 'under_review' | 'resolved' | 'dismissed';
  resolution: string | null;
  resolved_by: string | null;
  created_at: string;
  updated_at: string;
}

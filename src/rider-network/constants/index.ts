/**
 * Rider Network — platform constants.
 *
 * Marinduque's six municipalities, supported services, and status labels.
 * No fabricated records live here — only enumerated options the UI renders.
 */

export const RIDER_MUNICIPALITIES = [
  'Boac',
  'Mogpog',
  'Gasan',
  'Buenavista',
  'Torrijos',
  'Santa Cruz',
] as const;

export type RiderMunicipality = (typeof RIDER_MUNICIPALITIES)[number];

export const RIDER_SERVICE_TYPES = [
  { value: 'standard', label: 'Standard Delivery' },
  { value: 'pabili', label: 'Pabili (Buy For Me)' },
  { value: 'padala', label: 'Padala (Send Item)' },
  { value: 'return_trip', label: 'Return Trip Booking' },
  { value: 'group_pabili', label: 'Group Pabili' },
  { value: 'scheduled', label: 'Scheduled Delivery' },
  { value: 'empty_trip', label: 'May Bakanteng Biyahe' },
] as const;

export const VEHICLE_TYPES = [
  { value: 'motorcycle', label: 'Motorcycle' },
  { value: 'bicycle', label: 'Bicycle' },
  { value: 'tricycle', label: 'Tricycle' },
  { value: 'car', label: 'Car' },
  { value: 'van', label: 'Van' },
  { value: 'multicab', label: 'Multicab' },
] as const;

export const RIDER_APPLICATION_STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  under_review: 'Under Review',
  approved: 'Approved',
  rejected: 'Rejected',
  suspended: 'Suspended',
};

export const DELIVERY_REQUEST_STATUS_LABELS: Record<string, string> = {
  open: 'Open',
  quoted: 'Quoted',
  accepted: 'Accepted',
  picked_up: 'Picked Up',
  in_transit: 'In Transit',
  delivered: 'Delivered',
  completed: 'Completed',
  cancelled: 'Cancelled',
  failed: 'Failed',
  disputed: 'Disputed',
};

export const RIDER_AVAILABILITY_LABELS: Record<string, string> = {
  offline: 'Offline',
  online: 'Online',
  busy: 'Busy',
};

export const RIDER_NETWORK_ROUTE_PREFIX = '/riders';

/** Minimum GCash/cash tip a customer may attach to a delivery request. */
export const MIN_TIP_PHP = 1;
/** Maximum tip enforced at the form boundary. */
export const MAX_TIP_PHP = 1000;
/** Default quotation expiry in hours. */
export const DEFAULT_QUOTATION_EXPIRY_HOURS = 2;

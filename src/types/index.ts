export type UserRole = 'buyer' | 'seller' | 'moderator' | 'administrator' | 'super_admin';

export type AccountStatus = 'active' | 'suspended';

export type ProductStatus = 'draft' | 'pending_review' | 'published' | 'rejected' | 'paused' | 'sold_out' | 'archived';
export type OfferStatus = 'pending' | 'accepted' | 'rejected' | 'withdrawn' | 'expired';

export type ProductCondition =
  | 'brand_new' | 'like_new' | 'gently_used' | 'used' | 'refurbished'
  | 'handmade' | 'locally_produced' | 'perishable' | 'made_to_order';

export interface ProductConditionOption {
  id: string;
  value: string;
  label: string;
  description: string | null;
  category_group: string;
  is_active: boolean;
  sort_order: number;
}
export type OrderStatus = 'pending' | 'confirmed' | 'processing' | 'ready_for_pickup' | 'paid' | 'shipped' | 'delivered' | 'completed' | 'cancelled' | 'refunded' | 'disputed';
export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded' | 'partial';
export type PaymentMethod = 'cod' | 'gcash' | 'bank_transfer' | 'maya' | 'card';
export type DeliveryStatus = 'pending' | 'picked_up' | 'in_transit' | 'out_for_delivery' | 'delivered' | 'failed' | 'returned';
export type VerificationStatus = 'pending' | 'approved' | 'rejected';
export type ReportReason = 'spam' | 'scam' | 'inappropriate' | 'counterfeit' | 'harassment' | 'other';
export type ReportStatus = 'pending' | 'reviewing' | 'resolved' | 'dismissed';
export type ReportTargetType = 'product' | 'seller' | 'review' | 'message' | 'user';
export type NotificationType = 'order' | 'message' | 'review' | 'system' | 'report' | 'verification' | 'product' | 'promo';

export interface Municipality {
  id: string;
  name: string;
  province: string;
  region: string;
}

export interface Barangay {
  id: string;
  municipality_id: string;
  name: string;
}

export interface ProfilePreferences {
  email_notifications?: boolean;
  preferred_contact?: 'message' | 'phone' | 'email';
  show_phone?: boolean;
  show_location?: boolean;
}

export interface UserAddress {
  id: string;
  user_id: string;
  label: string;
  recipient_name: string;
  phone: string;
  municipality_id: string;
  barangay_id: string;
  street: string;
  landmark: string | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  display_name: string;
  username: string | null;
  avatar_url: string | null;
  phone: string | null;
  bio: string | null;
  municipality_id: string | null;
  barangay_id: string | null;
  street_address: string | null;
  account_status: AccountStatus;
  terms_accepted_at: string | null;
  privacy_accepted_at: string | null;
  onboarding_completed_at: string | null;
  preferences: ProfilePreferences;
  deactivated_at: string | null;
  deletion_requested_at: string | null;
  suspended_at: string | null;
  suspension_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserRoleRow {
  id: string;
  user_id: string;
  role: UserRole;
  secondary_role: UserRole | null;
  created_at: string;
  updated_at: string;
}

export interface RoleChangeHistoryEntry {
  id: string;
  actor_id: string | null;
  target_id: string;
  previous_role: string;
  new_role: string;
  reason: string | null;
  created_at: string;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon_name: string | null;
  image_url: string | null;
  parent_id: string | null;
  sort_order: number;
  is_active: boolean;
}

export interface SellerProfile {
  id: string;
  user_id: string;
  shop_name: string;
  slug: string;
  description: string | null;
  logo_url: string | null;
  banner_url: string | null;
  municipality_id: string | null;
  barangay_id: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  is_active: boolean;
  is_verified: boolean;
  negotiation_enabled: boolean;
  default_offer_expiry_hours: number;
  created_at: string;
  updated_at: string;
}

export interface Product {
  id: string;
  seller_id: string;
  category_id: string | null;
  title: string;
  slug: string;
  description: string | null;
  price: number;
  sale_price: number | null;
  stock: number;
  sku: string | null;
  condition: ProductCondition;
  condition_description: string | null;
  product_age: string | null;
  defects: string | null;
  repair_history: string | null;
  warranty_info: string | null;
  condition_notes: string | null;
  status: ProductStatus;
  municipality_id: string | null;
  barangay_id: string | null;
  delivery_options: string[] | null;
  pickup_enabled: boolean;
  specifications: Record<string, string> | null;
  moderation_note: string | null;
  min_order_quantity: number;
  max_order_quantity: number | null;
  promotion_start_at: string | null;
  promotion_end_at: string | null;
  negotiation_enabled: boolean;
  min_offer_price: number | null;
  view_count: number;
  created_at: string;
  updated_at: string;
}

export interface ProductImage {
  id: string;
  product_id: string;
  image_url: string;
  alt_text: string | null;
  sort_order: number;
  is_primary: boolean;
}

export interface ProductVariant {
  id: string;
  product_id: string;
  name: string;
  value: string;
  price_override: number | null;
  stock: number;
  sku: string | null;
}

export interface Cart {
  id: string;
  user_id: string;
  created_at: string;
  updated_at: string;
}

export interface CartItem {
  id: string;
  cart_id: string;
  product_id: string;
  variant_id: string | null;
  quantity: number;
  saved_for_later: boolean;
  selected_for_checkout: boolean;
  created_at: string;
}

export interface Order {
  id: string;
  buyer_id: string;
  order_number: string;
  status: OrderStatus;
  subtotal: number;
  shipping_fee: number;
  total: number;
  notes: string | null;
  shipping_municipality_id: string | null;
  shipping_barangay_id: string | null;
  shipping_address: string | null;
  shipping_contact_name: string | null;
  shipping_contact_phone: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  variant_id: string | null;
  seller_id: string;
  product_title: string;
  product_image_url: string | null;
  unit_price: number;
  quantity: number;
  subtotal: number;
  created_at: string;
}

export interface Payment {
  id: string;
  order_id: string;
  buyer_id: string;
  amount: number;
  method: PaymentMethod | null;
  status: PaymentStatus;
  reference_number: string | null;
  payment_proof_url: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Delivery {
  id: string;
  order_id: string;
  courier: string | null;
  tracking_number: string | null;
  status: DeliveryStatus;
  pickup_address: string | null;
  delivery_address: string | null;
  estimated_delivery: string | null;
  delivered_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrderStatusHistory {
  id: string;
  order_id: string;
  old_status: string;
  new_status: string;
  changed_by: string;
  actor_role: string;
  reason: string | null;
  created_at: string;
}

export type DisputeStatus = 'open' | 'under_review' | 'resolved' | 'dismissed';

export interface OrderDispute {
  id: string;
  order_id: string;
  buyer_id: string;
  reason: string;
  description: string;
  status: DisputeStatus;
  resolution: string | null;
  resolved_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Review {
  id: string;
  order_item_id: string | null;
  product_id: string;
  reviewer_id: string;
  seller_id: string;
  rating: number;
  title: string;
  body: string;
  status: string;
  edited_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReviewImage {
  id: string;
  review_id: string;
  image_url: string;
  sort_order: number;
  created_at: string;
}

export interface ReviewVote {
  id: string;
  review_id: string;
  user_id: string;
  created_at: string;
}

export interface ReviewResponse {
  id: string;
  review_id: string;
  seller_id: string;
  body: string;
  edited_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReviewReport {
  id: string;
  review_id: string | null;
  response_id: string | null;
  reporter_id: string;
  reason: string;
  description: string;
  status: string;
  resolution_note: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
}

export interface ReviewWithRelations extends Review {
  reviewer?: { id: string; display_name: string; username: string | null; avatar_url: string | null };
  review_images?: ReviewImage[];
  review_votes?: ReviewVote[];
  review_responses?: ReviewResponse[];
}

export interface ProductRatingSummary {
  avg_rating: number;
  total_reviews: number;
  five_star: number;
  four_star: number;
  three_star: number;
  two_star: number;
  one_star: number;
}

export interface Favorite {
  id: string;
  user_id: string;
  product_id: string;
  created_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  link: string | null;
  is_read: boolean;
  created_at: string;
}

export interface Conversation {
  id: string;
  participant_1: string;
  participant_2: string;
  product_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  image_url: string | null;
  is_read: boolean;
  created_at: string;
}

export interface BulkPricingTier {
  id: string;
  product_id: string;
  min_quantity: number;
  max_quantity: number | null;
  discount_percentage: number;
  label: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface ProductOffer {
  id: string;
  product_id: string;
  buyer_id: string;
  seller_id: string;
  conversation_id: string | null;
  proposed_price: number;
  counter_price: number | null;
  quantity: number;
  status: OfferStatus;
  buyer_message: string | null;
  seller_message: string | null;
  expires_at: string | null;
  responded_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProductOfferWithRelations extends ProductOffer {
  product?: ProductWithRelations;
  buyer?: { id: string; display_name: string; username: string | null; avatar_url: string | null };
}

export interface ProductWithRelations extends Product {
  seller?: SellerProfile;
  category?: Category;
  municipality?: Municipality;
  barangay?: Barangay;
  product_images?: ProductImage[];
  product_variants?: ProductVariant[];
}

export interface CartItemWithRelations extends CartItem {
  product?: ProductWithRelations;
}

// ============================================================
// TindaTap Business Tools Types
// ============================================================

export type PosPaymentMethod = 'cash' | 'gcash' | 'maya' | 'bank_transfer' | 'card';
export type PosTransactionStatus = 'completed' | 'voided' | 'refunded';
export type StockMovementType = 'sale' | 'restock' | 'adjustment' | 'damage' | 'transfer' | 'return' | 'initial';
export type CreditLedgerStatus = 'unpaid' | 'partial' | 'paid' | 'overdue' | 'voided';
export type RestockOrderStatus = 'pending' | 'ordered' | 'received' | 'cancelled';

export interface PosTransaction {
  id: string;
  seller_id: string;
  transaction_number: string;
  subtotal: number;
  discount_amount: number;
  total_amount: number;
  amount_paid: number;
  change_due: number;
  payment_method: PosPaymentMethod;
  status: PosTransactionStatus;
  customer_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface PosTransactionItem {
  id: string;
  pos_transaction_id: string;
  product_id: string | null;
  product_title: string;
  unit_price: number;
  quantity: number;
  subtotal: number;
  created_at: string;
}

export interface StockMovement {
  id: string;
  seller_id: string;
  product_id: string;
  variant_id: string | null;
  movement_type: StockMovementType;
  quantity_change: number;
  quantity_after: number;
  reason: string | null;
  reference_type: string | null;
  reference_id: string | null;
  created_at: string;
}

export interface StoreCustomer {
  id: string;
  seller_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  total_credit_balance: number;
  created_at: string;
  updated_at: string;
}

export interface CreditLedger {
  id: string;
  seller_id: string;
  customer_id: string;
  pos_transaction_id: string | null;
  description: string | null;
  total_amount: number;
  amount_paid: number;
  balance: number;
  status: CreditLedgerStatus;
  due_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreditPayment {
  id: string;
  credit_ledger_id: string;
  seller_id: string;
  amount: number;
  payment_method: PosPaymentMethod;
  notes: string | null;
  created_at: string;
}

export interface RestockOrder {
  id: string;
  seller_id: string;
  supplier_name: string;
  supplier_contact: string | null;
  status: RestockOrderStatus;
  total_cost: number;
  notes: string | null;
  ordered_at: string | null;
  received_at: string | null;
  created_at: string;
  updated_at: string;
}

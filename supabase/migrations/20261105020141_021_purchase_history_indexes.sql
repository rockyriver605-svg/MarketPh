/*
# Purchase history lookup indexes

Plain-English summary
This migration adds database indexes so the buyer purchase history can search and filter quickly by order number, buyer, seller, payment reference, status, and date. It does not change any data, tables, or security rules.

## New indexes
- orders(order_number): fast lookup by order number.
- orders(buyer_id, created_at DESC): buyer purchase list sorted by newest.
- orders(status): status section filters.
- order_items(order_id): loading items per order.
- order_items(seller_id): seller-side and seller filter lookups.
- payments(order_id): payment records per order.
- payments(reference_number): search by transaction reference.

## Security
No changes. Existing row level security policies and grants are untouched.

## Notes
- All statements use IF NOT EXISTS, so re-running is safe.
- No data is modified or removed.
*/

CREATE INDEX IF NOT EXISTS idx_orders_order_number ON orders (order_number);
CREATE INDEX IF NOT EXISTS idx_orders_buyer_created ON orders (buyer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders (status);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items (order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_seller ON order_items (seller_id);
CREATE INDEX IF NOT EXISTS idx_payments_order ON payments (order_id);
CREATE INDEX IF NOT EXISTS idx_payments_reference ON payments (reference_number);

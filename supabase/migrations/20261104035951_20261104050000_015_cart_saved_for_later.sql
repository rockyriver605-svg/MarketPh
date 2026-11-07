/*
# MariMarket Cart Enhancement — Save for Later & Selection

1. Modified Tables
- `cart_items`
  - Added `saved_for_later` (boolean, NOT NULL, default false): when true, the item
    is moved out of the active cart into the buyer's "Saved for later" list. It stays
    linked to the same cart so the buyer can restore it without re-adding.
  - Added `selected_for_checkout` (boolean, NOT NULL, default true): when false, the
    item is excluded from the checkout subtotal and selection count. Newly added items
    default to selected so the existing add-to-cart flow is unchanged.

2. Indexes
- Added index on `cart_items(saved_for_later)` to speed up the split between
  active cart items and saved-for-later items.
- Added index on `cart_items(cart_id, saved_for_later)` for grouped reads.

3. Security
- No new tables. Existing RLS policies on `cart_items` already scope every CRUD verb
  through the owning `carts.user_id = auth.uid()` check, so the new columns inherit
  that protection automatically.
- The existing table-level grants for `authenticated` already cover UPDATE on all
  columns, so updating the two new boolean columns works without additional grants.

4. Notes
- Both columns have safe defaults so existing rows and existing insert paths
  (including the ProductDetailPage add-to-cart upsert) keep working unchanged.
- No destructive changes; columns are additive only.
*/

ALTER TABLE cart_items
  ADD COLUMN IF NOT EXISTS saved_for_later boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS selected_for_checkout boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_cart_items_saved_for_later ON cart_items (saved_for_later);
CREATE INDEX IF NOT EXISTS idx_cart_items_cart_saved ON cart_items (cart_id, saved_for_later);

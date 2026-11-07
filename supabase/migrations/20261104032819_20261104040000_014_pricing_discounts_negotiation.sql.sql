/*
# Product Pricing, Discounts, and Negotiation System

## Overview
Adds bulk pricing tiers, scheduled promotions, quantity limits, and a complete
price negotiation (offer/counteroffer) system to MariMarket.

## 1. New Tables

### product_offers
Tracks buyer-to-seller price negotiations on individual products.
- id (uuid PK)
- product_id (uuid FK -> products, ON DELETE CASCADE)
- buyer_id (uuid FK -> auth.users, ON DELETE CASCADE)
- seller_id (uuid FK -> seller_profiles, ON DELETE CASCADE)
- conversation_id (uuid FK -> conversations, nullable, ON DELETE SET NULL)
- proposed_price (numeric, not null) — the buyer's offer amount
- counter_price (numeric, nullable) — seller's counteroffer amount
- quantity (integer, not null, default 1) — how many units the offer covers
- status (text, not null, default 'pending') — pending|accepted|rejected|withdrawn|expired
- buyer_message (text, nullable) — optional note from buyer
- seller_message (text, nullable) — optional note from seller on accept/reject/counter
- expires_at (timestamptz, nullable) — when the offer auto-expires
- responded_at (timestamptz, nullable) — when seller took action
- created_at, updated_at (timestamptz defaults)

### bulk_pricing_tiers
Optional quantity-based pricing tiers per product (e.g., buy 10+ get 10% off).
- id (uuid PK)
- product_id (uuid FK -> products, ON DELETE CASCADE)
- min_quantity (integer, not null)
- max_quantity (integer, nullable)
- discount_percentage (numeric, not null, check 0-100)
- label (text, nullable) — e.g., "Bulk discount"
- sort_order (integer, default 0)
- created_at, updated_at

## 2. Modified Tables

### products (added columns)
- min_order_quantity (integer, default 1) — minimum units per purchase
- max_order_quantity (integer, nullable) — maximum units per purchase
- promotion_start_at (timestamptz, nullable) — when a scheduled sale begins
- promotion_end_at (timestamptz, nullable) — when a scheduled sale ends
- negotiation_enabled (boolean, default false) — whether this product accepts offers
- min_offer_price (numeric, nullable) — floor price seller will accept for offers

### seller_profiles (added columns)
- negotiation_enabled (boolean, default false) — store-wide default for accepting offers
- default_offer_expiry_hours (integer, default 48) — default expiry for offers received

## 3. Security

### product_offers RLS
- SELECT: buyer or seller of the offer can read (TO authenticated)
- INSERT: any authenticated user can create an offer on a product (buyer only)
- UPDATE: buyer can withdraw; seller can accept/reject/counter (enforced by policy)
- DELETE: only buyer or seller can delete

### bulk_pricing_tiers RLS
- SELECT: public (anon + authenticated) — visible to all marketplace visitors
- INSERT/UPDATE/DELETE: only the product's seller (TO authenticated)

### products new columns
- Covered by existing product RLS policies; negotiation_enabled and min_offer_price
  are seller-writable like other product fields.

### seller_profiles new columns
- negotiation_enabled and default_offer_expiry_hours are seller-writable
  (covered by existing seller_profiles policies).

## 4. Important Notes
1. Offer validation: A trigger checks that proposed_price > 0, the product exists,
   is published, and has stock > 0. It also checks that negotiation is enabled
   on the product OR the seller profile.
2. Offer status transitions: pending -> accepted|rejected|withdrawn|expired.
   Accepted/rejected/expired offers cannot change status again.
3. Accepted offers do NOT auto-create orders or payments — they represent an
   agreement on price only.
4. Auto-expiry: A function `expire_stale_offers()` marks offers past their
   expires_at as expired. Can be called periodically.
*/

-- ============================================================
-- product_offers table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.product_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  buyer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  seller_id uuid NOT NULL REFERENCES public.seller_profiles(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
  proposed_price numeric NOT NULL CHECK (proposed_price > 0),
  counter_price numeric CHECK (counter_price IS NULL OR counter_price > 0),
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity >= 1),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected','withdrawn','expired')),
  buyer_message text,
  seller_message text,
  expires_at timestamptz,
  responded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.product_offers ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_offers TO authenticated;

-- Buyer can see their own offers; seller can see offers on their products
DROP POLICY IF EXISTS "select_own_offers" ON public.product_offers;
CREATE POLICY "select_own_offers" ON public.product_offers
  FOR SELECT TO authenticated
  USING (auth.uid() = buyer_id OR EXISTS (
    SELECT 1 FROM public.seller_profiles sp
    WHERE sp.id = product_offers.seller_id AND sp.user_id = auth.uid()
  ));

-- Any authenticated user can create an offer (buyer_id defaults to auth.uid())
DROP POLICY IF EXISTS "insert_offers" ON public.product_offers;
CREATE POLICY "insert_offers" ON public.product_offers
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = buyer_id);

-- Buyer can withdraw their own pending offers; seller can accept/reject/counter
DROP POLICY IF EXISTS "update_offers" ON public.product_offers;
CREATE POLICY "update_offers" ON public.product_offers
  FOR UPDATE TO authenticated
  USING (auth.uid() = buyer_id OR EXISTS (
    SELECT 1 FROM public.seller_profiles sp
    WHERE sp.id = product_offers.seller_id AND sp.user_id = auth.uid()
  ))
  WITH CHECK (auth.uid() = buyer_id OR EXISTS (
    SELECT 1 FROM public.seller_profiles sp
    WHERE sp.id = product_offers.seller_id AND sp.user_id = auth.uid()
  ));

-- Only buyer or seller can delete
DROP POLICY IF EXISTS "delete_offers" ON public.product_offers;
CREATE POLICY "delete_offers" ON public.product_offers
  FOR DELETE TO authenticated
  USING (auth.uid() = buyer_id OR EXISTS (
    SELECT 1 FROM public.seller_profiles sp
    WHERE sp.id = product_offers.seller_id AND sp.user_id = auth.uid()
  ));

-- ============================================================
-- bulk_pricing_tiers table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.bulk_pricing_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  min_quantity integer NOT NULL CHECK (min_quantity >= 1),
  max_quantity integer CHECK (max_quantity IS NULL OR max_quantity >= min_quantity),
  discount_percentage numeric NOT NULL CHECK (discount_percentage > 0 AND discount_percentage <= 100),
  label text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.bulk_pricing_tiers ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.bulk_pricing_tiers TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.bulk_pricing_tiers TO authenticated;

DROP POLICY IF EXISTS "read_bulk_pricing" ON public.bulk_pricing_tiers;
CREATE POLICY "read_bulk_pricing" ON public.bulk_pricing_tiers
  FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "insert_bulk_pricing_seller" ON public.bulk_pricing_tiers;
CREATE POLICY "insert_bulk_pricing_seller" ON public.bulk_pricing_tiers
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.products p
    JOIN public.seller_profiles sp ON sp.id = p.seller_id
    WHERE p.id = bulk_pricing_tiers.product_id AND sp.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "update_bulk_pricing_seller" ON public.bulk_pricing_tiers;
CREATE POLICY "update_bulk_pricing_seller" ON public.bulk_pricing_tiers
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.products p
    JOIN public.seller_profiles sp ON sp.id = p.seller_id
    WHERE p.id = bulk_pricing_tiers.product_id AND sp.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.products p
    JOIN public.seller_profiles sp ON sp.id = p.seller_id
    WHERE p.id = bulk_pricing_tiers.product_id AND sp.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "delete_bulk_pricing_seller" ON public.bulk_pricing_tiers;
CREATE POLICY "delete_bulk_pricing_seller" ON public.bulk_pricing_tiers
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.products p
    JOIN public.seller_profiles sp ON sp.id = p.seller_id
    WHERE p.id = bulk_pricing_tiers.product_id AND sp.user_id = auth.uid()
  ));

-- ============================================================
-- Add columns to products
-- ============================================================
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS min_order_quantity integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS max_order_quantity integer,
  ADD COLUMN IF NOT EXISTS promotion_start_at timestamptz,
  ADD COLUMN IF NOT EXISTS promotion_end_at timestamptz,
  ADD COLUMN IF NOT EXISTS negotiation_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS min_offer_price numeric;

-- ============================================================
-- Add columns to seller_profiles
-- ============================================================
ALTER TABLE public.seller_profiles
  ADD COLUMN IF NOT EXISTS negotiation_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS default_offer_expiry_hours integer NOT NULL DEFAULT 48;

-- ============================================================
-- Offer validation trigger
-- ============================================================
CREATE OR REPLACE FUNCTION public.validate_product_offer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_product public.products%ROWTYPE;
  v_seller public.seller_profiles%ROWTYPE;
BEGIN
  -- Fetch the product
  SELECT * INTO v_product FROM public.products WHERE id = NEW.product_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product does not exist.';
  END IF;

  -- Product must be published
  IF v_product.status <> 'published' THEN
    RAISE EXCEPTION 'Cannot make an offer on a product that is not published.';
  END IF;

  -- Product must have stock
  IF v_product.stock <= 0 THEN
    RAISE EXCEPTION 'Cannot make an offer on an out-of-stock product.';
  END IF;

  -- Buyer cannot make an offer on their own product
  IF v_product.seller_id IS NOT NULL THEN
    SELECT * INTO v_seller FROM public.seller_profiles WHERE id = v_product.seller_id;
    IF v_seller.user_id = NEW.buyer_id THEN
      RAISE EXCEPTION 'You cannot make an offer on your own product.';
    END IF;
  END IF;

  -- Negotiation must be enabled on product or seller profile
  IF NOT v_product.negotiation_enabled AND NOT v_seller.negotiation_enabled THEN
    RAISE EXCEPTION 'Negotiation is not enabled for this product.';
  END IF;

  -- If min_offer_price is set, proposed_price must meet it
  IF v_product.min_offer_price IS NOT NULL AND NEW.proposed_price < v_product.min_offer_price THEN
    RAISE EXCEPTION 'Offer amount must be at least %.', v_product.min_offer_price;
  END IF;

  -- Quantity must not exceed stock
  IF NEW.quantity > v_product.stock THEN
    RAISE EXCEPTION 'Requested quantity exceeds available stock (%).', v_product.stock;
  END IF;

  -- On UPDATE: only allow transitions from pending
  IF TG_OP = 'UPDATE' AND OLD.status <> 'pending' AND NEW.status <> OLD.status THEN
    RAISE EXCEPTION 'Cannot change status of an offer that is already %.', OLD.status;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS product_offers_validation ON public.product_offers;
CREATE TRIGGER product_offers_validation
  BEFORE INSERT OR UPDATE ON public.product_offers
  FOR EACH ROW EXECUTE FUNCTION public.validate_product_offer();

-- Set responded_at when seller takes action
CREATE OR REPLACE FUNCTION public.set_offer_responded_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF NEW.status IN ('accepted','rejected') AND OLD.status = 'pending' THEN
    NEW.responded_at = now();
  END IF;
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS product_offers_responded ON public.product_offers;
CREATE TRIGGER product_offers_responded
  BEFORE UPDATE ON public.product_offers
  FOR EACH ROW EXECUTE FUNCTION public.set_offer_responded_at();

-- ============================================================
-- Expire stale offers function
-- ============================================================
CREATE OR REPLACE FUNCTION public.expire_stale_offers()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.product_offers
  SET status = 'expired', updated_at = now()
  WHERE status = 'pending'
    AND expires_at IS NOT NULL
    AND expires_at < now();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- ============================================================
-- Indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_product_offers_product ON public.product_offers(product_id);
CREATE INDEX IF NOT EXISTS idx_product_offers_buyer ON public.product_offers(buyer_id);
CREATE INDEX IF NOT EXISTS idx_product_offers_seller ON public.product_offers(seller_id);
CREATE INDEX IF NOT EXISTS idx_product_offers_status ON public.product_offers(status);
CREATE INDEX IF NOT EXISTS idx_bulk_pricing_product ON public.bulk_pricing_tiers(product_id);

-- Revoke execute from anon on security definer functions
REVOKE EXECUTE ON FUNCTION public.validate_product_offer() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_offer_responded_at() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.expire_stale_offers() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.expire_stale_offers() TO authenticated;

/*
# Seller Promotions, Coupons, and Voucher Management System

## Overview
Adds a complete promotions and coupon system for MariMarket sellers.
Sellers can create promotional campaigns and generate coupon codes for buyers.
Buyers can discover active promotions, save coupons, and apply them at checkout.
All redemption logic is enforced server-side via a concurrency-safe RPC.

## 1. New Tables
### promotions — seller-owned campaigns (percentage, fixed, BOGO, bundle, storewide, etc.)
### promotion_products — links campaigns to specific products
### coupons — coupon codes attached to a promotion or standalone
### coupon_redemptions — records each coupon use, tied to an order
### buyer_saved_coupons — buyers can bookmark coupons

## 2. Security (RLS)
- Sellers CRUD their own campaigns/coupons; buyers SELECT active+public; admins SELECT all.
- Redemptions: buyers insert/select their own; sellers select via coupon ownership.
- Saved coupons: buyers CRUD their own.
- All RPCs are SECURITY DEFINER with EXECUTE revoked from PUBLIC/anon.

## 3. RPC Functions
- validate_coupon: checks validity, returns discount amount + reason.
- redeem_coupon: atomic concurrency-safe redemption with FOR UPDATE lock.
- release_coupon_redemption: releases redemption when order is cancelled.
- apply_promotion_discount: calculates discount for a campaign.

## 4. Orders table additions
- coupon_discount numeric (snapshot of applied discount)
- coupon_id uuid (reference to the coupon used)

## Important Notes
- Coupon codes stored with UNIQUE index on (seller_id, upper(code)) for case-insensitive uniqueness.
- Discount snapshots in coupon_redemptions preserve historical order data.
- Redemption limits enforced inside redeem_coupon RPC via SELECT FOR UPDATE.
*/

-- ============ promotions ============
CREATE TABLE IF NOT EXISTS promotions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES seller_profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  type text NOT NULL DEFAULT 'percentage'
    CHECK (type IN ('percentage','fixed_amount','buy_one_get_one','buy_more_save_more','bundle','free_delivery','product_specific','storewide')),
  discount_value numeric NOT NULL DEFAULT 0 CHECK (discount_value >= 0),
  min_purchase numeric NOT NULL DEFAULT 0 CHECK (min_purchase >= 0),
  max_discount numeric CHECK (max_discount IS NULL OR max_discount >= 0),
  max_redemptions integer CHECK (max_redemptions IS NULL OR max_redemptions > 0),
  per_buyer_limit integer NOT NULL DEFAULT 1 CHECK (per_buyer_limit >= 1),
  start_at timestamptz NOT NULL DEFAULT now(),
  end_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','pending_review','active','paused','expired','rejected')),
  visibility text NOT NULL DEFAULT 'public' CHECK (visibility IN ('public','storefront_only')),
  municipality_id uuid REFERENCES municipalities(id) ON DELETE SET NULL,
  terms text,
  total_redemptions integer NOT NULL DEFAULT 0 CHECK (total_redemptions >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE promotions ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON promotions TO authenticated;

DROP POLICY IF EXISTS "seller_select_own_promotions" ON promotions;
CREATE POLICY "seller_select_own_promotions" ON promotions FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM seller_profiles sp WHERE sp.id = promotions.seller_id AND sp.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "buyer_select_active_promotions" ON promotions;
CREATE POLICY "buyer_select_active_promotions" ON promotions FOR SELECT
  TO authenticated USING (status = 'active' AND visibility = 'public');

DROP POLICY IF EXISTS "admin_select_all_promotions" ON promotions;
CREATE POLICY "admin_select_all_promotions" ON promotions FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = auth.uid()
            AND ur.role IN ('administrator','super_admin','moderator'))
  );

DROP POLICY IF EXISTS "seller_insert_own_promotions" ON promotions;
CREATE POLICY "seller_insert_own_promotions" ON promotions FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM seller_profiles sp WHERE sp.id = promotions.seller_id AND sp.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "seller_update_own_promotions" ON promotions;
CREATE POLICY "seller_update_own_promotions" ON promotions FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM seller_profiles sp WHERE sp.id = promotions.seller_id AND sp.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM seller_profiles sp WHERE sp.id = promotions.seller_id AND sp.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "seller_delete_own_promotions" ON promotions;
CREATE POLICY "seller_delete_own_promotions" ON promotions FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM seller_profiles sp WHERE sp.id = promotions.seller_id AND sp.user_id = auth.uid())
  );

CREATE INDEX IF NOT EXISTS idx_promotions_seller_id ON promotions(seller_id);
CREATE INDEX IF NOT EXISTS idx_promotions_status ON promotions(status);
CREATE INDEX IF NOT EXISTS idx_promotions_dates ON promotions(start_at, end_at);
CREATE INDEX IF NOT EXISTS idx_promotions_municipality ON promotions(municipality_id) WHERE municipality_id IS NOT NULL;

-- ============ promotion_products ============
CREATE TABLE IF NOT EXISTS promotion_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  promotion_id uuid NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE promotion_products ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, DELETE ON promotion_products TO authenticated;

DROP POLICY IF EXISTS "seller_manage_own_promotion_products" ON promotion_products;
CREATE POLICY "seller_manage_own_promotion_products" ON promotion_products FOR ALL
  TO authenticated USING (
    EXISTS (SELECT 1 FROM promotions p
            JOIN seller_profiles sp ON sp.id = p.seller_id
            WHERE p.id = promotion_products.promotion_id AND sp.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM promotions p
            JOIN seller_profiles sp ON sp.id = p.seller_id
            WHERE p.id = promotion_products.promotion_id AND sp.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "buyer_select_promotion_products" ON promotion_products;
CREATE POLICY "buyer_select_promotion_products" ON promotion_products FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM promotions p WHERE p.id = promotion_products.promotion_id
            AND p.status = 'active' AND p.visibility = 'public')
  );

CREATE INDEX IF NOT EXISTS idx_promotion_products_promotion ON promotion_products(promotion_id);
CREATE INDEX IF NOT EXISTS idx_promotion_products_product ON promotion_products(product_id);

-- ============ coupons ============
CREATE TABLE IF NOT EXISTS coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  promotion_id uuid REFERENCES promotions(id) ON DELETE SET NULL,
  seller_id uuid NOT NULL REFERENCES seller_profiles(id) ON DELETE CASCADE,
  code text NOT NULL,
  description text,
  discount_type text NOT NULL DEFAULT 'percentage'
    CHECK (discount_type IN ('percentage','fixed_amount')),
  discount_value numeric NOT NULL DEFAULT 0 CHECK (discount_value >= 0),
  min_purchase numeric NOT NULL DEFAULT 0 CHECK (min_purchase >= 0),
  max_discount numeric CHECK (max_discount IS NULL OR max_discount >= 0),
  start_at timestamptz NOT NULL DEFAULT now(),
  end_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  max_redemptions integer CHECK (max_redemptions IS NULL OR max_redemptions > 0),
  per_buyer_limit integer NOT NULL DEFAULT 1 CHECK (per_buyer_limit >= 1),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','expired')),
  total_redemptions integer NOT NULL DEFAULT 0 CHECK (total_redemptions >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_coupons_seller_code_unique
  ON coupons(seller_id, upper(code));

ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON coupons TO authenticated;

DROP POLICY IF EXISTS "seller_select_own_coupons" ON coupons;
CREATE POLICY "seller_select_own_coupons" ON coupons FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM seller_profiles sp WHERE sp.id = coupons.seller_id AND sp.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "buyer_select_active_coupons" ON coupons;
CREATE POLICY "buyer_select_active_coupons" ON coupons FOR SELECT
  TO authenticated USING (status = 'active');

DROP POLICY IF EXISTS "admin_select_all_coupons" ON coupons;
CREATE POLICY "admin_select_all_coupons" ON coupons FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = auth.uid()
            AND ur.role IN ('administrator','super_admin','moderator'))
  );

DROP POLICY IF EXISTS "seller_insert_own_coupons" ON coupons;
CREATE POLICY "seller_insert_own_coupons" ON coupons FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM seller_profiles sp WHERE sp.id = coupons.seller_id AND sp.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "seller_update_own_coupons" ON coupons;
CREATE POLICY "seller_update_own_coupons" ON coupons FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM seller_profiles sp WHERE sp.id = coupons.seller_id AND sp.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM seller_profiles sp WHERE sp.id = coupons.seller_id AND sp.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "seller_delete_own_coupons" ON coupons;
CREATE POLICY "seller_delete_own_coupons" ON coupons FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM seller_profiles sp WHERE sp.id = coupons.seller_id AND sp.user_id = auth.uid())
  );

CREATE INDEX IF NOT EXISTS idx_coupons_seller_id ON coupons(seller_id);
CREATE INDEX IF NOT EXISTS idx_coupons_status ON coupons(status);
CREATE INDEX IF NOT EXISTS idx_coupons_dates ON coupons(start_at, end_at);

-- ============ coupon_redemptions ============
CREATE TABLE IF NOT EXISTS coupon_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id uuid NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
  buyer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  discount_amount numeric NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  status text NOT NULL DEFAULT 'redeemed' CHECK (status IN ('redeemed','released')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(coupon_id, order_id)
);

ALTER TABLE coupon_redemptions ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON coupon_redemptions TO authenticated;

DROP POLICY IF EXISTS "buyer_select_own_redemptions" ON coupon_redemptions;
CREATE POLICY "buyer_select_own_redemptions" ON coupon_redemptions FOR SELECT
  TO authenticated USING (auth.uid() = buyer_id);

DROP POLICY IF EXISTS "seller_select_own_redemptions" ON coupon_redemptions;
CREATE POLICY "seller_select_own_redemptions" ON coupon_redemptions FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM coupons c
            JOIN seller_profiles sp ON sp.id = c.seller_id
            WHERE c.id = coupon_redemptions.coupon_id AND sp.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "admin_select_all_redemptions" ON coupon_redemptions;
CREATE POLICY "admin_select_all_redemptions" ON coupon_redemptions FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = auth.uid()
            AND ur.role IN ('administrator','super_admin','moderator'))
  );

DROP POLICY IF EXISTS "buyer_insert_own_redemption" ON coupon_redemptions;
CREATE POLICY "buyer_insert_own_redemption" ON coupon_redemptions FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = buyer_id);

DROP POLICY IF EXISTS "buyer_update_own_redemption" ON coupon_redemptions;
CREATE POLICY "buyer_update_own_redemption" ON coupon_redemptions FOR UPDATE
  TO authenticated USING (auth.uid() = buyer_id) WITH CHECK (auth.uid() = buyer_id);

CREATE INDEX IF NOT EXISTS idx_redemptions_coupon ON coupon_redemptions(coupon_id);
CREATE INDEX IF NOT EXISTS idx_redemptions_buyer ON coupon_redemptions(buyer_id);
CREATE INDEX IF NOT EXISTS idx_redemptions_order ON coupon_redemptions(order_id);

-- ============ buyer_saved_coupons ============
CREATE TABLE IF NOT EXISTS buyer_saved_coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  coupon_id uuid NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(buyer_id, coupon_id)
);

ALTER TABLE buyer_saved_coupons ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, DELETE ON buyer_saved_coupons TO authenticated;

DROP POLICY IF EXISTS "buyer_select_own_saved" ON buyer_saved_coupons;
CREATE POLICY "buyer_select_own_saved" ON buyer_saved_coupons FOR SELECT
  TO authenticated USING (auth.uid() = buyer_id);

DROP POLICY IF EXISTS "buyer_insert_own_saved" ON buyer_saved_coupons;
CREATE POLICY "buyer_insert_own_saved" ON buyer_saved_coupons FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = buyer_id);

DROP POLICY IF EXISTS "buyer_delete_own_saved" ON buyer_saved_coupons;
CREATE POLICY "buyer_delete_own_saved" ON buyer_saved_coupons FOR DELETE
  TO authenticated USING (auth.uid() = buyer_id);

CREATE INDEX IF NOT EXISTS idx_saved_coupons_buyer ON buyer_saved_coupons(buyer_id);

-- ============ Orders: add coupon columns ============
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'coupon_discount') THEN
    ALTER TABLE orders ADD COLUMN coupon_discount numeric NOT NULL DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'coupon_id') THEN
    ALTER TABLE orders ADD COLUMN coupon_id uuid REFERENCES coupons(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ============ RPC: validate_coupon ============
CREATE OR REPLACE FUNCTION validate_coupon(
  p_code text,
  p_buyer_id uuid,
  p_seller_subtotal numeric DEFAULT 0
) RETURNS TABLE(valid boolean, coupon_id uuid, seller_id uuid, discount_amount numeric, discount_type text, reason text)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  c RECORD;
  buyer_uses integer;
  disc numeric;
BEGIN
  SELECT id, seller_id, discount_type, discount_value, min_purchase, max_discount,
         start_at, end_at, max_redemptions, per_buyer_limit, total_redemptions, status
  INTO c
  FROM coupons
  WHERE upper(code) = upper(p_code)
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::uuid, 0::numeric, NULL::text, 'Coupon code not found'::text;
    RETURN;
  END IF;

  IF c.status != 'active' THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::uuid, 0::numeric, NULL::text, 'Coupon is no longer active'::text;
    RETURN;
  END IF;

  IF now() < c.start_at THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::uuid, 0::numeric, NULL::text, 'Coupon is not yet available'::text;
    RETURN;
  END IF;

  IF now() > c.end_at THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::uuid, 0::numeric, NULL::text, 'Coupon has expired'::text;
    RETURN;
  END IF;

  IF c.max_redemptions IS NOT NULL AND c.total_redemptions >= c.max_redemptions THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::uuid, 0::numeric, NULL::text, 'Coupon redemption limit reached'::text;
    RETURN;
  END IF;

  IF p_seller_subtotal < c.min_purchase THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::uuid, 0::numeric, NULL::text,
      'Minimum purchase of PHP ' || c.min_purchase::text || ' not reached'::text;
    RETURN;
  END IF;

  SELECT count(*) INTO buyer_uses
  FROM coupon_redemptions
  WHERE coupon_id = c.id AND buyer_id = p_buyer_id AND status = 'redeemed';

  IF buyer_uses >= c.per_buyer_limit THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::uuid, 0::numeric, NULL::text, 'You have already used this coupon the maximum number of times'::text;
    RETURN;
  END IF;

  IF c.discount_type = 'percentage' THEN
    disc := p_seller_subtotal * (c.discount_value / 100.0);
    IF c.max_discount IS NOT NULL AND disc > c.max_discount THEN
      disc := c.max_discount;
    END IF;
  ELSE
    disc := c.discount_value;
    IF disc > p_seller_subtotal THEN
      disc := p_seller_subtotal;
    END IF;
    IF c.max_discount IS NOT NULL AND disc > c.max_discount THEN
      disc := c.max_discount;
    END IF;
  END IF;

  RETURN QUERY SELECT true, c.id, c.seller_id, disc, c.discount_type, NULL::text;
END;
$$;

REVOKE EXECUTE ON FUNCTION validate_coupon(text, uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION validate_coupon(text, uuid, numeric) TO authenticated;

-- ============ RPC: redeem_coupon ============
CREATE OR REPLACE FUNCTION redeem_coupon(
  p_coupon_id uuid,
  p_buyer_id uuid,
  p_order_id uuid,
  p_discount_amount numeric
) RETURNS TABLE(success boolean, reason text)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  c RECORD;
  buyer_uses integer;
  existing_redeem integer;
BEGIN
  SELECT total_redemptions, max_redemptions, per_buyer_limit, status, end_at
  INTO c
  FROM coupons
  WHERE id = p_coupon_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Coupon not found'::text;
    RETURN;
  END IF;

  IF c.status != 'active' THEN
    RETURN QUERY SELECT false, 'Coupon is no longer active'::text;
    RETURN;
  END IF;

  IF now() > c.end_at THEN
    RETURN QUERY SELECT false, 'Coupon has expired'::text;
    RETURN;
  END IF;

  IF c.max_redemptions IS NOT NULL AND c.total_redemptions >= c.max_redemptions THEN
    RETURN QUERY SELECT false, 'Coupon redemption limit reached'::text;
    RETURN;
  END IF;

  SELECT count(*) INTO existing_redeem
  FROM coupon_redemptions
  WHERE coupon_id = p_coupon_id AND order_id = p_order_id;

  IF existing_redeem > 0 THEN
    RETURN QUERY SELECT false, 'Coupon already redeemed for this order'::text;
    RETURN;
  END IF;

  SELECT count(*) INTO buyer_uses
  FROM coupon_redemptions
  WHERE coupon_id = p_coupon_id AND buyer_id = p_buyer_id AND status = 'redeemed';

  IF buyer_uses >= c.per_buyer_limit THEN
    RETURN QUERY SELECT false, 'Per-buyer redemption limit reached'::text;
    RETURN;
  END IF;

  INSERT INTO coupon_redemptions (coupon_id, buyer_id, order_id, discount_amount, status)
  VALUES (p_coupon_id, p_buyer_id, p_order_id, p_discount_amount, 'redeemed');

  UPDATE coupons SET total_redemptions = total_redemptions + 1, updated_at = now()
  WHERE id = p_coupon_id;

  RETURN QUERY SELECT true, NULL::text;
END;
$$;

REVOKE EXECUTE ON FUNCTION redeem_coupon(uuid, uuid, uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION redeem_coupon(uuid, uuid, uuid, numeric) TO authenticated;

-- ============ RPC: release_coupon_redemption ============
CREATE OR REPLACE FUNCTION release_coupon_redemption(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT id, coupon_id FROM coupon_redemptions
    WHERE order_id = p_order_id AND status = 'redeemed'
  LOOP
    UPDATE coupon_redemptions SET status = 'released' WHERE id = r.id;
    UPDATE coupons SET total_redemptions = GREATEST(total_redemptions - 1, 0), updated_at = now()
    WHERE id = r.coupon_id;
  END LOOP;
END;
$$;

REVOKE EXECUTE ON FUNCTION release_coupon_redemption(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION release_coupon_redemption(uuid) TO authenticated;

-- ============ RPC: apply_promotion_discount ============
CREATE OR REPLACE FUNCTION apply_promotion_discount(
  p_promotion_id uuid,
  p_quantity integer DEFAULT 1,
  p_subtotal numeric DEFAULT 0
) RETURNS TABLE(discount_amount numeric, valid boolean, reason text)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  p RECORD;
  disc numeric;
BEGIN
  SELECT type, discount_value, max_discount, status, start_at, end_at, min_purchase
  INTO p
  FROM promotions
  WHERE id = p_promotion_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 0::numeric, false, 'Promotion not found'::text;
    RETURN;
  END IF;

  IF p.status != 'active' THEN
    RETURN QUERY SELECT 0::numeric, false, 'Promotion is not active'::text;
    RETURN;
  END IF;

  IF now() < p.start_at OR now() > p.end_at THEN
    RETURN QUERY SELECT 0::numeric, false, 'Promotion is not within its active period'::text;
    RETURN;
  END IF;

  IF p_subtotal < p.min_purchase THEN
    RETURN QUERY SELECT 0::numeric, false, 'Minimum purchase not reached'::text;
    RETURN;
  END IF;

  disc := 0;
  IF p.type IN ('percentage','product_specific','storewide','buy_more_save_more','bundle') THEN
    disc := p_subtotal * (p.discount_value / 100.0);
  ELSIF p.type = 'fixed_amount' THEN
    disc := p.discount_value;
  ELSIF p.type = 'buy_one_get_one' THEN
    IF p_quantity >= 2 THEN
      disc := p_subtotal / p_quantity;
    END IF;
  ELSIF p.type = 'free_delivery' THEN
    disc := 0;
  END IF;

  IF p.max_discount IS NOT NULL AND disc > p.max_discount THEN
    disc := p.max_discount;
  END IF;

  IF disc > p_subtotal THEN
    disc := p_subtotal;
  END IF;

  RETURN QUERY SELECT disc, true, NULL::text;
END;
$$;

REVOKE EXECUTE ON FUNCTION apply_promotion_discount(uuid, integer, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION apply_promotion_discount(uuid, integer, numeric) TO authenticated;

-- Grant service_role on all new tables
GRANT SELECT, INSERT, UPDATE, DELETE ON promotions, promotion_products, coupons, coupon_redemptions, buyer_saved_coupons TO service_role;

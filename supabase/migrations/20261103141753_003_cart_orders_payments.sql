/*
# MariMarket — Shopping Cart, Orders, Payments & Deliveries

## Summary
Creates the transaction infrastructure: shopping carts, cart items, orders, order items,
payments, and delivery tracking.

## New Tables
1. **carts** — shopping cart per user (one active cart per user).
2. **cart_items** — items in a shopping cart.
3. **orders** — order records with status tracking.
4. **order_items** — individual line items in an order.
5. **payments** — payment records linked to orders.
6. **deliveries** — delivery tracking linked to orders.

## Security
- RLS on all tables.
- Carts: users can only access their own cart.
- Orders: buyers can see their own orders; sellers can see orders containing their products.
- Payments: buyers can see their own payments; sellers can see payments for orders with their products.
- Deliveries: buyers can see deliveries for their orders; sellers can see deliveries for their products.
- All write operations scoped to ownership.
*/

-- ============================================================
-- CARTS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.carts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_carts_user_id ON public.carts(user_id);

ALTER TABLE public.carts ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.carts TO authenticated;

DROP POLICY IF EXISTS "read_own_cart" ON public.carts;
CREATE POLICY "read_own_cart"
  ON public.carts FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_cart" ON public.carts;
CREATE POLICY "insert_own_cart"
  ON public.carts FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_cart" ON public.carts;
CREATE POLICY "update_own_cart"
  ON public.carts FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_cart" ON public.carts;
CREATE POLICY "delete_own_cart"
  ON public.carts FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ============================================================
-- ORDERS (must exist before order_items references it)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  order_number text UNIQUE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'paid', 'shipped', 'delivered', 'completed', 'cancelled', 'refunded')),
  subtotal numeric(12,2) NOT NULL DEFAULT 0,
  shipping_fee numeric(12,2) NOT NULL DEFAULT 0,
  total numeric(12,2) NOT NULL DEFAULT 0,
  notes text,
  shipping_municipality_id uuid REFERENCES public.municipalities(id) ON DELETE SET NULL,
  shipping_barangay_id uuid REFERENCES public.barangays(id) ON DELETE SET NULL,
  shipping_address text,
  shipping_contact_name text,
  shipping_contact_phone text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_orders_buyer_id ON public.orders(buyer_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders(created_at DESC);

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.orders TO authenticated;

-- ============================================================
-- ORDER ITEMS (must exist before orders policies reference it)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  variant_id uuid REFERENCES public.product_variants(id) ON DELETE SET NULL,
  seller_id uuid NOT NULL REFERENCES public.seller_profiles(id) ON DELETE RESTRICT,
  product_title text NOT NULL,
  product_image_url text,
  unit_price numeric(12,2) NOT NULL CHECK (unit_price >= 0),
  quantity int NOT NULL CHECK (quantity > 0),
  subtotal numeric(12,2) NOT NULL CHECK (subtotal >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON public.order_items(product_id);
CREATE INDEX IF NOT EXISTS idx_order_items_seller_id ON public.order_items(seller_id);

ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON public.order_items TO authenticated;

-- ============================================================
-- CART ITEMS (must exist after carts)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.cart_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id uuid NOT NULL REFERENCES public.carts(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  variant_id uuid REFERENCES public.product_variants(id) ON DELETE SET NULL,
  quantity int NOT NULL DEFAULT 1 CHECK (quantity > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cart_items_cart_id ON public.cart_items(cart_id);
CREATE INDEX IF NOT EXISTS idx_cart_items_product_id ON public.cart_items(product_id);

ALTER TABLE public.cart_items ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cart_items TO authenticated;

-- ============================================================
-- PAYMENTS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  buyer_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  method text CHECK (method IN ('cod', 'gcash', 'bank_transfer', 'maya', 'card')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed', 'refunded', 'partial')),
  reference_number text,
  payment_proof_url text,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payments_order_id ON public.payments(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_buyer_id ON public.payments(buyer_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON public.payments(status);

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.payments TO authenticated;

-- ============================================================
-- DELIVERIES
-- ============================================================

CREATE TABLE IF NOT EXISTS public.deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  courier text,
  tracking_number text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'failed', 'returned')),
  pickup_address text,
  delivery_address text,
  estimated_delivery date,
  delivered_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deliveries_order_id ON public.deliveries(order_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_status ON public.deliveries(status);

ALTER TABLE public.deliveries ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.deliveries TO authenticated;

-- ============================================================
-- POLICIES: CART ITEMS
-- ============================================================

DROP POLICY IF EXISTS "read_own_cart_items" ON public.cart_items;
CREATE POLICY "read_own_cart_items"
  ON public.cart_items FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.carts c WHERE c.id = cart_items.cart_id AND c.user_id = auth.uid()));

DROP POLICY IF EXISTS "insert_own_cart_items" ON public.cart_items;
CREATE POLICY "insert_own_cart_items"
  ON public.cart_items FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.carts c WHERE c.id = cart_items.cart_id AND c.user_id = auth.uid()));

DROP POLICY IF EXISTS "update_own_cart_items" ON public.cart_items;
CREATE POLICY "update_own_cart_items"
  ON public.cart_items FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.carts c WHERE c.id = cart_items.cart_id AND c.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.carts c WHERE c.id = cart_items.cart_id AND c.user_id = auth.uid()));

DROP POLICY IF EXISTS "delete_own_cart_items" ON public.cart_items;
CREATE POLICY "delete_own_cart_items"
  ON public.cart_items FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.carts c WHERE c.id = cart_items.cart_id AND c.user_id = auth.uid()));

-- ============================================================
-- POLICIES: ORDERS
-- ============================================================

DROP POLICY IF EXISTS "read_orders" ON public.orders;
CREATE POLICY "read_orders"
  ON public.orders FOR SELECT
  TO authenticated
  USING (
    buyer_id = auth.uid()
    OR public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.order_items oi
      JOIN public.products p ON p.id = oi.product_id
      JOIN public.seller_profiles sp ON sp.id = p.seller_id
      WHERE oi.order_id = orders.id AND sp.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "insert_own_order" ON public.orders;
CREATE POLICY "insert_own_order"
  ON public.orders FOR INSERT
  TO authenticated
  WITH CHECK (buyer_id = auth.uid());

DROP POLICY IF EXISTS "update_orders" ON public.orders;
CREATE POLICY "update_orders"
  ON public.orders FOR UPDATE
  TO authenticated
  USING (
    buyer_id = auth.uid()
    OR public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.order_items oi
      JOIN public.products p ON p.id = oi.product_id
      JOIN public.seller_profiles sp ON sp.id = p.seller_id
      WHERE oi.order_id = orders.id AND sp.user_id = auth.uid()
    )
  )
  WITH CHECK (
    buyer_id = auth.uid()
    OR public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.order_items oi
      JOIN public.products p ON p.id = oi.product_id
      JOIN public.seller_profiles sp ON sp.id = p.seller_id
      WHERE oi.order_id = orders.id AND sp.user_id = auth.uid()
    )
  );

-- ============================================================
-- POLICIES: ORDER ITEMS
-- ============================================================

DROP POLICY IF EXISTS "read_order_items" ON public.order_items;
CREATE POLICY "read_order_items"
  ON public.order_items FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_items.order_id AND o.buyer_id = auth.uid())
    OR public.is_admin()
    OR EXISTS (SELECT 1 FROM public.seller_profiles sp WHERE sp.id = order_items.seller_id AND sp.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "insert_own_order_items" ON public.order_items;
CREATE POLICY "insert_own_order_items"
  ON public.order_items FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_items.order_id AND o.buyer_id = auth.uid())
  );

-- ============================================================
-- POLICIES: PAYMENTS
-- ============================================================

DROP POLICY IF EXISTS "read_payments" ON public.payments;
CREATE POLICY "read_payments"
  ON public.payments FOR SELECT
  TO authenticated
  USING (
    buyer_id = auth.uid()
    OR public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.order_items oi
      JOIN public.seller_profiles sp ON sp.id = oi.seller_id AND sp.user_id = auth.uid()
      WHERE oi.order_id = payments.order_id
    )
  );

DROP POLICY IF EXISTS "insert_own_payment" ON public.payments;
CREATE POLICY "insert_own_payment"
  ON public.payments FOR INSERT
  TO authenticated
  WITH CHECK (buyer_id = auth.uid());

DROP POLICY IF EXISTS "update_payments" ON public.payments;
CREATE POLICY "update_payments"
  ON public.payments FOR UPDATE
  TO authenticated
  USING (buyer_id = auth.uid() OR public.is_admin())
  WITH CHECK (buyer_id = auth.uid() OR public.is_admin());

-- ============================================================
-- POLICIES: DELIVERIES
-- ============================================================

DROP POLICY IF EXISTS "read_deliveries" ON public.deliveries;
CREATE POLICY "read_deliveries"
  ON public.deliveries FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.orders o WHERE o.id = deliveries.order_id AND o.buyer_id = auth.uid())
    OR public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.order_items oi
      JOIN public.seller_profiles sp ON sp.id = oi.seller_id AND sp.user_id = auth.uid()
      WHERE oi.order_id = deliveries.order_id
    )
  );

DROP POLICY IF EXISTS "insert_deliveries" ON public.deliveries;
CREATE POLICY "insert_deliveries"
  ON public.deliveries FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.orders o WHERE o.id = deliveries.order_id AND o.buyer_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.order_items oi
      JOIN public.seller_profiles sp ON sp.id = oi.seller_id AND sp.user_id = auth.uid()
      WHERE oi.order_id = deliveries.order_id
    )
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "update_deliveries" ON public.deliveries;
CREATE POLICY "update_deliveries"
  ON public.deliveries FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.orders o WHERE o.id = deliveries.order_id AND o.buyer_id = auth.uid())
    OR public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.order_items oi
      JOIN public.seller_profiles sp ON sp.id = oi.seller_id AND sp.user_id = auth.uid()
      WHERE oi.order_id = deliveries.order_id
    )
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.orders o WHERE o.id = deliveries.order_id AND o.buyer_id = auth.uid())
    OR public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.order_items oi
      JOIN public.seller_profiles sp ON sp.id = oi.seller_id AND sp.user_id = auth.uid()
      WHERE oi.order_id = deliveries.order_id
    )
  );

-- ============================================================
-- UPDATED_AT TRIGGERS
-- ============================================================

DROP TRIGGER IF EXISTS carts_updated_at ON public.carts;
CREATE TRIGGER carts_updated_at
  BEFORE UPDATE ON public.carts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS orders_updated_at ON public.orders;
CREATE TRIGGER orders_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS payments_updated_at ON public.payments;
CREATE TRIGGER payments_updated_at
  BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS deliveries_updated_at ON public.deliveries;
CREATE TRIGGER deliveries_updated_at
  BEFORE UPDATE ON public.deliveries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ============================================================
-- AUTO-GENERATE ORDER NUMBER
-- ============================================================

CREATE OR REPLACE FUNCTION public.generate_order_number()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.order_number = 'MM-' || to_char(now(), 'YYYYMMDD') || '-' || lpad(NEW.id::text, 8, '0');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_generate_number ON public.orders;
CREATE TRIGGER orders_generate_number
  BEFORE INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.generate_order_number();

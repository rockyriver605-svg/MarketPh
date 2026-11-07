/*
# MariMarket — Order Management System: Status History, Disputes, Secure Transitions

## Summary
Extends the order system with full lifecycle management:
1. Adds new order statuses: 'processing', 'ready_for_pickup', 'disputed' to the orders CHECK constraint.
2. Creates `order_status_history` table to record every status change with timestamps and responsible users.
3. Creates `order_disputes` table for buyer-reported transaction problems.
4. Adds `cancellation_reason` and `cancelled_by` columns to orders for cancellation tracking.
5. Creates a SECURITY DEFINER function `transition_order_status` that enforces valid status transitions
   based on who is acting (buyer vs seller vs admin) and records the change in history.
6. Creates a SECURITY DEFINER function `request_order_cancellation` for buyers to cancel orders.
7. Creates a SECURITY DEFINER function `file_order_dispute` for buyers to report problems.

## New Tables
- `order_status_history` — audit trail of every status change (order_id, old_status, new_status, changed_by, reason, created_at).
- `order_disputes` — buyer-reported problems (order_id, buyer_id, reason, description, status, resolution, created_at, updated_at).

## Modified Tables
- `orders` — adds `cancellation_reason text` and `cancelled_by uuid` columns. Status constraint expanded with 'processing', 'ready_for_pickup', 'disputed'.

## Security
- RLS on all new tables.
- `order_status_history`: buyers and sellers can read history for their orders; only the transition function writes (SECURITY DEFINER).
- `order_disputes`: buyers can create and read their own disputes; sellers can read disputes on their orders; admins can read all.
- `transition_order_status`: SECURITY DEFINER, validates caller is the buyer or seller of the order, enforces transition rules.
- `request_order_cancellation`: SECURITY DEFINER, validates caller is the buyer, checks order is in a cancellable state.
- `file_order_dispute`: SECURITY DEFINER, validates caller is the buyer.
- REVOKE EXECUTE from PUBLIC/anon on all new functions; GRANT to authenticated.
*/

-- ============================================================
-- 1. UPDATE ORDERS STATUS CONSTRAINT
-- ============================================================

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_status_check
  CHECK (status IN ('pending', 'confirmed', 'processing', 'ready_for_pickup', 'paid', 'shipped', 'delivered', 'completed', 'cancelled', 'refunded', 'disputed'));

-- Add cancellation tracking columns
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS cancellation_reason text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS cancelled_by uuid;

-- ============================================================
-- 2. ORDER STATUS HISTORY
-- ============================================================

CREATE TABLE IF NOT EXISTS public.order_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  old_status text NOT NULL,
  new_status text NOT NULL,
  changed_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_role text NOT NULL DEFAULT 'buyer',
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_status_history_order_id ON public.order_status_history(order_id);
CREATE INDEX IF NOT EXISTS idx_order_status_history_created_at ON public.order_status_history(created_at);

ALTER TABLE public.order_status_history ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.order_status_history TO authenticated;

DROP POLICY IF EXISTS "read_order_status_history" ON public.order_status_history;
CREATE POLICY "read_order_status_history"
  ON public.order_status_history FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_status_history.order_id AND o.buyer_id = auth.uid())
    OR public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.order_items oi
      JOIN public.seller_profiles sp ON sp.id = oi.seller_id AND sp.user_id = auth.uid()
      WHERE oi.order_id = order_status_history.order_id
    )
  );

-- ============================================================
-- 3. ORDER DISPUTES
-- ============================================================

CREATE TABLE IF NOT EXISTS public.order_disputes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  buyer_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  reason text NOT NULL,
  description text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'under_review', 'resolved', 'dismissed')),
  resolution text,
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_disputes_order_id ON public.order_disputes(order_id);
CREATE INDEX IF NOT EXISTS idx_order_disputes_buyer_id ON public.order_disputes(buyer_id);
CREATE INDEX IF NOT EXISTS idx_order_disputes_status ON public.order_disputes(status);

ALTER TABLE public.order_disputes ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON public.order_disputes TO authenticated;

DROP POLICY IF EXISTS "read_order_disputes" ON public.order_disputes;
CREATE POLICY "read_order_disputes"
  ON public.order_disputes FOR SELECT
  TO authenticated
  USING (
    buyer_id = auth.uid()
    OR public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.order_items oi
      JOIN public.seller_profiles sp ON sp.id = oi.seller_id AND sp.user_id = auth.uid()
      WHERE oi.order_id = order_disputes.order_id
    )
  );

DROP POLICY IF EXISTS "insert_own_dispute" ON public.order_disputes;
CREATE POLICY "insert_own_dispute"
  ON public.order_disputes FOR INSERT
  TO authenticated
  WITH CHECK (buyer_id = auth.uid());

-- ============================================================
-- 4. UPDATED_AT TRIGGER FOR ORDER DISPUTES
-- ============================================================

DROP TRIGGER IF EXISTS order_disputes_updated_at ON public.order_disputes;
CREATE TRIGGER order_disputes_updated_at
  BEFORE UPDATE ON public.order_disputes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ============================================================
-- 5. TRANSITION ORDER STATUS FUNCTION
-- ============================================================

CREATE OR REPLACE FUNCTION public.transition_order_status(
  p_order_id uuid,
  p_new_status text,
  p_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order record;
  v_old_status text;
  v_actor_id uuid := auth.uid();
  v_is_buyer boolean;
  v_is_seller boolean;
  v_is_admin boolean;
  v_actor_role text;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'You must be signed in.';
  END IF;

  -- Load the order
  SELECT * INTO v_order FROM orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found.';
  END IF;

  v_old_status := v_order.status;
  v_is_buyer := (v_order.buyer_id = v_actor_id);
  v_is_seller := EXISTS (
    SELECT 1 FROM order_items oi
    JOIN seller_profiles sp ON sp.id = oi.seller_id AND sp.user_id = v_actor_id
    WHERE oi.order_id = p_order_id
  );
  v_is_admin := public.is_admin();

  IF NOT (v_is_buyer OR v_is_seller OR v_is_admin) THEN
    RAISE EXCEPTION 'You are not authorized to update this order.';
  END IF;

  -- No-op if same status
  IF v_old_status = p_new_status THEN
    RETURN;
  END IF;

  -- Determine actor role
  IF v_is_admin THEN
    v_actor_role := 'admin';
  ELSIF v_is_seller THEN
    v_actor_role := 'seller';
  ELSE
    v_actor_role := 'buyer';
  END IF;

  -- Define allowed transitions per actor
  -- SELLER transitions: pending -> confirmed/rejected, confirmed -> processing, processing -> ready_for_pickup, ready_for_pickup -> shipped, shipped -> delivered
  IF v_actor_role = 'seller' THEN
    IF NOT (
      (v_old_status = 'pending' AND p_new_status IN ('confirmed', 'cancelled'))
      OR (v_old_status = 'confirmed' AND p_new_status IN ('processing', 'cancelled'))
      OR (v_old_status = 'processing' AND p_new_status IN ('ready_for_pickup', 'cancelled'))
      OR (v_old_status = 'ready_for_pickup' AND p_new_status IN ('shipped', 'cancelled'))
      OR (v_old_status = 'shipped' AND p_new_status = 'delivered')
      OR (v_old_status = 'delivered' AND p_new_status = 'completed')
    ) THEN
      RAISE EXCEPTION 'Sellers cannot transition an order from "%" to "%".', v_old_status, p_new_status;
    END IF;
  -- BUYER transitions: pending/confirmed -> cancelled, delivered -> completed, any active -> disputed
  ELSIF v_actor_role = 'buyer' THEN
    IF NOT (
      (v_old_status IN ('pending', 'confirmed', 'processing') AND p_new_status = 'cancelled')
      OR (v_old_status = 'delivered' AND p_new_status = 'completed')
      OR (v_old_status IN ('pending', 'confirmed', 'processing', 'ready_for_pickup', 'shipped', 'delivered') AND p_new_status = 'disputed')
    ) THEN
      RAISE EXCEPTION 'Buyers cannot transition an order from "%" to "%".', v_old_status, p_new_status;
    END IF;
  -- ADMIN can do any transition
  ELSE
    v_actor_role := 'admin';
  END IF;

  -- Update the order
  UPDATE orders SET status = p_new_status, updated_at = now() WHERE id = p_order_id;

  -- Record in history
  INSERT INTO order_status_history (order_id, old_status, new_status, changed_by, actor_role, reason)
  VALUES (p_order_id, v_old_status, p_new_status, v_actor_id, v_actor_role, p_reason);

  -- Update delivery status if applicable
  IF p_new_status = 'shipped' THEN
    UPDATE deliveries SET status = 'in_transit', updated_at = now() WHERE order_id = p_order_id;
  ELSIF p_new_status = 'delivered' THEN
    UPDATE deliveries SET status = 'delivered', delivered_at = now(), updated_at = now() WHERE order_id = p_order_id;
  ELSIF p_new_status = 'ready_for_pickup' THEN
    UPDATE deliveries SET status = 'picked_up', updated_at = now() WHERE order_id = p_order_id;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.transition_order_status(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transition_order_status(uuid, text, text) TO authenticated;

-- ============================================================
-- 6. REQUEST ORDER CANCELLATION FUNCTION
-- ============================================================

CREATE OR REPLACE FUNCTION public.request_order_cancellation(
  p_order_id uuid,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order record;
  v_buyer_id uuid := auth.uid();
BEGIN
  IF v_buyer_id IS NULL THEN
    RAISE EXCEPTION 'You must be signed in.';
  END IF;

  SELECT * INTO v_order FROM orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found.';
  END IF;

  IF v_order.buyer_id <> v_buyer_id THEN
    RAISE EXCEPTION 'You can only cancel your own orders.';
  END IF;

  IF v_order.status NOT IN ('pending', 'confirmed', 'processing') THEN
    RAISE EXCEPTION 'This order can no longer be cancelled.';
  END IF;

  -- Update order
  UPDATE orders
  SET status = 'cancelled', cancellation_reason = p_reason, cancelled_by = v_buyer_id, updated_at = now()
  WHERE id = p_order_id;

  -- Record in history
  INSERT INTO order_status_history (order_id, old_status, new_status, changed_by, actor_role, reason)
  VALUES (p_order_id, v_order.status, 'cancelled', v_buyer_id, 'buyer', p_reason);

  -- Restore stock
  UPDATE products p
  SET stock = stock + oi.quantity
  FROM order_items oi
  WHERE oi.product_id = p.id AND oi.order_id = p_order_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.request_order_cancellation(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_order_cancellation(uuid, text) TO authenticated;

-- ============================================================
-- 7. FILE ORDER DISPUTE FUNCTION
-- ============================================================

CREATE OR REPLACE FUNCTION public.file_order_dispute(
  p_order_id uuid,
  p_reason text,
  p_description text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order record;
  v_buyer_id uuid := auth.uid();
  v_dispute_id uuid;
BEGIN
  IF v_buyer_id IS NULL THEN
    RAISE EXCEPTION 'You must be signed in.';
  END IF;

  SELECT * INTO v_order FROM orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found.';
  END IF;

  IF v_order.buyer_id <> v_buyer_id THEN
    RAISE EXCEPTION 'You can only dispute your own orders.';
  END IF;

  -- Check no existing open dispute
  IF EXISTS (SELECT 1 FROM order_disputes WHERE order_id = p_order_id AND status IN ('open', 'under_review')) THEN
    RAISE EXCEPTION 'A dispute is already open for this order.';
  END IF;

  -- Create dispute
  INSERT INTO order_disputes (order_id, buyer_id, reason, description)
  VALUES (p_order_id, v_buyer_id, p_reason, p_description)
  RETURNING id INTO v_dispute_id;

  -- Mark order as disputed
  UPDATE orders SET status = 'disputed', updated_at = now() WHERE id = p_order_id;

  -- Record in history
  INSERT INTO order_status_history (order_id, old_status, new_status, changed_by, actor_role, reason)
  VALUES (p_order_id, v_order.status, 'disputed', v_buyer_id, 'buyer', p_reason);

  RETURN v_dispute_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.file_order_dispute(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.file_order_dispute(uuid, text, text) TO authenticated;

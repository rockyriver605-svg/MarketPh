/*
# Seller delivery tracking updates

1. Function
- `update_delivery_tracking(p_order_id, p_courier, p_tracking_number, p_estimated_delivery, p_notes)` lets the seller of an order (or an administrator) record the courier, tracking number, estimated delivery date, and notes on the order's delivery record.

2. Rules
- The caller must be signed in and be a seller on the order, or an administrator.
- Details can be edited only while the order is confirmed, processing, ready for pickup, shipped, or delivered. Cancelled, refunded, disputed, and completed orders are locked.
- Courier is limited to 60 characters, tracking number to 80, notes to 500.
- The order must already have a delivery record. Pickup-only orders without one get a clear error.

3. Security
- The deliveries table gets no new policies and no client write grant. Sellers still cannot write the table directly; they can only change these four fields through this function.
- The function is granted to signed-in users only (EXECUTE revoked from PUBLIC and anon).
*/

CREATE OR REPLACE FUNCTION public.update_delivery_tracking(
  p_order_id uuid,
  p_courier text,
  p_tracking_number text,
  p_estimated_delivery date,
  p_notes text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_status text;
  v_is_seller boolean;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'You must be signed in.';
  END IF;

  SELECT status INTO v_status FROM orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found.';
  END IF;

  v_is_seller := EXISTS (
    SELECT 1
    FROM order_items oi
    JOIN seller_profiles sp ON sp.id = oi.seller_id AND sp.user_id = v_actor_id
    WHERE oi.order_id = p_order_id
  );
  IF NOT (v_is_seller OR public.is_admin()) THEN
    RAISE EXCEPTION 'You are not authorized to update this order.';
  END IF;

  IF v_status NOT IN ('confirmed', 'processing', 'ready_for_pickup', 'shipped', 'delivered') THEN
    RAISE EXCEPTION 'Tracking details cannot be changed for a % order.', v_status;
  END IF;

  IF char_length(coalesce(p_courier, '')) > 60
    OR char_length(coalesce(p_tracking_number, '')) > 80
    OR char_length(coalesce(p_notes, '')) > 500 THEN
    RAISE EXCEPTION 'One of the tracking fields is too long.';
  END IF;

  UPDATE deliveries
  SET courier = nullif(btrim(coalesce(p_courier, '')), ''),
      tracking_number = nullif(btrim(coalesce(p_tracking_number, '')), ''),
      estimated_delivery = p_estimated_delivery,
      notes = nullif(btrim(coalesce(p_notes, '')), ''),
      updated_at = now()
  WHERE order_id = p_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'This order has no delivery record to update.';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.update_delivery_tracking(uuid, text, text, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_delivery_tracking(uuid, text, text, date, text) TO authenticated;

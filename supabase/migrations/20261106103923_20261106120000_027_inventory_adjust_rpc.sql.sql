/*
# Inventory stock adjustment RPC and low-stock notifications

## Purpose
Adds a secure, server-side stock adjustment function so sellers can add, remove,
or set stock for their own products and variants. Every adjustment writes an
append-only stock_movements row, updates the inventory row, and fires low-stock
and out-of-stock notifications to the seller. This closes the gap between the
existing inventory/stock_movements tables and a working seller inventory UI.

## Changes

### New function: public.adjust_stock(...)
SECURITY DEFINER, callable by authenticated only.
Arguments:
- p_product_id uuid  (required)
- p_variant_id  uuid  (nullable; when null, adjusts the product-level inventory row)
- p_delta       integer (signed; positive adds, negative removes)
- p_reason      text   (short description, optional)

Behaviour:
1. Resolves the seller via seller_profiles.user_id = auth.uid().
2. Verifies the product belongs to that seller.
3. Locks the inventory row (SELECT ... FOR UPDATE) to prevent concurrent oversell.
4. Computes the new quantity, rejecting negative results.
5. Updates inventory.quantity and inventory.updated_at.
6. Inserts a stock_movements row (append-only) with movement_type derived from delta sign and reason.
7. Fires a low-stock notification when the new quantity is at or below the threshold (and above 0), but only once per low episode — tracked via the notification "data" jsonb with a `low_alert_key`.
8. Fires an out-of-stock notification when the new quantity is 0, similarly deduplicated.
9. Returns the new quantity.

Idempotency / dedup: low/out-of-stock notifications are only inserted when no
unread notification with the same low_alert_key already exists for the seller.

### RLS / grants
- REVOKE EXECUTE on adjust_stock FROM PUBLIC, anon.
- GRANT EXECUTE on adjust_stock TO authenticated.
- No table grants changed (inventory/stock_movements already granted).

### No new tables, no columns changed.
Reuses existing inventory, stock_movements, seller_profiles, products, notifications tables.
*/

CREATE OR REPLACE FUNCTION public.adjust_stock(
  p_product_id uuid,
  p_variant_id uuid,
  p_delta integer,
  p_reason text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_seller_id uuid;
  v_new_qty integer;
  v_after_qty integer;
  v_threshold integer;
  v_movement_type text;
  v_low_key text;
  v_alert_exists boolean;
BEGIN
  -- Resolve the authenticated seller
  SELECT sp.id INTO v_seller_id
  FROM seller_profiles sp
  WHERE sp.user_id = auth.uid();
  IF v_seller_id IS NULL THEN
    RAISE EXCEPTION 'Only sellers can adjust inventory.';
  END IF;

  -- Verify product ownership
  IF NOT EXISTS (
    SELECT 1 FROM products p
    WHERE p.id = p_product_id AND p.seller_id = v_seller_id
  ) THEN
    RAISE EXCEPTION 'You do not own this product.';
  END IF;

  -- Derive movement type
  IF p_delta > 0 THEN
    v_movement_type := 'addition';
  ELSIF p_delta < 0 THEN
    v_movement_type := 'reduction';
  ELSE
    v_movement_type := 'correction';
  END IF;
  IF p_reason ILike '%restock%' THEN v_movement_type := 'addition'; END IF;
  IF p_reason ILike '%damage%' OR p_reason ILike '%damaged%' THEN v_movement_type := 'damaged'; END IF;
  IF p_reason ILike '%correction%' OR p_reason ILike '%adjust%' THEN v_movement_type := 'correction'; END IF;
  IF p_reason ILike '%return%' THEN v_movement_type := 'return'; END IF;
  IF p_reason ILike '%initial%' THEN v_movement_type := 'initial'; END IF;

  -- Lock and update the inventory row atomically
  SELECT i.quantity, i.low_stock_threshold INTO v_after_qty, v_threshold
  FROM inventory i
  WHERE i.product_id = p_product_id AND i.variant_id IS NOT DISTINCT FROM p_variant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inventory record not found for this product.';
  END IF;

  v_new_qty := v_after_qty + p_delta;
  IF v_new_qty < 0 THEN
    RAISE EXCEPTION 'Insufficient stock. Available: %, requested change: %.', v_after_qty, p_delta;
  END IF;

  UPDATE inventory
  SET quantity = v_new_qty, updated_at = now()
  WHERE product_id = p_product_id AND variant_id IS NOT DISTINCT FROM p_variant_id;

  -- Append-only movement record
  INSERT INTO stock_movements (seller_id, product_id, variant_id, movement_type, quantity_change, quantity_after, reason, reference_type, reference_id)
  VALUES (v_seller_id, p_product_id, p_variant_id, v_movement_type, p_delta, v_new_qty, p_reason, 'manual', auth.uid());

  -- Out-of-stock notification (deduplicated)
  IF v_new_qty = 0 THEN
    v_low_key := 'oos_' || p_product_id || COALESCE('_' || p_variant_id::text, '');
    SELECT EXISTS (
      SELECT 1 FROM notifications n
      WHERE n.user_id = auth.uid()
        AND n.is_read = false
        AND (n.data->>'low_alert_key') = v_low_key
    ) INTO v_alert_exists;
    IF NOT v_alert_exists THEN
      INSERT INTO notifications (user_id, type, title, body, link, data)
      SELECT
        auth.uid(),
        'inventory',
        'Out of stock',
        'A product has reached zero stock and is now unavailable.',
        '/seller/inventory',
        jsonb_build_object('low_alert_key', v_low_key, 'product_id', p_product_id, 'variant_id', p_variant_id)
      WHERE EXISTS (SELECT 1 FROM products p WHERE p.id = p_product_id);
    END IF;
  ELSIF v_new_qty <= v_threshold AND v_new_qty > 0 THEN
    -- Low-stock notification (deduplicated)
    v_low_key := 'low_' || p_product_id || COALESCE('_' || p_variant_id::text, '');
    SELECT EXISTS (
      SELECT 1 FROM notifications n
      WHERE n.user_id = auth.uid()
        AND n.is_read = false
        AND (n.data->>'low_alert_key') = v_low_key
    ) INTO v_alert_exists;
    IF NOT v_alert_exists THEN
      INSERT INTO notifications (user_id, type, title, body, link, data)
      SELECT
        auth.uid(),
        'inventory',
        'Low stock alert',
        'A product has reached the low-stock threshold (' || v_new_qty || ' remaining).',
        '/seller/inventory',
        jsonb_build_object('low_alert_key', v_low_key, 'product_id', p_product_id, 'variant_id', p_variant_id, 'remaining', v_new_qty)
      WHERE EXISTS (SELECT 1 FROM products p WHERE p.id = p_product_id);
    END IF;
  END IF;

  RETURN v_new_qty;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.adjust_stock(uuid, uuid, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.adjust_stock(uuid, uuid, integer, text) TO authenticated;

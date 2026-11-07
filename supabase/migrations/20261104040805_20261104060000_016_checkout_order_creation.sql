/*
# MariMarket — Secure Checkout: Atomic Multi-Seller Order Creation

## Summary
Adds a SECURITY DEFINER function `create_checkout_orders` that atomically creates
one order per seller from the buyer's selected cart items. The function re-validates
stock, product status, and seller status server-side, decrements inventory, copies
prices at purchase time, creates payment and delivery records, and removes purchased
items from the cart — all in a single transaction. This prevents duplicate orders,
incorrect totals, and inventory overselling.

## New Functions
1. `create_checkout_orders(p_cart_item_ids uuid[], p_delivery_type text, p_address jsonb, p_payment_method text, p_notes text)`
   - SECURITY DEFINER, scoped to `authenticated`.
   - Validates caller owns the cart items.
   - Groups items by seller.
   - For each seller group: creates an order (with order_number via trigger),
     order_items (copying product title, image, unit_price, subtotal),
     a payment record (status 'pending'), and a delivery record.
   - Re-validates: product must be published, stock >= quantity, seller active.
   - Atomically decrements product stock with a guarded UPDATE.
   - Deletes purchased cart items.
   - Returns a table of created order IDs and order numbers.

## Security
- SECURITY DEFINER so it can read/update products, insert into orders/order_items/
  payments/deliveries, and delete cart_items regardless of per-row RLS on those tables.
- REVOKE EXECUTE from PUBLIC and anon; GRANT EXECUTE to authenticated only.
- Function checks `auth.uid()` matches the cart owner for every supplied cart_item_id.
- All price/stock calculations happen server-side — the client never passes prices.

## Modified Tables
- No schema changes to existing tables. No columns added or removed.
*/

CREATE OR REPLACE FUNCTION public.create_checkout_orders(
  p_cart_item_ids uuid[],
  p_delivery_type text,
  p_address jsonb,
  p_payment_method text,
  p_notes text DEFAULT NULL
)
RETURNS TABLE (order_id uuid, order_number text, seller_id uuid, total numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_buyer_id uuid := auth.uid();
  v_cart_id uuid;
  v_seller_id uuid;
  v_order_id uuid;
  v_order_number text;
  v_subtotal numeric(12,2);
  v_shipping_fee numeric(12,2) := 0;
  v_total numeric(12,2);
  v_item record;
  v_primary_image text;
  v_unit_price numeric(12,2);
  v_item_subtotal numeric(12,2);
  v_delivery_address_text text;
  v_contact_name text;
  v_contact_phone text;
  v_muni_id uuid;
  v_brgy_id uuid;
  v_count int;
BEGIN
  -- Validate buyer
  IF v_buyer_id IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to checkout.';
  END IF;

  -- Validate delivery type
  IF p_delivery_type NOT IN ('delivery', 'pickup') THEN
    RAISE EXCEPTION 'Invalid delivery type.';
  END IF;

  -- Validate payment method
  IF p_payment_method NOT IN ('cod', 'gcash', 'bank_transfer', 'maya', 'card') THEN
    RAISE EXCEPTION 'Invalid payment method.';
  END IF;

  -- Validate address fields for delivery
  IF p_delivery_type = 'delivery' THEN
    IF p_address IS NULL
       OR (p_address->>'recipient_name') IS NULL
       OR (p_address->>'phone') IS NULL
       OR (p_address->>'street') IS NULL
       OR (p_address->>'municipality_id') IS NULL
       OR (p_address->>'barangay_id') IS NULL
    THEN
      RAISE EXCEPTION 'A complete delivery address is required.';
    END IF;
    v_contact_name := p_address->>'recipient_name';
    v_contact_phone := p_address->>'phone';
    v_muni_id := (p_address->>'municipality_id')::uuid;
    v_brgy_id := (p_address->>'barangay_id')::uuid;
    v_delivery_address_text := p_address->>'street';
  END IF;

  -- Get the buyer's cart
  SELECT id INTO v_cart_id FROM carts WHERE user_id = v_buyer_id LIMIT 1;
  IF v_cart_id IS NULL THEN
    RAISE EXCEPTION 'Your cart is empty.';
  END IF;

  -- Validate that all supplied cart item IDs belong to this buyer's cart
  SELECT count(*) INTO v_count
  FROM cart_items
  WHERE id = ANY(p_cart_item_ids) AND cart_id = v_cart_id;
  IF v_count IS NULL OR v_count <> array_length(p_cart_item_ids, 1) THEN
    RAISE EXCEPTION 'Some items could not be found in your cart.';
  END IF;

  -- Validate each cart item: product published, stock sufficient, seller active
  FOR v_item IN
    SELECT ci.id, ci.product_id, ci.variant_id, ci.quantity,
           p.seller_id, p.title, p.price, p.sale_price, p.stock,
           p.status, p.promotion_start_at, p.promotion_end_at,
           sp.is_active AS seller_active
    FROM cart_items ci
    JOIN products p ON p.id = ci.product_id
    JOIN seller_profiles sp ON sp.id = p.seller_id
    WHERE ci.id = ANY(p_cart_item_ids) AND ci.saved_for_later = false
  LOOP
    IF v_item.status <> 'published' THEN
      RAISE EXCEPTION 'Product "%" is no longer available.', v_item.title;
    END IF;
    IF NOT v_item.seller_active THEN
      RAISE EXCEPTION 'The seller for "%" is no longer active.', v_item.title;
    END IF;
    IF v_item.stock < v_item.quantity THEN
      RAISE EXCEPTION 'Not enough stock for "%" (available: %).', v_item.title, v_item.stock;
    END IF;
  END LOOP;

  -- Process each seller group
  FOR v_seller_id IN
    SELECT DISTINCT p.seller_id
    FROM cart_items ci
    JOIN products p ON p.id = ci.product_id
    WHERE ci.id = ANY(p_cart_item_ids) AND ci.saved_for_later = false
    ORDER BY p.seller_id
  LOOP
    -- Compute subtotal for this seller's items
    v_subtotal := 0;
    FOR v_item IN
      SELECT ci.id AS cart_item_id, ci.product_id, ci.variant_id, ci.quantity,
             p.title, p.price, p.sale_price, p.stock,
             p.promotion_start_at, p.promotion_end_at
      FROM cart_items ci
      JOIN products p ON p.id = ci.product_id
      WHERE ci.id = ANY(p_cart_item_ids) AND p.seller_id = v_seller_id AND ci.saved_for_later = false
    LOOP
      v_unit_price := COALESCE(v_item.sale_price, v_item.price);
      v_item_subtotal := v_unit_price * v_item.quantity;
      v_subtotal := v_subtotal + v_item_subtotal;
    END LOOP;

    -- Shipping fee: flat 50 PHP for delivery within Marinduque, 0 for pickup
    IF p_delivery_type = 'delivery' THEN
      v_shipping_fee := 50.00;
    ELSE
      v_shipping_fee := 0.00;
    END IF;

    v_total := v_subtotal + v_shipping_fee;

    -- Create the order
    INSERT INTO orders (buyer_id, status, subtotal, shipping_fee, total, notes,
      shipping_municipality_id, shipping_barangay_id, shipping_address,
      shipping_contact_name, shipping_contact_phone)
    VALUES (v_buyer_id, 'pending', v_subtotal, v_shipping_fee, v_total, p_notes,
      CASE WHEN p_delivery_type = 'delivery' THEN v_muni_id ELSE NULL END,
      CASE WHEN p_delivery_type = 'delivery' THEN v_brgy_id ELSE NULL END,
      CASE WHEN p_delivery_type = 'delivery' THEN v_delivery_address_text ELSE NULL END,
      CASE WHEN p_delivery_type = 'delivery' THEN v_contact_name ELSE NULL END,
      CASE WHEN p_delivery_type = 'delivery' THEN v_contact_phone ELSE NULL END)
    RETURNING id, order_number INTO v_order_id, v_order_number;

    -- Create order items and decrement stock
    FOR v_item IN
      SELECT ci.id AS cart_item_id, ci.product_id, ci.variant_id, ci.quantity,
             p.title, p.price, p.sale_price, p.stock,
             p.promotion_start_at, p.promotion_end_at
      FROM cart_items ci
      JOIN products p ON p.id = ci.product_id
      WHERE ci.id = ANY(p_cart_item_ids) AND p.seller_id = v_seller_id AND ci.saved_for_later = false
    LOOP
      -- Effective price (promotion sale_price if active, else sale_price fallback, else price)
      IF v_item.promotion_start_at IS NOT NULL
         AND v_item.promotion_end_at IS NOT NULL
         AND now() >= v_item.promotion_start_at
         AND now() <= v_item.promotion_end_at
         AND v_item.sale_price IS NOT NULL
      THEN
        v_unit_price := v_item.sale_price;
      ELSE
        v_unit_price := COALESCE(v_item.sale_price, v_item.price);
      END IF;
      v_item_subtotal := v_unit_price * v_item.quantity;

      -- Get primary image
      SELECT image_url INTO v_primary_image
      FROM product_images
      WHERE product_id = v_item.product_id AND is_primary = true
      LIMIT 1;
      IF v_primary_image IS NULL THEN
        SELECT image_url INTO v_primary_image
        FROM product_images
        WHERE product_id = v_item.product_id
        ORDER BY sort_order ASC
        LIMIT 1;
      END IF;

      -- Insert order item (price snapshot at purchase time)
      INSERT INTO order_items (order_id, product_id, variant_id, seller_id,
        product_title, product_image_url, unit_price, quantity, subtotal)
      VALUES (v_order_id, v_item.product_id, v_item.variant_id, v_seller_id,
        v_item.title, v_primary_image, v_unit_price, v_item.quantity, v_item_subtotal);

      -- Decrement stock atomically — guarded UPDATE prevents overselling
      UPDATE products SET stock = stock - v_item.quantity
      WHERE id = v_item.product_id AND stock >= v_item.quantity;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Stock changed during checkout for "%". Please try again.', v_item.title;
      END IF;
    END LOOP;

    -- Create payment record (pending — no payment is simulated)
    INSERT INTO payments (order_id, buyer_id, amount, method, status)
    VALUES (v_order_id, v_buyer_id, v_total, p_payment_method, 'pending');

    -- Create delivery record
    INSERT INTO deliveries (order_id, status, pickup_address, delivery_address, notes)
    VALUES (
      v_order_id,
      'pending',
      CASE WHEN p_delivery_type = 'pickup' THEN v_delivery_address_text ELSE NULL END,
      CASE WHEN p_delivery_type = 'delivery' THEN v_delivery_address_text ELSE NULL END,
      p_notes
    );

    -- Return this order in the result set
    order_id := v_order_id;
    order_number := v_order_number;
    seller_id := v_seller_id;
    total := v_total;
    RETURN NEXT;
  END LOOP;

  -- Remove purchased items from cart
  DELETE FROM cart_items WHERE id = ANY(p_cart_item_ids);
END;
$$;

-- Revoke public access, grant to authenticated only
REVOKE EXECUTE ON FUNCTION public.create_checkout_orders(uuid[], text, jsonb, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_checkout_orders(uuid[], text, jsonb, text, text) TO authenticated;

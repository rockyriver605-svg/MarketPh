/*
# POS sales: atomic server-side checkout and immutable sale records

## 1. Plain-English summary
Adds the secure path that records an in-store cash sale. The whole sale (transaction,
items, stock deduction, stock movements, and cash change) is written in one database
transaction, or not at all. Prices and discounts are recalculated on the server from
the product catalog, so the browser cannot set prices.

## 2. Modified tables
- pos_transactions: adds client_reference (duplicate-submission key), transaction
  discount type/value, and a snapshot of the store name, phone, and email at sale time.
- pos_transaction_items: adds variation id/label, item discount type/value/amount.

## 3. New functions
- pos_discount_amount(base, type, value): validates and computes a discount; never exceeds the base.
- pos_sale_payload(transaction id): builds the receipt data for one sale.
- create_pos_sale(items, discount, amount received, customer, client reference, notes):
  the only way to create a sale. Runs as SECURITY DEFINER and derives the seller
  from the signed-in user.

## 4. Security changes
- Sales can no longer be inserted, updated, or deleted directly from the browser.
  Completed sales are immutable; only create_pos_sale writes them.
- The anon role loses all privileges on POS tables and store customers.
- New functions are executable by signed-in users only (create_pos_sale) and are
  hidden from anon and PUBLIC.

## 5. Important notes
1. Only cash payments are accepted by create_pos_sale in this version.
2. Stock is decremented on products.stock (matching marketplace checkout) and on
   the chosen variation's stock when a variation is sold.
3. A repeated submission with the same client_reference returns the original sale
   instead of creating a second one.
4. No existing rows are modified or deleted.
*/

ALTER TABLE public.pos_transactions
  ADD COLUMN IF NOT EXISTS client_reference text,
  ADD COLUMN IF NOT EXISTS discount_type text CHECK (discount_type IN ('percent', 'fixed')),
  ADD COLUMN IF NOT EXISTS discount_value numeric(12,2) CHECK (discount_value >= 0),
  ADD COLUMN IF NOT EXISTS store_name text,
  ADD COLUMN IF NOT EXISTS store_phone text,
  ADD COLUMN IF NOT EXISTS store_email text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_transactions_seller_client_reference
  ON public.pos_transactions(seller_id, client_reference)
  WHERE client_reference IS NOT NULL;

ALTER TABLE public.pos_transaction_items
  ADD COLUMN IF NOT EXISTS product_variant_id uuid REFERENCES public.product_variants(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS variant_label text,
  ADD COLUMN IF NOT EXISTS discount_type text CHECK (discount_type IN ('percent', 'fixed')),
  ADD COLUMN IF NOT EXISTS discount_value numeric(12,2) CHECK (discount_value >= 0),
  ADD COLUMN IF NOT EXISTS discount_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0);

CREATE OR REPLACE FUNCTION public.pos_discount_amount(p_base numeric, p_type text, p_value numeric)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
  IF p_type = 'percent' THEN
    IF p_value IS NULL OR p_value <= 0 OR p_value > 100 THEN
      RAISE EXCEPTION 'A percentage discount must be above 0 and at most 100.';
    END IF;
    RETURN round(p_base * p_value / 100, 2);
  ELSIF p_type = 'fixed' THEN
    IF p_value IS NULL OR p_value <= 0 OR p_value > p_base THEN
      RAISE EXCEPTION 'A fixed discount cannot be more than the amount it applies to.';
    END IF;
    RETURN round(p_value, 2);
  END IF;
  RAISE EXCEPTION 'Unknown discount type.';
END;
$$;

REVOKE ALL ON FUNCTION public.pos_discount_amount(numeric, text, numeric) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.pos_sale_payload(p_transaction_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'id', t.id,
    'transaction_number', t.transaction_number,
    'created_at', t.created_at,
    'subtotal', t.subtotal,
    'discount_amount', t.discount_amount,
    'discount_type', t.discount_type,
    'discount_value', t.discount_value,
    'total_amount', t.total_amount,
    'amount_paid', t.amount_paid,
    'change_due', t.change_due,
    'payment_method', t.payment_method,
    'store', jsonb_build_object('name', t.store_name, 'phone', t.store_phone, 'email', t.store_email),
    'items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'product_title', i.product_title,
        'variant_label', i.variant_label,
        'quantity', i.quantity,
        'unit_price', i.unit_price,
        'subtotal', i.subtotal,
        'discount_type', i.discount_type,
        'discount_value', i.discount_value,
        'discount_amount', i.discount_amount
      ) ORDER BY i.created_at, i.id)
      FROM public.pos_transaction_items i
      WHERE i.pos_transaction_id = t.id
    ), '[]'::jsonb)
  )
  FROM public.pos_transactions t
  WHERE t.id = p_transaction_id;
$$;

REVOKE ALL ON FUNCTION public.pos_sale_payload(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.create_pos_sale(
  p_items jsonb,
  p_discount jsonb,
  p_amount_received numeric,
  p_customer_id uuid,
  p_client_reference text,
  p_notes text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_seller_id uuid;
  v_store_name text;
  v_store_phone text;
  v_store_email text;
  v_existing_id uuid;
  v_item jsonb;
  v_line jsonb;
  v_lines jsonb := '[]'::jsonb;
  v_qty int;
  v_p_id uuid;
  v_p_title text;
  v_p_price numeric;
  v_p_sale numeric;
  v_p_stock int;
  v_p_status text;
  v_p_seller uuid;
  v_v_name text;
  v_v_value text;
  v_v_override numeric;
  v_v_stock int;
  v_variant_id uuid;
  v_variant_label text;
  v_unit numeric;
  v_sub numeric;
  v_disc numeric;
  v_disc_type text;
  v_disc_value numeric;
  v_gross numeric := 0;
  v_item_disc numeric := 0;
  v_base numeric;
  v_tx_disc numeric := 0;
  v_tx_disc_type text;
  v_tx_disc_value numeric;
  v_total numeric;
  v_received numeric;
  v_change numeric;
  v_txn_id uuid;
  v_number text;
  v_affected int;
  v_new_stock int;
BEGIN
  SELECT id, shop_name, contact_phone, contact_email
    INTO v_seller_id, v_store_name, v_store_phone, v_store_email
  FROM public.seller_profiles
  WHERE user_id = auth.uid() AND is_active = true;

  IF v_seller_id IS NULL THEN
    RAISE EXCEPTION 'Your seller account is not active or was not found.';
  END IF;

  IF p_client_reference IS NULL OR char_length(p_client_reference) NOT BETWEEN 8 AND 100 THEN
    RAISE EXCEPTION 'Invalid sale reference.';
  END IF;

  SELECT id INTO v_existing_id
  FROM public.pos_transactions
  WHERE seller_id = v_seller_id AND client_reference = p_client_reference;

  IF v_existing_id IS NOT NULL THEN
    RETURN public.pos_sale_payload(v_existing_id);
  END IF;

  IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' OR jsonb_array_length(p_items) NOT BETWEEN 1 AND 50 THEN
    RAISE EXCEPTION 'Add at least one item and no more than 50 items.';
  END IF;

  IF p_customer_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.store_customers WHERE id = p_customer_id AND seller_id = v_seller_id
  ) THEN
    RAISE EXCEPTION 'The selected customer was not found in your store.';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    IF COALESCE(v_item->>'quantity', '') !~ '^[0-9]{1,4}$' OR (v_item->>'quantity')::int < 1 THEN
      RAISE EXCEPTION 'Quantities must be whole numbers from 1 to 9999.';
    END IF;
    v_qty := (v_item->>'quantity')::int;

    SELECT id, title, price, sale_price, stock, status, seller_id
      INTO v_p_id, v_p_title, v_p_price, v_p_sale, v_p_stock, v_p_status, v_p_seller
    FROM public.products
    WHERE id = (v_item->>'product_id')::uuid
    FOR UPDATE;

    IF NOT FOUND OR v_p_seller <> v_seller_id OR v_p_status <> 'published' THEN
      RAISE EXCEPTION 'A product in the sale is not available for sale.';
    END IF;

    IF v_item->>'variant_id' IS NOT NULL THEN
      SELECT name, value, price_override, stock
        INTO v_v_name, v_v_value, v_v_override, v_v_stock
      FROM public.product_variants
      WHERE id = (v_item->>'variant_id')::uuid AND product_id = v_p_id
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'The selected variation of "%" was not found.', v_p_title;
      END IF;

      v_variant_id := (v_item->>'variant_id')::uuid;
      v_variant_label := v_v_name || ': ' || v_v_value;
      v_unit := COALESCE(v_v_override, v_p_sale, v_p_price);

      IF v_v_stock < v_qty THEN
        RAISE EXCEPTION 'Not enough stock for "% (%)" (available: %).', v_p_title, v_variant_label, v_v_stock;
      END IF;
    ELSE
      IF EXISTS (SELECT 1 FROM public.product_variants WHERE product_id = v_p_id) THEN
        RAISE EXCEPTION 'Select a variation for "%".', v_p_title;
      END IF;
      v_variant_id := NULL;
      v_variant_label := NULL;
      v_unit := COALESCE(v_p_sale, v_p_price);
    END IF;

    IF v_p_stock < v_qty THEN
      RAISE EXCEPTION 'Not enough stock for "%" (available: %).', v_p_title, v_p_stock;
    END IF;

    v_sub := round(v_unit * v_qty, 2);
    v_disc_type := v_item->'discount'->>'type';
    v_disc_value := (v_item->'discount'->>'value')::numeric;
    v_disc := CASE WHEN v_disc_type IS NULL THEN 0 ELSE public.pos_discount_amount(v_sub, v_disc_type, v_disc_value) END;

    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'product_id', v_p_id,
      'variant_id', v_variant_id,
      'title', v_p_title,
      'variant_label', v_variant_label,
      'unit', v_unit,
      'quantity', v_qty,
      'subtotal', v_sub,
      'discount_type', v_disc_type,
      'discount_value', v_disc_value,
      'discount_amount', v_disc
    ));

    v_gross := v_gross + v_sub;
    v_item_disc := v_item_disc + v_disc;
  END LOOP;

  v_base := v_gross - v_item_disc;

  IF jsonb_typeof(p_discount) = 'object' THEN
    v_tx_disc_type := p_discount->>'type';
    v_tx_disc_value := (p_discount->>'value')::numeric;
    v_tx_disc := public.pos_discount_amount(v_base, v_tx_disc_type, v_tx_disc_value);
  END IF;

  v_total := v_base - v_tx_disc;
  IF v_total <= 0 THEN
    RAISE EXCEPTION 'The total must be greater than zero.';
  END IF;

  v_received := round(COALESCE(p_amount_received, -1), 2);
  IF v_received < v_total THEN
    RAISE EXCEPTION 'The cash received is less than the total due.';
  END IF;
  v_change := v_received - v_total;

  v_number := 'POS-' || to_char(now() AT TIME ZONE 'Asia/Manila', 'YYMMDD') || '-'
    || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

  INSERT INTO public.pos_transactions (
    seller_id, transaction_number, subtotal, discount_amount, discount_type, discount_value,
    total_amount, amount_paid, change_due, payment_method, status, customer_id, notes,
    client_reference, store_name, store_phone, store_email
  ) VALUES (
    v_seller_id, v_number, v_gross, v_item_disc + v_tx_disc, v_tx_disc_type, v_tx_disc_value,
    v_total, v_received, v_change, 'cash', 'completed', p_customer_id,
    NULLIF(left(trim(COALESCE(p_notes, '')), 500), ''),
    p_client_reference, v_store_name, v_store_phone, v_store_email
  )
  RETURNING id INTO v_txn_id;

  FOR v_line IN SELECT value FROM jsonb_array_elements(v_lines) LOOP
    INSERT INTO public.pos_transaction_items (
      pos_transaction_id, product_id, product_variant_id, product_title, variant_label,
      unit_price, quantity, subtotal, discount_type, discount_value, discount_amount, created_at
    ) VALUES (
      v_txn_id,
      (v_line->>'product_id')::uuid,
      (v_line->>'variant_id')::uuid,
      v_line->>'title',
      v_line->>'variant_label',
      (v_line->>'unit')::numeric,
      (v_line->>'quantity')::int,
      (v_line->>'subtotal')::numeric,
      v_line->>'discount_type',
      (v_line->>'discount_value')::numeric,
      (v_line->>'discount_amount')::numeric,
      clock_timestamp()
    );

    UPDATE public.products
      SET stock = stock - (v_line->>'quantity')::int
    WHERE id = (v_line->>'product_id')::uuid AND stock >= (v_line->>'quantity')::int;
    GET DIAGNOSTICS v_affected = ROW_COUNT;
    IF v_affected = 0 THEN
      RAISE EXCEPTION 'Stock changed while recording the sale. Please review the cart and try again.';
    END IF;

    SELECT stock INTO v_new_stock FROM public.products WHERE id = (v_line->>'product_id')::uuid;

    IF v_line->>'variant_id' IS NOT NULL THEN
      UPDATE public.product_variants
        SET stock = stock - (v_line->>'quantity')::int
      WHERE id = (v_line->>'variant_id')::uuid AND stock >= (v_line->>'quantity')::int;
      GET DIAGNOSTICS v_affected = ROW_COUNT;
      IF v_affected = 0 THEN
        RAISE EXCEPTION 'Stock changed while recording the sale. Please review the cart and try again.';
      END IF;
    END IF;

    INSERT INTO public.stock_movements (
      seller_id, product_id, variant_id, movement_type, quantity_change, quantity_after,
      reason, reference_type, reference_id
    ) VALUES (
      v_seller_id,
      (v_line->>'product_id')::uuid,
      (v_line->>'variant_id')::uuid,
      'sale',
      -((v_line->>'quantity')::int),
      v_new_stock,
      'POS sale',
      'pos_transaction',
      v_txn_id
    );
  END LOOP;

  RETURN public.pos_sale_payload(v_txn_id);
END;
$$;

REVOKE ALL ON FUNCTION public.create_pos_sale(jsonb, jsonb, numeric, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_pos_sale(jsonb, jsonb, numeric, uuid, text, text) TO authenticated;

REVOKE ALL ON public.pos_transactions, public.pos_transaction_items, public.stock_movements, public.store_customers FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.pos_transactions, public.pos_transaction_items FROM authenticated;
REVOKE INSERT ON public.stock_movements FROM authenticated;

DROP POLICY IF EXISTS "insert_own_pos_transactions" ON public.pos_transactions;
DROP POLICY IF EXISTS "update_own_pos_transactions" ON public.pos_transactions;
DROP POLICY IF EXISTS "delete_own_pos_transactions" ON public.pos_transactions;
DROP POLICY IF EXISTS "insert_own_pos_transaction_items" ON public.pos_transaction_items;
DROP POLICY IF EXISTS "update_own_pos_transaction_items" ON public.pos_transaction_items;
DROP POLICY IF EXISTS "delete_own_pos_transaction_items" ON public.pos_transaction_items;
DROP POLICY IF EXISTS "insert_own_stock_movements" ON public.stock_movements;

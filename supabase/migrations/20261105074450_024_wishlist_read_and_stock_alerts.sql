/*
# Wishlist read function and product change alerts

1. New Functions
- `get_my_wishlist()` returns the signed-in buyer's saved products with their current availability fields (status, stock, seller active state, price, image, location). It runs with definer rights but only ever returns rows where the saved product belongs to `auth.uid()`, so unpublished saved items (paused, sold out, archived) stay visible to the buyer instead of silently disappearing under the products read policy.
- `push_wishlist_alert(product, title, event, price, body)` writes one in-app notification per buyer who saved the product, skipping buyers who turned wishlist alerts off and skipping duplicates from the last day.
- `notify_wishlist_product_changes()` is the trigger function that maps product changes to alert events.

2. Triggers on products
- After an update to status, stock, price, or sale price: emits `price_drop`, `back_in_stock`, `out_of_stock`, or `unavailable`.
- Before a delete: emits `removed` (saved rows cascade after this runs, so the buyers are still known).

3. Preferences
- Buyers can opt out by setting `profiles.preferences.wishlist_alerts` to `false`. A missing key means alerts are on.

4. Security
- `get_my_wishlist()` is granted to `authenticated` only.
- The alert helper and trigger function are not callable by any client role.
- No table grants or policies change.

## Notes
- Duplicate guard: an alert with the same event, product, and price is not written again to the same buyer within 24 hours.
- Variant-level stock is not included in these alerts; only product-level stock is watched.
*/

CREATE OR REPLACE FUNCTION public.get_my_wishlist()
RETURNS TABLE (
  favorite_id uuid,
  saved_at timestamptz,
  product_id uuid,
  title text,
  condition text,
  status text,
  price numeric,
  sale_price numeric,
  stock integer,
  max_order_quantity integer,
  has_variants boolean,
  category_id uuid,
  category_name text,
  municipality_id uuid,
  municipality_name text,
  barangay_name text,
  shop_name text,
  seller_active boolean,
  image_url text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    f.id,
    f.created_at,
    p.id,
    p.title::text,
    p.condition::text,
    p.status::text,
    p.price::numeric,
    p.sale_price::numeric,
    p.stock::integer,
    p.max_order_quantity::integer,
    EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id),
    p.category_id,
    c.name::text,
    p.municipality_id,
    m.name::text,
    b.name::text,
    sp.shop_name::text,
    coalesce(sp.is_active, false),
    img.image_url::text
  FROM favorites f
  JOIN products p ON p.id = f.product_id
  JOIN seller_profiles sp ON sp.id = p.seller_id
  LEFT JOIN categories c ON c.id = p.category_id
  LEFT JOIN municipalities m ON m.id = p.municipality_id
  LEFT JOIN barangays b ON b.id = p.barangay_id
  LEFT JOIN LATERAL (
    SELECT pi.image_url
    FROM product_images pi
    WHERE pi.product_id = p.id
    ORDER BY pi.is_primary DESC, pi.sort_order ASC
    LIMIT 1
  ) img ON true
  WHERE f.user_id = auth.uid()
  ORDER BY f.created_at DESC;
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_wishlist() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_wishlist() TO authenticated;

CREATE OR REPLACE FUNCTION public.push_wishlist_alert(
  p_product_id uuid,
  p_title text,
  p_event text,
  p_price numeric,
  p_body text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dedupe text := p_event || ':' || p_product_id::text || ':' || coalesce(p_price::text, '');
BEGIN
  INSERT INTO notifications (user_id, type, title, body, link, data)
  SELECT
    f.user_id,
    'product',
    p_title,
    p_body,
    CASE WHEN p_event = 'removed' THEN '/favorites' ELSE '/product/' || p_product_id::text END,
    jsonb_build_object('event', p_event, 'product_id', p_product_id, 'price', p_price, 'dedupe_key', v_dedupe)
  FROM favorites f
  LEFT JOIN profiles pr ON pr.id = f.user_id
  WHERE f.product_id = p_product_id
    AND coalesce(pr.preferences->>'wishlist_alerts', 'true') <> 'false'
    AND NOT EXISTS (
      SELECT 1
      FROM notifications n
      WHERE n.user_id = f.user_id
        AND n.data->>'dedupe_key' = v_dedupe
        AND n.created_at > now() - interval '1 day'
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.push_wishlist_alert(uuid, text, text, numeric, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.notify_wishlist_product_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.push_wishlist_alert(
      OLD.id, OLD.title, 'removed', NULL,
      'A saved item was removed from MariMarket.'
    );
    RETURN OLD;
  END IF;

  IF OLD.status = 'published' AND NEW.status IS DISTINCT FROM 'published' THEN
    PERFORM public.push_wishlist_alert(
      NEW.id, NEW.title, 'unavailable', NULL,
      'A saved item is no longer listed (' || NEW.status || ').'
    );
  END IF;

  IF NEW.status = 'published' AND OLD.stock > 0 AND NEW.stock = 0 THEN
    PERFORM public.push_wishlist_alert(
      NEW.id, NEW.title, 'out_of_stock', NULL,
      'A saved item is now out of stock.'
    );
  END IF;

  IF NEW.status = 'published' AND OLD.stock = 0 AND NEW.stock > 0 THEN
    PERFORM public.push_wishlist_alert(
      NEW.id, NEW.title, 'back_in_stock', NULL,
      'A saved item is back in stock.'
    );
  END IF;

  IF NEW.status = 'published'
    AND coalesce(NEW.sale_price, NEW.price) < coalesce(OLD.sale_price, OLD.price) THEN
    PERFORM public.push_wishlist_alert(
      NEW.id, NEW.title, 'price_drop', coalesce(NEW.sale_price, NEW.price),
      'A saved item dropped to ' || coalesce(NEW.sale_price, NEW.price)::text || ' PHP.'
    );
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.notify_wishlist_product_changes() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_wishlist_product_update ON public.products;
CREATE TRIGGER trg_wishlist_product_update
AFTER UPDATE ON public.products
FOR EACH ROW
WHEN (
  OLD.status IS DISTINCT FROM NEW.status
  OR OLD.stock IS DISTINCT FROM NEW.stock
  OR OLD.price IS DISTINCT FROM NEW.price
  OR OLD.sale_price IS DISTINCT FROM NEW.sale_price
)
EXECUTE FUNCTION public.notify_wishlist_product_changes();

DROP TRIGGER IF EXISTS trg_wishlist_product_delete ON public.products;
CREATE TRIGGER trg_wishlist_product_delete
BEFORE DELETE ON public.products
FOR EACH ROW
EXECUTE FUNCTION public.notify_wishlist_product_changes();

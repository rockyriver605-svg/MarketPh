/*
# Wishlist collections and secure sharing

1. Changes
- Reuses the existing favorites table as the saved-product list (one row per buyer and product, already unique).
- New table `wishlist_collections`: named groups owned by one buyer, with an optional default collection and an optional share token.
- New table `wishlist_collection_items`: links a saved product (favorites row) to one or more collections.
- New function `set_wishlist_collection_sharing` turns sharing on or off and generates the share token server-side.
- New function `get_shared_wishlist` returns a read-only view of a shared collection by token.

2. Security
- RLS enabled on both new tables with owner-only policies (select, insert, update, delete).
- Buyers may only link their own favorites to their own collections.
- Share tokens cannot be written directly by clients; the column is not granted for update.
- Shared view exposes only product title, image, price, condition, status, store name, and date saved. No addresses, phone numbers, or buyer identity.
- Shared view excludes products that are draft, pending review, rejected, or archived.
- The anon role loses its previously granted (unused, policy-less) privileges on favorites.

3. Notes
- A partial unique index allows at most one default collection per buyer.
- Collection names are unique per buyer, case-insensitive, so repeated create requests cannot duplicate a collection.
*/

REVOKE ALL ON favorites FROM anon;

CREATE TABLE IF NOT EXISTS wishlist_collections (
id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 60),
is_default boolean NOT NULL DEFAULT false,
share_token text UNIQUE,
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS wishlist_collections_user_name_key ON wishlist_collections (user_id, lower(btrim(name)));
CREATE UNIQUE INDEX IF NOT EXISTS wishlist_collections_one_default ON wishlist_collections (user_id) WHERE is_default;

CREATE TABLE IF NOT EXISTS wishlist_collection_items (
id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
collection_id uuid NOT NULL REFERENCES wishlist_collections(id) ON DELETE CASCADE,
favorite_id uuid NOT NULL REFERENCES favorites(id) ON DELETE CASCADE,
created_at timestamptz NOT NULL DEFAULT now(),
CONSTRAINT wishlist_collection_items_unique UNIQUE (collection_id, favorite_id)
);

CREATE INDEX IF NOT EXISTS wishlist_collection_items_favorite_idx ON wishlist_collection_items (favorite_id);

ALTER TABLE wishlist_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE wishlist_collection_items ENABLE ROW LEVEL SECURITY;

GRANT SELECT, DELETE ON wishlist_collections TO authenticated;
GRANT INSERT (name, is_default) ON wishlist_collections TO authenticated;
GRANT UPDATE (name, is_default, updated_at) ON wishlist_collections TO authenticated;
GRANT SELECT, INSERT, DELETE ON wishlist_collection_items TO authenticated;

DROP POLICY IF EXISTS "select_own_wishlist_collections" ON wishlist_collections;
CREATE POLICY "select_own_wishlist_collections" ON wishlist_collections FOR SELECT
TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_wishlist_collections" ON wishlist_collections;
CREATE POLICY "insert_own_wishlist_collections" ON wishlist_collections FOR INSERT
TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_wishlist_collections" ON wishlist_collections;
CREATE POLICY "update_own_wishlist_collections" ON wishlist_collections FOR UPDATE
TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_wishlist_collections" ON wishlist_collections;
CREATE POLICY "delete_own_wishlist_collections" ON wishlist_collections FOR DELETE
TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "select_own_wishlist_collection_items" ON wishlist_collection_items;
CREATE POLICY "select_own_wishlist_collection_items" ON wishlist_collection_items FOR SELECT
TO authenticated USING (
EXISTS (SELECT 1 FROM wishlist_collections c WHERE c.id = wishlist_collection_items.collection_id AND c.user_id = auth.uid())
);

DROP POLICY IF EXISTS "insert_own_wishlist_collection_items" ON wishlist_collection_items;
CREATE POLICY "insert_own_wishlist_collection_items" ON wishlist_collection_items FOR INSERT
TO authenticated WITH CHECK (
EXISTS (SELECT 1 FROM wishlist_collections c WHERE c.id = wishlist_collection_items.collection_id AND c.user_id = auth.uid())
AND EXISTS (SELECT 1 FROM favorites f WHERE f.id = wishlist_collection_items.favorite_id AND f.user_id = auth.uid())
);

DROP POLICY IF EXISTS "delete_own_wishlist_collection_items" ON wishlist_collection_items;
CREATE POLICY "delete_own_wishlist_collection_items" ON wishlist_collection_items FOR DELETE
TO authenticated USING (
EXISTS (SELECT 1 FROM wishlist_collections c WHERE c.id = wishlist_collection_items.collection_id AND c.user_id = auth.uid())
);

CREATE OR REPLACE FUNCTION set_wishlist_collection_sharing(p_collection_id uuid, p_enabled boolean)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
v_token text;
BEGIN
IF auth.uid() IS NULL THEN
RAISE EXCEPTION 'Sign in required' USING ERRCODE = '42501';
END IF;

IF p_enabled THEN
UPDATE wishlist_collections
SET share_token = COALESCE(share_token, replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')),
updated_at = now()
WHERE id = p_collection_id AND user_id = auth.uid()
RETURNING share_token INTO v_token;
ELSE
UPDATE wishlist_collections
SET share_token = NULL, updated_at = now()
WHERE id = p_collection_id AND user_id = auth.uid()
RETURNING share_token INTO v_token;
END IF;

IF NOT FOUND THEN
RAISE EXCEPTION 'Collection not found' USING ERRCODE = 'P0002';
END IF;

RETURN v_token;
END;
$function$;

REVOKE EXECUTE ON FUNCTION set_wishlist_collection_sharing(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION set_wishlist_collection_sharing(uuid, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION get_shared_wishlist(p_token text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
SELECT jsonb_build_object(
'name', c.name,
'items', COALESCE((
SELECT jsonb_agg(
jsonb_build_object(
'product_id', p.id,
'title', p.title,
'slug', p.slug,
'condition', p.condition,
'status', p.status,
'price', p.price,
'sale_price', p.sale_price,
'image_url', (
SELECT pi.image_url FROM product_images pi
WHERE pi.product_id = p.id
ORDER BY pi.is_primary DESC, pi.sort_order ASC
LIMIT 1
),
'shop_name', sp.shop_name,
'added_at', ci.created_at
)
ORDER BY ci.created_at DESC
)
FROM wishlist_collection_items ci
JOIN favorites f ON f.id = ci.favorite_id
JOIN products p ON p.id = f.product_id
JOIN seller_profiles sp ON sp.id = p.seller_id
WHERE ci.collection_id = c.id
AND p.status IN ('published', 'paused', 'sold_out')
), '[]'::jsonb)
)
FROM wishlist_collections c
WHERE p_token IS NOT NULL AND c.share_token = p_token;
$function$;

REVOKE EXECUTE ON FUNCTION get_shared_wishlist(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_shared_wishlist(text) TO anon, authenticated;

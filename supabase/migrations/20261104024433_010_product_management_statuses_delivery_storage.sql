/*
# Product listing management: expanded statuses, delivery/pickup, image storage, moderation

## Plain-English summary
Extends the products table to support the full listing lifecycle (pending review, rejected,
paused), delivery and pickup options, and a secure storage bucket for product images. Adds
a server-side moderation function so moderators/admins can reject or pause listings. Sellers
can only upload images to their own folder and only manage images for their own products.

## Columns added to products
- delivery_options (text[]): delivery methods the seller supports.
- pickup_enabled (boolean, default true): whether the seller allows in-person pickup.
- moderation_note (text, nullable): reason left by a moderator when a listing is rejected.

## Status constraint change
Adds pending_review, rejected, and paused to the allowed status values.

## Storage bucket
- `product-images`: public-read bucket. INSERT/UPDATE/DELETE scoped to the seller's own
  folder path `seller-<uuid>/...`. Sellers can only write to their own folder. Admins
  can delete any image.

## New SECURITY DEFINER function
- `moderate_product`: lets moderators and admins approve, reject, or pause a listing.

## Important notes
- RLS on products already enforces ownership; this migration does not weaken those policies.
- No data is deleted or rewritten.
*/

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS delivery_options text[] DEFAULT ARRAY[]::text[],
  ADD COLUMN IF NOT EXISTS pickup_enabled boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS moderation_note text;

ALTER TABLE products DROP CONSTRAINT IF EXISTS products_status_check;

ALTER TABLE products
  ADD CONSTRAINT products_status_check
  CHECK (status IN ('draft','pending_review','published','rejected','paused','sold_out','archived'));

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('product-images', 'product-images', true, 5242880)
ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = 5242880;

DROP POLICY IF EXISTS "read_product_images_storage" ON storage.objects;
CREATE POLICY "read_product_images_storage" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'product-images');

DROP POLICY IF EXISTS "insert_own_product_images_storage" ON storage.objects;
CREATE POLICY "insert_own_product_images_storage" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'product-images'
    AND (storage.foldername(name))[1] = 'seller-' || auth.uid()::text
  );

DROP POLICY IF EXISTS "update_own_product_images_storage" ON storage.objects;
CREATE POLICY "update_own_product_images_storage" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'product-images'
    AND (storage.foldername(name))[1] = 'seller-' || auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'product-images'
    AND (storage.foldername(name))[1] = 'seller-' || auth.uid()::text
  );

DROP POLICY IF EXISTS "delete_own_product_images_storage" ON storage.objects;
CREATE POLICY "delete_own_product_images_storage" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'product-images'
    AND (
      (storage.foldername(name))[1] = 'seller-' || auth.uid()::text
      OR is_admin()
    )
  );

CREATE OR REPLACE FUNCTION public.moderate_product(p_product_id uuid, p_action text, p_note text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller_is_mod boolean;
  v_current_status text;
BEGIN
  IF p_action NOT IN ('approve','reject','pause') THEN
    RAISE EXCEPTION 'Invalid moderation action. Use approve, reject, or pause.';
  END IF;

  SELECT is_moderator() INTO v_caller_is_mod;
  IF NOT v_caller_is_mod THEN
    RAISE EXCEPTION 'Only moderators and administrators can moderate listings.';
  END IF;

  SELECT status INTO v_current_status FROM public.products WHERE id = p_product_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product not found.';
  END IF;

  IF p_action = 'approve' THEN
    UPDATE public.products
      SET status = 'published', moderation_note = NULL, updated_at = now()
      WHERE id = p_product_id;
  ELSIF p_action = 'reject' THEN
    UPDATE public.products
      SET status = 'rejected', moderation_note = p_note, updated_at = now()
      WHERE id = p_product_id;
  ELSIF p_action = 'pause' THEN
    UPDATE public.products
      SET status = 'paused', moderation_note = p_note, updated_at = now()
      WHERE id = p_product_id;
  END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.moderate_product(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.moderate_product(uuid, text, text) TO authenticated;

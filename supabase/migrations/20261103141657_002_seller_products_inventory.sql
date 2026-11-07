/*
# MariMarket — Seller Profiles, Categories, Products & Inventory

## Summary
Creates the product catalog infrastructure: seller storefronts, seller verifications,
product categories, products, product images, product variants, and inventory tracking.

## New Tables
1. **seller_profiles** — storefront data for sellers (shop name, description, logo, location, verification status).
2. **seller_verifications** — verification records for sellers (ID, business permit, status).
3. **categories** — product categories (name, slug, parent category for hierarchy).
4. **products** — product listings (title, description, price, category, seller, status, condition).
5. **product_images** — images for each product (ordered, with a primary flag).
6. **product_variants** — size/color/style variants for a product.
7. **inventory** — stock tracking per product or product variant.

## Security
- RLS on all tables.
- Public can read published products, approved categories, and active seller profiles.
- Sellers can CRUD their own products, images, variants, inventory.
- Seller verifications: sellers can read their own, admins can read all. Only service_role writes status.
- Products with status 'draft' are only visible to the owning seller.
- Ownership is verified via seller_profiles.user_id = auth.uid().
*/

-- ============================================================
-- SELLER PROFILES
-- ============================================================

CREATE TABLE IF NOT EXISTS public.seller_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  shop_name text NOT NULL,
  slug text NOT NULL UNIQUE,
  description text,
  logo_url text,
  banner_url text,
  municipality_id uuid REFERENCES public.municipalities(id) ON DELETE SET NULL,
  barangay_id uuid REFERENCES public.barangays(id) ON DELETE SET NULL,
  contact_phone text,
  contact_email text,
  is_active boolean NOT NULL DEFAULT true,
  is_verified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_seller_profiles_user_id ON public.seller_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_seller_profiles_slug ON public.seller_profiles(slug);
CREATE INDEX IF NOT EXISTS idx_seller_profiles_municipality_id ON public.seller_profiles(municipality_id);

ALTER TABLE public.seller_profiles ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.seller_profiles TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.seller_profiles TO authenticated;

-- Public can read active seller profiles; sellers can read their own regardless of active status
DROP POLICY IF EXISTS "read_seller_profiles" ON public.seller_profiles;
CREATE POLICY "read_seller_profiles"
  ON public.seller_profiles FOR SELECT
  TO anon, authenticated
  USING (is_active = true OR user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "insert_own_seller_profile" ON public.seller_profiles;
CREATE POLICY "insert_own_seller_profile"
  ON public.seller_profiles FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "update_own_seller_profile" ON public.seller_profiles;
CREATE POLICY "update_own_seller_profile"
  ON public.seller_profiles FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid() OR public.is_admin())
  WITH CHECK (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "delete_own_seller_profile" ON public.seller_profiles;
CREATE POLICY "delete_own_seller_profile"
  ON public.seller_profiles FOR DELETE
  TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

-- ============================================================
-- SELLER VERIFICATIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.seller_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES public.seller_profiles(id) ON DELETE CASCADE,
  id_type text CHECK (id_type IN ('national_id', 'drivers_license', 'voters_id', 'passport', 'business_permit')),
  id_image_url text,
  selfie_image_url text,
  business_permit_url text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_seller_verifications_seller_id ON public.seller_verifications(seller_id);
CREATE INDEX IF NOT EXISTS idx_seller_verifications_status ON public.seller_verifications(status);

ALTER TABLE public.seller_verifications ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON public.seller_verifications TO authenticated;
GRANT UPDATE, DELETE ON public.seller_verifications TO authenticated;

-- Sellers can read their own verifications; moderators/admins can read all
DROP POLICY IF EXISTS "read_seller_verifications" ON public.seller_verifications;
CREATE POLICY "read_seller_verifications"
  ON public.seller_verifications FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.seller_profiles sp WHERE sp.id = seller_verifications.seller_id AND sp.user_id = auth.uid())
    OR public.is_moderator()
  );

-- Sellers can submit verifications for their own store
DROP POLICY IF EXISTS "insert_own_seller_verification" ON public.seller_verifications;
CREATE POLICY "insert_own_seller_verification"
  ON public.seller_verifications FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.seller_profiles sp WHERE sp.id = seller_verifications.seller_id AND sp.user_id = auth.uid())
  );

-- Only moderators/admins can update verification status (but not the seller themselves)
DROP POLICY IF EXISTS "update_seller_verification" ON public.seller_verifications;
CREATE POLICY "update_seller_verification"
  ON public.seller_verifications FOR UPDATE
  TO authenticated
  USING (public.is_moderator())
  WITH CHECK (public.is_moderator());

-- Only admins can delete verifications
DROP POLICY IF EXISTS "delete_seller_verification" ON public.seller_verifications;
CREATE POLICY "delete_seller_verification"
  ON public.seller_verifications FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- ============================================================
-- CATEGORIES
-- ============================================================

CREATE TABLE IF NOT EXISTS public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  description text,
  icon_name text,
  parent_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_categories_parent_id ON public.categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_categories_slug ON public.categories(slug);

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.categories TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.categories TO authenticated;

-- Public can read active categories; admins can read all
DROP POLICY IF EXISTS "read_categories" ON public.categories;
CREATE POLICY "read_categories"
  ON public.categories FOR SELECT
  TO anon, authenticated
  USING (is_active = true OR public.is_admin());

-- Only admins can create/update/delete categories
DROP POLICY IF EXISTS "insert_category_admin" ON public.categories;
CREATE POLICY "insert_category_admin"
  ON public.categories FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "update_category_admin" ON public.categories;
CREATE POLICY "update_category_admin"
  ON public.categories FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "delete_category_admin" ON public.categories;
CREATE POLICY "delete_category_admin"
  ON public.categories FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- ============================================================
-- PRODUCTS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES public.seller_profiles(id) ON DELETE CASCADE,
  category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  title text NOT NULL,
  slug text NOT NULL,
  description text,
  price numeric(12,2) NOT NULL CHECK (price >= 0),
  sale_price numeric(12,2) CHECK (sale_price >= 0 AND sale_price < price),
  stock int NOT NULL DEFAULT 0 CHECK (stock >= 0),
  sku text,
  condition text NOT NULL DEFAULT 'new' CHECK (condition IN ('new', 'like_new', 'good', 'fair', 'poor')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'sold_out', 'archived')),
  municipality_id uuid REFERENCES public.municipalities(id) ON DELETE SET NULL,
  barangay_id uuid REFERENCES public.barangays(id) ON DELETE SET NULL,
  view_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (seller_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_products_seller_id ON public.products(seller_id);
CREATE INDEX IF NOT EXISTS idx_products_category_id ON public.products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_status ON public.products(status);
CREATE INDEX IF NOT EXISTS idx_products_municipality_id ON public.products(municipality_id);
CREATE INDEX IF NOT EXISTS idx_products_created_at ON public.products(created_at DESC);

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.products TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.products TO authenticated;

-- Public can read published products; sellers can read all their own
DROP POLICY IF EXISTS "read_products" ON public.products;
CREATE POLICY "read_products"
  ON public.products FOR SELECT
  TO anon, authenticated
  USING (
    status = 'published'
    OR EXISTS (SELECT 1 FROM public.seller_profiles sp WHERE sp.id = products.seller_id AND sp.user_id = auth.uid())
    OR public.is_admin()
  );

-- Only the seller who owns the product can insert
DROP POLICY IF EXISTS "insert_own_product" ON public.products;
CREATE POLICY "insert_own_product"
  ON public.products FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.seller_profiles sp WHERE sp.id = products.seller_id AND sp.user_id = auth.uid())
  );

-- Only the seller who owns the product can update (admins too)
DROP POLICY IF EXISTS "update_own_product" ON public.products;
CREATE POLICY "update_own_product"
  ON public.products FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.seller_profiles sp WHERE sp.id = products.seller_id AND sp.user_id = auth.uid())
    OR public.is_admin()
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.seller_profiles sp WHERE sp.id = products.seller_id AND sp.user_id = auth.uid())
    OR public.is_admin()
  );

-- Only the seller who owns the product can delete (admins too)
DROP POLICY IF EXISTS "delete_own_product" ON public.products;
CREATE POLICY "delete_own_product"
  ON public.products FOR DELETE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.seller_profiles sp WHERE sp.id = products.seller_id AND sp.user_id = auth.uid())
    OR public.is_admin()
  );

-- ============================================================
-- PRODUCT IMAGES
-- ============================================================

CREATE TABLE IF NOT EXISTS public.product_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  image_url text NOT NULL,
  alt_text text,
  sort_order int NOT NULL DEFAULT 0,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_images_product_id ON public.product_images(product_id);

ALTER TABLE public.product_images ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.product_images TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.product_images TO authenticated;

-- Public can read images of products they can see
DROP POLICY IF EXISTS "read_product_images" ON public.product_images;
CREATE POLICY "read_product_images"
  ON public.product_images FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_images.product_id
        AND (p.status = 'published'
             OR EXISTS (SELECT 1 FROM public.seller_profiles sp WHERE sp.id = p.seller_id AND sp.user_id = auth.uid())
             OR public.is_admin())
    )
  );

-- Only the product's seller can manage images
DROP POLICY IF EXISTS "insert_own_product_image" ON public.product_images;
CREATE POLICY "insert_own_product_image"
  ON public.product_images FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.products p
      JOIN public.seller_profiles sp ON sp.id = p.seller_id
      WHERE p.id = product_images.product_id AND sp.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "update_own_product_image" ON public.product_images;
CREATE POLICY "update_own_product_image"
  ON public.product_images FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.products p
      JOIN public.seller_profiles sp ON sp.id = p.seller_id
      WHERE p.id = product_images.product_id AND sp.user_id = auth.uid()
    ) OR public.is_admin()
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.products p
      JOIN public.seller_profiles sp ON sp.id = p.seller_id
      WHERE p.id = product_images.product_id AND sp.user_id = auth.uid()
    ) OR public.is_admin()
  );

DROP POLICY IF EXISTS "delete_own_product_image" ON public.product_images;
CREATE POLICY "delete_own_product_image"
  ON public.product_images FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.products p
      JOIN public.seller_profiles sp ON sp.id = p.seller_id
      WHERE p.id = product_images.product_id AND sp.user_id = auth.uid()
    ) OR public.is_admin()
  );

-- ============================================================
-- PRODUCT VARIANTS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.product_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  name text NOT NULL,
  value text NOT NULL,
  price_override numeric(12,2) CHECK (price_override >= 0),
  stock int NOT NULL DEFAULT 0 CHECK (stock >= 0),
  sku text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_variants_product_id ON public.product_variants(product_id);

ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.product_variants TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.product_variants TO authenticated;

-- Same access pattern as product_images
DROP POLICY IF EXISTS "read_product_variants" ON public.product_variants;
CREATE POLICY "read_product_variants"
  ON public.product_variants FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_variants.product_id
        AND (p.status = 'published'
             OR EXISTS (SELECT 1 FROM public.seller_profiles sp WHERE sp.id = p.seller_id AND sp.user_id = auth.uid())
             OR public.is_admin())
    )
  );

DROP POLICY IF EXISTS "insert_own_product_variant" ON public.product_variants;
CREATE POLICY "insert_own_product_variant"
  ON public.product_variants FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.products p
      JOIN public.seller_profiles sp ON sp.id = p.seller_id
      WHERE p.id = product_variants.product_id AND sp.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "update_own_product_variant" ON public.product_variants;
CREATE POLICY "update_own_product_variant"
  ON public.product_variants FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.products p
      JOIN public.seller_profiles sp ON sp.id = p.seller_id
      WHERE p.id = product_variants.product_id AND sp.user_id = auth.uid()
    ) OR public.is_admin()
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.products p
      JOIN public.seller_profiles sp ON sp.id = p.seller_id
      WHERE p.id = product_variants.product_id AND sp.user_id = auth.uid()
    ) OR public.is_admin()
  );

DROP POLICY IF EXISTS "delete_own_product_variant" ON public.product_variants;
CREATE POLICY "delete_own_product_variant"
  ON public.product_variants FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.products p
      JOIN public.seller_profiles sp ON sp.id = p.seller_id
      WHERE p.id = product_variants.product_id AND sp.user_id = auth.uid()
    ) OR public.is_admin()
  );

-- ============================================================
-- INVENTORY (per product or per variant)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  variant_id uuid REFERENCES public.product_variants(id) ON DELETE CASCADE,
  quantity int NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  reserved int NOT NULL DEFAULT 0 CHECK (reserved >= 0),
  low_stock_threshold int NOT NULL DEFAULT 5,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, variant_id)
);

CREATE INDEX IF NOT EXISTS idx_inventory_product_id ON public.inventory(product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_variant_id ON public.inventory(variant_id);

ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.inventory TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.inventory TO authenticated;

-- Public can read inventory for published products; sellers can read their own
DROP POLICY IF EXISTS "read_inventory" ON public.inventory;
CREATE POLICY "read_inventory"
  ON public.inventory FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = inventory.product_id
        AND (p.status = 'published'
             OR EXISTS (SELECT 1 FROM public.seller_profiles sp WHERE sp.id = p.seller_id AND sp.user_id = auth.uid())
             OR public.is_admin())
    )
  );

DROP POLICY IF EXISTS "insert_own_inventory" ON public.inventory;
CREATE POLICY "insert_own_inventory"
  ON public.inventory FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.products p
      JOIN public.seller_profiles sp ON sp.id = p.seller_id
      WHERE p.id = inventory.product_id AND sp.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "update_own_inventory" ON public.inventory;
CREATE POLICY "update_own_inventory"
  ON public.inventory FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.products p
      JOIN public.seller_profiles sp ON sp.id = p.seller_id
      WHERE p.id = inventory.product_id AND sp.user_id = auth.uid()
    ) OR public.is_admin()
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.products p
      JOIN public.seller_profiles sp ON sp.id = p.seller_id
      WHERE p.id = inventory.product_id AND sp.user_id = auth.uid()
    ) OR public.is_admin()
  );

DROP POLICY IF EXISTS "delete_own_inventory" ON public.inventory;
CREATE POLICY "delete_own_inventory"
  ON public.inventory FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.products p
      JOIN public.seller_profiles sp ON sp.id = p.seller_id
      WHERE p.id = inventory.product_id AND sp.user_id = auth.uid()
    ) OR public.is_admin()
  );

-- ============================================================
-- UPDATED_AT TRIGGERS
-- ============================================================

DROP TRIGGER IF EXISTS seller_profiles_updated_at ON public.seller_profiles;
CREATE TRIGGER seller_profiles_updated_at
  BEFORE UPDATE ON public.seller_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS seller_verifications_updated_at ON public.seller_verifications;
CREATE TRIGGER seller_verifications_updated_at
  BEFORE UPDATE ON public.seller_verifications
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS categories_updated_at ON public.categories;
CREATE TRIGGER categories_updated_at
  BEFORE UPDATE ON public.categories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS products_updated_at ON public.products;
CREATE TRIGGER products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS product_variants_updated_at ON public.product_variants;
CREATE TRIGGER product_variants_updated_at
  BEFORE UPDATE ON public.product_variants
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS inventory_updated_at ON public.inventory;
CREATE TRIGGER inventory_updated_at
  BEFORE UPDATE ON public.inventory
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ============================================================
-- SEED CATEGORIES (real marketplace categories, not fake products)
-- ============================================================

INSERT INTO public.categories (name, slug, icon_name, sort_order) VALUES
  ('Agricultural Products', 'agricultural-products', 'Wheat', 1),
  ('Fish & Seafood', 'fish-seafood', 'Fish', 2),
  ('Food & Beverages', 'food-beverages', 'UtensilsCrossed', 3),
  ('Handicrafts', 'handicrafts', 'Scissors', 4),
  ('Clothing & Apparel', 'clothing-apparel', 'Shirt', 5),
  ('Health & Beauty', 'health-beauty', 'Heart', 6),
  ('Home & Living', 'home-living', 'Home', 7),
  ('Electronics', 'electronics', 'Smartphone', 8),
  ('Tools & Hardware', 'tools-hardware', 'Wrench', 9),
  ('Services', 'services', 'Briefcase', 10)
ON CONFLICT (slug) DO NOTHING;

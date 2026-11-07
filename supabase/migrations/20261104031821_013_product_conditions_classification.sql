CREATE TABLE IF NOT EXISTS public.product_conditions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  value text NOT NULL UNIQUE,
  label text NOT NULL,
  description text,
  category_group text NOT NULL DEFAULT 'all',
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.product_conditions ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.product_conditions TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.product_conditions TO authenticated;

CREATE POLICY "read_active_conditions" ON public.product_conditions
  FOR SELECT TO anon, authenticated
  USING (is_active = true OR is_admin());

CREATE POLICY "insert_condition_admin" ON public.product_conditions
  FOR INSERT TO authenticated
  WITH CHECK (is_admin());

CREATE POLICY "update_condition_admin" ON public.product_conditions
  FOR UPDATE TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY "delete_condition_admin" ON public.product_conditions
  FOR DELETE TO authenticated
  USING (is_admin());

INSERT INTO product_conditions (value, label, description, category_group, sort_order, is_active) VALUES
  ('brand_new', 'Brand New', 'Never used, in original packaging.', 'all', 1, true),
  ('like_new', 'Like New', 'Used minimally, no visible wear.', 'secondhand', 2, true),
  ('gently_used', 'Gently Used', 'Lightly used with minor signs of wear.', 'secondhand', 3, true),
  ('used', 'Used', 'Previously owned with visible wear but functional.', 'secondhand', 4, true),
  ('refurbished', 'Refurbished', 'Restored to working condition by a professional.', 'secondhand', 5, true),
  ('handmade', 'Handmade', 'Crafted by hand, unique item.', 'handmade', 6, true),
  ('locally_produced', 'Locally Produced', 'Produced locally in Marinduque.', 'fresh', 7, true),
  ('perishable', 'Perishable', 'Fresh goods with limited shelf life.', 'fresh', 8, true),
  ('made_to_order', 'Made to Order', 'Custom-made upon order.', 'handmade', 9, true)
ON CONFLICT (value) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  category_group = EXCLUDED.category_group,
  is_active = true,
  updated_at = now();

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS condition_description text,
  ADD COLUMN IF NOT EXISTS product_age text,
  ADD COLUMN IF NOT EXISTS defects text,
  ADD COLUMN IF NOT EXISTS repair_history text,
  ADD COLUMN IF NOT EXISTS warranty_info text,
  ADD COLUMN IF NOT EXISTS condition_notes text;

UPDATE products SET condition = 'brand_new' WHERE condition = 'new';
UPDATE products SET condition = 'gently_used' WHERE condition = 'good';
UPDATE products SET condition = 'used' WHERE condition = 'fair';
UPDATE products SET condition = 'used' WHERE condition = 'poor';

CREATE OR REPLACE FUNCTION public.validate_product_condition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.product_conditions WHERE value = NEW.condition AND is_active = true) THEN
    RAISE EXCEPTION 'Invalid product condition: %. Use an active condition from product_conditions.', NEW.condition;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS products_condition_check ON products;
CREATE TRIGGER products_condition_check
  BEFORE INSERT OR UPDATE OF condition ON products
  FOR EACH ROW EXECUTE FUNCTION public.validate_product_condition();

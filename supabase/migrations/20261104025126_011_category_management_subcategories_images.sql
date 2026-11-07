/*
# Category & subcategory management system

## Summary
- Adds `image_url` to categories for uploaded icon/banner images.
- Adds a SECURITY DEFINER function `safe_delete_category` that blocks deletion
  when the category or any of its subcategories has linked products, or when it
  has subcategories. Prevents orphaned products and broken navigation.
- Seeds the 18 requested top-level categories (replaces the old 10 seed categories
  with the full set required by Prompt 09). Existing category rows referenced by
  products are preserved; old unused categories are deactivated, not deleted.
- Adds a unique slug constraint to prevent duplicate category slugs.

## Columns added
- categories.image_url (text, nullable): optional uploaded icon or banner image URL.

## Function
- safe_delete_category(p_category_id uuid): checks for products and subcategories
  before deleting. Raises an exception with a human-readable reason if blocked.
  Only callable by admins (is_admin() gate inside; also revoked from anon).

## Data
- The 18 categories are inserted with ON CONFLICT (slug) DO UPDATE so re-running
  is safe. Old categories not in the new set are deactivated (is_active = false)
  so they no longer appear in public navigation but any linked products remain intact.
*/

ALTER TABLE categories
  ADD COLUMN IF NOT EXISTS image_url text;

ALTER TABLE categories
  ADD CONSTRAINT categories_slug_unique UNIQUE (slug);

CREATE OR REPLACE FUNCTION public.safe_delete_category(p_category_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_has_products boolean;
  v_has_subcats boolean;
  v_subcat_has_products boolean;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Only administrators can delete categories.';
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.products WHERE category_id = p_category_id
  ) INTO v_has_products;

  IF v_has_products THEN
    RAISE EXCEPTION 'Cannot delete: this category has products linked to it.';
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.categories WHERE parent_id = p_category_id
  ) INTO v_has_subcats;

  IF v_has_subcats THEN
    SELECT EXISTS(
      SELECT 1 FROM public.products p
      JOIN public.categories c ON c.id = p.category_id
      WHERE c.parent_id = p_category_id
    ) INTO v_subcat_has_products;

    IF v_subcat_has_products THEN
      RAISE EXCEPTION 'Cannot delete: subcategories under this category have products.';
    ELSE
      RAISE EXCEPTION 'Cannot delete: this category has subcategories. Delete or move them first.';
    END IF;
  END IF;

  DELETE FROM public.categories WHERE id = p_category_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.safe_delete_category(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.safe_delete_category(uuid) TO authenticated;

-- Deactivate old categories not in the new set (only those with no products)
UPDATE categories SET is_active = false
  WHERE slug NOT IN (
    'electronics-gadgets','fashion-clothing','home-furniture','food-groceries',
    'fruits-vegetables','agriculture-farming','livestock-poultry','seafood-fishery',
    'vehicles-accessories','beauty-personal-care','sports-outdoor','toys-hobbies',
    'books-school-supplies','handicrafts-local-products','construction-hardware',
    'business-equipment','local-services','other-products'
  )
  AND id NOT IN (SELECT category_id FROM products WHERE category_id IS NOT NULL);

-- Seed the 18 requested categories
INSERT INTO categories (name, slug, description, icon_name, parent_id, sort_order, is_active) VALUES
  ('Electronics & Gadgets', 'electronics-gadgets', 'Phones, computers, accessories, and electronic devices.', 'Smartphone', NULL, 1, true),
  ('Fashion & Clothing', 'fashion-clothing', 'Apparel, footwear, bags, and fashion accessories.', 'Shirt', NULL, 2, true),
  ('Home & Furniture', 'home-furniture', 'Furniture, appliances, decor, and household items.', 'Home', NULL, 3, true),
  ('Food & Groceries', 'food-groceries', 'Packaged food, beverages, pantry staples, and dry goods.', 'UtensilsCrossed', NULL, 4, true),
  ('Fruits & Vegetables', 'fruits-vegetables', 'Fresh produce, fruits, and vegetables from local farms.', 'Sprout', NULL, 5, true),
  ('Agriculture & Farming', 'agriculture-farming', 'Seeds, fertilizers, farm tools, and agricultural supplies.', 'Wheat', NULL, 6, true),
  ('Livestock & Poultry', 'livestock-poultry', 'Live animals, feed, and poultry supplies.', 'Milk', NULL, 7, true),
  ('Seafood & Fishery', 'seafood-fishery', 'Fresh catch, dried fish, and fishery products.', 'Fish', NULL, 8, true),
  ('Vehicles & Accessories', 'vehicles-accessories', 'Motorcycles, bicycles, parts, and vehicle accessories.', 'Bike', NULL, 9, true),
  ('Beauty & Personal Care', 'beauty-personal-care', 'Skincare, cosmetics, grooming, and personal care items.', 'Heart', NULL, 10, true),
  ('Sports & Outdoor', 'sports-outdoor', 'Sports gear, outdoor equipment, and fitness items.', 'Dumbbell', NULL, 11, true),
  ('Toys & Hobbies', 'toys-hobbies', 'Toys, games, collectibles, and hobby supplies.', 'Gamepad2', NULL, 12, true),
  ('Books & School Supplies', 'books-school-supplies', 'Books, textbooks, stationery, and educational materials.', 'BookOpen', NULL, 13, true),
  ('Handicrafts & Local Products', 'handicrafts-local-products', 'Handmade crafts, woven goods, and Marinduque local products.', 'Scissors', NULL, 14, true),
  ('Construction & Hardware', 'construction-hardware', 'Building materials, tools, and hardware supplies.', 'Wrench', NULL, 15, true),
  ('Business Equipment', 'business-equipment', 'Office equipment, machinery, and commercial supplies.', 'Briefcase', NULL, 16, true),
  ('Local Services', 'local-services', 'Repair, transport, catering, and other local services.', 'Hammer', NULL, 17, true),
  ('Other Products', 'other-products', 'Products that do not fit in other categories.', 'Package', NULL, 18, true)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon_name = EXCLUDED.icon_name,
  is_active = true,
  updated_at = now();

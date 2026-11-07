/*
# Product specifications column

## Summary
Adds a `specifications` JSONB column to the products table so sellers can store
arbitrary key-value product specifications (e.g., weight, dimensions, material,
brand, warranty). This complements the structured fields (price, condition, etc.)
without requiring schema changes for each new spec type.

## Column added
- products.specifications (jsonb, nullable, default '{}'): key-value pairs of
  product specifications. Example: {"weight": "1kg", "material": "bamboo"}.

## Notes
- No existing data is modified. The column defaults to an empty object so it is
  always safe to read.
- RLS policies on products are unchanged — sellers can still only modify their
  own products.
*/

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS specifications jsonb DEFAULT '{}'::jsonb;

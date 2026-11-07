/*
# Geography admin write policies

## Plain-English summary
Municipalities and barangays are the official location records used across MariMarket.
Everyone can read them, but until now the database also allowed anonymous and signed-in
users to change them. This migration removes those write permissions and allows changes
only for administrators.

## Changes
1. `municipalities` and `barangays`: anon loses all write grants; authenticated keeps
   SELECT, INSERT, UPDATE, DELETE, but every write is gated by admin-only RLS policies.
2. Public read policies are unchanged, so buyers, sellers, and the registration flow still
   see every municipality and barangay.
3. A case-insensitive, whitespace-tolerant unique index on barangay names per municipality
   prevents duplicates such as "Poblacion" and "poblacion ".
4. A case-insensitive unique index on municipality names prevents duplicates.

## Security
- RLS remains enabled on both tables.
- Admin write policies use `is_admin()`, which checks the signed-in user's role on the server.
- No policy grants writes to non-admin users.

## Notes
- Rerunnable: grants are re-applied, indexes use IF NOT EXISTS, and policies are dropped first.
*/

ALTER TABLE municipalities ENABLE ROW LEVEL SECURITY;
ALTER TABLE barangays ENABLE ROW LEVEL SECURITY;

REVOKE INSERT, UPDATE, DELETE ON municipalities FROM anon;
REVOKE INSERT, UPDATE, DELETE ON barangays FROM anon;
REVOKE ALL ON municipalities FROM anon;
REVOKE ALL ON barangays FROM anon;
GRANT SELECT ON municipalities TO anon, authenticated;
GRANT SELECT ON barangays TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON municipalities TO authenticated;
GRANT INSERT, UPDATE, DELETE ON barangays TO authenticated;

DROP POLICY IF EXISTS "admin_insert_municipalities" ON municipalities;
CREATE POLICY "admin_insert_municipalities" ON municipalities FOR INSERT
  TO authenticated WITH CHECK (is_admin());

DROP POLICY IF EXISTS "admin_update_municipalities" ON municipalities;
CREATE POLICY "admin_update_municipalities" ON municipalities FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "admin_delete_municipalities" ON municipalities;
CREATE POLICY "admin_delete_municipalities" ON municipalities FOR DELETE
  TO authenticated USING (is_admin());

DROP POLICY IF EXISTS "admin_insert_barangays" ON barangays;
CREATE POLICY "admin_insert_barangays" ON barangays FOR INSERT
  TO authenticated WITH CHECK (is_admin());

DROP POLICY IF EXISTS "admin_update_barangays" ON barangays;
CREATE POLICY "admin_update_barangays" ON barangays FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "admin_delete_barangays" ON barangays;
CREATE POLICY "admin_delete_barangays" ON barangays FOR DELETE
  TO authenticated USING (is_admin());

CREATE UNIQUE INDEX IF NOT EXISTS barangays_municipality_name_ci_key
  ON barangays (municipality_id, lower(btrim(name)));

CREATE UNIQUE INDEX IF NOT EXISTS municipalities_name_ci_key
  ON municipalities (lower(btrim(name)));

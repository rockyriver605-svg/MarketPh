/*
# Account addresses and account settings

Adds saved delivery addresses for each user and the database functions that power
account deactivation and deletion requests.

1. New Tables
- `user_addresses`: multiple saved delivery addresses per user.
  - `id` (uuid, primary key)
  - `user_id` (uuid, owner, defaults to the signed-in user)
  - `label` (text, e.g. Home or Office)
  - `recipient_name` (text, 2 to 100 characters)
  - `phone` (text, Philippine mobile number)
  - `municipality_id` / `barangay_id` (references to the location tables; barangay must belong to the municipality)
  - `street` (text, required) and `landmark` (text, optional)
  - `is_default` (boolean, at most one default per user)
  - `created_at` / `updated_at`

2. Modified Tables
- `profiles`: adds `deactivated_at` and `deletion_requested_at` (timestamps). Users cannot write these columns directly; they change only through the account functions below.

3. Functions
- `set_default_address(uuid)`: makes one of the caller's addresses the default and clears the previous default in one step.
- `deactivate_my_account()`, `reactivate_my_account()`: set or clear the caller's `deactivated_at`.
- `request_account_deletion()`, `cancel_account_deletion()`: set or clear the caller's `deletion_requested_at`.

4. Security
- RLS enabled on `user_addresses` with four separate owner-only policies (select, insert, update, delete) scoped to `authenticated`.
- Grants on `user_addresses` are limited to `authenticated`.
- Account functions run as the function owner but only act on `auth.uid()`; they are revoked from PUBLIC and anon.
- The location trigger function is not callable by any client role.

5. Important Notes
- Idempotent: safe to re-run. Columns use IF NOT EXISTS and policies are dropped before they are created.
- No existing data is changed or removed.
*/

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS deactivated_at timestamptz;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS deletion_requested_at timestamptz;

CREATE TABLE IF NOT EXISTS user_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  label text NOT NULL DEFAULT 'Home' CHECK (char_length(label) BETWEEN 1 AND 40),
  recipient_name text NOT NULL CHECK (char_length(btrim(recipient_name)) BETWEEN 2 AND 100),
  phone text NOT NULL CHECK (phone ~ '^(\+?63|0)9\d{9}$'),
  municipality_id uuid NOT NULL REFERENCES municipalities(id),
  barangay_id uuid NOT NULL REFERENCES barangays(id),
  street text NOT NULL CHECK (char_length(btrim(street)) BETWEEN 1 AND 200),
  landmark text CHECK (landmark IS NULL OR char_length(landmark) <= 200),
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_addresses_user_id_idx ON user_addresses (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS user_addresses_one_default_idx ON user_addresses (user_id) WHERE is_default;

CREATE OR REPLACE FUNCTION validate_user_address_location()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM barangays b
    WHERE b.id = NEW.barangay_id AND b.municipality_id = NEW.municipality_id
  ) THEN
    RAISE EXCEPTION 'Barangay does not belong to the selected municipality' USING ERRCODE = '23514';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION validate_user_address_location() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS user_addresses_validate_location ON user_addresses;
CREATE TRIGGER user_addresses_validate_location
BEFORE INSERT OR UPDATE ON user_addresses
FOR EACH ROW EXECUTE FUNCTION validate_user_address_location();

ALTER TABLE user_addresses ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON user_addresses TO authenticated;

DROP POLICY IF EXISTS "select_own_addresses" ON user_addresses;
CREATE POLICY "select_own_addresses" ON user_addresses FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_addresses" ON user_addresses;
CREATE POLICY "insert_own_addresses" ON user_addresses FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_addresses" ON user_addresses;
CREATE POLICY "update_own_addresses" ON user_addresses FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_addresses" ON user_addresses;
CREATE POLICY "delete_own_addresses" ON user_addresses FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION set_default_address(p_address_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM user_addresses WHERE id = p_address_id AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Address not found' USING ERRCODE = 'P0002';
  END IF;
  UPDATE user_addresses SET is_default = false
  WHERE user_id = auth.uid() AND is_default AND id <> p_address_id;
  UPDATE user_addresses SET is_default = true
  WHERE id = p_address_id AND user_id = auth.uid();
END;
$$;

CREATE OR REPLACE FUNCTION deactivate_my_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;
  UPDATE profiles SET deactivated_at = now() WHERE id = auth.uid() AND deactivated_at IS NULL;
END;
$$;

CREATE OR REPLACE FUNCTION reactivate_my_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;
  UPDATE profiles SET deactivated_at = NULL WHERE id = auth.uid();
END;
$$;

CREATE OR REPLACE FUNCTION request_account_deletion()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;
  UPDATE profiles SET deletion_requested_at = now()
  WHERE id = auth.uid() AND deletion_requested_at IS NULL;
END;
$$;

CREATE OR REPLACE FUNCTION cancel_account_deletion()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;
  UPDATE profiles SET deletion_requested_at = NULL WHERE id = auth.uid();
END;
$$;

REVOKE EXECUTE ON FUNCTION set_default_address(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION set_default_address(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION deactivate_my_account() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION deactivate_my_account() TO authenticated;

REVOKE EXECUTE ON FUNCTION reactivate_my_account() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION reactivate_my_account() TO authenticated;

REVOKE EXECUTE ON FUNCTION request_account_deletion() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION request_account_deletion() TO authenticated;

REVOKE EXECUTE ON FUNCTION cancel_account_deletion() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION cancel_account_deletion() TO authenticated;

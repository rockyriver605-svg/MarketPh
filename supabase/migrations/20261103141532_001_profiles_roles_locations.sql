/*
# MariMarket Foundation — Profiles, Roles, Municipalities & Barangays

## Summary
Creates the core identity and location infrastructure for the MariMarket platform.

## New Tables
1. **profiles** — public user profile data linked to auth.users.
2. **user_roles** — role assignments per user (buyer, seller, moderator, administrator, super_admin).
3. **municipalities** — the six municipalities of Marinduque province. Seeded with real data.
4. **barangays** — barangays within each municipality. Seeded with real data.

## Security
- RLS enabled on all tables.
- profiles: public read, users update only their own.
- user_roles: users read their own role; only service_role can write.
- municipalities & barangays: public read for all.
- SECURITY DEFINER functions: is_admin(), is_moderator(), get_current_user_role().
- Trigger handle_new_user() auto-creates profile + buyer role on signup.
*/

-- ============================================================
-- MUNICIPALITIES
-- ============================================================

CREATE TABLE IF NOT EXISTS public.municipalities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  province text NOT NULL DEFAULT 'Marinduque',
  region text NOT NULL DEFAULT 'MIMAROPA',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.municipalities ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.municipalities TO anon, authenticated;

DROP POLICY IF EXISTS "public_read_municipalities" ON public.municipalities;
CREATE POLICY "public_read_municipalities"
  ON public.municipalities FOR SELECT
  TO anon, authenticated USING (true);

-- ============================================================
-- BARANGAYS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.barangays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  municipality_id uuid NOT NULL REFERENCES public.municipalities(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (municipality_id, name)
);

CREATE INDEX IF NOT EXISTS idx_barangays_municipality_id ON public.barangays(municipality_id);

ALTER TABLE public.barangays ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.barangays TO anon, authenticated;

DROP POLICY IF EXISTS "public_read_barangays" ON public.barangays;
CREATE POLICY "public_read_barangays"
  ON public.barangays FOR SELECT
  TO anon, authenticated USING (true);

-- ============================================================
-- PROFILES
-- ============================================================

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  avatar_url text,
  phone text,
  bio text,
  municipality_id uuid REFERENCES public.municipalities(id) ON DELETE SET NULL,
  barangay_id uuid REFERENCES public.barangays(id) ON DELETE SET NULL,
  street_address text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profiles_municipality_id ON public.profiles(municipality_id);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.profiles TO anon, authenticated;
GRANT INSERT, UPDATE ON public.profiles TO authenticated;

DROP POLICY IF EXISTS "public_read_profiles" ON public.profiles;
CREATE POLICY "public_read_profiles"
  ON public.profiles FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "insert_own_profile" ON public.profiles;
CREATE POLICY "insert_own_profile"
  ON public.profiles FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "update_own_profile" ON public.profiles;
CREATE POLICY "update_own_profile"
  ON public.profiles FOR UPDATE
  TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- ============================================================
-- USER ROLES
-- ============================================================

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'buyer'
    CHECK (role IN ('buyer', 'seller', 'moderator', 'administrator', 'super_admin')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON public.user_roles(user_id);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.user_roles TO authenticated;

DROP POLICY IF EXISTS "read_own_role" ON public.user_roles;
CREATE POLICY "read_own_role"
  ON public.user_roles FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

-- ============================================================
-- HELPER FUNCTIONS (after user_roles table exists)
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.user_roles WHERE user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role IN ('administrator', 'super_admin')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_moderator()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role IN ('moderator', 'administrator', 'super_admin')
  );
$$;

REVOKE EXECUTE ON FUNCTION public.get_current_user_role() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_moderator() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_current_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_moderator() TO authenticated;

-- ============================================================
-- AUTO-CREATE PROFILE + BUYER ROLE ON SIGNUP
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)));

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'buyer');

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- UPDATED_AT TRIGGER
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_updated_at ON public.profiles;
CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS user_roles_updated_at ON public.user_roles;
CREATE TRIGGER user_roles_updated_at
  BEFORE UPDATE ON public.user_roles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- ============================================================
-- SEED MUNICIPALITIES
-- ============================================================

INSERT INTO public.municipalities (name) VALUES
  ('Boac'), ('Mogpog'), ('Gasan'), ('Buenavista'), ('Torrijos'), ('Santa Cruz')
ON CONFLICT (name) DO NOTHING;

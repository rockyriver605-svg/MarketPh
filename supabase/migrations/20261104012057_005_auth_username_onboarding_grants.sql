/*
# Auth profile fields, username availability, and tightened grants

1. Plain-English summary
- Adds a unique username, account status, and terms/privacy acceptance fields to profiles.
- Updates the signup trigger so new accounts get their username, phone number, and terms acceptance from the sign-up form.
- Adds a function that tells the sign-up form whether a username is free.
- Narrows what signed-in users can change on their own profile, so account status and other protected fields cannot be edited from the browser.
- Creates the profile-photos storage bucket with its upload rules.

2. Modified tables
- profiles: new columns username, account_status, terms_accepted_at, privacy_accepted_at, onboarding_completed_at.
- profiles: removes the self-insert policy (profiles are created only by the signup trigger).

3. Security changes
- Revokes all table privileges on profiles and user_roles from anon and authenticated, then re-grants only what the app needs.
- user_roles: read-only for authenticated users (their own row is already protected by policy). Roles can only change through trusted server code.
- profiles: authenticated users may update only display_name, avatar_url, phone, bio, municipality_id, barangay_id, street_address, username, onboarding_completed_at.
- profile-photos bucket: 2 MB limit, JPEG/PNG/WebP only, each user may write only inside their own folder.

4. Notes
- Usernames are lowercase letters, digits, and underscores, 3 to 30 characters.
- Existing profile rows keep their data; the new columns start empty.
*/

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS username text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS account_status text NOT NULL DEFAULT 'active';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS privacy_accepted_at timestamptz;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_username_format') THEN
    ALTER TABLE profiles ADD CONSTRAINT profiles_username_format
      CHECK (username IS NULL OR username ~ '^[a-z0-9_]{3,30}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_account_status_check') THEN
    ALTER TABLE profiles ADD CONSTRAINT profiles_account_status_check
      CHECK (account_status IN ('active', 'suspended'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_key ON profiles (username);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_username text;
  v_terms_accepted boolean;
  v_accepted_at timestamptz;
BEGIN
  v_username := lower(NULLIF(NEW.raw_user_meta_data->>'username', ''));
  IF v_username IS NULL OR v_username !~ '^[a-z0-9_]{3,30}$' THEN
    v_username := 'user_' || substr(replace(NEW.id::text, '-', ''), 1, 10);
  END IF;

  v_terms_accepted := NEW.raw_user_meta_data->>'terms_accepted' = 'true';
  v_accepted_at := CASE WHEN v_terms_accepted THEN now() ELSE NULL END;

  INSERT INTO public.profiles (id, display_name, username, phone, terms_accepted_at, privacy_accepted_at)
  VALUES (
    NEW.id,
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'display_name', ''), split_part(NEW.email, '@', 1)),
    v_username,
    NULLIF(NEW.raw_user_meta_data->>'phone', ''),
    v_accepted_at,
    v_accepted_at
  );

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'buyer');

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.is_username_available(p_username text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT EXISTS (SELECT 1 FROM public.profiles WHERE username = lower(p_username));
$$;

REVOKE EXECUTE ON FUNCTION public.is_username_available(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_username_available(text) TO anon, authenticated;

DROP POLICY IF EXISTS "insert_own_profile" ON profiles;

REVOKE ALL ON profiles FROM anon, authenticated;
GRANT SELECT ON profiles TO anon, authenticated;
REVOKE UPDATE ON profiles FROM authenticated;
GRANT UPDATE (display_name, avatar_url, phone, bio, municipality_id, barangay_id, street_address, username, onboarding_completed_at)
  ON profiles TO authenticated;

REVOKE ALL ON user_roles FROM anon, authenticated;
GRANT SELECT ON user_roles TO authenticated;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('profile-photos', 'profile-photos', true, 2097152, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "profile_photos_insert_own" ON storage.objects;
CREATE POLICY "profile_photos_insert_own" ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'profile-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "profile_photos_update_own" ON storage.objects;
CREATE POLICY "profile_photos_update_own" ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'profile-photos' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'profile-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "profile_photos_delete_own" ON storage.objects;
CREATE POLICY "profile_photos_delete_own" ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'profile-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

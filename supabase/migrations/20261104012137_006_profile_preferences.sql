/*
# Profile account preferences

1. Plain-English summary
- Adds a preferences field to each profile so people can choose how they want to be contacted and notified.

2. Modified tables
- profiles: new column preferences (JSON object, defaults to an empty object).

3. Security changes
- Signed-in users may update only their own preferences, through the existing profile update rule.

4. Notes
- Existing profiles start with an empty preferences object; the app supplies defaults.
*/

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS preferences jsonb NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_preferences_is_object') THEN
    ALTER TABLE profiles ADD CONSTRAINT profiles_preferences_is_object
      CHECK (jsonb_typeof(preferences) = 'object');
  END IF;
END $$;

GRANT UPDATE (preferences) ON profiles TO authenticated;

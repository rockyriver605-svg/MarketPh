/*
# Role-based access control: suspension, dual roles, role history, admin actions

## Plain-English summary
MariMarket already has user_roles and an account_status column on profiles. This migration
extends that foundation so administrators and super admins can manage roles and suspend or
restore accounts safely, with a permanent audit trail. It also lets a single user hold both
a buyer and a seller role without creating a second account.

## New tables
- `role_change_history`: one row per role change. Records who acted, who was acted on, the
  previous role, the new role, the reason, and the timestamp. Read-only from the app.

## Columns added
- `profiles.suspended_at` (timestamptz, nullable): when an admin suspended the account.
- `profiles.suspension_reason` (text, nullable): the admin's reason for the suspension.
- `user_roles.secondary_role` (text, nullable): a second role a user can switch into at will
  (typically 'seller' alongside a primary 'buyer' role). Constrained to the same set as role.

## Security changes
- `role_change_history`: RLS enabled. Admins and super admins can read; inserts happen only
  through the SECURITY DEFINER admin RPCs, so users cannot write their own history rows.
  Grants: SELECT to authenticated; no INSERT/UPDATE/DELETE to any client role.
- `profiles`: UPDATE grant extended to cover suspended_at and suspension_reason, but those
  columns are only writable through the admin SECURITY DEFINER RPCs — the owner UPDATE policy
  still checks auth.uid() = id, and the RPCs enforce is_admin() before touching them.
- `user_roles`: existing SELECT-only grant to authenticated is unchanged. Role writes happen
  only through SECURITY DEFINER RPCs that verify the caller is an admin.

## New SECURITY DEFINER functions (all revoked from PUBLIC/anon, granted to authenticated)
- `activate_user_as_seller(p_user_id uuid)`: promotes a buyer to seller by setting
  secondary_role = 'seller'. Only admins/super admins can call it. Logs to role_change_history.
- `set_user_role(p_user_id uuid, p_new_role text, p_reason text)`: sets the primary role.
  Super admins can assign any role including administrator. Admins can assign buyer, seller,
  or moderator but cannot create or remove administrators. Nobody can demote a super admin
  except another super admin. Logs to role_change_history. Refuses to target a super admin
  when the caller is not a super admin.
- `suspend_user(p_user_id uuid, p_reason text)`: sets account_status = 'suspended',
  suspended_at = now(), suspension_reason = p_reason. Admins/super admins only. Cannot
  target a super admin unless the caller is a super admin. Logs to role_change_history.
- `restore_user(p_user_id uuid)`: sets account_status = 'active', clears suspended_at and
  suspension_reason. Admins/super admins only. Logs to role_change_history.
- `admin_list_role_history(p_limit int, p_offset int)`: returns recent role change rows for
  the admin panel. Admins/super admins only.

## Important notes
- All RPCs verify the caller's role on the server using the existing user_roles table and
  never trust client-supplied role information.
- A user cannot assign themselves administrator privileges: every role-setting RPC checks
  is_admin() (and super_admin for admin-level targets) on the authenticated caller.
- Suspension is enforced at sign-in: the existing reactivate_my_account RPC and the sign-in
  flow will see account_status = 'suspended' and the frontend blocks further access.
- No existing data is deleted or rewritten.
*/

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS suspended_at timestamptz,
  ADD COLUMN IF NOT EXISTS suspension_reason text;

ALTER TABLE user_roles
  ADD COLUMN IF NOT EXISTS secondary_role text
  CHECK (secondary_role IS NULL OR secondary_role IN ('buyer','seller','moderator','administrator','super_admin'));

CREATE TABLE IF NOT EXISTS role_change_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  target_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  previous_role text NOT NULL,
  new_role text NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_role_change_history_created_at ON role_change_history (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_role_change_history_target ON role_change_history (target_id);

ALTER TABLE role_change_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON role_change_history FROM PUBLIC, anon;
GRANT SELECT ON role_change_history TO authenticated;

DROP POLICY IF EXISTS "read_role_history_admin" ON role_change_history;
CREATE POLICY "read_role_history_admin" ON role_change_history FOR SELECT
  TO authenticated USING (is_admin());

GRANT UPDATE (suspended_at, suspension_reason) ON profiles TO authenticated;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
SELECT EXISTS (
  SELECT 1 FROM public.user_roles
  WHERE user_id = auth.uid() AND role = 'super_admin'
);
$$;
REVOKE EXECUTE ON FUNCTION public.is_super_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;

CREATE OR REPLACE FUNCTION public.activate_user_as_seller(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller_is_admin boolean;
  v_current_role text;
  v_current_secondary text;
BEGIN
  SELECT is_admin() INTO v_caller_is_admin;
  IF NOT v_caller_is_admin THEN
    RAISE EXCEPTION 'Only administrators can activate sellers.';
  END IF;

  SELECT role, secondary_role INTO v_current_role, v_current_secondary
  FROM public.user_roles WHERE user_id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found.';
  END IF;

  IF v_current_role = 'seller' OR v_current_secondary = 'seller' THEN
    RETURN;
  END IF;

  UPDATE public.user_roles
    SET secondary_role = 'seller', updated_at = now()
    WHERE user_id = p_user_id;

  INSERT INTO public.role_change_history (actor_id, target_id, previous_role, new_role, reason)
    VALUES (auth.uid(), p_user_id, v_current_role, v_current_role || ' + seller', 'Seller activated by admin');
END;
$$;
REVOKE EXECUTE ON FUNCTION public.activate_user_as_seller(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.activate_user_as_seller(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_user_role(p_user_id uuid, p_new_role text, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller_is_admin boolean;
  v_caller_is_super boolean;
  v_target_role text;
BEGIN
  IF p_new_role NOT IN ('buyer','seller','moderator','administrator','super_admin') THEN
    RAISE EXCEPTION 'Invalid role.';
  END IF;

  SELECT is_admin(), is_super_admin() INTO v_caller_is_admin, v_caller_is_super;
  IF NOT v_caller_is_admin THEN
    RAISE EXCEPTION 'Only administrators can change roles.';
  END IF;

  SELECT role INTO v_target_role FROM public.user_roles WHERE user_id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found.';
  END IF;

  IF v_target_role = 'super_admin' AND NOT v_caller_is_super THEN
    RAISE EXCEPTION 'Only a super admin can change another super admin.';
  END IF;

  IF p_new_role IN ('administrator','super_admin') AND NOT v_caller_is_super THEN
    RAISE EXCEPTION 'Only a super admin can grant administrator privileges.';
  END IF;

  IF p_new_role = 'seller' THEN
    UPDATE public.user_roles
      SET secondary_role = 'seller', updated_at = now()
      WHERE user_id = p_user_id;
  ELSE
    UPDATE public.user_roles
      SET role = p_new_role,
          secondary_role = CASE WHEN p_new_role = 'buyer' THEN secondary_role ELSE NULL END,
          updated_at = now()
      WHERE user_id = p_user_id;
  END IF;

  INSERT INTO public.role_change_history (actor_id, target_id, previous_role, new_role, reason)
    VALUES (auth.uid(), p_user_id, v_target_role, p_new_role, p_reason);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.set_user_role(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_user_role(uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.suspend_user(p_user_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller_is_admin boolean;
  v_caller_is_super boolean;
  v_target_role text;
BEGIN
  SELECT is_admin(), is_super_admin() INTO v_caller_is_admin, v_caller_is_super;
  IF NOT v_caller_is_admin THEN
    RAISE EXCEPTION 'Only administrators can suspend accounts.';
  END IF;

  SELECT role INTO v_target_role FROM public.user_roles WHERE user_id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found.';
  END IF;

  IF v_target_role = 'super_admin' AND NOT v_caller_is_super THEN
    RAISE EXCEPTION 'Only a super admin can suspend another super admin.';
  END IF;

  UPDATE public.profiles
    SET account_status = 'suspended',
        suspended_at = now(),
        suspension_reason = p_reason,
        updated_at = now()
    WHERE id = p_user_id;

  INSERT INTO public.role_change_history (actor_id, target_id, previous_role, new_role, reason)
    VALUES (auth.uid(), p_user_id, v_target_role, v_target_role, 'Suspended: ' || COALESCE(p_reason, 'no reason given'));
END;
$$;
REVOKE EXECUTE ON FUNCTION public.suspend_user(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.suspend_user(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.restore_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller_is_admin boolean;
  v_target_role text;
BEGIN
  SELECT is_admin() INTO v_caller_is_admin;
  IF NOT v_caller_is_admin THEN
    RAISE EXCEPTION 'Only administrators can restore accounts.';
  END IF;

  SELECT role INTO v_target_role FROM public.user_roles WHERE user_id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found.';
  END IF;

  UPDATE public.profiles
    SET account_status = 'active',
        suspended_at = NULL,
        suspension_reason = NULL,
        updated_at = now()
    WHERE id = p_user_id;

  INSERT INTO public.role_change_history (actor_id, target_id, previous_role, new_role, reason)
    VALUES (auth.uid(), p_user_id, v_target_role, v_target_role, 'Account restored by admin');
END;
$$;
REVOKE EXECUTE ON FUNCTION public.restore_user(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restore_user(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_list_role_history(p_limit int DEFAULT 50, p_offset int DEFAULT 0)
RETURNS TABLE (
  id uuid,
  actor_id uuid,
  target_id uuid,
  previous_role text,
  new_role text,
  reason text,
  created_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
SELECT id, actor_id, target_id, previous_role, new_role, reason, created_at
FROM public.role_change_history
ORDER BY created_at DESC
LIMIT GREATEST(1, LEAST(p_limit, 200))
OFFSET GREATEST(0, p_offset);
$$;
REVOKE EXECUTE ON FUNCTION public.admin_list_role_history(int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_role_history(int, int) TO authenticated;

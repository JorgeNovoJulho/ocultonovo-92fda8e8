
-- Fix search_path on functions using p_user_id parameter naming
-- Must use the exact original parameter names to avoid signature conflict

-- is_admin_master with p_user_id signature
CREATE OR REPLACE FUNCTION public.is_admin_master(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = p_user_id
      AND role::text = 'admin_master'
  );
$$;

-- get_admin_role with p_user_id signature
CREATE OR REPLACE FUNCTION public.get_admin_role(p_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role::text
  FROM public.user_roles
  WHERE user_id = p_user_id
    AND role::text IN ('admin_master', 'admin_regional', 'moderator')
  LIMIT 1;
$$;

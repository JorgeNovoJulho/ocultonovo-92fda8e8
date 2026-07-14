-- Garante que public.is_admin_master() (sem args) exista e funcione
CREATE OR REPLACE FUNCTION public.is_admin_master()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role::text = 'admin_master'
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_admin_master() TO authenticated, anon, service_role;

-- Força reload do schema cache do PostgREST
NOTIFY pgrst, 'reload schema';
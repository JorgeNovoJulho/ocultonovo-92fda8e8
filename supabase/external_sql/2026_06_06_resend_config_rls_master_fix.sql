-- Fix RLS de public.resend_config para aceitar o Master Admin
-- (por username 'ocultomaster' OU email master OU role admin_master).
-- Idempotente. Executar no SQL Editor do Supabase EXTERNO (rvybbrkzmboqbhcemqar).

-- 1) Helper unificado: é master admin?
CREATE OR REPLACE FUNCTION public.is_resend_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(
      lower(coalesce(auth.jwt() ->> 'email','')) = 'ocultomaster@ocultoswing.com.br',
      false
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND lower(coalesce(p.username,'')) = 'ocultomaster'
    )
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('admin_master','admin_regional')
    );
$$;

GRANT EXECUTE ON FUNCTION public.is_resend_admin() TO authenticated;

-- 2) Garante tabela com RLS habilitada
ALTER TABLE public.resend_config ENABLE ROW LEVEL SECURITY;

-- 3) Recria política única e abrangente
DROP POLICY IF EXISTS "Master admin can manage resend config" ON public.resend_config;
DROP POLICY IF EXISTS "resend_config_master_all" ON public.resend_config;
DROP POLICY IF EXISTS "resend_config_master_select" ON public.resend_config;

CREATE POLICY "resend_config_master_all" ON public.resend_config
  FOR ALL TO authenticated
  USING (public.is_resend_admin())
  WITH CHECK (public.is_resend_admin());

-- 4) Garante grants Data API
GRANT SELECT, INSERT, UPDATE, DELETE ON public.resend_config TO authenticated;
GRANT ALL ON public.resend_config TO service_role;

-- 5) Recarrega cache do PostgREST
NOTIFY pgrst, 'reload schema';

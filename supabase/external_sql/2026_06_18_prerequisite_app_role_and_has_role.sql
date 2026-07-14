-- =====================================================================
-- 2026-06-18 — PRÉ-REQUISITO: app_role, user_roles, has_role, is_admin
-- Idempotente. Rode ANTES do security_scan_fixes_v4 se der erro
-- "function public.has_role does not exist".
-- Cole INTEIRO no SQL Editor do Supabase EXTERNO e execute.
-- =====================================================================

-- 1) Tipo app_role (idempotente via DO block)
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin_master', 'admin_regional', 'moderator');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2) Tabela user_roles (com GRANTs obrigatórios)
CREATE TABLE IF NOT EXISTS public.user_roles (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role       public.app_role NOT NULL,
  granted_by uuid REFERENCES auth.users(id),
  granted_at timestamptz DEFAULT now(),
  UNIQUE (user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_roles_own_read" ON public.user_roles;
CREATE POLICY "user_roles_own_read"
  ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "user_roles_admin_all" ON public.user_roles;
CREATE POLICY "user_roles_admin_all"
  ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin_master'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin_master'::public.app_role));

-- 3) has_role (SECURITY DEFINER para evitar recursão RLS)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO anon, authenticated, service_role;

-- 4) is_admin (alias para qualquer role administrativa)
CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('admin_master', 'admin_regional', 'moderator')
  )
$$;

GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO anon, authenticated, service_role;

-- 5) is_admin_master (alias específico)
CREATE OR REPLACE FUNCTION public.is_admin_master(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'admin_master'
  )
$$;

GRANT EXECUTE ON FUNCTION public.is_admin_master(uuid) TO anon, authenticated, service_role;

-- 6) Índice útil
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON public.user_roles(user_id);

NOTIFY pgrst, 'reload schema';

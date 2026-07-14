-- =====================================================================
-- Fix RLS oculto_master_alert_settings — aceita Master por username
-- (oculto_master / ocultomaster) OU por role admin_master.
-- Também garante role admin_master no user_roles para o(s) perfil(is) master.
-- Idempotente. Cole no SQL Editor do Supabase EXTERNO.
-- =====================================================================

-- 1) Helper robusto (NÃO referencia colunas inexistentes em profiles).
CREATE OR REPLACE FUNCTION public.is_master_admin_user(_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    _uid IS NOT NULL
    AND (
      EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE (p.id = _uid OR p.user_id = _uid)
          AND lower(regexp_replace(coalesce(p.username,''), '[\s_\-.]+', '', 'g')) = 'ocultomaster'
      )
      OR EXISTS (
        SELECT 1 FROM auth.users u
        WHERE u.id = _uid
          AND lower(coalesce(u.email,'')) = 'ocultomaster@ocultoswing.com.br'
      )
      OR EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = _uid
          AND ur.role::text IN ('admin_master','admin_regional')
      )
    );
$$;

GRANT EXECUTE ON FUNCTION public.is_master_admin_user(uuid) TO authenticated, anon, service_role;

-- 2) Recria policies usando o helper (aceita username OU role).
DO $$
DECLARE r RECORD;
BEGIN
  IF to_regclass('public.oculto_master_alert_settings') IS NOT NULL THEN
    FOR r IN
      SELECT policyname FROM pg_policies
       WHERE schemaname='public' AND tablename='oculto_master_alert_settings'
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.oculto_master_alert_settings', r.policyname);
    END LOOP;

    EXECUTE 'ALTER TABLE public.oculto_master_alert_settings ENABLE ROW LEVEL SECURITY';

    EXECUTE $p$
      CREATE POLICY "oculto_master_alert_settings_admin_all"
        ON public.oculto_master_alert_settings
        FOR ALL
        TO authenticated
        USING (public.is_master_admin_user(auth.uid()))
        WITH CHECK (public.is_master_admin_user(auth.uid()))
    $p$;
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.oculto_master_alert_settings TO authenticated;
GRANT ALL ON public.oculto_master_alert_settings TO service_role;

-- 3) Garante singleton para UPSERT funcionar.
INSERT INTO public.oculto_master_alert_settings (id)
VALUES ('singleton')
ON CONFLICT (id) DO NOTHING;

-- 4) Garante role admin_master no user_roles para o(s) perfil(is) master.
DO $$
DECLARE u_id uuid;
BEGIN
  FOR u_id IN
    SELECT DISTINCT COALESCE(p.user_id, p.id)
      FROM public.profiles p
     WHERE lower(regexp_replace(coalesce(p.username,''), '[\s_\-.]+', '', 'g')) = 'ocultomaster'
  LOOP
    BEGIN
      INSERT INTO public.user_roles (user_id, role)
      VALUES (u_id, 'admin_master'::public.app_role)
      ON CONFLICT (user_id, role) DO NOTHING;
    EXCEPTION WHEN OTHERS THEN
      -- ignora se enum/coluna divergir; helper continua aceitando por username
      NULL;
    END;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

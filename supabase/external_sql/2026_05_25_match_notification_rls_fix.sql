-- ============================================================================
-- FIX RLS — match notification system
-- Permitir uploads/edição também quando o usuário for o Master Admin
-- identificado pelo EMAIL (ocultomaster@ocultoswing.com.br), além de
-- admin_master / admin_regional via user_roles.
-- Idempotente. Rodar no SQL Editor do Supabase externo (rvybbrkzmboqbhcemqar).
-- ============================================================================

-- Helper: é admin (por role OU por email master)?
CREATE OR REPLACE FUNCTION public.is_match_sounds_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(
      (SELECT lower(coalesce(auth.jwt() ->> 'email','')) = 'ocultomaster@ocultoswing.com.br'),
      false
    )
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('admin_master','admin_regional')
    );
$$;

GRANT EXECUTE ON FUNCTION public.is_match_sounds_admin() TO authenticated;

-- ===== storage.objects (bucket match-sounds) =====
DROP POLICY IF EXISTS "match_sounds_master_write"  ON storage.objects;
DROP POLICY IF EXISTS "match_sounds_master_update" ON storage.objects;
DROP POLICY IF EXISTS "match_sounds_master_delete" ON storage.objects;

CREATE POLICY "match_sounds_master_write" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'match-sounds' AND public.is_match_sounds_admin());

CREATE POLICY "match_sounds_master_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'match-sounds' AND public.is_match_sounds_admin())
  WITH CHECK (bucket_id = 'match-sounds' AND public.is_match_sounds_admin());

CREATE POLICY "match_sounds_master_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'match-sounds' AND public.is_match_sounds_admin());

-- ===== public.oculto_match_sounds =====
DROP POLICY IF EXISTS "match_sounds_master_insert" ON public.oculto_match_sounds;
DROP POLICY IF EXISTS "match_sounds_master_delete" ON public.oculto_match_sounds;
DROP POLICY IF EXISTS "match_sounds_master_update" ON public.oculto_match_sounds;

CREATE POLICY "match_sounds_master_insert" ON public.oculto_match_sounds
  FOR INSERT TO authenticated
  WITH CHECK (public.is_match_sounds_admin());

CREATE POLICY "match_sounds_master_update" ON public.oculto_match_sounds
  FOR UPDATE TO authenticated
  USING (public.is_match_sounds_admin())
  WITH CHECK (public.is_match_sounds_admin());

CREATE POLICY "match_sounds_master_delete" ON public.oculto_match_sounds
  FOR DELETE TO authenticated
  USING (public.is_match_sounds_admin());

-- ===== public.oculto_match_notification_settings =====
DROP POLICY IF EXISTS "match_settings_master_update" ON public.oculto_match_notification_settings;

CREATE POLICY "match_settings_master_update" ON public.oculto_match_notification_settings
  FOR UPDATE TO authenticated
  USING (public.is_match_sounds_admin())
  WITH CHECK (public.is_match_sounds_admin());

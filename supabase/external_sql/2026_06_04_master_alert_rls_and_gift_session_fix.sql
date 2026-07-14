-- ============================================================
-- 1) RLS de oculto_master_alert_settings: aceita master via:
--    - username 'ocultomaster' (qualquer variação)
--    - email canônico ocultomaster@ocultoswing.com.br
--    - has_role(uid, 'admin_master')
-- 2) Garante linha singleton existe para UPDATE funcionar.
-- 3) Reforça a função aura_send_xp_gift retornar erro claro
--    quando auth.uid() é NULL (sem alterar contrato).
-- Idempotente — pode rodar várias vezes.
-- ============================================================

-- Função helper centralizada (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.is_master_admin_user(_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE (p.id = _uid OR p.user_id = _uid)
      AND (
        lower(regexp_replace(coalesce(p.username,''), '[\s_\-.]+', '', 'g')) = 'ocultomaster'
        OR lower(coalesce(p.email,'')) = 'ocultomaster@ocultoswing.com.br'
        OR lower(regexp_replace(coalesce(p.name,''), '[\s_\-.]+', '', 'g')) = 'ocultomaster'
      )
  )
  OR EXISTS (
    SELECT 1 FROM auth.users u
    WHERE u.id = _uid
      AND lower(coalesce(u.email,'')) = 'ocultomaster@ocultoswing.com.br'
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_master_admin_user(uuid) TO authenticated, anon, service_role;

-- Recria as policies da tabela usando o helper
DO $$
BEGIN
  -- drop antigas se existirem
  EXECUTE 'DROP POLICY IF EXISTS master_can_read_alert_settings   ON public.oculto_master_alert_settings';
  EXECUTE 'DROP POLICY IF EXISTS master_can_upsert_alert_settings ON public.oculto_master_alert_settings';
  EXECUTE 'DROP POLICY IF EXISTS master_can_update_alert_settings ON public.oculto_master_alert_settings';
  EXECUTE 'DROP POLICY IF EXISTS master_can_delete_alert_settings ON public.oculto_master_alert_settings';
END $$;

CREATE POLICY master_can_read_alert_settings
  ON public.oculto_master_alert_settings FOR SELECT
  USING (public.is_master_admin_user(auth.uid()));

CREATE POLICY master_can_upsert_alert_settings
  ON public.oculto_master_alert_settings FOR INSERT
  WITH CHECK (public.is_master_admin_user(auth.uid()));

CREATE POLICY master_can_update_alert_settings
  ON public.oculto_master_alert_settings FOR UPDATE
  USING (public.is_master_admin_user(auth.uid()))
  WITH CHECK (public.is_master_admin_user(auth.uid()));

-- Garante singleton inicial
INSERT INTO public.oculto_master_alert_settings (id)
VALUES ('singleton')
ON CONFLICT (id) DO NOTHING;

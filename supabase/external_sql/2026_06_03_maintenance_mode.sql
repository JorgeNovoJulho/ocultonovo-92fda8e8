-- ============================================================================
-- MAINTENANCE MODE — Modo Manutenção controlado pelo Admin Master
-- Cole no SQL Editor do Supabase EXTERNO (rvybbrkzmboqbhcemqar).
-- Idempotente. Não destrutivo. Reaproveita platform_runtime_settings.
-- ============================================================================

-- 1) Campos auxiliares de manutenção em platform_runtime_settings
ALTER TABLE public.platform_runtime_settings
  ADD COLUMN IF NOT EXISTS maintenance_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS maintenance_message text NOT NULL DEFAULT
    'O Oculto está em manutenção rápida para melhorias. Voltaremos em instantes.',
  ADD COLUMN IF NOT EXISTS maintenance_allowed_admin_username text NOT NULL DEFAULT 'ocultomaster',
  ADD COLUMN IF NOT EXISTS maintenance_started_at  timestamptz,
  ADD COLUMN IF NOT EXISTS maintenance_finished_at timestamptz,
  ADD COLUMN IF NOT EXISTS force_logout_version    integer NOT NULL DEFAULT 0;

-- 2) Tabela de auditoria isolada (prefixo oculto_)
CREATE TABLE IF NOT EXISTS public.oculto_maintenance_audit (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action      text NOT NULL CHECK (action IN ('enable','disable','force_logout','blocked_user','reopen','error')),
  actor_user_id uuid,
  meta        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.oculto_maintenance_audit TO authenticated;
GRANT ALL ON public.oculto_maintenance_audit TO service_role;

ALTER TABLE public.oculto_maintenance_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "oculto_maintenance_audit_select_master" ON public.oculto_maintenance_audit;
CREATE POLICY "oculto_maintenance_audit_select_master"
  ON public.oculto_maintenance_audit FOR SELECT
  USING (public.has_role(auth.uid(), 'admin_master'));

DROP POLICY IF EXISTS "oculto_maintenance_audit_insert_self" ON public.oculto_maintenance_audit;
CREATE POLICY "oculto_maintenance_audit_insert_self"
  ON public.oculto_maintenance_audit FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_oculto_maintenance_audit_created
  ON public.oculto_maintenance_audit (created_at DESC);

-- 3) RPC pública leve — estado atual de manutenção (todos podem ler)
CREATE OR REPLACE FUNCTION public.get_maintenance_state()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'enabled', coalesce(s.maintenance_enabled, false),
    'message', s.maintenance_message,
    'force_logout_version', coalesce(s.force_logout_version, 0),
    'started_at', s.maintenance_started_at,
    'finished_at', s.maintenance_finished_at,
    'allowed_admin_username', s.maintenance_allowed_admin_username
  )
  FROM public.platform_runtime_settings s
  ORDER BY s.created_at ASC LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_maintenance_state() TO anon, authenticated;

-- 4) RPC: ativar / desativar manutenção (somente master)
CREATE OR REPLACE FUNCTION public.set_maintenance(p_enabled boolean, p_message text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.platform_runtime_settings;
BEGIN
  IF v_uid IS NULL OR NOT public.has_role(v_uid, 'admin_master') THEN
    RAISE EXCEPTION 'forbidden: only admin_master can toggle maintenance';
  END IF;

  UPDATE public.platform_runtime_settings
     SET maintenance_enabled  = p_enabled,
         maintenance_message  = COALESCE(NULLIF(p_message,''), maintenance_message),
         maintenance_started_at  = CASE WHEN p_enabled AND maintenance_started_at IS NULL THEN now()
                                        WHEN p_enabled THEN maintenance_started_at
                                        ELSE maintenance_started_at END,
         maintenance_finished_at = CASE WHEN p_enabled THEN NULL ELSE now() END,
         force_logout_version    = CASE WHEN p_enabled THEN coalesce(force_logout_version,0) + 1
                                        ELSE coalesce(force_logout_version,0) END,
         updated_at = now()
   WHERE id = (SELECT id FROM public.platform_runtime_settings ORDER BY created_at ASC LIMIT 1)
   RETURNING * INTO v_row;

  INSERT INTO public.oculto_maintenance_audit (action, actor_user_id, meta)
  VALUES (
    CASE WHEN p_enabled THEN 'enable' ELSE 'disable' END,
    v_uid,
    jsonb_build_object('message', v_row.maintenance_message,
                       'force_logout_version', v_row.force_logout_version)
  );

  RETURN public.get_maintenance_state();
END $$;

GRANT EXECUTE ON FUNCTION public.set_maintenance(boolean, text) TO authenticated;

-- 5) RPC: forçar logout geral (incrementa versão sem alterar enabled)
CREATE OR REPLACE FUNCTION public.force_logout_all()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR NOT public.has_role(v_uid, 'admin_master') THEN
    RAISE EXCEPTION 'forbidden: only admin_master can force logout';
  END IF;

  UPDATE public.platform_runtime_settings
     SET force_logout_version = coalesce(force_logout_version,0) + 1,
         updated_at = now()
   WHERE id = (SELECT id FROM public.platform_runtime_settings ORDER BY created_at ASC LIMIT 1);

  INSERT INTO public.oculto_maintenance_audit (action, actor_user_id, meta)
  VALUES ('force_logout', v_uid, '{}'::jsonb);

  RETURN public.get_maintenance_state();
END $$;

GRANT EXECUTE ON FUNCTION public.force_logout_all() TO authenticated;

-- 6) Garantir realtime (já costuma estar; idempotente)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname='supabase_realtime' AND tablename='platform_runtime_settings'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.platform_runtime_settings;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

ALTER TABLE public.platform_runtime_settings REPLICA IDENTITY FULL;

NOTIFY pgrst, 'reload schema';

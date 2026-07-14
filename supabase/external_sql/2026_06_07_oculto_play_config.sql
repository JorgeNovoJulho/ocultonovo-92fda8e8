-- ============================================================================
-- OCULTO PLAY — Etapa 2: Feature flag oculta + gate de acesso
-- Cole no SQL Editor do Supabase EXTERNO (rvybbrkzmboqbhcemqar).
-- 100% idempotente. NÃO cria nada visível para usuários comuns.
-- Apenas:
--   1) Cria tabela singleton oculto_play_config (flag global)
--   2) Cria RPC can_access_oculto_play() que retorna true SOMENTE para o
--      Admin Master OU usuários explicitamente liberados (allowlist)
--   3) Cria tabela oculto_play_allowlist para testes futuros
--   4) Registra realtime para o config
-- Nenhuma tabela de conteúdo do Play é criada nesta etapa.
-- ============================================================================

-- 1) Singleton config
CREATE TABLE IF NOT EXISTS public.oculto_play_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enabled            boolean NOT NULL DEFAULT false,  -- killswitch global
  visible_to_users   boolean NOT NULL DEFAULT false,  -- expor para usuários comuns
  beta_open          boolean NOT NULL DEFAULT false,  -- liberar para todo mundo em beta
  short_videos_on    boolean NOT NULL DEFAULT true,
  memes_on           boolean NOT NULL DEFAULT true,
  audios_on          boolean NOT NULL DEFAULT true,
  vip_teasers_on     boolean NOT NULL DEFAULT true,
  communities_on     boolean NOT NULL DEFAULT true,
  challenges_on      boolean NOT NULL DEFAULT true,
  gamification_on    boolean NOT NULL DEFAULT true,
  today_section_on   boolean NOT NULL DEFAULT true,
  comeback_section_on boolean NOT NULL DEFAULT true,
  notes text,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- garante 1 linha singleton
INSERT INTO public.oculto_play_config (enabled, visible_to_users)
SELECT false, false
WHERE NOT EXISTS (SELECT 1 FROM public.oculto_play_config);

GRANT SELECT ON public.oculto_play_config TO authenticated;
GRANT ALL ON public.oculto_play_config TO service_role;

ALTER TABLE public.oculto_play_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "oculto_play_config_select_auth" ON public.oculto_play_config;
CREATE POLICY "oculto_play_config_select_auth"
  ON public.oculto_play_config FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "oculto_play_config_master_write" ON public.oculto_play_config;
CREATE POLICY "oculto_play_config_master_write"
  ON public.oculto_play_config FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin_master')
    OR EXISTS (SELECT 1 FROM public.profiles p
                WHERE p.user_id = auth.uid()
                  AND COALESCE(p.is_admin, false) = true)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin_master')
    OR EXISTS (SELECT 1 FROM public.profiles p
                WHERE p.user_id = auth.uid()
                  AND COALESCE(p.is_admin, false) = true)
  );

-- trigger updated_at
CREATE OR REPLACE FUNCTION public._touch_oculto_play_config()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_touch_oculto_play_config ON public.oculto_play_config;
CREATE TRIGGER trg_touch_oculto_play_config
  BEFORE UPDATE ON public.oculto_play_config
  FOR EACH ROW EXECUTE FUNCTION public._touch_oculto_play_config();

-- 2) Allowlist (testers individuais antes do beta público)
CREATE TABLE IF NOT EXISTS public.oculto_play_allowlist (
  user_id uuid PRIMARY KEY,
  added_by uuid,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.oculto_play_allowlist TO authenticated;
GRANT ALL ON public.oculto_play_allowlist TO service_role;

ALTER TABLE public.oculto_play_allowlist ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "oculto_play_allowlist_self_read" ON public.oculto_play_allowlist;
CREATE POLICY "oculto_play_allowlist_self_read"
  ON public.oculto_play_allowlist FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin_master')
  );

DROP POLICY IF EXISTS "oculto_play_allowlist_master_write" ON public.oculto_play_allowlist;
CREATE POLICY "oculto_play_allowlist_master_write"
  ON public.oculto_play_allowlist FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin_master'))
  WITH CHECK (public.has_role(auth.uid(), 'admin_master'));

-- 3) RPCs públicas (leves)
CREATE OR REPLACE FUNCTION public.get_oculto_play_config()
RETURNS public.oculto_play_config
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM public.oculto_play_config ORDER BY created_at ASC LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.get_oculto_play_config() TO authenticated;

-- Gate principal — usado no frontend e em RPCs futuras
CREATE OR REPLACE FUNCTION public.can_access_oculto_play()
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  r public.oculto_play_config;
BEGIN
  IF v_uid IS NULL THEN RETURN false; END IF;

  -- Master sempre vê (modo preview)
  IF public.has_role(v_uid, 'admin_master') THEN RETURN true; END IF;

  SELECT * INTO r FROM public.oculto_play_config ORDER BY created_at LIMIT 1;
  IF r IS NULL OR COALESCE(r.enabled, false) = false THEN RETURN false; END IF;

  -- Allowlist explícita
  IF EXISTS (SELECT 1 FROM public.oculto_play_allowlist WHERE user_id = v_uid) THEN
    RETURN true;
  END IF;

  -- Beta aberto (todo mundo logado)
  IF COALESCE(r.beta_open, false) = true THEN RETURN true; END IF;

  -- Visibilidade pública (lançamento)
  RETURN COALESCE(r.visible_to_users, false);
END $$;

GRANT EXECUTE ON FUNCTION public.can_access_oculto_play() TO authenticated;

-- 4) Realtime
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname='supabase_realtime' AND tablename='oculto_play_config'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.oculto_play_config;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

ALTER TABLE public.oculto_play_config REPLICA IDENTITY FULL;

NOTIFY pgrst, 'reload schema';

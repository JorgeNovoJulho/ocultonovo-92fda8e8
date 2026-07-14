-- ============================================================
-- ETAPA 3 — MODOS DE VISUALIZAÇÃO DO FEED
-- Externo: rvybbrkzmboqbhcemqar.supabase.co
-- Idempotente: pode rodar várias vezes sem efeito colateral
-- ============================================================

-- 1. Coluna feed_mode em profiles -----------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS feed_mode text NOT NULL DEFAULT 'completo';

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_feed_mode_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_feed_mode_check
  CHECK (feed_mode IN ('completo','social','descoberta','limpo','card'));

-- 2. Tabela de configuração admin -----------------------------
CREATE TABLE IF NOT EXISTS public.oculto_feed_modes_config (
  mode_id     text PRIMARY KEY,
  label       text NOT NULL,
  description text,
  enabled     boolean NOT NULL DEFAULT true,
  min_plan    text NOT NULL DEFAULT 'free' CHECK (min_plan IN ('free','premium','vip')),
  sort_order  int  NOT NULL DEFAULT 0,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.oculto_feed_modes_config TO anon, authenticated;
GRANT ALL    ON public.oculto_feed_modes_config TO service_role;

ALTER TABLE public.oculto_feed_modes_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "feed_modes_config_read_all"     ON public.oculto_feed_modes_config;
DROP POLICY IF EXISTS "feed_modes_config_master_write" ON public.oculto_feed_modes_config;

CREATE POLICY "feed_modes_config_read_all"
  ON public.oculto_feed_modes_config FOR SELECT USING (true);

CREATE POLICY "feed_modes_config_master_write"
  ON public.oculto_feed_modes_config FOR ALL
  USING (public._is_master_admin(auth.uid()))
  WITH CHECK (public._is_master_admin(auth.uid()));

-- 3. Seed dos 5 modos default ---------------------------------
INSERT INTO public.oculto_feed_modes_config (mode_id, label, description, enabled, min_plan, sort_order) VALUES
  ('completo',   'Completo',   'Experiência total: tudo do feed',                 true, 'free', 0),
  ('social',     'Social',     'Foco em pessoas: stories, presença e matches',    true, 'free', 1),
  ('descoberta', 'Descoberta', 'Descobrir perfis: radar, VIP e salas',            true, 'free', 2),
  ('limpo',      'Limpo',      'Só posts, sem distrações',                        true, 'free', 3),
  ('card',       'Card',       'Layout em grade de cards',                        true, 'free', 4)
ON CONFLICT (mode_id) DO NOTHING;

-- 4. RPC: set_feed_mode ---------------------------------------
CREATE OR REPLACE FUNCTION public.set_feed_mode(p_mode text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_cfg record;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_cfg FROM public.oculto_feed_modes_config WHERE mode_id = p_mode;
  IF NOT FOUND OR NOT v_cfg.enabled THEN
    RAISE EXCEPTION 'mode_not_available';
  END IF;

  UPDATE public.profiles
     SET feed_mode = p_mode
   WHERE id = v_uid OR user_id = v_uid;

  RETURN p_mode;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_feed_mode(text) TO authenticated;

-- 5. Realtime para reagir a mudanças admin --------------------
ALTER PUBLICATION supabase_realtime ADD TABLE public.oculto_feed_modes_config;

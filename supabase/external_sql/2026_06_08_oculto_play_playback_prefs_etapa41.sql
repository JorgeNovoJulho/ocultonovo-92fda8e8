-- =====================================================================
-- Etapa 41 — Oculto Play: Velocidade variável + Sleep Timer
-- Persiste preferências de playback por usuário (velocidade, sleep_minutes
-- padrão) para sincronizar entre dispositivos.
-- Externo: rvybbrkzmboqbhcemqar
-- Idempotente.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.oculto_play_playback_prefs (
  user_id          uuid PRIMARY KEY,
  playback_rate    numeric(3,2) NOT NULL DEFAULT 1.00 CHECK (playback_rate >= 0.25 AND playback_rate <= 3.00),
  sleep_minutes    integer      NOT NULL DEFAULT 0    CHECK (sleep_minutes >= 0 AND sleep_minutes <= 240),
  auto_sleep       boolean      NOT NULL DEFAULT false,
  updated_at       timestamptz  NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.oculto_play_playback_prefs TO authenticated;
GRANT ALL ON public.oculto_play_playback_prefs TO service_role;

ALTER TABLE public.oculto_play_playback_prefs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='oculto_play_playback_prefs' AND policyname='pbp_select_own') THEN
    CREATE POLICY pbp_select_own ON public.oculto_play_playback_prefs
      FOR SELECT TO authenticated USING (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='oculto_play_playback_prefs' AND policyname='pbp_upsert_own') THEN
    CREATE POLICY pbp_upsert_own ON public.oculto_play_playback_prefs
      FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='oculto_play_playback_prefs' AND policyname='pbp_update_own') THEN
    CREATE POLICY pbp_update_own ON public.oculto_play_playback_prefs
      FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='oculto_play_playback_prefs' AND policyname='pbp_delete_own') THEN
    CREATE POLICY pbp_delete_own ON public.oculto_play_playback_prefs
      FOR DELETE TO authenticated USING (user_id = auth.uid());
  END IF;
END $$;

-- RPC upsert seguro
CREATE OR REPLACE FUNCTION public.oculto_play_save_playback_prefs(
  p_playback_rate numeric DEFAULT NULL,
  p_sleep_minutes integer DEFAULT NULL,
  p_auto_sleep    boolean DEFAULT NULL
)
RETURNS public.oculto_play_playback_prefs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.oculto_play_playback_prefs;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  INSERT INTO public.oculto_play_playback_prefs (user_id, playback_rate, sleep_minutes, auto_sleep, updated_at)
  VALUES (
    v_uid,
    COALESCE(p_playback_rate, 1.00),
    COALESCE(p_sleep_minutes, 0),
    COALESCE(p_auto_sleep, false),
    now()
  )
  ON CONFLICT (user_id) DO UPDATE
    SET playback_rate = COALESCE(p_playback_rate, public.oculto_play_playback_prefs.playback_rate),
        sleep_minutes = COALESCE(p_sleep_minutes, public.oculto_play_playback_prefs.sleep_minutes),
        auto_sleep    = COALESCE(p_auto_sleep,    public.oculto_play_playback_prefs.auto_sleep),
        updated_at    = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.oculto_play_save_playback_prefs(numeric, integer, boolean) TO authenticated;

-- RPC leitura
CREATE OR REPLACE FUNCTION public.oculto_play_get_playback_prefs()
RETURNS public.oculto_play_playback_prefs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.oculto_play_playback_prefs;
BEGIN
  IF v_uid IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT * INTO v_row FROM public.oculto_play_playback_prefs WHERE user_id = v_uid;
  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.oculto_play_get_playback_prefs() TO authenticated;

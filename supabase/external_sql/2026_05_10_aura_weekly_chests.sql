-- =====================================================================
-- Aura Match v2 — Bloco F: Cofres Semanais
-- O usuário pode reivindicar 1 cofre a cada 7 dias.
-- A recompensa escala com o nível atual: XP base + bônus por nível.
-- Tabela: oculto_aura_weekly_chests (1 linha por usuário+semana)
-- RPCs: aura_weekly_chest_status(), aura_weekly_chest_claim()
-- Idempotente.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.oculto_aura_weekly_chests (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL,
  week_key    text NOT NULL,           -- formato YYYY-WW (ISO week, America/Sao_Paulo)
  level_at_claim int  NOT NULL,
  xp_awarded  int  NOT NULL,
  super_dm_awarded int NOT NULL DEFAULT 0,
  claimed_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, week_key)
);

ALTER TABLE public.oculto_aura_weekly_chests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "weekly_chests_select_own" ON public.oculto_aura_weekly_chests;
CREATE POLICY "weekly_chests_select_own"
  ON public.oculto_aura_weekly_chests FOR SELECT
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_oculto_aura_weekly_chests_user_week
  ON public.oculto_aura_weekly_chests(user_id, week_key DESC);

-- helper: chave da semana ISO no fuso BR
CREATE OR REPLACE FUNCTION public.aura_current_week_key()
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT to_char((now() at time zone 'America/Sao_Paulo')::date, 'IYYY-IW');
$$;

-- status: já foi reivindicado nesta semana? quando libera o próximo?
CREATE OR REPLACE FUNCTION public.aura_weekly_chest_status()
RETURNS TABLE(
  week_key      text,
  claimed       boolean,
  claimed_at    timestamptz,
  next_claim_at timestamptz,
  level         int,
  xp_preview    int,
  super_dm_preview int
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_wk text := public.aura_current_week_key();
  v_row record;
  v_level int;
  v_xp_preview int;
  v_sdm_preview int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;

  SELECT aura_level INTO v_level FROM public.profiles WHERE user_id = v_uid;
  v_level := COALESCE(v_level, 1);

  -- recompensa: XP base 50 + 25 por nível (cap 500); Super DM grátis a cada 5 níveis
  v_xp_preview  := LEAST(500, 50 + (v_level - 1) * 25);
  v_sdm_preview := CASE WHEN v_level >= 5 THEN 1 ELSE 0 END
                 + CASE WHEN v_level >= 10 THEN 1 ELSE 0 END
                 + CASE WHEN v_level >= 20 THEN 1 ELSE 0 END;

  SELECT * INTO v_row FROM public.oculto_aura_weekly_chests
   WHERE user_id = v_uid AND week_key = v_wk
   ORDER BY claimed_at DESC LIMIT 1;

  week_key      := v_wk;
  claimed       := v_row.id IS NOT NULL;
  claimed_at    := v_row.claimed_at;
  next_claim_at := CASE
    WHEN v_row.id IS NULL THEN now()
    ELSE date_trunc('week', (now() at time zone 'America/Sao_Paulo'))::timestamptz + interval '7 days'
  END;
  level         := v_level;
  xp_preview    := v_xp_preview;
  super_dm_preview := v_sdm_preview;
  RETURN NEXT;
END;
$$;

-- claim: reivindica o cofre da semana atual (1 vez/semana)
CREATE OR REPLACE FUNCTION public.aura_weekly_chest_claim()
RETURNS TABLE(
  ok           boolean,
  message      text,
  xp_awarded   int,
  super_dm_awarded int,
  level        int,
  level_up     boolean
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_wk  text := public.aura_current_week_key();
  v_level int;
  v_xp int;
  v_sdm int;
  v_old_level int;
  v_new_level int;
  v_new_xp int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;

  IF EXISTS (SELECT 1 FROM public.oculto_aura_weekly_chests
              WHERE user_id = v_uid AND week_key = v_wk) THEN
    ok := false; message := 'Cofre desta semana já foi reivindicado';
    xp_awarded := 0; super_dm_awarded := 0;
    SELECT aura_level INTO level FROM public.profiles WHERE user_id = v_uid;
    level := COALESCE(level, 1); level_up := false;
    RETURN NEXT; RETURN;
  END IF;

  SELECT aura_level INTO v_level FROM public.profiles WHERE user_id = v_uid;
  v_level := COALESCE(v_level, 1);
  v_old_level := v_level;

  v_xp  := LEAST(500, 50 + (v_level - 1) * 25);
  v_sdm := CASE WHEN v_level >= 5 THEN 1 ELSE 0 END
         + CASE WHEN v_level >= 10 THEN 1 ELSE 0 END
         + CASE WHEN v_level >= 20 THEN 1 ELSE 0 END;

  INSERT INTO public.oculto_aura_weekly_chests
    (user_id, week_key, level_at_claim, xp_awarded, super_dm_awarded)
    VALUES (v_uid, v_wk, v_level, v_xp, v_sdm);

  UPDATE public.profiles
     SET aura_xp = GREATEST(0, aura_xp + v_xp),
         aura_level = public.aura_level_from_xp(GREATEST(0, aura_xp + v_xp))
   WHERE user_id = v_uid
   RETURNING aura_xp, aura_level INTO v_new_xp, v_new_level;

  ok := true;
  message := 'Cofre reivindicado!';
  xp_awarded := v_xp;
  super_dm_awarded := v_sdm;
  level := v_new_level;
  level_up := v_new_level > v_old_level;
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.aura_current_week_key() TO authenticated;
GRANT EXECUTE ON FUNCTION public.aura_weekly_chest_status() TO authenticated;
GRANT EXECUTE ON FUNCTION public.aura_weekly_chest_claim() TO authenticated;
NOTIFY pgrst, 'reload schema';

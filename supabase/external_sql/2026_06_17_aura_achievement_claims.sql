-- =====================================================================
-- Aura Match — Premiação de Conquistas (idempotente, persistente)
-- Cria tabela oculto_aura_achievement_claims e RPC aura_achievement_claim
-- que credita XP em profiles.aura_xp uma única vez por (user, achievement).
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.oculto_aura_achievement_claims (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  achievement_id  text NOT NULL,
  xp_awarded      integer NOT NULL DEFAULT 0,
  claimed_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, achievement_id)
);

GRANT SELECT, INSERT ON public.oculto_aura_achievement_claims TO authenticated;
GRANT ALL ON public.oculto_aura_achievement_claims TO service_role;

ALTER TABLE public.oculto_aura_achievement_claims ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own claims read"  ON public.oculto_aura_achievement_claims;
DROP POLICY IF EXISTS "own claims write" ON public.oculto_aura_achievement_claims;

CREATE POLICY "own claims read"
  ON public.oculto_aura_achievement_claims FOR SELECT
  TO authenticated USING (user_id = auth.uid());

CREATE POLICY "own claims write"
  ON public.oculto_aura_achievement_claims FOR INSERT
  TO authenticated WITH CHECK (user_id = auth.uid());

-- RPC: credita XP uma única vez por conquista. Retorna xp final.
CREATE OR REPLACE FUNCTION public.aura_achievement_claim(
  p_achievement_id text,
  p_xp_reward      integer
) RETURNS TABLE(awarded boolean, xp_total integer, level integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_existing int;
  v_new_xp int;
  v_new_level int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF p_achievement_id IS NULL OR length(trim(p_achievement_id)) = 0 THEN
    RAISE EXCEPTION 'achievement id required';
  END IF;
  IF p_xp_reward IS NULL OR p_xp_reward <= 0 THEN
    RAISE EXCEPTION 'xp reward must be positive';
  END IF;

  SELECT 1 INTO v_existing
    FROM public.oculto_aura_achievement_claims
   WHERE user_id = v_uid AND achievement_id = p_achievement_id;

  IF v_existing IS NOT NULL THEN
    SELECT aura_xp, aura_level INTO v_new_xp, v_new_level
      FROM public.profiles WHERE user_id = v_uid;
    awarded := false;
    xp_total := COALESCE(v_new_xp, 0);
    level    := COALESCE(v_new_level, 1);
    RETURN NEXT;
    RETURN;
  END IF;

  INSERT INTO public.oculto_aura_achievement_claims (user_id, achievement_id, xp_awarded)
    VALUES (v_uid, p_achievement_id, p_xp_reward);

  UPDATE public.profiles
     SET aura_xp    = GREATEST(0, COALESCE(aura_xp, 0) + p_xp_reward),
         aura_level = public.aura_level_from_xp(GREATEST(0, COALESCE(aura_xp, 0) + p_xp_reward))
   WHERE user_id = v_uid
   RETURNING aura_xp, aura_level INTO v_new_xp, v_new_level;

  awarded := true;
  xp_total := COALESCE(v_new_xp, 0);
  level    := COALESCE(v_new_level, 1);
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.aura_achievement_claim(text, integer) TO authenticated;

NOTIFY pgrst, 'reload schema';

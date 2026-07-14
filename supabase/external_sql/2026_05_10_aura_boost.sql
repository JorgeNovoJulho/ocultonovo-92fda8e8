-- =====================================================================
-- Aura Match v2 — Bloco G: Aura Boost (impulso de 1h)
-- Custo: 200 XP. Duração: 60 min. Cooldown: enquanto houver boost ativo.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.oculto_aura_boosts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL,
  activated_at timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  xp_spent     int NOT NULL DEFAULT 200
);

ALTER TABLE public.oculto_aura_boosts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "aura_boosts_select_all" ON public.oculto_aura_boosts;
CREATE POLICY "aura_boosts_select_all"
  ON public.oculto_aura_boosts FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_oculto_aura_boosts_active
  ON public.oculto_aura_boosts(user_id, expires_at DESC);

-- ativa boost (debita 200 XP)
CREATE OR REPLACE FUNCTION public.aura_boost_activate()
RETURNS TABLE(ok boolean, message text, expires_at timestamptz, xp int)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_xp int;
  v_expires timestamptz;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.oculto_aura_boosts
     WHERE user_id = v_uid AND expires_at > now()
  ) THEN
    ok := false; message := 'Você já tem um boost ativo';
    SELECT ob.expires_at INTO expires_at FROM public.oculto_aura_boosts ob
      WHERE ob.user_id = v_uid AND ob.expires_at > now()
      ORDER BY ob.expires_at DESC LIMIT 1;
    SELECT aura_xp INTO xp FROM public.profiles WHERE user_id = v_uid;
    RETURN NEXT; RETURN;
  END IF;

  SELECT aura_xp INTO v_xp FROM public.profiles WHERE user_id = v_uid;
  v_xp := COALESCE(v_xp, 0);
  IF v_xp < 200 THEN
    ok := false; message := 'XP insuficiente (precisa de 200)';
    expires_at := NULL; xp := v_xp;
    RETURN NEXT; RETURN;
  END IF;

  v_expires := now() + interval '60 minutes';

  UPDATE public.profiles
     SET aura_xp = aura_xp - 200,
         aura_level = public.aura_level_from_xp(GREATEST(0, aura_xp - 200))
   WHERE user_id = v_uid
   RETURNING aura_xp INTO v_xp;

  INSERT INTO public.oculto_aura_boosts (user_id, expires_at, xp_spent)
    VALUES (v_uid, v_expires, 200);

  ok := true; message := 'Boost ativado por 60 minutos';
  expires_at := v_expires; xp := v_xp;
  RETURN NEXT;
END;
$$;

-- status do meu boost
CREATE OR REPLACE FUNCTION public.aura_boost_my_status()
RETURNS TABLE(active boolean, expires_at timestamptz, xp int)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  SELECT ob.expires_at INTO expires_at FROM public.oculto_aura_boosts ob
    WHERE ob.user_id = v_uid AND ob.expires_at > now()
    ORDER BY ob.expires_at DESC LIMIT 1;
  active := expires_at IS NOT NULL;
  SELECT aura_xp INTO xp FROM public.profiles WHERE user_id = v_uid;
  xp := COALESCE(xp, 0);
  RETURN NEXT;
END;
$$;

-- lista user_ids com boost ativo (para destacar bolhas no Aura Match)
CREATE OR REPLACE FUNCTION public.aura_boost_active_users()
RETURNS TABLE(user_id uuid, expires_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  RETURN QUERY
    SELECT DISTINCT ON (b.user_id) b.user_id, b.expires_at
      FROM public.oculto_aura_boosts b
     WHERE b.expires_at > now()
     ORDER BY b.user_id, b.expires_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.aura_boost_activate()    TO authenticated;
GRANT EXECUTE ON FUNCTION public.aura_boost_my_status()   TO authenticated;
GRANT EXECUTE ON FUNCTION public.aura_boost_active_users() TO authenticated;
NOTIFY pgrst, 'reload schema';

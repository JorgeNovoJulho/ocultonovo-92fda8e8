-- ============================================================================
-- Recompensa de XP por tempo ativo em salas do Aura Match
-- Cada ciclo completo de ~10 min com atividade real = +10 XP em profiles.aura_xp
-- Anti-abuso: cooldown server-side de 9 min por (user_id, slug)
-- Idempotente: pode rodar várias vezes sem erros.
-- ============================================================================

-- 1) Log de bonificações
CREATE TABLE IF NOT EXISTS public.oculto_aura_room_active_xp_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL,
  slug        text NOT NULL,
  amount      integer NOT NULL DEFAULT 10,
  awarded_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_oculto_aura_room_active_xp_log_user_slug_at
  ON public.oculto_aura_room_active_xp_log (user_id, slug, awarded_at DESC);

ALTER TABLE public.oculto_aura_room_active_xp_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner can read own active xp log"
  ON public.oculto_aura_room_active_xp_log;
CREATE POLICY "owner can read own active xp log"
  ON public.oculto_aura_room_active_xp_log
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- 2) RPC: credita +10 XP por ciclo de 10 min ativo (com cooldown)
DROP FUNCTION IF EXISTS public.aura_room_award_active_xp(text);

CREATE OR REPLACE FUNCTION public.aura_room_award_active_xp(p_slug text)
RETURNS TABLE (ok boolean, reason text, new_xp integer, new_level smallint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid          uuid := auth.uid();
  v_last         timestamptz;
  v_has_xp       boolean;
  v_has_level_fn boolean;
  v_new_xp       integer;
  v_new_level    smallint := 0;
  v_amount       integer := 10;
BEGIN
  IF v_uid IS NULL THEN
    RETURN QUERY SELECT false, 'auth_required'::text, 0, 0::smallint;
    RETURN;
  END IF;

  IF p_slug IS NULL OR length(btrim(p_slug)) = 0 THEN
    RETURN QUERY SELECT false, 'invalid_slug'::text, 0, 0::smallint;
    RETURN;
  END IF;

  -- Cooldown 9 minutos por sala
  SELECT MAX(awarded_at) INTO v_last
    FROM public.oculto_aura_room_active_xp_log
   WHERE user_id = v_uid AND slug = p_slug;

  IF v_last IS NOT NULL AND now() - v_last < interval '9 minutes' THEN
    RETURN QUERY SELECT false, 'cooldown'::text, 0, 0::smallint;
    RETURN;
  END IF;

  -- Existe coluna profiles.aura_xp?
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='profiles' AND column_name='aura_xp'
  ) INTO v_has_xp;

  IF NOT v_has_xp THEN
    -- Sem coluna — apenas registra o evento e retorna ok=false silencioso
    INSERT INTO public.oculto_aura_room_active_xp_log(user_id, slug, amount)
      VALUES (v_uid, p_slug, v_amount);
    RETURN QUERY SELECT false, 'no_xp_column'::text, 0, 0::smallint;
    RETURN;
  END IF;

  -- Existe função aura_level_from_xp?
  SELECT EXISTS (
    SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.proname='aura_level_from_xp'
  ) INTO v_has_level_fn;

  IF v_has_level_fn THEN
    EXECUTE format($f$
      UPDATE public.profiles
         SET aura_xp = GREATEST(0, COALESCE(aura_xp,0) + %s),
             aura_level = public.aura_level_from_xp(GREATEST(0, COALESCE(aura_xp,0) + %s))
       WHERE user_id = %L
       RETURNING aura_xp, COALESCE(aura_level,0)
    $f$, v_amount, v_amount, v_uid)
    INTO v_new_xp, v_new_level;
  ELSE
    EXECUTE format($f$
      UPDATE public.profiles
         SET aura_xp = GREATEST(0, COALESCE(aura_xp,0) + %s)
       WHERE user_id = %L
       RETURNING aura_xp, 0::smallint
    $f$, v_amount, v_uid)
    INTO v_new_xp, v_new_level;
  END IF;

  INSERT INTO public.oculto_aura_room_active_xp_log(user_id, slug, amount)
    VALUES (v_uid, p_slug, v_amount);

  RETURN QUERY SELECT true, 'awarded'::text, COALESCE(v_new_xp, 0), COALESCE(v_new_level, 0::smallint);
END;
$$;

REVOKE ALL ON FUNCTION public.aura_room_award_active_xp(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.aura_room_award_active_xp(text) TO authenticated;

NOTIFY pgrst, 'reload schema';

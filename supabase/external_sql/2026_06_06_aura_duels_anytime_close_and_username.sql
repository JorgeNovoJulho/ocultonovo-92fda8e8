-- =====================================================================
-- Aura Duels — 2026-06-06
-- 1) Permite que QUALQUER lado encerre o duelo a qualquer momento
--    (pending OU accepted), independente de ter aceito o convite.
--    Quem encerra um pending sem disputa real => marca como 'resolved'
--    sem vencedor (sem premiação de 100 XP).
-- 2) aura_duels_my_list — retorna @username (NUNCA nome real)
-- Idempotente. Rodar no SQL Editor do Supabase EXTERNO.
-- =====================================================================

-- 1) Resolver/encerrar em qualquer status ativo ---------------------------
CREATE OR REPLACE FUNCTION public.aura_duel_resolve(p_duel uuid)
RETURNS TABLE(ok boolean, message text, winner_id uuid, challenger_xp int, opponent_xp int)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_d   record;
  v_c_xp int := 0;
  v_o_xp int := 0;
  v_winner uuid;
  v_has_history boolean;
  v_has_aura_xp boolean;
  v_has_level_fn boolean;
  v_compute boolean;
BEGIN
  IF v_uid IS NULL THEN
    RETURN QUERY SELECT false, 'Sessão expirada', NULL::uuid, 0, 0; RETURN;
  END IF;

  SELECT * INTO v_d FROM oculto_aura_duels WHERE id = p_duel FOR UPDATE;
  IF v_d.id IS NULL THEN
    RETURN QUERY SELECT false, 'Duelo não encontrado', NULL::uuid, 0, 0; RETURN;
  END IF;
  IF v_d.challenger_id <> v_uid AND v_d.opponent_id <> v_uid THEN
    RETURN QUERY SELECT false, 'Você não participa deste duelo', NULL::uuid, 0, 0; RETURN;
  END IF;
  IF v_d.status NOT IN ('pending','accepted') THEN
    RETURN QUERY SELECT false, 'Duelo já encerrado', v_d.winner_id, v_d.challenger_xp, v_d.opponent_xp; RETURN;
  END IF;

  -- Só computa vencedor real se o duelo foi aceito (disputa válida).
  v_compute := (v_d.status = 'accepted');

  IF v_compute THEN
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema='public' AND table_name='oculto_aura_quests_history'
    ) INTO v_has_history;

    IF v_has_history THEN
      EXECUTE 'SELECT COALESCE(SUM(xp_awarded),0) FROM oculto_aura_quests_history WHERE user_id=$1 AND week_key=$2'
        INTO v_c_xp USING v_d.challenger_id, v_d.week_key;
      EXECUTE 'SELECT COALESCE(SUM(xp_awarded),0) FROM oculto_aura_quests_history WHERE user_id=$1 AND week_key=$2'
        INTO v_o_xp USING v_d.opponent_id, v_d.week_key;
    END IF;

    IF v_c_xp = v_o_xp THEN v_winner := NULL;
    ELSIF v_c_xp > v_o_xp THEN v_winner := v_d.challenger_id;
    ELSE v_winner := v_d.opponent_id; END IF;
  ELSE
    -- Encerramento antecipado (pending): sem vencedor, sem XP de premiação
    v_winner := NULL;
    v_c_xp := 0;
    v_o_xp := 0;
  END IF;

  UPDATE oculto_aura_duels
     SET status='resolved', resolved_at=now(),
         challenger_xp=v_c_xp, opponent_xp=v_o_xp, winner_id=v_winner
   WHERE id=p_duel;

  IF v_compute AND v_winner IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='profiles' AND column_name='aura_xp'
    ) INTO v_has_aura_xp;

    IF v_has_aura_xp THEN
      SELECT EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname='public' AND p.proname='aura_level_from_xp'
      ) INTO v_has_level_fn;

      IF v_has_level_fn THEN
        EXECUTE 'UPDATE profiles SET aura_xp = COALESCE(aura_xp,0)+100,
                  aura_level = public.aura_level_from_xp(COALESCE(aura_xp,0)+100)
                  WHERE user_id=$1' USING v_winner;
      ELSE
        EXECUTE 'UPDATE profiles SET aura_xp = COALESCE(aura_xp,0)+100 WHERE user_id=$1' USING v_winner;
      END IF;
    END IF;
  END IF;

  RETURN QUERY SELECT true,
    CASE WHEN v_compute THEN 'Duelo resolvido' ELSE 'Duelo encerrado' END,
    v_winner, v_c_xp, v_o_xp;
END; $$;

GRANT EXECUTE ON FUNCTION public.aura_duel_resolve(uuid) TO authenticated;

-- 2) Lista usando @username (privacidade) -------------------------------
CREATE OR REPLACE FUNCTION public.aura_duels_my_list()
RETURNS TABLE(
  id uuid, role text, opponent_user_id uuid,
  opponent_name text, opponent_avatar text,
  status text, week_key text, created_at timestamptz, winner_id uuid,
  my_xp int, opp_xp int
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  RETURN QUERY
    SELECT d.id,
      CASE WHEN d.challenger_id = v_uid THEN 'challenger' ELSE 'opponent' END,
      CASE WHEN d.challenger_id = v_uid THEN d.opponent_id ELSE d.challenger_id END,
      -- SEMPRE @username — nunca nome real
      '@' || COALESCE(NULLIF(p.username,''), 'usuario'),
      p.avatar_url, d.status, d.week_key, d.created_at, d.winner_id,
      CASE WHEN d.challenger_id = v_uid THEN d.challenger_xp ELSE d.opponent_xp END,
      CASE WHEN d.challenger_id = v_uid THEN d.opponent_xp ELSE d.challenger_xp END
    FROM oculto_aura_duels d
    LEFT JOIN profiles p ON p.user_id = (CASE WHEN d.challenger_id = v_uid THEN d.opponent_id ELSE d.challenger_id END)
    WHERE d.challenger_id = v_uid OR d.opponent_id = v_uid
    ORDER BY d.created_at DESC LIMIT 30;
END; $$;

GRANT EXECUTE ON FUNCTION public.aura_duels_my_list() TO authenticated;

NOTIFY pgrst, 'reload schema';

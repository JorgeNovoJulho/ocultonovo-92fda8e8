-- =====================================================================
-- Aura Duels — Hardening do aura_duel_resolve (idempotente)
-- Corrige erro ao clicar em "Resolver" quando:
--   * profiles.aura_xp não existe (some bancos antigos)
--   * função aura_level_from_xp não existe
--   * tabela oculto_aura_quests_history ainda não foi criada
-- A função agora calcula vencedor com defesa total e só atualiza XP
-- via SQL dinâmico se as colunas existirem. NUNCA quebra o fluxo.
-- =====================================================================
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
  IF v_d.status <> 'accepted' THEN
    RETURN QUERY SELECT false, 'Duelo já encerrado ou ainda não aceito', v_d.winner_id, v_d.challenger_xp, v_d.opponent_xp; RETURN;
  END IF;

  -- Soma XP da semana (se a tabela existir)
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

  UPDATE oculto_aura_duels
     SET status='resolved', resolved_at=now(),
         challenger_xp=v_c_xp, opponent_xp=v_o_xp, winner_id=v_winner
   WHERE id=p_duel;

  -- Premia 100 XP só se profiles.aura_xp existir
  IF v_winner IS NOT NULL THEN
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

  RETURN QUERY SELECT true, 'Duelo resolvido', v_winner, v_c_xp, v_o_xp;
END; $$;

GRANT EXECUTE ON FUNCTION public.aura_duel_resolve(uuid) TO authenticated;
NOTIFY pgrst, 'reload schema';

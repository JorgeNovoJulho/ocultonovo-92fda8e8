-- =====================================================================
-- Aura Duels — XP ao vivo (Em andamento) + resolve consistente
-- Corrige bug: enquanto o duelo está "accepted", os campos challenger_xp /
-- opponent_xp estão 0 até o resolve. A UI mostrava sempre "0 XP × 0 XP".
-- Agora a listagem calcula o XP da semana em tempo real para
-- duelos pending/accepted, e usa os campos persistidos quando resolved.
-- Idempotente.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.aura_duels_my_list()
RETURNS TABLE(
  id uuid,
  role text,
  opponent_user_id uuid,
  opponent_name text,
  opponent_avatar text,
  status text,
  week_key text,
  created_at timestamptz,
  winner_id uuid,
  my_xp int,
  opp_xp int
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  RETURN QUERY
  WITH base AS (
    SELECT d.*,
      CASE WHEN d.challenger_id = v_uid THEN 'challenger' ELSE 'opponent' END AS my_role,
      CASE WHEN d.challenger_id = v_uid THEN d.opponent_id ELSE d.challenger_id END AS opp_id
    FROM oculto_aura_duels d
    WHERE d.challenger_id = v_uid OR d.opponent_id = v_uid
    ORDER BY d.created_at DESC
    LIMIT 30
  ),
  live AS (
    SELECT b.id,
      COALESCE((
        SELECT SUM(xp_awarded)::int FROM oculto_aura_quests_history h
        WHERE h.user_id = v_uid AND h.week_key = b.week_key
      ), 0) AS my_live_xp,
      COALESCE((
        SELECT SUM(xp_awarded)::int FROM oculto_aura_quests_history h
        WHERE h.user_id = b.opp_id AND h.week_key = b.week_key
      ), 0) AS opp_live_xp
    FROM base b
  )
  SELECT
    b.id,
    b.my_role,
    b.opp_id,
    p.name,
    p.avatar_url,
    b.status,
    b.week_key,
    b.created_at,
    b.winner_id,
    -- my_xp
    CASE
      WHEN b.status IN ('resolved','declined','expired') THEN
        CASE WHEN b.challenger_id = v_uid THEN b.challenger_xp ELSE b.opponent_xp END
      ELSE l.my_live_xp
    END AS my_xp,
    -- opp_xp
    CASE
      WHEN b.status IN ('resolved','declined','expired') THEN
        CASE WHEN b.challenger_id = v_uid THEN b.opponent_xp ELSE b.challenger_xp END
      ELSE l.opp_live_xp
    END AS opp_xp
  FROM base b
  JOIN live l ON l.id = b.id
  LEFT JOIN profiles p ON p.user_id = b.opp_id
  ORDER BY b.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.aura_duels_my_list() TO authenticated;

-- Garante consistência: persistir o snapshot final no resolve mesmo quando
-- empate (winner NULL), e nunca regredir XP positivo.
-- DROP necessário pois a assinatura mudou (adição de winner_name).
DROP FUNCTION IF EXISTS public.aura_duel_resolve(uuid);

CREATE FUNCTION public.aura_duel_resolve(p_duel uuid)
RETURNS TABLE(ok boolean, message text, winner_id uuid, winner_name text, challenger_xp int, opponent_xp int)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_d record;
  v_c_xp int := 0;
  v_o_xp int := 0;
  v_winner uuid;
  v_winner_name text;
BEGIN
  SELECT * INTO v_d FROM oculto_aura_duels WHERE id = p_duel FOR UPDATE;
  IF v_d.id IS NULL THEN
    RETURN QUERY SELECT false, 'Duelo não encontrado', NULL::uuid, NULL::text, 0, 0; RETURN;
  END IF;
  IF v_uid IS NULL OR (v_uid <> v_d.challenger_id AND v_uid <> v_d.opponent_id) THEN
    RETURN QUERY SELECT false, 'Sem permissão', NULL::uuid, NULL::text, 0, 0; RETURN;
  END IF;
  IF v_d.status <> 'accepted' THEN
    RETURN QUERY SELECT false, 'Duelo indisponível para resolução', NULL::uuid, NULL::text,
                 COALESCE(v_d.challenger_xp,0), COALESCE(v_d.opponent_xp,0); RETURN;
  END IF;

  SELECT COALESCE(SUM(xp_awarded),0)::int INTO v_c_xp
    FROM oculto_aura_quests_history
   WHERE user_id = v_d.challenger_id AND week_key = v_d.week_key;
  SELECT COALESCE(SUM(xp_awarded),0)::int INTO v_o_xp
    FROM oculto_aura_quests_history
   WHERE user_id = v_d.opponent_id AND week_key = v_d.week_key;

  IF v_c_xp = v_o_xp THEN v_winner := NULL;
  ELSIF v_c_xp > v_o_xp THEN v_winner := v_d.challenger_id;
  ELSE v_winner := v_d.opponent_id;
  END IF;

  UPDATE oculto_aura_duels
     SET status = 'resolved',
         resolved_at = now(),
         challenger_xp = v_c_xp,
         opponent_xp = v_o_xp,
         winner_id = v_winner
   WHERE id = p_duel;

  IF v_winner IS NOT NULL THEN
    UPDATE profiles
       SET aura_xp = COALESCE(aura_xp,0) + 100,
           aura_level = public.aura_level_from_xp(COALESCE(aura_xp,0) + 100)
     WHERE user_id = v_winner;

    SELECT p.name INTO v_winner_name FROM profiles p WHERE p.user_id = v_winner;
  END IF;

  RETURN QUERY SELECT true,
    CASE WHEN v_winner IS NULL THEN 'Empate — nenhum XP concedido' ELSE 'Duelo resolvido' END,
    v_winner, v_winner_name, v_c_xp, v_o_xp;
END;
$$;

GRANT EXECUTE ON FUNCTION public.aura_duel_resolve(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- =====================================================================
-- Aura Duels — Corrige XP "0 × 0" (Em andamento e resolução)
--
-- Bug: aura_duels_my_list e aura_duel_resolve liam de
-- `oculto_aura_quests_history`, tabela que NUNCA foi criada/populada.
-- Resultado: o duelo sempre mostrava 0 XP para ambos os participantes,
-- mesmo após resgatar missões / ganhar XP na semana.
--
-- Correção: ler diretamente de `oculto_aura_daily_quests`, somando
-- `xp_reward` das missões resgatadas (claimed_at IS NOT NULL) cuja `day`
-- caia na mesma semana ISO (America/Sao_Paulo) do `week_key` do duelo.
-- Idempotente. Executar no SQL Editor do Supabase EXTERNO.
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
    FROM public.oculto_aura_duels d
    WHERE d.challenger_id = v_uid OR d.opponent_id = v_uid
    ORDER BY d.created_at DESC
    LIMIT 30
  ),
  live AS (
    SELECT b.id,
      COALESCE((
        SELECT SUM(q.xp_reward)::int
          FROM public.oculto_aura_daily_quests q
         WHERE q.user_id = v_uid
           AND q.claimed_at IS NOT NULL
           AND to_char(q.day, 'IYYY-IW') = b.week_key
      ), 0) AS my_live_xp,
      COALESCE((
        SELECT SUM(q.xp_reward)::int
          FROM public.oculto_aura_daily_quests q
         WHERE q.user_id = b.opp_id
           AND q.claimed_at IS NOT NULL
           AND to_char(q.day, 'IYYY-IW') = b.week_key
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
    CASE
      WHEN b.status IN ('resolved','declined','expired') THEN
        CASE WHEN b.challenger_id = v_uid THEN b.challenger_xp ELSE b.opponent_xp END
      ELSE l.my_live_xp
    END AS my_xp,
    CASE
      WHEN b.status IN ('resolved','declined','expired') THEN
        CASE WHEN b.challenger_id = v_uid THEN b.opponent_xp ELSE b.challenger_xp END
      ELSE l.opp_live_xp
    END AS opp_xp
  FROM base b
  JOIN live l ON l.id = b.id
  LEFT JOIN public.profiles p ON p.user_id = b.opp_id
  ORDER BY b.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.aura_duels_my_list() TO authenticated;

-- ---------------------------------------------------------------------
-- aura_duel_resolve — mesma fonte (oculto_aura_daily_quests)
-- ---------------------------------------------------------------------
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
  SELECT * INTO v_d FROM public.oculto_aura_duels WHERE id = p_duel FOR UPDATE;
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

  SELECT COALESCE(SUM(q.xp_reward),0)::int INTO v_c_xp
    FROM public.oculto_aura_daily_quests q
   WHERE q.user_id = v_d.challenger_id
     AND q.claimed_at IS NOT NULL
     AND to_char(q.day, 'IYYY-IW') = v_d.week_key;

  SELECT COALESCE(SUM(q.xp_reward),0)::int INTO v_o_xp
    FROM public.oculto_aura_daily_quests q
   WHERE q.user_id = v_d.opponent_id
     AND q.claimed_at IS NOT NULL
     AND to_char(q.day, 'IYYY-IW') = v_d.week_key;

  IF v_c_xp = v_o_xp THEN v_winner := NULL;
  ELSIF v_c_xp > v_o_xp THEN v_winner := v_d.challenger_id;
  ELSE v_winner := v_d.opponent_id;
  END IF;

  UPDATE public.oculto_aura_duels
     SET status = 'resolved',
         resolved_at = now(),
         challenger_xp = v_c_xp,
         opponent_xp = v_o_xp,
         winner_id = v_winner
   WHERE id = p_duel;

  IF v_winner IS NOT NULL THEN
    UPDATE public.profiles
       SET aura_xp = COALESCE(aura_xp,0) + 100,
           aura_level = public.aura_level_from_xp(COALESCE(aura_xp,0) + 100)
     WHERE user_id = v_winner;

    SELECT p.name INTO v_winner_name FROM public.profiles p WHERE p.user_id = v_winner;
  END IF;

  RETURN QUERY SELECT true,
    CASE WHEN v_winner IS NULL THEN 'Empate — nenhum XP concedido' ELSE 'Duelo resolvido' END,
    v_winner, v_winner_name, v_c_xp, v_o_xp;
END;
$$;

GRANT EXECUTE ON FUNCTION public.aura_duel_resolve(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';

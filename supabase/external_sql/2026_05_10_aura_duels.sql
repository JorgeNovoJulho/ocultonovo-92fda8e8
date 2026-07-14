-- Aura Match v2 — Bloco I: Duelos de Aura
CREATE TABLE IF NOT EXISTS public.oculto_aura_duels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  challenger_id uuid NOT NULL,
  opponent_id uuid NOT NULL,
  week_key text NOT NULL,
  challenger_xp int NOT NULL DEFAULT 0,
  opponent_xp int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  winner_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  CHECK (challenger_id <> opponent_id)
);
CREATE INDEX IF NOT EXISTS idx_aura_duels_users ON public.oculto_aura_duels(challenger_id, opponent_id, week_key);
CREATE INDEX IF NOT EXISTS idx_aura_duels_opponent ON public.oculto_aura_duels(opponent_id) WHERE status = 'pending';

ALTER TABLE public.oculto_aura_duels ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "duels_select_participant" ON public.oculto_aura_duels;
CREATE POLICY "duels_select_participant" ON public.oculto_aura_duels FOR SELECT
  USING (auth.uid() = challenger_id OR auth.uid() = opponent_id);

CREATE OR REPLACE FUNCTION public.aura_duel_challenge(p_opponent uuid)
RETURNS TABLE(ok boolean, message text, duel_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid(); v_wk text := to_char((now() at time zone 'America/Sao_Paulo')::date, 'IYYY-IW');
  v_id uuid;
BEGIN
  IF v_uid IS NULL OR p_opponent IS NULL OR v_uid = p_opponent THEN
    RETURN QUERY SELECT false, 'Oponente inválido', NULL::uuid; RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM oculto_aura_duels WHERE week_key = v_wk
    AND ((challenger_id = v_uid AND opponent_id = p_opponent) OR (challenger_id = p_opponent AND opponent_id = v_uid))) THEN
    RETURN QUERY SELECT false, 'Já existe um duelo entre vocês esta semana', NULL::uuid; RETURN;
  END IF;
  INSERT INTO oculto_aura_duels (challenger_id, opponent_id, week_key)
  VALUES (v_uid, p_opponent, v_wk) RETURNING id INTO v_id;
  RETURN QUERY SELECT true, 'Desafio enviado!', v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.aura_duel_accept(p_duel uuid)
RETURNS TABLE(ok boolean, message text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  UPDATE oculto_aura_duels SET status = 'accepted'
   WHERE id = p_duel AND opponent_id = v_uid AND status = 'pending';
  IF NOT FOUND THEN RETURN QUERY SELECT false, 'Duelo não encontrado ou já respondido'; RETURN; END IF;
  RETURN QUERY SELECT true, 'Duelo aceito!';
END; $$;

CREATE OR REPLACE FUNCTION public.aura_duel_decline(p_duel uuid)
RETURNS TABLE(ok boolean, message text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  UPDATE oculto_aura_duels SET status = 'declined', resolved_at = now()
   WHERE id = p_duel AND opponent_id = v_uid AND status = 'pending';
  IF NOT FOUND THEN RETURN QUERY SELECT false, 'Duelo não encontrado'; RETURN; END IF;
  RETURN QUERY SELECT true, 'Recusado';
END; $$;

CREATE OR REPLACE FUNCTION public.aura_duel_resolve(p_duel uuid)
RETURNS TABLE(ok boolean, message text, winner_id uuid, challenger_xp int, opponent_xp int)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_d record; v_c_xp int := 0; v_o_xp int := 0; v_winner uuid;
BEGIN
  SELECT * INTO v_d FROM oculto_aura_duels WHERE id = p_duel FOR UPDATE;
  IF v_d.id IS NULL OR v_d.status <> 'accepted' THEN
    RETURN QUERY SELECT false, 'Duelo indisponível', NULL::uuid, 0, 0; RETURN;
  END IF;
  SELECT COALESCE(SUM(xp_awarded),0) INTO v_c_xp
    FROM oculto_aura_quests_history
    WHERE user_id = v_d.challenger_id AND week_key = v_d.week_key;
  SELECT COALESCE(SUM(xp_awarded),0) INTO v_o_xp
    FROM oculto_aura_quests_history
    WHERE user_id = v_d.opponent_id AND week_key = v_d.week_key;

  IF v_c_xp = v_o_xp THEN v_winner := NULL;
  ELSIF v_c_xp > v_o_xp THEN v_winner := v_d.challenger_id;
  ELSE v_winner := v_d.opponent_id; END IF;

  UPDATE oculto_aura_duels SET status = 'resolved', resolved_at = now(),
    challenger_xp = v_c_xp, opponent_xp = v_o_xp, winner_id = v_winner
    WHERE id = p_duel;

  IF v_winner IS NOT NULL THEN
    UPDATE profiles SET aura_xp = COALESCE(aura_xp,0) + 100,
      aura_level = public.aura_level_from_xp(COALESCE(aura_xp,0) + 100)
      WHERE user_id = v_winner;
  END IF;

  RETURN QUERY SELECT true, 'Duelo resolvido', v_winner, v_c_xp, v_o_xp;
END; $$;

CREATE OR REPLACE FUNCTION public.aura_duels_my_list()
RETURNS TABLE(id uuid, role text, opponent_user_id uuid, opponent_name text, opponent_avatar text, status text, week_key text, created_at timestamptz, winner_id uuid, my_xp int, opp_xp int)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  RETURN QUERY
    SELECT d.id,
      CASE WHEN d.challenger_id = v_uid THEN 'challenger' ELSE 'opponent' END,
      CASE WHEN d.challenger_id = v_uid THEN d.opponent_id ELSE d.challenger_id END,
      p.name, p.avatar_url, d.status, d.week_key, d.created_at, d.winner_id,
      CASE WHEN d.challenger_id = v_uid THEN d.challenger_xp ELSE d.opponent_xp END,
      CASE WHEN d.challenger_id = v_uid THEN d.opponent_xp ELSE d.challenger_xp END
    FROM oculto_aura_duels d
    LEFT JOIN profiles p ON p.user_id = (CASE WHEN d.challenger_id = v_uid THEN d.opponent_id ELSE d.challenger_id END)
    WHERE d.challenger_id = v_uid OR d.opponent_id = v_uid
    ORDER BY d.created_at DESC LIMIT 30;
END; $$;

GRANT EXECUTE ON FUNCTION public.aura_duel_challenge(uuid), public.aura_duel_accept(uuid),
  public.aura_duel_decline(uuid), public.aura_duel_resolve(uuid), public.aura_duels_my_list() TO authenticated;
NOTIFY pgrst, 'reload schema';

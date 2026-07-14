-- ============================================================================
-- OCULTO PLAY — Etapa 6: Gamificação/XP + "Hoje no Oculto" (curadoria diária)
-- Cole no SQL Editor do Supabase EXTERNO (rvybbrkzmboqbhcemqar).
-- 100% idempotente. Tudo isolado em oculto_play_*.
-- Não toca em aura, social score, prestige, posts, etc.
-- ============================================================================

-- ---------- 1) XP ledger ----------
CREATE TABLE IF NOT EXISTS public.oculto_play_xp_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL,                 -- auth.users.id
  item_id     uuid,                          -- oculto_play_items.id (nullable p/ ações livres)
  action      text NOT NULL,                 -- 'view'|'like'|'save'|'share'|'upload'|'daily_bonus'
  xp          int  NOT NULL,
  day         date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Sao_Paulo')::date,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_op_xp_user_day ON public.oculto_play_xp_log (user_id, day DESC);
CREATE INDEX IF NOT EXISTS idx_op_xp_user_created ON public.oculto_play_xp_log (user_id, created_at DESC);
-- Idempotência por ação+item+dia (view, like, save, share, upload contam 1x por item por dia)
CREATE UNIQUE INDEX IF NOT EXISTS uq_op_xp_unique_action_item_day
  ON public.oculto_play_xp_log (user_id, action, COALESCE(item_id, '00000000-0000-0000-0000-000000000000'::uuid), day);

GRANT SELECT, INSERT ON public.oculto_play_xp_log TO authenticated;
GRANT ALL ON public.oculto_play_xp_log TO service_role;

ALTER TABLE public.oculto_play_xp_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "op_xp_owner_read" ON public.oculto_play_xp_log;
CREATE POLICY "op_xp_owner_read" ON public.oculto_play_xp_log
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());
DROP POLICY IF EXISTS "op_xp_master_read" ON public.oculto_play_xp_log;
CREATE POLICY "op_xp_master_read" ON public.oculto_play_xp_log
  FOR SELECT TO authenticated
  USING (public.is_master_admin(auth.uid()));

-- ---------- 2) Hoje no Oculto (curadoria master) ----------
CREATE TABLE IF NOT EXISTS public.oculto_play_today_picks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id     uuid NOT NULL,                 -- referencia oculto_play_items.id
  day         date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Sao_Paulo')::date,
  pos    int  NOT NULL DEFAULT 0,
  note        text,
  picked_by   uuid NOT NULL,                 -- master que selecionou
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_op_today_pick_day_item
  ON public.oculto_play_today_picks (day, item_id);
CREATE INDEX IF NOT EXISTS idx_op_today_pick_day
  ON public.oculto_play_today_picks (day, pos);

GRANT SELECT ON public.oculto_play_today_picks TO authenticated;
GRANT ALL ON public.oculto_play_today_picks TO service_role;

ALTER TABLE public.oculto_play_today_picks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "op_today_read_all" ON public.oculto_play_today_picks;
CREATE POLICY "op_today_read_all" ON public.oculto_play_today_picks
  FOR SELECT TO authenticated
  USING (public.can_access_oculto_play());

-- ---------- 3) RPC: oculto_play_xp_grant ----------
-- Idempotente por (user_id, action, item_id, day). Aplica cap diário (default 300 XP).
CREATE OR REPLACE FUNCTION public.oculto_play_xp_grant(
  p_action text,
  p_item_id uuid DEFAULT NULL,
  p_xp_override int DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_xp  int;
  v_day date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_total_today int;
  v_cap int := 300;
  v_inserted boolean := false;
  v_gamif_on boolean;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  END IF;

  -- Gate: gamificação precisa estar ligada no config
  SELECT COALESCE(gamification_on, true) INTO v_gamif_on
    FROM public.oculto_play_config LIMIT 1;
  IF NOT COALESCE(v_gamif_on, true) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'gamification_off');
  END IF;

  -- XP por ação (override opcional)
  v_xp := COALESCE(p_xp_override, CASE p_action
    WHEN 'view'        THEN 1
    WHEN 'like'        THEN 3
    WHEN 'save'        THEN 5
    WHEN 'share'       THEN 4
    WHEN 'upload'      THEN 20
    WHEN 'daily_bonus' THEN 15
    ELSE 0
  END);

  IF v_xp <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_action');
  END IF;

  -- Cap diário
  SELECT COALESCE(SUM(xp), 0) INTO v_total_today
    FROM public.oculto_play_xp_log
    WHERE user_id = v_uid AND day = v_day;
  IF v_total_today >= v_cap THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'daily_cap', 'xp_today', v_total_today, 'cap', v_cap);
  END IF;

  BEGIN
    INSERT INTO public.oculto_play_xp_log(user_id, item_id, action, xp, day)
    VALUES (v_uid, p_item_id, p_action, v_xp, v_day);
    v_inserted := true;
  EXCEPTION WHEN unique_violation THEN
    v_inserted := false;
  END;

  RETURN jsonb_build_object(
    'ok', v_inserted,
    'xp_awarded', CASE WHEN v_inserted THEN v_xp ELSE 0 END,
    'xp_today',   v_total_today + CASE WHEN v_inserted THEN v_xp ELSE 0 END,
    'cap',        v_cap,
    'reason',     CASE WHEN v_inserted THEN 'granted' ELSE 'already_granted' END
  );
END $$;

GRANT EXECUTE ON FUNCTION public.oculto_play_xp_grant(text, uuid, int) TO authenticated;

-- ---------- 4) RPC: oculto_play_my_xp ----------
CREATE OR REPLACE FUNCTION public.oculto_play_my_xp()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_total int;
  v_today int;
  v_day date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_level int;
  v_next_level_xp int;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('xp_total', 0, 'xp_today', 0, 'level', 1, 'next_level_xp', 100, 'cap', 300);
  END IF;

  SELECT COALESCE(SUM(xp), 0) INTO v_total
    FROM public.oculto_play_xp_log WHERE user_id = v_uid;

  SELECT COALESCE(SUM(xp), 0) INTO v_today
    FROM public.oculto_play_xp_log WHERE user_id = v_uid AND day = v_day;

  -- Curva simples: nível n requer 100*n*(n-1)/2 XP acumulado.
  v_level := GREATEST(1, FLOOR(1 + sqrt(GREATEST(v_total, 0) / 50.0))::int);
  v_next_level_xp := (50 * v_level * (v_level + 1));

  RETURN jsonb_build_object(
    'xp_total', v_total,
    'xp_today', v_today,
    'level',    v_level,
    'next_level_xp', v_next_level_xp,
    'cap',     300
  );
END $$;

GRANT EXECUTE ON FUNCTION public.oculto_play_my_xp() TO authenticated;

-- ---------- 5) RPC: hoje no oculto (master picks + leitura) ----------
CREATE OR REPLACE FUNCTION public.oculto_play_today_set(
  p_item_id uuid,
  p_position int DEFAULT 0,
  p_note text DEFAULT NULL,
  p_day date DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_day date := COALESCE(p_day, (now() AT TIME ZONE 'America/Sao_Paulo')::date);
  v_id  uuid;
BEGIN
  IF NOT public.is_master_admin(v_uid) THEN
    RAISE EXCEPTION 'master_admin_only';
  END IF;
  INSERT INTO public.oculto_play_today_picks(item_id, day, pos, note, picked_by)
  VALUES (p_item_id, v_day, COALESCE(p_position, 0), p_note, v_uid)
  ON CONFLICT (day, item_id) DO UPDATE
    SET pos = EXCLUDED.pos,
        note     = EXCLUDED.note,
        picked_by = EXCLUDED.picked_by
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.oculto_play_today_set(uuid, int, text, date) TO authenticated;

CREATE OR REPLACE FUNCTION public.oculto_play_today_unset(
  p_item_id uuid,
  p_day date DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_day date := COALESCE(p_day, (now() AT TIME ZONE 'America/Sao_Paulo')::date);
BEGIN
  IF NOT public.is_master_admin(auth.uid()) THEN
    RAISE EXCEPTION 'master_admin_only';
  END IF;
  DELETE FROM public.oculto_play_today_picks
    WHERE day = v_day AND item_id = p_item_id;
  RETURN true;
END $$;
GRANT EXECUTE ON FUNCTION public.oculto_play_today_unset(uuid, date) TO authenticated;

CREATE OR REPLACE FUNCTION public.oculto_play_today_list(
  p_day date DEFAULT NULL
)
RETURNS TABLE (
  item_id uuid,
  pos int,
  note text,
  title text,
  caption text,
  thumb_url text,
  media_url text,
  kind text,
  visibility text,
  author_id uuid,
  view_count int,
  like_count int
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    p.item_id,
    p.pos,
    p.note,
    i.title,
    i.caption,
    i.thumb_url,
    i.media_url,
    i.kind::text,
    i.visibility::text,
    i.author_id,
    i.view_count,
    i.like_count
  FROM public.oculto_play_today_picks p
  JOIN public.oculto_play_items i ON i.id = p.item_id
  WHERE p.day = COALESCE(p_day, (now() AT TIME ZONE 'America/Sao_Paulo')::date)
    AND i.is_published = true
    AND public.can_access_oculto_play()
  ORDER BY p.pos ASC, p.created_at ASC;
$$;
GRANT EXECUTE ON FUNCTION public.oculto_play_today_list(date) TO authenticated;

-- ============================================================================
-- FIM Etapa 6
-- ============================================================================

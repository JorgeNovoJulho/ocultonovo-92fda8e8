-- ============================================================================
-- HISTÓRICO DE PRESTÍGIO SOCIAL
-- 100% idempotente — cole no SQL Editor do Supabase EXTERNO
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.oculto_social_prestige_history (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL,
  rank        int  NOT NULL,
  name        text NOT NULL,
  badge_icon  text,
  glow_color  text,
  xp_at       int  NOT NULL,
  reached_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_oculto_social_prestige_history_user
  ON public.oculto_social_prestige_history (user_id, reached_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_oculto_social_prestige_history_user_rank
  ON public.oculto_social_prestige_history (user_id, rank);

ALTER TABLE public.oculto_social_prestige_history ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY social_prestige_history_read_own ON public.oculto_social_prestige_history
    FOR SELECT USING (auth.uid() = user_id OR public._is_master_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================================
-- Função interna: registrar marco se rank atual maior que último registrado
-- ============================================================================
CREATE OR REPLACE FUNCTION public._social_prestige_record_milestone(p_user uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_xp     int;
  v_cur    record;
BEGIN
  IF p_user IS NULL THEN RETURN; END IF;

  SELECT coalesce(total_xp,0) INTO v_xp
    FROM oculto_social_scores WHERE user_id = p_user;
  v_xp := coalesce(v_xp, 0);

  SELECT * INTO v_cur
    FROM oculto_social_prestige_levels
   WHERE is_active AND min_xp <= v_xp
   ORDER BY min_xp DESC LIMIT 1;
  IF v_cur IS NULL THEN RETURN; END IF;

  INSERT INTO oculto_social_prestige_history (user_id, rank, name, badge_icon, glow_color, xp_at)
  VALUES (p_user, v_cur.rank, v_cur.name, v_cur.badge_icon, v_cur.glow_color, v_xp)
  ON CONFLICT (user_id, rank) DO NOTHING;
END; $$;

-- ============================================================================
-- Trigger no oculto_social_scores: ao mudar XP, registra milestone se subiu
-- ============================================================================
CREATE OR REPLACE FUNCTION public._tg_social_prestige_history()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public._social_prestige_record_milestone(NEW.user_id);
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_social_prestige_history ON public.oculto_social_scores;
CREATE TRIGGER trg_social_prestige_history
  AFTER INSERT OR UPDATE OF total_xp ON public.oculto_social_scores
  FOR EACH ROW EXECUTE FUNCTION public._tg_social_prestige_history();

-- ============================================================================
-- Backfill: registra rank atual de todos os usuários existentes (idempotente)
-- ============================================================================
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT user_id FROM oculto_social_scores LOOP
    PERFORM public._social_prestige_record_milestone(r.user_id);
  END LOOP;
END $$;

-- ============================================================================
-- RPC: histórico do usuário (próprio ou admin)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.social_prestige_history(p_user uuid DEFAULT NULL)
RETURNS TABLE (
  rank       int,
  name       text,
  badge_icon text,
  glow_color text,
  xp_at      int,
  reached_at timestamptz
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := coalesce(p_user, auth.uid());
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;
  IF v_uid <> auth.uid() AND NOT public._is_master_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
    SELECT h.rank, h.name, h.badge_icon, h.glow_color, h.xp_at, h.reached_at
      FROM oculto_social_prestige_history h
     WHERE h.user_id = v_uid
     ORDER BY h.reached_at ASC;
END; $$;
GRANT EXECUTE ON FUNCTION public.social_prestige_history(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';

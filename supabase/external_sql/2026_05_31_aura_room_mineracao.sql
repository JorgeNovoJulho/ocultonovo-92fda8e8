-- =====================================================================
-- Sala "Mineração" + Economia de XP configurável
-- Foco em retenção: usuário ganha XP por permanecer e interagir genuinamente
-- 100% idempotente — pode rodar várias vezes
-- =====================================================================

-- Extensão necessária para detecção de mensagens repetidas (anti-bot)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============== 1) Insert/Upsert da sala Mineração ==============
INSERT INTO public.oculto_aura_rooms
  (slug, name, theme, hue, emoji, active, vip_only,
   hour_from, hour_to, min_aura_level, min_social_score, min_prestige_xp,
   required_plan, requires_kyc, couple_only, sort_order, glow_intensity, description)
VALUES
  ('mineracao', 'Mineração', 'Permaneça, conecte-se e minere XP',
   45, '⛏️', true, false, NULL, NULL,
   2, 500, 500,
   NULL, false, false, 5, 90,
   'Quanto mais você permanece e conversa de verdade, mais XP você minera.')
ON CONFLICT (slug) DO UPDATE SET
  name             = EXCLUDED.name,
  theme            = EXCLUDED.theme,
  hue              = EXCLUDED.hue,
  emoji            = EXCLUDED.emoji,
  active           = EXCLUDED.active,
  vip_only         = EXCLUDED.vip_only,
  min_aura_level   = EXCLUDED.min_aura_level,
  min_social_score = EXCLUDED.min_social_score,
  min_prestige_xp  = EXCLUDED.min_prestige_xp,
  sort_order       = EXCLUDED.sort_order,
  glow_intensity   = EXCLUDED.glow_intensity,
  description      = EXCLUDED.description;

-- ============== 2) Catálogo de regras editáveis ==============
CREATE TABLE IF NOT EXISTS public.oculto_aura_room_mining_rules (
  rule_key     text PRIMARY KEY,
  amount       integer NOT NULL,
  enabled      boolean NOT NULL DEFAULT true,
  description  text,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  updated_by   uuid
);

GRANT SELECT ON public.oculto_aura_room_mining_rules TO authenticated;
GRANT ALL    ON public.oculto_aura_room_mining_rules TO service_role;

ALTER TABLE public.oculto_aura_room_mining_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mining_rules_read_authenticated" ON public.oculto_aura_room_mining_rules;
CREATE POLICY "mining_rules_read_authenticated"
  ON public.oculto_aura_room_mining_rules FOR SELECT TO authenticated USING (true);
-- escrita só via RPC SECURITY DEFINER (master)

-- Seeds default
INSERT INTO public.oculto_aura_room_mining_rules (rule_key, amount, description) VALUES
  ('per_minute_idle',     1, 'XP por minuto conectado na sala'),
  ('per_quality_message', 1, 'XP por mensagem genuína (anti-bot)'),
  ('receive_pulse',       1, 'XP por receber pulso'),
  ('receive_highlight',   5, 'XP por receber destaque'),
  ('invite_accepted',     5, 'XP quando convidado entra na sala'),
  ('approach',            2, 'XP por aproximar-se de alguém'),
  ('receive_reaction',    1, 'XP por receber reação em mensagem'),
  ('receive_like',        2, 'XP por receber like'),
  ('receive_dislike',    -3, 'XP perdido ao receber dislike (clamp ≥ 0)'),
  ('reply_mention',       2, 'XP por responder/mencionar alguém')
ON CONFLICT (rule_key) DO NOTHING;

-- ============== 3) Ledger (idempotência por ref_key) ==============
CREATE TABLE IF NOT EXISTS public.oculto_aura_room_mining_ledger (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL,
  slug         text NOT NULL,
  rule_key     text NOT NULL,
  amount       integer NOT NULL,
  ref_key      text NOT NULL,
  meta         jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, rule_key, ref_key)
);

CREATE INDEX IF NOT EXISTS idx_mining_ledger_user_at
  ON public.oculto_aura_room_mining_ledger (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mining_ledger_slug_at
  ON public.oculto_aura_room_mining_ledger (slug, created_at DESC);

GRANT SELECT ON public.oculto_aura_room_mining_ledger TO authenticated;
GRANT ALL    ON public.oculto_aura_room_mining_ledger TO service_role;

ALTER TABLE public.oculto_aura_room_mining_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mining_ledger_select_own" ON public.oculto_aura_room_mining_ledger;
CREATE POLICY "mining_ledger_select_own"
  ON public.oculto_aura_room_mining_ledger FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- ============== 4) Helper: master admin ==============
-- Reaproveita aura_is_master_admin() se existir; senão cria.
CREATE OR REPLACE FUNCTION public.aura_is_master_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
     WHERE p.user_id = auth.uid()
       AND lower(p.username) = 'ocultomaster'
  );
$$;

-- ============== 5) RPC: listar regras ==============
CREATE OR REPLACE FUNCTION public.aura_room_mining_rules_list()
RETURNS TABLE(rule_key text, amount integer, enabled boolean, description text, updated_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.rule_key, r.amount, r.enabled, r.description, r.updated_at
    FROM public.oculto_aura_room_mining_rules r
   ORDER BY r.rule_key;
$$;

-- ============== 6) RPC: upsert regra (master) ==============
CREATE OR REPLACE FUNCTION public.aura_room_mining_rules_upsert(
  p_rule_key text, p_amount integer, p_enabled boolean
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF NOT public.aura_is_master_admin() THEN RAISE EXCEPTION 'forbidden: master only'; END IF;

  INSERT INTO public.oculto_aura_room_mining_rules (rule_key, amount, enabled, updated_at, updated_by)
  VALUES (p_rule_key, p_amount, COALESCE(p_enabled, true), now(), v_uid)
  ON CONFLICT (rule_key)
  DO UPDATE SET amount = EXCLUDED.amount,
                enabled = EXCLUDED.enabled,
                updated_at = now(),
                updated_by = v_uid;
END; $$;

-- ============== 7) Helper interno: credita XP + grava ledger ==============
CREATE OR REPLACE FUNCTION public._mining_credit_xp(
  p_user_id uuid, p_slug text, p_rule_key text, p_ref_key text, p_meta jsonb
) RETURNS TABLE(ok boolean, reason text, awarded integer, balance integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_amount integer;
  v_enabled boolean;
  v_new_xp integer;
  v_has_xp boolean;
  v_has_level_fn boolean;
BEGIN
  SELECT r.amount, r.enabled INTO v_amount, v_enabled
    FROM public.oculto_aura_room_mining_rules r
   WHERE r.rule_key = p_rule_key;

  IF v_amount IS NULL THEN
    ok := false; reason := 'unknown_rule'; awarded := 0; balance := 0; RETURN NEXT; RETURN;
  END IF;
  IF v_enabled IS DISTINCT FROM true THEN
    ok := false; reason := 'disabled'; awarded := 0; balance := 0; RETURN NEXT; RETURN;
  END IF;

  -- Idempotência via UNIQUE (user_id, rule_key, ref_key)
  BEGIN
    INSERT INTO public.oculto_aura_room_mining_ledger (user_id, slug, rule_key, amount, ref_key, meta)
    VALUES (p_user_id, p_slug, p_rule_key, v_amount, p_ref_key, p_meta);
  EXCEPTION WHEN unique_violation THEN
    SELECT COALESCE(aura_xp, 0) INTO balance FROM public.profiles WHERE user_id = p_user_id;
    ok := false; reason := 'already_awarded'; awarded := 0;
    RETURN NEXT; RETURN;
  END;

  -- Aplica no profile.aura_xp (clamp em 0)
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='profiles' AND column_name='aura_xp'
  ) INTO v_has_xp;

  IF NOT v_has_xp THEN
    ok := true; reason := 'no_xp_column'; awarded := v_amount; balance := 0;
    RETURN NEXT; RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.proname='aura_level_from_xp'
  ) INTO v_has_level_fn;

  IF v_has_level_fn THEN
    UPDATE public.profiles
       SET aura_xp = GREATEST(0, COALESCE(aura_xp,0) + v_amount),
           aura_level = public.aura_level_from_xp(GREATEST(0, COALESCE(aura_xp,0) + v_amount))
     WHERE user_id = p_user_id
     RETURNING aura_xp INTO v_new_xp;
  ELSE
    UPDATE public.profiles
       SET aura_xp = GREATEST(0, COALESCE(aura_xp,0) + v_amount)
     WHERE user_id = p_user_id
     RETURNING aura_xp INTO v_new_xp;
  END IF;

  ok := true; reason := 'credited'; awarded := v_amount; balance := COALESCE(v_new_xp, 0);
  RETURN NEXT;
END; $$;

-- ============== 8) RPC: tick por minuto idle ==============
-- Idempotente por bucket de minuto (YYYYMMDDHH24MI).
CREATE OR REPLACE FUNCTION public.aura_room_mining_tick(p_slug text)
RETURNS TABLE(ok boolean, reason text, awarded integer, balance integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_bucket text;
BEGIN
  IF v_uid IS NULL THEN
    ok := false; reason := 'auth_required'; awarded := 0; balance := 0; RETURN NEXT; RETURN;
  END IF;
  IF p_slug IS NULL OR length(btrim(p_slug)) = 0 THEN
    ok := false; reason := 'invalid_slug'; awarded := 0; balance := 0; RETURN NEXT; RETURN;
  END IF;

  v_bucket := to_char(now() AT TIME ZONE 'UTC', 'YYYYMMDDHH24MI');

  RETURN QUERY
    SELECT * FROM public._mining_credit_xp(
      v_uid, p_slug, 'per_minute_idle',
      'minute:' || p_slug || ':' || v_bucket,
      jsonb_build_object('bucket', v_bucket)
    );
END; $$;

-- ============== 9) RPC: award genérico para eventos da sala ==============
-- p_target_user_id: quando informado, credita XP no destinatário (ex: receive_*).
-- Quando nulo, credita no próprio auth.uid() (ex: per_quality_message, reply_mention).
-- p_message: texto opcional usado por validações anti-bot (per_quality_message).
CREATE OR REPLACE FUNCTION public.aura_room_mining_award(
  p_slug text,
  p_rule_key text,
  p_ref_key text,
  p_target_user_id uuid DEFAULT NULL,
  p_message text DEFAULT NULL
) RETURNS TABLE(ok boolean, reason text, awarded integer, balance integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_recipient uuid;
  v_msg       text;
  v_distinct  integer;
  v_recent    integer;
  v_last_at   timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    ok := false; reason := 'auth_required'; awarded := 0; balance := 0; RETURN NEXT; RETURN;
  END IF;

  v_recipient := COALESCE(p_target_user_id, v_uid);

  -- =========== Anti-bot para per_quality_message ===========
  IF p_rule_key = 'per_quality_message' THEN
    v_msg := lower(btrim(COALESCE(p_message, '')));

    IF length(v_msg) < 12 THEN
      ok := false; reason := 'msg_too_short'; awarded := 0; balance := 0; RETURN NEXT; RETURN;
    END IF;

    -- ≥ 3 palavras distintas
    SELECT count(DISTINCT w) INTO v_distinct
      FROM regexp_split_to_table(v_msg, '\s+') AS w
      WHERE length(w) > 1;
    IF v_distinct < 3 THEN
      ok := false; reason := 'msg_low_diversity'; awarded := 0; balance := 0; RETURN NEXT; RETURN;
    END IF;

    -- Blacklist simples (frases muito comuns sem conteúdo)
    IF v_msg ~ '^(oi+|ola+|olá+|opa+|eai+|e ai+|hey+|hi+|kk+|haha+|rsrs+|hahaha+)\s*[\.\!\?]*$' THEN
      ok := false; reason := 'msg_blacklisted'; awarded := 0; balance := 0; RETURN NEXT; RETURN;
    END IF;

    -- Rate limit: 1 crédito a cada 20s por user/sala
    SELECT max(created_at) INTO v_last_at
      FROM public.oculto_aura_room_mining_ledger
     WHERE user_id = v_uid AND slug = p_slug AND rule_key = 'per_quality_message';
    IF v_last_at IS NOT NULL AND now() - v_last_at < interval '20 seconds' THEN
      ok := false; reason := 'rate_limited'; awarded := 0; balance := 0; RETURN NEXT; RETURN;
    END IF;

    -- Similaridade com últimas 5 mensagens recentes (10 min)
    SELECT count(*) INTO v_recent
      FROM public.oculto_aura_room_mining_ledger l
     WHERE l.user_id = v_uid
       AND l.slug = p_slug
       AND l.rule_key = 'per_quality_message'
       AND l.created_at > now() - interval '10 minutes'
       AND similarity(lower(COALESCE(l.meta->>'msg','')), v_msg) > 0.75;
    IF v_recent > 0 THEN
      ok := false; reason := 'msg_repetitive'; awarded := 0; balance := 0; RETURN NEXT; RETURN;
    END IF;

    RETURN QUERY
      SELECT * FROM public._mining_credit_xp(
        v_uid, p_slug, p_rule_key, p_ref_key,
        jsonb_build_object('msg', v_msg)
      );
    RETURN;
  END IF;

  -- =========== Demais regras ===========
  -- Para "invite_accepted" o convidado credita o convidante (p_target_user_id deve ser o INVITER)
  -- Para "receive_*" o actor credita o RECEIVER do evento
  RETURN QUERY
    SELECT * FROM public._mining_credit_xp(
      v_recipient, p_slug, p_rule_key, p_ref_key,
      jsonb_build_object('actor', v_uid)
    );
END; $$;

-- ============== 10) RPC: métricas 24h para painel admin ==============
CREATE OR REPLACE FUNCTION public.aura_room_mining_metrics_24h()
RETURNS TABLE(rule_key text, total_awards bigint, total_amount bigint, unique_users bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT l.rule_key,
         count(*)::bigint,
         COALESCE(sum(l.amount),0)::bigint,
         count(DISTINCT l.user_id)::bigint
    FROM public.oculto_aura_room_mining_ledger l
   WHERE l.slug = 'mineracao'
     AND l.created_at > now() - interval '24 hours'
   GROUP BY l.rule_key
   ORDER BY l.rule_key;
$$;

-- ============== 11) Grants das funções ==============
GRANT EXECUTE ON FUNCTION public.aura_is_master_admin()                                          TO authenticated;
GRANT EXECUTE ON FUNCTION public.aura_room_mining_rules_list()                                   TO authenticated;
GRANT EXECUTE ON FUNCTION public.aura_room_mining_rules_upsert(text, integer, boolean)           TO authenticated;
GRANT EXECUTE ON FUNCTION public.aura_room_mining_tick(text)                                     TO authenticated;
GRANT EXECUTE ON FUNCTION public.aura_room_mining_award(text, text, text, uuid, text)            TO authenticated;
GRANT EXECUTE ON FUNCTION public.aura_room_mining_metrics_24h()                                  TO authenticated;
-- _mining_credit_xp é interno, sem grant explícito.

NOTIFY pgrst, 'reload schema';

-- =====================================================================
-- 2026-05-31 — Economia de XP nas Interações do Feed
-- Catálogo configurável + ledger idempotente + RPC de cobrança/recompensa.
-- Idempotente. Rodar no SQL Editor do Supabase EXTERNO.
-- =====================================================================

-- 1) Catálogo (master-config)
CREATE TABLE IF NOT EXISTS public.oculto_aura_xp_interaction_costs (
  action_key       text PRIMARY KEY,
  actor_cost       int  NOT NULL DEFAULT 0,
  receiver_reward  int  NOT NULL DEFAULT 0,
  enabled          boolean NOT NULL DEFAULT true,
  description      text,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  updated_by       uuid
);

GRANT SELECT ON public.oculto_aura_xp_interaction_costs TO authenticated;
GRANT ALL ON public.oculto_aura_xp_interaction_costs TO service_role;
ALTER TABLE public.oculto_aura_xp_interaction_costs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "xp_costs_read_all" ON public.oculto_aura_xp_interaction_costs;
CREATE POLICY "xp_costs_read_all"
  ON public.oculto_aura_xp_interaction_costs FOR SELECT TO authenticated USING (true);

-- Seed (idempotente)
INSERT INTO public.oculto_aura_xp_interaction_costs (action_key, actor_cost, receiver_reward, description) VALUES
  ('post_like',     1, 1,  'Curtir um post'),
  ('post_dislike',  1, -3, 'Descurtir um post (penaliza o autor)'),
  ('post_comment',  1, 3,  'Comentar em um post'),
  ('post_save',     1, 2,  'Salvar um post'),
  ('post_share',    1, 5,  'Compartilhar um post'),
  ('view_likers',   5, 5,  'Ver quem curtiu o post'),
  ('view_comments', 5, 5,  'Ler os comentários do post')
ON CONFLICT (action_key) DO NOTHING;

-- 2) Ledger / idempotência
CREATE TABLE IF NOT EXISTS public.oculto_aura_xp_interaction_ledger (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id        uuid NOT NULL,
  receiver_id     uuid,
  action_key      text NOT NULL,
  actor_cost      int NOT NULL DEFAULT 0,
  receiver_reward int NOT NULL DEFAULT 0,
  post_id         uuid,
  ref_key         text NOT NULL UNIQUE,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_xp_ledger_actor    ON public.oculto_aura_xp_interaction_ledger(actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_xp_ledger_receiver ON public.oculto_aura_xp_interaction_ledger(receiver_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_xp_ledger_post     ON public.oculto_aura_xp_interaction_ledger(post_id);
CREATE INDEX IF NOT EXISTS idx_xp_ledger_action   ON public.oculto_aura_xp_interaction_ledger(action_key, created_at DESC);

GRANT SELECT ON public.oculto_aura_xp_interaction_ledger TO authenticated;
GRANT ALL ON public.oculto_aura_xp_interaction_ledger TO service_role;
ALTER TABLE public.oculto_aura_xp_interaction_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "xp_ledger_read_own" ON public.oculto_aura_xp_interaction_ledger;
CREATE POLICY "xp_ledger_read_own"
  ON public.oculto_aura_xp_interaction_ledger FOR SELECT TO authenticated
  USING (
    actor_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    OR receiver_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  );

-- Realtime
ALTER TABLE public.oculto_aura_xp_interaction_ledger REPLICA IDENTITY FULL;
DO $$ BEGIN
  PERFORM 1 FROM pg_publication_tables
   WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='oculto_aura_xp_interaction_ledger';
  IF NOT FOUND THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.oculto_aura_xp_interaction_ledger';
  END IF;
END $$;

-- 3) Helper: master check via email/username
CREATE OR REPLACE FUNCTION public._aura_xp_is_master()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users u
     WHERE u.id = auth.uid()
       AND lower(coalesce(u.email,'')) = 'ocultomaster@ocultoswing.com.br'
  ) OR EXISTS (
    SELECT 1 FROM public.profiles p
     WHERE p.user_id = auth.uid()
       AND lower(coalesce(p.username,'')) = 'ocultomaster'
  );
$$;
GRANT EXECUTE ON FUNCTION public._aura_xp_is_master() TO authenticated;

-- 4) RPC: lista config (qualquer autenticado pode ler para o frontend)
CREATE OR REPLACE FUNCTION public.aura_xp_interaction_config_list()
RETURNS SETOF public.oculto_aura_xp_interaction_costs
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM public.oculto_aura_xp_interaction_costs ORDER BY action_key;
$$;
GRANT EXECUTE ON FUNCTION public.aura_xp_interaction_config_list() TO authenticated;

-- 5) RPC: upsert (somente master)
CREATE OR REPLACE FUNCTION public.aura_xp_interaction_config_upsert(
  p_action_key text,
  p_actor_cost int,
  p_receiver_reward int,
  p_enabled boolean
)
RETURNS public.oculto_aura_xp_interaction_costs
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row public.oculto_aura_xp_interaction_costs;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF NOT public._aura_xp_is_master() THEN RAISE EXCEPTION 'master only'; END IF;

  INSERT INTO public.oculto_aura_xp_interaction_costs(action_key, actor_cost, receiver_reward, enabled, updated_at, updated_by)
  VALUES (p_action_key, GREATEST(0, COALESCE(p_actor_cost,0)), COALESCE(p_receiver_reward,0), COALESCE(p_enabled,true), now(), auth.uid())
  ON CONFLICT (action_key) DO UPDATE
    SET actor_cost = EXCLUDED.actor_cost,
        receiver_reward = EXCLUDED.receiver_reward,
        enabled = EXCLUDED.enabled,
        updated_at = now(),
        updated_by = auth.uid()
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;
GRANT EXECUTE ON FUNCTION public.aura_xp_interaction_config_upsert(text,int,int,boolean) TO authenticated;

-- 6) RPC principal: cobrar/recompensar
CREATE OR REPLACE FUNCTION public.aura_xp_interaction_charge(
  p_action_key  text,
  p_post_id     uuid,
  p_receiver_id uuid,
  p_ref_key     text
)
RETURNS TABLE(
  ok               boolean,
  reason           text,
  actor_cost       int,
  receiver_reward  int,
  actor_balance    int,
  receiver_balance int
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid          uuid := auth.uid();
  v_actor_pid    uuid;
  v_cfg          public.oculto_aura_xp_interaction_costs;
  v_actor_xp     int;
  v_receiver_xp  int;
  v_already      boolean;
BEGIN
  IF v_uid IS NULL THEN
    RETURN QUERY SELECT false, 'auth_required', 0, 0, 0, 0; RETURN;
  END IF;

  SELECT id INTO v_actor_pid FROM public.profiles
   WHERE id = v_uid OR user_id = v_uid LIMIT 1;
  IF v_actor_pid IS NULL THEN
    RETURN QUERY SELECT false, 'profile_missing', 0, 0, 0, 0; RETURN;
  END IF;

  SELECT * INTO v_cfg FROM public.oculto_aura_xp_interaction_costs WHERE action_key = p_action_key;
  IF NOT FOUND THEN
    RETURN QUERY SELECT true, 'no_config', 0, 0,
      COALESCE((SELECT aura_xp FROM public.profiles WHERE id = v_actor_pid),0), 0;
    RETURN;
  END IF;

  IF NOT v_cfg.enabled THEN
    RETURN QUERY SELECT true, 'disabled', 0, 0,
      COALESCE((SELECT aura_xp FROM public.profiles WHERE id = v_actor_pid),0),
      COALESCE((SELECT aura_xp FROM public.profiles WHERE id = p_receiver_id),0);
    RETURN;
  END IF;

  -- Idempotência
  SELECT EXISTS(SELECT 1 FROM public.oculto_aura_xp_interaction_ledger WHERE ref_key = p_ref_key) INTO v_already;
  IF v_already THEN
    RETURN QUERY SELECT true, 'already_charged', v_cfg.actor_cost, v_cfg.receiver_reward,
      COALESCE((SELECT aura_xp FROM public.profiles WHERE id = v_actor_pid),0),
      COALESCE((SELECT aura_xp FROM public.profiles WHERE id = p_receiver_id),0);
    RETURN;
  END IF;

  -- Self-action: sem cobrança nem premiação
  IF p_receiver_id IS NOT NULL AND p_receiver_id = v_actor_pid THEN
    RETURN QUERY SELECT true, 'self_action', 0, 0,
      COALESCE((SELECT aura_xp FROM public.profiles WHERE id = v_actor_pid),0),
      COALESCE((SELECT aura_xp FROM public.profiles WHERE id = p_receiver_id),0);
    RETURN;
  END IF;

  -- Saldo do actor
  SELECT COALESCE(aura_xp,0) INTO v_actor_xp FROM public.profiles WHERE id = v_actor_pid FOR UPDATE;

  IF v_actor_xp < v_cfg.actor_cost THEN
    RETURN QUERY SELECT false, 'insufficient_xp', v_cfg.actor_cost, v_cfg.receiver_reward, v_actor_xp,
      COALESCE((SELECT aura_xp FROM public.profiles WHERE id = p_receiver_id),0);
    RETURN;
  END IF;

  -- Debita actor
  UPDATE public.profiles SET aura_xp = GREATEST(0, COALESCE(aura_xp,0) - v_cfg.actor_cost)
   WHERE id = v_actor_pid
   RETURNING aura_xp INTO v_actor_xp;

  -- Aplica reward no receiver (pode ser negativo)
  IF p_receiver_id IS NOT NULL AND v_cfg.receiver_reward <> 0 THEN
    UPDATE public.profiles
       SET aura_xp = GREATEST(0, COALESCE(aura_xp,0) + v_cfg.receiver_reward)
     WHERE id = p_receiver_id
     RETURNING aura_xp INTO v_receiver_xp;
  ELSE
    SELECT COALESCE(aura_xp,0) INTO v_receiver_xp FROM public.profiles WHERE id = p_receiver_id;
  END IF;

  -- Audit
  INSERT INTO public.oculto_aura_xp_interaction_ledger
    (actor_id, receiver_id, action_key, actor_cost, receiver_reward, post_id, ref_key)
  VALUES
    (v_actor_pid, p_receiver_id, p_action_key, v_cfg.actor_cost, v_cfg.receiver_reward, p_post_id, p_ref_key);

  RETURN QUERY SELECT true, 'ok', v_cfg.actor_cost, v_cfg.receiver_reward,
    COALESCE(v_actor_xp,0), COALESCE(v_receiver_xp,0);
END;
$$;
GRANT EXECUTE ON FUNCTION public.aura_xp_interaction_charge(text,uuid,uuid,text) TO authenticated;

-- 7) RPC: métricas 24h por ação (master/admin)
CREATE OR REPLACE FUNCTION public.aura_xp_interaction_metrics_24h()
RETURNS TABLE(action_key text, count_24h int, total_actor_cost int, total_receiver_reward int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT action_key,
         COUNT(*)::int,
         COALESCE(SUM(actor_cost),0)::int,
         COALESCE(SUM(receiver_reward),0)::int
    FROM public.oculto_aura_xp_interaction_ledger
   WHERE created_at >= now() - interval '24 hours'
   GROUP BY action_key
   ORDER BY action_key;
$$;
GRANT EXECUTE ON FUNCTION public.aura_xp_interaction_metrics_24h() TO authenticated;

NOTIFY pgrst, 'reload schema';

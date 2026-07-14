-- ============================================================
-- PASSO 1 — Sistema centralizado de planos e rate limit
-- Banco-alvo: Supabase EXTERNO (rvybbrkzmboqbhcemqar)
-- Como aplicar: Supabase Dashboard > SQL Editor > New query >
-- cole este arquivo inteiro > Run.
--
-- Idempotente: pode ser rodado múltiplas vezes sem erro.
-- Não afeta nenhuma tabela ou função existente.
-- ============================================================

-- 1) plan_permissions: toggles editáveis por (plano, feature)
CREATE TABLE IF NOT EXISTS public.plan_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan text NOT NULL CHECK (plan IN ('free','premium','vip')),
  feature text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(plan, feature)
);

ALTER TABLE public.plan_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone authenticated can read plan permissions" ON public.plan_permissions;
CREATE POLICY "Anyone authenticated can read plan permissions"
  ON public.plan_permissions FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins can insert plan permissions" ON public.plan_permissions;
CREATE POLICY "Admins can insert plan permissions"
  ON public.plan_permissions FOR INSERT
  TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can update plan permissions" ON public.plan_permissions;
CREATE POLICY "Admins can update plan permissions"
  ON public.plan_permissions FOR UPDATE
  TO authenticated USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can delete plan permissions" ON public.plan_permissions;
CREATE POLICY "Admins can delete plan permissions"
  ON public.plan_permissions FOR DELETE
  TO authenticated USING (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS update_plan_permissions_updated_at ON public.plan_permissions;
CREATE TRIGGER update_plan_permissions_updated_at
  BEFORE UPDATE ON public.plan_permissions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) usage_limits: valor + janela (segundos) por (plano, feature)
CREATE TABLE IF NOT EXISTS public.usage_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan text NOT NULL CHECK (plan IN ('free','premium','vip')),
  feature text NOT NULL,
  limit_value integer NOT NULL CHECK (limit_value >= 0),
  period_seconds integer NOT NULL CHECK (period_seconds > 0),
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(plan, feature)
);

ALTER TABLE public.usage_limits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone authenticated can read usage limits" ON public.usage_limits;
CREATE POLICY "Anyone authenticated can read usage limits"
  ON public.usage_limits FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins can insert usage limits" ON public.usage_limits;
CREATE POLICY "Admins can insert usage limits"
  ON public.usage_limits FOR INSERT
  TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can update usage limits" ON public.usage_limits;
CREATE POLICY "Admins can update usage limits"
  ON public.usage_limits FOR UPDATE
  TO authenticated USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can delete usage limits" ON public.usage_limits;
CREATE POLICY "Admins can delete usage limits"
  ON public.usage_limits FOR DELETE
  TO authenticated USING (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS update_usage_limits_updated_at ON public.usage_limits;
CREATE TRIGGER update_usage_limits_updated_at
  BEFORE UPDATE ON public.usage_limits
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) usage_counters: contador atômico por janela
CREATE TABLE IF NOT EXISTS public.usage_counters (
  user_id uuid NOT NULL,
  feature text NOT NULL,
  window_start timestamptz NOT NULL,
  count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, feature, window_start)
);

CREATE INDEX IF NOT EXISTS idx_usage_counters_user_feature
  ON public.usage_counters(user_id, feature, window_start DESC);

ALTER TABLE public.usage_counters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own counters" ON public.usage_counters;
CREATE POLICY "Users can read own counters"
  ON public.usage_counters FOR SELECT
  TO authenticated USING (
    user_id = auth.uid() OR public.has_role(auth.uid(), 'admin')
  );
-- INSERT/UPDATE só via RPC SECURITY DEFINER. Sem policy = bloqueado.

-- 4) RPC atômica: check + incremento
CREATE OR REPLACE FUNCTION public.check_and_increment_usage(_feature text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_plan text;
  v_limit int;
  v_period int;
  v_window timestamptz;
  v_count int;
  v_enabled boolean;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'unauthenticated');
  END IF;

  -- Identifica plano (fallback free). Tenta user_id e id (mapping resiliente).
  SELECT COALESCE(plan_type, 'free') INTO v_plan
  FROM public.profiles
  WHERE user_id = v_user_id
  LIMIT 1;

  IF v_plan IS NULL THEN
    SELECT COALESCE(plan_type, 'free') INTO v_plan
    FROM public.profiles WHERE id = v_user_id LIMIT 1;
  END IF;

  v_plan := COALESCE(v_plan, 'free');

  -- Normaliza variantes legadas
  v_plan := CASE
    WHEN v_plan IN ('monthly','mensal','annual','anual','yearly') THEN 'premium'
    WHEN v_plan = 'vip' THEN 'vip'
    WHEN v_plan = 'premium' THEN 'premium'
    ELSE 'free'
  END;

  -- Verifica se a feature está habilitada para o plano
  SELECT enabled INTO v_enabled
  FROM public.plan_permissions
  WHERE plan = v_plan AND feature = _feature;

  IF v_enabled IS FALSE THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'feature_disabled',
      'plan', v_plan
    );
  END IF;

  -- Busca limite. Se não existe → liberado (sem cap)
  SELECT limit_value, period_seconds INTO v_limit, v_period
  FROM public.usage_limits
  WHERE plan = v_plan AND feature = _feature;

  IF v_limit IS NULL THEN
    RETURN jsonb_build_object(
      'allowed', true,
      'plan', v_plan,
      'unlimited', true
    );
  END IF;

  -- Janela alinhada (rolling fixo). Ex.: 2h → 00:00, 02:00, 04:00...
  v_window := to_timestamp(
    floor(extract(epoch FROM now())::bigint / v_period) * v_period
  );

  INSERT INTO public.usage_counters(user_id, feature, window_start, count, updated_at)
    VALUES (v_user_id, _feature, v_window, 1, now())
    ON CONFLICT (user_id, feature, window_start)
    DO UPDATE SET count = public.usage_counters.count + 1,
                  updated_at = now()
    RETURNING count INTO v_count;

  RETURN jsonb_build_object(
    'allowed', v_count <= v_limit,
    'count', v_count,
    'limit', v_limit,
    'plan', v_plan,
    'reset_at', v_window + (v_period * interval '1 second'),
    'reason', CASE WHEN v_count > v_limit THEN 'limit_exceeded' ELSE NULL END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.check_and_increment_usage(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_and_increment_usage(text) TO authenticated;

-- 5) RPC peek_usage: lê sem incrementar (UI mostra "restam X")
CREATE OR REPLACE FUNCTION public.peek_usage(_feature text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_plan text;
  v_limit int;
  v_period int;
  v_window timestamptz;
  v_count int;
  v_enabled boolean;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'unauthenticated');
  END IF;

  SELECT COALESCE(plan_type, 'free') INTO v_plan
  FROM public.profiles WHERE user_id = v_user_id LIMIT 1;
  IF v_plan IS NULL THEN
    SELECT COALESCE(plan_type, 'free') INTO v_plan
    FROM public.profiles WHERE id = v_user_id LIMIT 1;
  END IF;
  v_plan := COALESCE(v_plan, 'free');
  v_plan := CASE
    WHEN v_plan IN ('monthly','mensal','annual','anual','yearly') THEN 'premium'
    WHEN v_plan = 'vip' THEN 'vip'
    WHEN v_plan = 'premium' THEN 'premium'
    ELSE 'free'
  END;

  SELECT enabled INTO v_enabled
  FROM public.plan_permissions WHERE plan = v_plan AND feature = _feature;

  IF v_enabled IS FALSE THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'feature_disabled', 'plan', v_plan);
  END IF;

  SELECT limit_value, period_seconds INTO v_limit, v_period
  FROM public.usage_limits WHERE plan = v_plan AND feature = _feature;

  IF v_limit IS NULL THEN
    RETURN jsonb_build_object('allowed', true, 'plan', v_plan, 'unlimited', true);
  END IF;

  v_window := to_timestamp(
    floor(extract(epoch FROM now())::bigint / v_period) * v_period
  );

  SELECT count INTO v_count
  FROM public.usage_counters
  WHERE user_id = v_user_id AND feature = _feature AND window_start = v_window;

  v_count := COALESCE(v_count, 0);

  RETURN jsonb_build_object(
    'allowed', v_count < v_limit,
    'count', v_count,
    'limit', v_limit,
    'plan', v_plan,
    'reset_at', v_window + (v_period * interval '1 second')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.peek_usage(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.peek_usage(text) TO authenticated;

-- 6) SEED — limites default (do prompt)
INSERT INTO public.usage_limits (plan, feature, limit_value, period_seconds, description) VALUES
  ('free', 'feed_view',     10, 7200,  'Visualizações de feed a cada 2h'),
  ('free', 'chat_msg',      10, 86400, 'Mensagens de chat por dia'),
  ('free', 'match',          5, 86400, 'Rodadas de match por dia'),
  ('free', 'comment',        5, 86400, 'Comentários por dia'),
  ('free', 'like',          20, 86400, 'Curtidas por dia'),
  ('free', 'profile_view',  15, 86400, 'Perfis vistos por dia'),
  ('free', 'story_view',    30, 86400, 'Stories vistos por dia'),
  ('premium', 'feed_view',    1000, 7200,  'Feed a cada 2h'),
  ('premium', 'chat_msg',     1000, 86400, 'Mensagens por dia'),
  ('premium', 'match',         200, 86400, 'Matches por dia'),
  ('premium', 'comment',       500, 86400, 'Comentários por dia'),
  ('premium', 'like',         1000, 86400, 'Curtidas por dia'),
  ('premium', 'profile_view',  500, 86400, 'Perfis por dia'),
  ('premium', 'story_view',   1000, 86400, 'Stories por dia'),
  ('vip', 'feed_view',    10000, 7200,  'Feed a cada 2h'),
  ('vip', 'chat_msg',     10000, 86400, 'Mensagens por dia'),
  ('vip', 'match',         2000, 86400, 'Matches por dia'),
  ('vip', 'comment',       5000, 86400, 'Comentários por dia'),
  ('vip', 'like',         10000, 86400, 'Curtidas por dia'),
  ('vip', 'profile_view',  5000, 86400, 'Perfis por dia'),
  ('vip', 'story_view',   10000, 86400, 'Stories por dia')
ON CONFLICT (plan, feature) DO NOTHING;

-- 7) SEED — permissões espelhando usePlanPermissions
INSERT INTO public.plan_permissions (plan, feature, enabled, description) VALUES
  -- FREE
  ('free', 'create_events',        false, 'Criar eventos'),
  ('free', 'view_profile_visits',  false, 'Ver quem visitou'),
  ('free', 'create_auctions',      false, 'Criar leilões'),
  ('free', 'create_paid_content',  false, 'Postar conteúdo pago'),
  ('free', 'create_coupons',       false, 'Criar cupons'),
  ('free', 'use_super_dm',         false, 'Enviar Super DM'),
  ('free', 'create_goals',         false, 'Metas de arrecadação'),
  ('free', 'use_referral_invites', false, 'Convide e Ganhe'),
  ('free', 'use_madrinha_program', false, 'Programa Madrinhas'),
  ('free', 'create_broadcasts',    false, 'Mensagens em massa'),
  ('free', 'send_chat_audio',      false, 'Áudio no chat'),
  ('free', 'send_chat_video',      false, 'Vídeo no chat'),
  ('free', 'use_chat_camera',      false, 'Câmera no chat'),
  ('free', 'private_profile',      false, 'Privar perfil'),
  ('free', 'hide_online_status',   false, 'Ocultar status online'),
  ('free', 'finance_panel',        false, 'Painel financeiro'),
  ('free', 'withdraw',             false, 'Saque'),
  -- PREMIUM
  ('premium', 'create_events',        true,  null),
  ('premium', 'view_profile_visits',  true,  null),
  ('premium', 'create_auctions',      false, 'Apenas VIP'),
  ('premium', 'create_paid_content',  false, 'Apenas VIP'),
  ('premium', 'create_coupons',       false, 'Apenas VIP'),
  ('premium', 'use_super_dm',         true,  null),
  ('premium', 'create_goals',         true,  null),
  ('premium', 'use_referral_invites', true,  null),
  ('premium', 'use_madrinha_program', true,  null),
  ('premium', 'create_broadcasts',    true,  null),
  ('premium', 'send_chat_audio',      true,  null),
  ('premium', 'send_chat_video',      true,  null),
  ('premium', 'use_chat_camera',      true,  null),
  ('premium', 'private_profile',      true,  null),
  ('premium', 'hide_online_status',   true,  null),
  ('premium', 'finance_panel',        true,  null),
  ('premium', 'withdraw',             true,  null),
  -- VIP (tudo liberado)
  ('vip', 'create_events',        true, null),
  ('vip', 'view_profile_visits',  true, null),
  ('vip', 'create_auctions',      true, null),
  ('vip', 'create_paid_content',  true, null),
  ('vip', 'create_coupons',       true, null),
  ('vip', 'use_super_dm',         true, null),
  ('vip', 'create_goals',         true, null),
  ('vip', 'use_referral_invites', true, null),
  ('vip', 'use_madrinha_program', true, null),
  ('vip', 'create_broadcasts',    true, null),
  ('vip', 'send_chat_audio',      true, null),
  ('vip', 'send_chat_video',      true, null),
  ('vip', 'use_chat_camera',      true, null),
  ('vip', 'private_profile',      true, null),
  ('vip', 'hide_online_status',   true, null),
  ('vip', 'hide_age',             true, null),
  ('vip', 'hide_location',        true, null),
  ('vip', 'anonymous_ranking',    true, null),
  ('vip', 'finance_panel',        true, null),
  ('vip', 'withdraw',             true, null)
ON CONFLICT (plan, feature) DO NOTHING;

-- ============================================================
-- Validação rápida (opcional)
-- ============================================================
-- SELECT plan, count(*) FROM public.plan_permissions GROUP BY plan;
-- SELECT plan, feature, limit_value, period_seconds FROM public.usage_limits ORDER BY plan, feature;
-- SELECT public.peek_usage('like');

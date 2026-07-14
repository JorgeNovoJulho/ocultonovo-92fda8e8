-- =====================================================================
-- 2026_05_25_beta_access_grants.sql
-- Acesso BETA simulado (sem cobrança real) para Canais VIP / PPV.
-- Idempotente. Aplicar via SQL Editor do Supabase EXTERNO.
-- =====================================================================

-- 1) TABELA -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.beta_access_grants (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL,                 -- auth.users.id
  profile_id  UUID,                          -- profiles.id do comprador
  creator_id  UUID,                          -- profiles.id do criador (assinatura/canal)
  post_id     UUID,                          -- posts.id (conteúdo pago avulso)
  plan_id     UUID,                          -- subscription_plans.id (opcional)
  grant_type  TEXT NOT NULL CHECK (grant_type IN ('paid_content','creator_subscription')),
  source      TEXT DEFAULT 'beta_checkout',
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked','expired')),
  expires_at  TIMESTAMPTZ,
  metadata    JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_beta_grants_user_status   ON public.beta_access_grants(user_id, status);
CREATE INDEX IF NOT EXISTS idx_beta_grants_post_status   ON public.beta_access_grants(post_id, status);
CREATE INDEX IF NOT EXISTS idx_beta_grants_creator_status ON public.beta_access_grants(creator_id, status);
CREATE INDEX IF NOT EXISTS idx_beta_grants_plan          ON public.beta_access_grants(plan_id, status);

-- Evita duplicatas ativas
CREATE UNIQUE INDEX IF NOT EXISTS uq_beta_grants_active_post
  ON public.beta_access_grants(user_id, post_id) WHERE status = 'active' AND post_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_beta_grants_active_creator
  ON public.beta_access_grants(user_id, creator_id) WHERE status = 'active' AND creator_id IS NOT NULL AND post_id IS NULL;

-- 2) RLS --------------------------------------------------------------
ALTER TABLE public.beta_access_grants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "beta_grants_self_select"  ON public.beta_access_grants;
DROP POLICY IF EXISTS "beta_grants_master_all"   ON public.beta_access_grants;

CREATE POLICY "beta_grants_self_select"
  ON public.beta_access_grants FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "beta_grants_master_all"
  ON public.beta_access_grants FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid() AND p.username = 'ocultomaster'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid() AND p.username = 'ocultomaster'
    )
  );

-- 3) RPC: conceder acesso beta ---------------------------------------
CREATE OR REPLACE FUNCTION public.grant_beta_access(
  p_grant_type TEXT,
  p_post_id    UUID DEFAULT NULL,
  p_creator_id UUID DEFAULT NULL,
  p_plan_id    UUID DEFAULT NULL,
  p_metadata   JSONB DEFAULT '{}'::jsonb
)
RETURNS public.beta_access_grants
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid       UUID := auth.uid();
  v_profile   UUID;
  v_runtime   public.platform_runtime_settings;
  v_grant     public.beta_access_grants;
  v_feature_off BOOLEAN;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED';
  END IF;

  SELECT * INTO v_runtime FROM public.platform_runtime_settings ORDER BY created_at LIMIT 1;
  IF v_runtime IS NULL THEN
    RAISE EXCEPTION 'RUNTIME_SETTINGS_MISSING';
  END IF;

  -- Só permite grant em modo beta E com a feature paga desligada
  IF v_runtime.platform_mode <> 'beta' THEN
    RAISE EXCEPTION 'BETA_GRANT_ONLY_IN_BETA_MODE';
  END IF;

  v_feature_off :=
    CASE p_grant_type
      WHEN 'paid_content'          THEN COALESCE(NOT v_runtime.paid_content_enabled, TRUE)
      WHEN 'creator_subscription'  THEN COALESCE(NOT v_runtime.subscriptions_enabled OR NOT v_runtime.vip_channels_enabled, TRUE)
      ELSE FALSE
    END;

  IF NOT v_feature_off THEN
    RAISE EXCEPTION 'FEATURE_ALREADY_LIVE_USE_REAL_CHECKOUT';
  END IF;

  SELECT id INTO v_profile FROM public.profiles WHERE user_id = v_uid LIMIT 1;

  INSERT INTO public.beta_access_grants
    (user_id, profile_id, creator_id, post_id, plan_id, grant_type, metadata)
  VALUES
    (v_uid, v_profile, p_creator_id, p_post_id, p_plan_id, p_grant_type, COALESCE(p_metadata, '{}'::jsonb))
  ON CONFLICT DO NOTHING
  RETURNING * INTO v_grant;

  IF v_grant.id IS NULL THEN
    SELECT * INTO v_grant
      FROM public.beta_access_grants
     WHERE user_id = v_uid
       AND status  = 'active'
       AND grant_type = p_grant_type
       AND COALESCE(post_id, '00000000-0000-0000-0000-000000000000') = COALESCE(p_post_id, '00000000-0000-0000-0000-000000000000')
       AND COALESCE(creator_id, '00000000-0000-0000-0000-000000000000') = COALESCE(p_creator_id, '00000000-0000-0000-0000-000000000000')
     LIMIT 1;
  END IF;

  RETURN v_grant;
END;
$$;

GRANT EXECUTE ON FUNCTION public.grant_beta_access(TEXT, UUID, UUID, UUID, JSONB) TO authenticated;

-- 4) RPCs de consulta -------------------------------------------------
CREATE OR REPLACE FUNCTION public.has_beta_post_access(p_user UUID, p_post UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.beta_access_grants
    WHERE user_id = p_user AND post_id = p_post
      AND status = 'active'
      AND (expires_at IS NULL OR expires_at > NOW())
  );
$$;

CREATE OR REPLACE FUNCTION public.has_beta_creator_access(p_user UUID, p_creator UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.beta_access_grants
    WHERE user_id = p_user AND creator_id = p_creator
      AND grant_type = 'creator_subscription'
      AND status = 'active'
      AND (expires_at IS NULL OR expires_at > NOW())
  );
$$;

GRANT EXECUTE ON FUNCTION public.has_beta_post_access(UUID, UUID)    TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_beta_creator_access(UUID, UUID) TO authenticated;

-- 5) RPC: revogar grants beta de monetização -------------------------
CREATE OR REPLACE FUNCTION public.revoke_beta_monetization_grants()
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_is_master BOOLEAN;
  v_count     INTEGER;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND username = 'ocultomaster'
  ) INTO v_is_master;

  IF NOT v_is_master THEN
    RAISE EXCEPTION 'MASTER_ONLY';
  END IF;

  UPDATE public.beta_access_grants
     SET status = 'revoked', revoked_at = NOW()
   WHERE status = 'active'
     AND grant_type IN ('paid_content','creator_subscription');

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.revoke_beta_monetization_grants() TO authenticated;

-- 6) RPC: métricas admin ---------------------------------------------
CREATE OR REPLACE FUNCTION public.beta_grants_summary()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_is_master BOOLEAN;
  v_result    JSONB;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND username = 'ocultomaster'
  ) INTO v_is_master;

  IF NOT v_is_master THEN
    RAISE EXCEPTION 'MASTER_ONLY';
  END IF;

  SELECT jsonb_build_object(
    'total_active',          COUNT(*) FILTER (WHERE status = 'active'),
    'active_paid_content',   COUNT(*) FILTER (WHERE status = 'active' AND grant_type = 'paid_content'),
    'active_subscriptions',  COUNT(*) FILTER (WHERE status = 'active' AND grant_type = 'creator_subscription'),
    'total_revoked',         COUNT(*) FILTER (WHERE status = 'revoked'),
    'unique_users_active',   COUNT(DISTINCT user_id) FILTER (WHERE status = 'active')
  ) INTO v_result
  FROM public.beta_access_grants;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.beta_grants_summary() TO authenticated;

-- 7) TRIGGER: ao ligar monetização, revoga grants beta ---------------
CREATE OR REPLACE FUNCTION public.auto_revoke_beta_grants_on_monetization()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF (NEW.monetization_enabled IS TRUE AND OLD.monetization_enabled IS NOT TRUE)
     OR (NEW.subscriptions_enabled IS TRUE AND OLD.subscriptions_enabled IS NOT TRUE)
     OR (NEW.paid_content_enabled IS TRUE AND OLD.paid_content_enabled IS NOT TRUE)
     OR (NEW.vip_channels_enabled IS TRUE AND OLD.vip_channels_enabled IS NOT TRUE)
  THEN
    UPDATE public.beta_access_grants
       SET status = 'revoked', revoked_at = NOW()
     WHERE status = 'active'
       AND grant_type IN ('paid_content','creator_subscription');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_revoke_beta_grants ON public.platform_runtime_settings;
CREATE TRIGGER trg_auto_revoke_beta_grants
AFTER UPDATE ON public.platform_runtime_settings
FOR EACH ROW EXECUTE FUNCTION public.auto_revoke_beta_grants_on_monetization();

-- =====================================================================
-- PRIORIDADE 1 — Social Core Engine (RPC unificada estendida)
-- Estende social_identity_get com magnetism, popularity, rarity,
-- compatibility_signals e reputation_flags. Idempotente.
-- Cole inteiro no SQL Editor do Supabase EXTERNO.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Tabela de configuração do Social Core (admin master controla)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.oculto_social_core_config (
  id text PRIMARY KEY DEFAULT 'singleton',
  weights      jsonb NOT NULL DEFAULT '{"aura":0.30,"prestige":0.25,"trust":0.20,"popularity":0.15,"magnetism":0.10}'::jsonb,
  thresholds   jsonb NOT NULL DEFAULT '{"min_score_to_match":0,"min_trust_to_message":20,"shadowban_score":-30}'::jsonb,
  multipliers  jsonb NOT NULL DEFAULT '{"premium":1.15,"vip":1.30}'::jsonb,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT singleton_only CHECK (id = 'singleton')
);

INSERT INTO public.oculto_social_core_config (id) VALUES ('singleton')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.oculto_social_core_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "social_core_config_read_all" ON public.oculto_social_core_config;
CREATE POLICY "social_core_config_read_all"
  ON public.oculto_social_core_config FOR SELECT
  TO authenticated USING (true);

-- (escrita só via RPC com checagem de admin)

-- ---------------------------------------------------------------------
-- 2) RPC estendida: social_core_identity_get
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.social_core_identity_get(p_user uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid;
  v_base jsonb;
  v_magnet jsonb;
  v_pop jsonb;
  v_compat jsonb;
  v_rep jsonb;
  v_profile RECORD;
  v_attn_recv int := 0;
  v_attn_sent int := 0;
  v_destiny_count int := 0;
  v_followers int := 0;
  v_best_aff int := 0;
  v_dom_rarity text := 'common';
  v_trust_score int := 0;
  v_trust_tier text := 'critical';
  v_shadow boolean := false;
BEGIN
  v_user := COALESCE(p_user, auth.uid());
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('error', 'no_user');
  END IF;

  -- Base (Onda A) — reusa contrato existente
  v_base := public.social_identity_get(v_user);

  -- Magnetismo: boost ativo agora
  BEGIN
    SELECT jsonb_build_object(
      'active', true,
      'multiplier', mb.multiplier,
      'ends_at', mb.ends_at,
      'source', mb.source
    ) INTO v_magnet
    FROM public.oculto_magnetic_boosts mb
    WHERE mb.user_id = v_user AND mb.ends_at > now()
    ORDER BY mb.ends_at DESC
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN v_magnet := NULL; END;

  IF v_magnet IS NULL THEN
    v_magnet := jsonb_build_object('active', false, 'multiplier', 1.0, 'ends_at', null, 'source', null);
  END IF;

  -- Popularidade: 7 dias
  BEGIN
    SELECT count(*) INTO v_attn_recv
    FROM public.oculto_aura_attentions
    WHERE target_id = v_user AND created_at > now() - interval '7 days';
  EXCEPTION WHEN OTHERS THEN v_attn_recv := 0; END;

  BEGIN
    SELECT count(*) INTO v_attn_sent
    FROM public.oculto_aura_attentions
    WHERE sender_id = v_user AND created_at > now() - interval '7 days';
  EXCEPTION WHEN OTHERS THEN v_attn_sent := 0; END;

  BEGIN
    SELECT count(*) INTO v_destiny_count
    FROM public.oculto_destiny_links
    WHERE user_a = v_user OR user_b = v_user;
  EXCEPTION WHEN OTHERS THEN v_destiny_count := 0; END;

  BEGIN
    SELECT count(*) INTO v_followers
    FROM public.followers
    WHERE following_id = v_user;
  EXCEPTION WHEN OTHERS THEN v_followers := 0; END;

  v_pop := jsonb_build_object(
    'attention_received_7d', v_attn_recv,
    'attention_sent_7d', v_attn_sent,
    'destiny_links', v_destiny_count,
    'followers', v_followers
  );

  -- Compatibilidade: melhor afinidade + raridade dominante
  BEGIN
    SELECT COALESCE(MAX(affinity), 0) INTO v_best_aff
    FROM public.oculto_destiny_links
    WHERE user_a = v_user OR user_b = v_user;

    SELECT rarity INTO v_dom_rarity
    FROM public.oculto_destiny_links
    WHERE user_a = v_user OR user_b = v_user
    GROUP BY rarity
    ORDER BY count(*) DESC
    LIMIT 1;
    IF v_dom_rarity IS NULL THEN v_dom_rarity := 'common'; END IF;
  EXCEPTION WHEN OTHERS THEN
    v_best_aff := 0; v_dom_rarity := 'common';
  END;

  v_compat := jsonb_build_object(
    'rarity', v_dom_rarity,
    'best_affinity', v_best_aff,
    'total_links', v_destiny_count
  );

  -- Reputação: trust tier + flags do profile
  BEGIN
    SELECT
      COALESCE(p.is_verified, false)        AS is_verified,
      COALESCE(p.subscription_plan, 'free') AS plan,
      COALESCE(p.shadowbanned, false)       AS shadowbanned
    INTO v_profile
    FROM public.profiles p
    WHERE p.id = v_user
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN v_profile := NULL; END;

  BEGIN
    SELECT score INTO v_trust_score
    FROM public.user_trust_scores
    WHERE user_id = v_user
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN v_trust_score := 0; END;
  v_trust_score := COALESCE(v_trust_score, 0);

  v_trust_tier := CASE
    WHEN v_trust_score >= 80 THEN 'excellent'
    WHEN v_trust_score >= 60 THEN 'good'
    WHEN v_trust_score >= 40 THEN 'regular'
    WHEN v_trust_score >= 20 THEN 'low'
    ELSE 'critical'
  END;

  v_shadow := COALESCE((v_profile).shadowbanned, false);

  v_rep := jsonb_build_object(
    'trust_tier',    v_trust_tier,
    'is_verified',   COALESCE((v_profile).is_verified, false),
    'is_premium',    COALESCE((v_profile).plan, 'free') IN ('premium','premium_annual'),
    'is_vip',        COALESCE((v_profile).plan, 'free') IN ('vip','vip_annual'),
    'shadowbanned',  v_shadow
  );

  RETURN jsonb_build_object(
    'user_id', v_user,
    'score',                v_base->'score',
    'prestige',             v_base->'prestige',
    'trust',                v_base->'trust',
    'aura',                 v_base->'aura',
    'magnetism',            v_magnet,
    'popularity',           v_pop,
    'compatibility_signals',v_compat,
    'reputation_flags',     v_rep,
    'updated_at', now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.social_core_identity_get(uuid) TO anon, authenticated;

-- ---------------------------------------------------------------------
-- 3) Update da config (somente admin master)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.social_core_config_update(
  p_weights jsonb DEFAULT NULL,
  p_thresholds jsonb DEFAULT NULL,
  p_multipliers jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_master boolean := false;
BEGIN
  -- Tenta has_role('master_admin'); cai para profiles.is_master se não existir
  BEGIN
    SELECT public.has_role(auth.uid(), 'master_admin') INTO v_is_master;
  EXCEPTION WHEN OTHERS THEN
    BEGIN
      SELECT COALESCE(is_master, false) INTO v_is_master FROM public.profiles WHERE id = auth.uid();
    EXCEPTION WHEN OTHERS THEN v_is_master := false; END;
  END;

  IF NOT COALESCE(v_is_master, false) THEN
    RAISE EXCEPTION 'forbidden: master admin only';
  END IF;

  UPDATE public.oculto_social_core_config
     SET weights     = COALESCE(p_weights,     weights),
         thresholds  = COALESCE(p_thresholds,  thresholds),
         multipliers = COALESCE(p_multipliers, multipliers),
         updated_at  = now()
   WHERE id = 'singleton';

  RETURN (SELECT to_jsonb(c.*) FROM public.oculto_social_core_config c WHERE c.id = 'singleton');
END;
$$;

GRANT EXECUTE ON FUNCTION public.social_core_config_update(jsonb, jsonb, jsonb) TO authenticated;

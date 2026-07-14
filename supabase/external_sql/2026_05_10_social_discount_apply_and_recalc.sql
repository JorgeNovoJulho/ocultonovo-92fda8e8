-- ============================================================================
-- SOCIAL — APLICAÇÃO REAL DO DESCONTO NO SPLIT + RECÁLCULO DE SCORES
-- 100% idempotente — cole no SQL Editor do Supabase EXTERNO
-- Pré-requisitos:
--   2026_05_06_affiliate_conditional_split.sql  (process_payment_split 7 args)
--   2026_05_10_social_trust_system.sql         (social_apply_discount, levels)
-- ============================================================================

-- =========================================================================
-- 1) PROCESS_PAYMENT_SPLIT — adiciona p_buyer_id e p_apply_social_discount
--    Sem quebrar chamadas legadas (params novos têm default).
--    Quando p_apply_social_discount = true, calcula o desconto via
--    social_apply_discount(p_buyer_id, kind, p_gross_amount) e usa o valor
--    líquido como gross efetivo da cobrança.
-- =========================================================================

DROP FUNCTION IF EXISTS public.process_payment_split(text,text,text,decimal,uuid,uuid,text);

CREATE OR REPLACE FUNCTION public.process_payment_split(
  p_transaction_id TEXT,
  p_payment_external_id TEXT,
  p_flow_type TEXT,
  p_gross_amount DECIMAL(10,2),
  p_creator_id UUID DEFAULT NULL,
  p_affiliate_id UUID DEFAULT NULL,
  p_provider TEXT DEFAULT 'platform',
  p_buyer_id UUID DEFAULT NULL,
  p_apply_social_discount BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cfg RECORD;
  v_tax_rate DECIMAL(5,4);
  v_platform_rate DECIMAL(5,4);
  v_affiliate_rate DECIMAL(5,4);
  v_tax DECIMAL(10,2);
  v_base DECIMAL(10,2);
  v_platform DECIMAL(10,2);
  v_affiliate DECIMAL(10,2) := 0;
  v_creator DECIMAL(10,2) := 0;
  v_result JSONB;
  v_aff_check RECORD;
  v_effective_affiliate UUID := NULL;
  v_rejection TEXT := NULL;
  v_referred UUID;
  v_original_gross DECIMAL(10,2) := p_gross_amount;
  v_effective_gross DECIMAL(10,2) := p_gross_amount;
  v_discount_pct NUMERIC := 0;
  v_discount_kind TEXT := NULL;
  v_disc_buyer UUID;
BEGIN
  -- Config ativa
  SELECT platform_percent, tax_percent, creator_percent, affiliate_percent
    INTO v_cfg
  FROM public.split_config WHERE is_active = true
  ORDER BY updated_at DESC LIMIT 1;

  IF v_cfg IS NULL THEN
    v_tax_rate := 0.06; v_platform_rate := 0.20; v_affiliate_rate := 0.05;
    v_cfg := ROW(20.00, 6.00, 69.00, 5.00)::RECORD;
  ELSE
    v_tax_rate := v_cfg.tax_percent / 100.0;
    v_platform_rate := v_cfg.platform_percent / 100.0;
    v_affiliate_rate := v_cfg.affiliate_percent / 100.0;
  END IF;

  -- Determinar referred (quem pagou): prioridade transactions.user_id
  SELECT user_id INTO v_referred
    FROM public.transactions
    WHERE id::text = p_transaction_id
       OR external_id = p_payment_external_id
    LIMIT 1;

  -- Buyer para desconto (param explícito tem prioridade)
  v_disc_buyer := COALESCE(p_buyer_id, v_referred);

  -- ============= APLICAR DESCONTO SOCIAL =============
  IF p_apply_social_discount AND v_disc_buyer IS NOT NULL THEN
    v_discount_kind := CASE
      WHEN p_flow_type = 'platform_plan'   THEN 'discount_sub'
      WHEN p_flow_type = 'creator_content' THEN 'discount_vip'
      ELSE NULL
    END;
    IF v_discount_kind IS NOT NULL THEN
      BEGIN
        v_effective_gross := public.social_apply_discount(
          v_disc_buyer, v_discount_kind, p_gross_amount
        );
        IF v_effective_gross IS NULL OR v_effective_gross < 0 THEN
          v_effective_gross := p_gross_amount;
        END IF;
        IF v_original_gross > 0 THEN
          v_discount_pct := ROUND(((v_original_gross - v_effective_gross) / v_original_gross) * 100, 2);
        END IF;
      EXCEPTION WHEN OTHERS THEN
        v_effective_gross := p_gross_amount;
        v_discount_pct := 0;
      END;
    END IF;
  END IF;

  -- Validar afiliado
  IF p_affiliate_id IS NOT NULL THEN
    SELECT * INTO v_aff_check
      FROM public.validate_affiliate_link(v_referred, p_affiliate_id);
    IF v_aff_check.is_valid THEN
      v_effective_affiliate := p_affiliate_id;
    ELSE
      v_rejection := v_aff_check.reason;
    END IF;
  ELSE
    v_rejection := 'no_affiliate';
  END IF;

  -- Imposto sobre o líquido pós-desconto (cobrança efetiva)
  v_tax  := ROUND(v_effective_gross * v_tax_rate, 2);
  v_base := ROUND(v_effective_gross - v_tax, 2);

  IF p_flow_type = 'platform_plan' THEN
    IF v_effective_affiliate IS NOT NULL THEN
      v_affiliate := ROUND(v_base * v_affiliate_rate, 2);
      v_platform  := ROUND(v_base - v_affiliate, 2);
    ELSE
      v_platform  := v_base;
    END IF;
    v_creator := 0;

  ELSIF p_flow_type = 'creator_content' THEN
    v_platform := ROUND(v_base * v_platform_rate, 2);
    -- discount_fee: reduz a fatia da plataforma (criador absorve a economia)
    IF v_disc_buyer IS NOT NULL THEN
      DECLARE v_fee_after NUMERIC; v_fee_pct NUMERIC := 0;
      BEGIN
        v_fee_after := public.social_apply_discount(v_disc_buyer, 'discount_fee', v_platform);
        IF v_fee_after IS NOT NULL AND v_fee_after >= 0 AND v_platform > 0 THEN
          v_fee_pct := ROUND(((v_platform - v_fee_after) / v_platform) * 100, 2);
          v_platform := v_fee_after;
        END IF;
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
    END IF;
    IF v_effective_affiliate IS NOT NULL THEN
      v_affiliate := ROUND(v_base * v_affiliate_rate, 2);
    END IF;
    v_creator := ROUND(v_base - v_platform - v_affiliate, 2);

  ELSE
    v_platform := 0; v_creator := 0; v_affiliate := 0;
  END IF;

  -- Creditar criador
  IF v_creator > 0 AND p_creator_id IS NOT NULL THEN
    UPDATE public.profiles
      SET pending_balance = COALESCE(pending_balance,0) + v_creator
      WHERE id = p_creator_id;
    INSERT INTO public.pending_balance_releases (profile_id, amount, source_type, release_at, status)
    VALUES (p_creator_id, v_creator, 'creator_content_income', now() + INTERVAL '7 days', 'pending');
  END IF;

  -- Creditar afiliado
  IF v_affiliate > 0 AND v_effective_affiliate IS NOT NULL THEN
    UPDATE public.profiles
      SET pending_balance = COALESCE(pending_balance,0) + v_affiliate
      WHERE id = v_effective_affiliate;
    INSERT INTO public.pending_balance_releases (profile_id, amount, source_type, release_at, status)
    VALUES (v_effective_affiliate, v_affiliate, 'affiliate_commission', now() + INTERVAL '7 days', 'pending');
  END IF;

  -- Atualizar transactions.affiliate_id (transparência)
  IF v_effective_affiliate IS NOT NULL THEN
    UPDATE public.transactions
      SET affiliate_id = v_effective_affiliate
      WHERE id::text = p_transaction_id OR external_id = p_payment_external_id;
  END IF;

  -- Auditoria
  INSERT INTO public.affiliate_split_audit (
    transaction_id, payment_external_id, referred_user_id,
    affiliate_id_input, affiliate_id_applied,
    is_valid, rejection_reason,
    affiliate_amount, creator_amount
  ) VALUES (
    p_transaction_id, p_payment_external_id, v_referred,
    p_affiliate_id, v_effective_affiliate,
    v_effective_affiliate IS NOT NULL,
    v_rejection,
    v_affiliate, v_creator
  );

  -- Log split (gross é o efetivamente cobrado)
  INSERT INTO public.transaction_split_logs (
    transaction_id, payment_external_id, flow_type,
    gross_amount, tax_amount, tax_rate, base_amount,
    platform_amount, platform_rate,
    affiliate_amount, affiliate_rate,
    creator_amount, creator_id, affiliate_id, provider
  ) VALUES (
    p_transaction_id, p_payment_external_id, p_flow_type,
    v_effective_gross, v_tax, v_tax_rate, v_base,
    v_platform, CASE WHEN p_flow_type='platform_plan' THEN 1.00 - v_affiliate_rate ELSE v_platform_rate END,
    v_affiliate, v_affiliate_rate,
    v_creator, p_creator_id, v_effective_affiliate, p_provider
  );

  v_result := jsonb_build_object(
    'gross', v_effective_gross,
    'original_gross', v_original_gross,
    'social_discount_pct', v_discount_pct,
    'social_discount_kind', v_discount_kind,
    'social_discount_applied', p_apply_social_discount AND v_discount_pct > 0,
    'tax', v_tax,
    'base', v_base,
    'platform', v_platform,
    'affiliate', v_affiliate,
    'creator', v_creator,
    'flow_type', p_flow_type,
    'affiliate_applied', v_effective_affiliate IS NOT NULL,
    'affiliate_id', v_effective_affiliate,
    'rejection_reason', v_rejection,
    'config', jsonb_build_object(
      'tax_pct', v_cfg.tax_percent,
      'platform_pct', v_cfg.platform_percent,
      'creator_pct', v_cfg.creator_percent,
      'affiliate_pct', v_cfg.affiliate_percent
    )
  );
  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_payment_split(
  TEXT,TEXT,TEXT,DECIMAL,UUID,UUID,TEXT,UUID,BOOLEAN
) TO authenticated, service_role;

-- =========================================================================
-- 2) RECÁLCULO DE SCORES SOCIAIS — Admin Master only
--    Reconstroi total_xp, breakdown e level a partir de oculto_social_events.
--    p_user opcional: se null, recalcula TODOS.
-- =========================================================================

CREATE OR REPLACE FUNCTION public.social_admin_recalc_scores(p_user uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_users uuid[];
  v_uid uuid;
  v_xp int;
  v_lvl int;
  v_breakdown jsonb;
  v_count int := 0;
  v_started timestamptz := clock_timestamp();
BEGIN
  IF NOT public._is_master_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;

  IF p_user IS NOT NULL THEN
    v_users := ARRAY[p_user];
  ELSE
    SELECT array_agg(DISTINCT user_id) INTO v_users
      FROM oculto_social_events
     WHERE user_id IS NOT NULL;
  END IF;

  IF v_users IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'recalculated', 0, 'note', 'no_events');
  END IF;

  FOREACH v_uid IN ARRAY v_users LOOP
    SELECT COALESCE(SUM(weight), 0)::int INTO v_xp
      FROM oculto_social_events WHERE user_id = v_uid;

    SELECT COALESCE(jsonb_object_agg(kind, total), '{}'::jsonb) INTO v_breakdown
      FROM (
        SELECT kind, SUM(weight)::int AS total
          FROM oculto_social_events
         WHERE user_id = v_uid
         GROUP BY kind
      ) k;

    SELECT MAX(level) INTO v_lvl FROM oculto_social_levels WHERE min_xp <= v_xp;
    v_lvl := COALESCE(v_lvl, 1);

    INSERT INTO oculto_social_scores(user_id, total_xp, level, breakdown, last_event_at, updated_at)
    VALUES (v_uid, GREATEST(0, v_xp), v_lvl, v_breakdown, now(), now())
    ON CONFLICT (user_id) DO UPDATE
      SET total_xp = GREATEST(0, EXCLUDED.total_xp),
          level = EXCLUDED.level,
          breakdown = EXCLUDED.breakdown,
          updated_at = now();

    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'recalculated', v_count,
    'scope', CASE WHEN p_user IS NULL THEN 'all' ELSE 'single' END,
    'elapsed_ms', extract(milliseconds FROM clock_timestamp() - v_started)::int
  );
END; $$;

GRANT EXECUTE ON FUNCTION public.social_admin_recalc_scores(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';

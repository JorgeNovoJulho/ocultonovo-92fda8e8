-- ============================================================
-- ANTIFRAUDE FINANCEIRO ASAAS — Score, detecção e ações automáticas
-- Idempotente. Roda no Supabase EXTERNO.
-- ============================================================

-- 1) Tabela de scores de fraude (camada nova, não substitui antifraud_layer)
CREATE TABLE IF NOT EXISTS public.oculto_fraud_scores (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL,
  fraud_score NUMERIC(6,2) NOT NULL DEFAULT 0,
  risk_level  TEXT NOT NULL DEFAULT 'low',  -- low|medium|high|critical
  reasons     JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata    JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS idx_ofs_risk    ON public.oculto_fraud_scores(risk_level);
CREATE INDEX IF NOT EXISTS idx_ofs_score   ON public.oculto_fraud_scores(fraud_score DESC);
CREATE INDEX IF NOT EXISTS idx_ofs_updated ON public.oculto_fraud_scores(updated_at DESC);

ALTER TABLE public.oculto_fraud_scores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ofs_master_all" ON public.oculto_fraud_scores;
CREATE POLICY "ofs_master_all" ON public.oculto_fraud_scores
FOR ALL USING (public.aura_is_master_admin())
WITH CHECK (public.aura_is_master_admin());

DROP POLICY IF EXISTS "ofs_service" ON public.oculto_fraud_scores;
CREATE POLICY "ofs_service" ON public.oculto_fraud_scores
FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 2) Log de incidentes detectados (auditoria)
CREATE TABLE IF NOT EXISTS public.oculto_fraud_incidents (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL,
  rule_code   TEXT NOT NULL,    -- self_referral | multi_account | chargeback_serial | fast_withdraw | pix_suspect | card_suspect | triangulation | farming | refund_high | abusive_buyer
  severity    TEXT NOT NULL DEFAULT 'low',
  score_delta NUMERIC(6,2) NOT NULL DEFAULT 5,
  reason      TEXT,
  metadata    JSONB NOT NULL DEFAULT '{}'::jsonb,
  resolved    BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ofi_user      ON public.oculto_fraud_incidents(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ofi_rule      ON public.oculto_fraud_incidents(rule_code);
CREATE INDEX IF NOT EXISTS idx_ofi_unresolved ON public.oculto_fraud_incidents(severity, created_at DESC) WHERE resolved = false;

ALTER TABLE public.oculto_fraud_incidents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ofi_master_all" ON public.oculto_fraud_incidents;
CREATE POLICY "ofi_master_all" ON public.oculto_fraud_incidents
FOR ALL USING (public.aura_is_master_admin())
WITH CHECK (public.aura_is_master_admin());

DROP POLICY IF EXISTS "ofi_service" ON public.oculto_fraud_incidents;
CREATE POLICY "ofi_service" ON public.oculto_fraud_incidents
FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 3) Configuração de score (limiares ajustáveis pelo Master)
CREATE TABLE IF NOT EXISTS public.oculto_fraud_settings (
  id                       INT PRIMARY KEY DEFAULT 1,
  threshold_medium         NUMERIC(6,2) NOT NULL DEFAULT 30,
  threshold_high           NUMERIC(6,2) NOT NULL DEFAULT 60,
  threshold_critical       NUMERIC(6,2) NOT NULL DEFAULT 85,
  freeze_wallet_on_high    BOOLEAN NOT NULL DEFAULT true,
  block_withdraw_on_high   BOOLEAN NOT NULL DEFAULT true,
  block_affiliate_on_high  BOOLEAN NOT NULL DEFAULT true,
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (id = 1)
);

INSERT INTO public.oculto_fraud_settings(id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.oculto_fraud_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ofs_set_master" ON public.oculto_fraud_settings;
CREATE POLICY "ofs_set_master" ON public.oculto_fraud_settings
FOR ALL USING (public.aura_is_master_admin())
WITH CHECK (public.aura_is_master_admin());

DROP POLICY IF EXISTS "ofs_set_read" ON public.oculto_fraud_settings;
CREATE POLICY "ofs_set_read" ON public.oculto_fraud_settings
FOR SELECT TO authenticated USING (true);

-- 4) RPC central: registrar incidente + recalcular score
CREATE OR REPLACE FUNCTION public.oculto_fraud_register(
  p_user_id     UUID,
  p_rule_code   TEXT,
  p_severity    TEXT DEFAULT 'low',
  p_score_delta NUMERIC DEFAULT 5,
  p_reason      TEXT DEFAULT NULL,
  p_metadata    JSONB DEFAULT '{}'::jsonb
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_set        public.oculto_fraud_settings%ROWTYPE;
  v_incident   UUID;
  v_score      NUMERIC(6,2);
  v_risk       TEXT;
  v_reasons    JSONB;
BEGIN
  IF auth.role() <> 'service_role'
     AND NOT public.aura_is_master_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT * INTO v_set FROM public.oculto_fraud_settings WHERE id = 1;

  INSERT INTO public.oculto_fraud_incidents(
    user_id, rule_code, severity, score_delta, reason, metadata
  ) VALUES (
    p_user_id, p_rule_code, p_severity, p_score_delta, p_reason, p_metadata
  ) RETURNING id INTO v_incident;

  -- Upsert score acumulado
  INSERT INTO public.oculto_fraud_scores(user_id, fraud_score, reasons, metadata)
  VALUES (
    p_user_id,
    LEAST(100, p_score_delta),
    jsonb_build_array(jsonb_build_object('rule', p_rule_code, 'at', now(), 'reason', p_reason)),
    p_metadata
  )
  ON CONFLICT (user_id) DO UPDATE
    SET fraud_score = LEAST(100, public.oculto_fraud_scores.fraud_score + p_score_delta),
        reasons     = COALESCE(public.oculto_fraud_scores.reasons,'[]'::jsonb)
                      || jsonb_build_array(jsonb_build_object('rule', p_rule_code, 'at', now(), 'reason', p_reason)),
        updated_at  = now();

  SELECT fraud_score, reasons INTO v_score, v_reasons
    FROM public.oculto_fraud_scores WHERE user_id = p_user_id;

  v_risk := CASE
    WHEN v_score >= v_set.threshold_critical THEN 'critical'
    WHEN v_score >= v_set.threshold_high     THEN 'high'
    WHEN v_score >= v_set.threshold_medium   THEN 'medium'
    ELSE 'low'
  END;

  UPDATE public.oculto_fraud_scores
     SET risk_level = v_risk
   WHERE user_id = p_user_id;

  -- Ações automáticas (high/critical)
  IF v_risk IN ('high','critical') THEN
    -- Marca profile como sob revisão (não suspende imediatamente)
    UPDATE public.profiles
       SET fraud_score      = v_score,
           fraud_last_check = now()
     WHERE (id = p_user_id OR user_id = p_user_id);

    -- Congela wallet (bloqueia saques) — usa fraud_frozen_until da camada antiga
    IF v_set.freeze_wallet_on_high THEN
      UPDATE public.profiles
         SET fraud_frozen_until = now() + interval '7 days'
       WHERE (id = p_user_id OR user_id = p_user_id)
         AND (fraud_frozen_until IS NULL OR fraud_frozen_until < now() + interval '7 days');
    END IF;
  END IF;

  -- Alerta admin
  IF p_severity IN ('medium','high','critical') THEN
    INSERT INTO public.admin_alerts(alert_type, severity, title, body, ref_user_id, ref_table, ref_id)
    VALUES (
      'fraud',
      p_severity,
      'Antifraude ASAAS: ' || p_rule_code,
      COALESCE(p_reason,'') || ' • Score: ' || v_score::text || ' • Nível: ' || v_risk,
      p_user_id,
      'oculto_fraud_incidents',
      v_incident
    );
  END IF;

  RETURN jsonb_build_object(
    'incident_id', v_incident,
    'fraud_score', v_score,
    'risk_level',  v_risk
  );
END $$;

GRANT EXECUTE ON FUNCTION public.oculto_fraud_register(UUID,TEXT,TEXT,NUMERIC,TEXT,JSONB)
  TO service_role, authenticated;

-- 5) RPC: revisar / resolver incidente (Admin Master)
CREATE OR REPLACE FUNCTION public.oculto_fraud_resolve(
  p_incident_id UUID,
  p_clear_score BOOLEAN DEFAULT false,
  p_unfreeze    BOOLEAN DEFAULT true,
  p_note        TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID;
BEGIN
  IF NOT public.aura_is_master_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE public.oculto_fraud_incidents
     SET resolved = true,
         metadata = COALESCE(metadata,'{}'::jsonb) || jsonb_build_object('resolved_at', now(), 'note', p_note)
   WHERE id = p_incident_id
  RETURNING user_id INTO v_uid;

  IF p_clear_score AND v_uid IS NOT NULL THEN
    UPDATE public.oculto_fraud_scores
       SET fraud_score = 0, risk_level = 'low', reasons = '[]'::jsonb, updated_at = now()
     WHERE user_id = v_uid;
  END IF;

  IF p_unfreeze AND v_uid IS NOT NULL THEN
    UPDATE public.profiles
       SET fraud_frozen_until = NULL
     WHERE (id = v_uid OR user_id = v_uid);
  END IF;

  RETURN jsonb_build_object('ok', true, 'user_id', v_uid);
END $$;

GRANT EXECUTE ON FUNCTION public.oculto_fraud_resolve(UUID,BOOLEAN,BOOLEAN,TEXT) TO authenticated;

-- 6) Detectores automáticos (heurísticas DB-level)

-- 6.1) Auto-indicação: afiliado = comprador
CREATE OR REPLACE FUNCTION public.detect_self_referral()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.affiliate_id IS NOT NULL AND NEW.affiliate_id = NEW.buyer_id THEN
    PERFORM public.oculto_fraud_register(
      NEW.affiliate_id, 'self_referral', 'high', 30,
      'Afiliado igual ao comprador',
      jsonb_build_object('split_id', NEW.id, 'amount', NEW.amount_total)
    );
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_detect_self_referral ON public.payment_splits;
CREATE TRIGGER trg_detect_self_referral
AFTER INSERT ON public.payment_splits
FOR EACH ROW EXECUTE FUNCTION public.detect_self_referral();

-- 6.2) Saque rápido após venda: withdraw em < 1h após split confirmado
CREATE OR REPLACE FUNCTION public.detect_fast_withdraw()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_recent INT;
BEGIN
  IF TG_TABLE_NAME = 'withdraw_requests' AND NEW.status IN ('pending','requested') THEN
    SELECT COUNT(*) INTO v_recent
      FROM public.payment_splits
     WHERE creator_id = NEW.user_id
       AND status = 'confirmed'
       AND created_at > now() - interval '1 hour';
    IF v_recent >= 1 THEN
      PERFORM public.oculto_fraud_register(
        NEW.user_id, 'fast_withdraw', 'medium', 15,
        'Saque solicitado < 1h após venda',
        jsonb_build_object('withdraw_id', NEW.id, 'recent_sales', v_recent)
      );
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- 6.3) Chargeback serial (>= 2 em 30d) — atua via payment_splits
CREATE OR REPLACE FUNCTION public.detect_chargeback_serial()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count INT;
BEGIN
  IF NEW.status = 'chargeback' THEN
    SELECT COUNT(*) INTO v_count
      FROM public.payment_splits
     WHERE buyer_id = NEW.buyer_id
       AND status = 'chargeback'
       AND created_at > now() - interval '30 days';
    IF v_count >= 3 THEN
      PERFORM public.oculto_fraud_register(
        NEW.buyer_id, 'chargeback_serial', 'critical', 40,
        'Chargeback serial: ' || v_count || ' em 30d',
        jsonb_build_object('split_id', NEW.id, 'count_30d', v_count)
      );
    ELSIF v_count = 2 THEN
      PERFORM public.oculto_fraud_register(
        NEW.buyer_id, 'chargeback_serial', 'high', 25,
        '2 chargebacks em 30d',
        jsonb_build_object('split_id', NEW.id)
      );
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_detect_chargeback_serial ON public.payment_splits;
CREATE TRIGGER trg_detect_chargeback_serial
AFTER INSERT OR UPDATE OF status ON public.payment_splits
FOR EACH ROW EXECUTE FUNCTION public.detect_chargeback_serial();

-- 7) Bloqueio em saques quando wallet congelada / risco alto
CREATE OR REPLACE FUNCTION public.guard_withdraw_fraud()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_risk TEXT; v_frozen TIMESTAMPTZ;
BEGIN
  SELECT fraud_frozen_until INTO v_frozen
    FROM public.profiles
   WHERE id = NEW.user_id OR user_id = NEW.user_id
   LIMIT 1;

  SELECT risk_level INTO v_risk
    FROM public.oculto_fraud_scores
   WHERE user_id = NEW.user_id;

  IF v_frozen IS NOT NULL AND v_frozen > now() THEN
    RAISE EXCEPTION 'Saque bloqueado: wallet sob revisão antifraude até %', v_frozen;
  END IF;

  IF v_risk IN ('high','critical') THEN
    NEW.status := 'under_review';
    INSERT INTO public.admin_alerts(alert_type, severity, title, body, ref_user_id, ref_table, ref_id)
    VALUES ('fraud','high','Saque suspeito sob revisão',
            'Risco: ' || v_risk, NEW.user_id, 'withdraw_requests', NEW.id);
  END IF;

  RETURN NEW;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='withdraw_requests') THEN
    DROP TRIGGER IF EXISTS trg_guard_withdraw_fraud ON public.withdraw_requests;
    CREATE TRIGGER trg_guard_withdraw_fraud
      BEFORE INSERT ON public.withdraw_requests
      FOR EACH ROW EXECUTE FUNCTION public.guard_withdraw_fraud();

    DROP TRIGGER IF EXISTS trg_detect_fast_withdraw ON public.withdraw_requests;
    CREATE TRIGGER trg_detect_fast_withdraw
      AFTER INSERT ON public.withdraw_requests
      FOR EACH ROW EXECUTE FUNCTION public.detect_fast_withdraw();
  END IF;
END $$;

-- 8) View admin: scores + dados do perfil
CREATE OR REPLACE VIEW public.v_admin_fraud_scores AS
SELECT
  s.user_id,
  s.fraud_score,
  s.risk_level,
  s.reasons,
  s.updated_at,
  p.username,
  p.display_name,
  p.fraud_frozen_until,
  (SELECT COUNT(*) FROM public.oculto_fraud_incidents i
     WHERE i.user_id = s.user_id AND i.resolved = false) AS open_incidents,
  (SELECT COUNT(*) FROM public.payment_splits ps
     WHERE ps.buyer_id = s.user_id AND ps.status = 'chargeback') AS chargebacks_total
FROM public.oculto_fraud_scores s
LEFT JOIN public.profiles p ON p.id = s.user_id OR p.user_id = s.user_id;

ALTER VIEW public.v_admin_fraud_scores SET (security_invoker = true);

-- 9) View KPI antifraude
CREATE OR REPLACE VIEW public.v_admin_fraud_kpi AS
SELECT
  COUNT(*) FILTER (WHERE risk_level = 'critical')                  AS critical_users,
  COUNT(*) FILTER (WHERE risk_level = 'high')                      AS high_users,
  COUNT(*) FILTER (WHERE risk_level = 'medium')                    AS medium_users,
  COUNT(*) FILTER (WHERE updated_at > now() - interval '24 hours') AS updated_24h,
  (SELECT COUNT(*) FROM public.oculto_fraud_incidents
    WHERE resolved = false)                                        AS open_incidents,
  (SELECT COUNT(*) FROM public.oculto_fraud_incidents
    WHERE created_at > now() - interval '24 hours')                AS incidents_24h,
  (SELECT COUNT(*) FROM public.profiles
    WHERE fraud_frozen_until > now())                              AS frozen_wallets
FROM public.oculto_fraud_scores;

ALTER VIEW public.v_admin_fraud_kpi SET (security_invoker = true);

NOTIFY pgrst, 'reload schema';

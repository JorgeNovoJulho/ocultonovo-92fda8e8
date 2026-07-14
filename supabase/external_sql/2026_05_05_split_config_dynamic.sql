-- ============================================================
-- Split Config Dinâmico — Admin Master controla percentuais
-- Idempotente: pode ser rodado múltiplas vezes sem efeitos colaterais.
-- Mantém process_payment_split como única fonte de verdade,
-- agora lendo alíquotas da tabela split_config (linha ativa).
-- ============================================================

-- 1. Tabela de configuração
CREATE TABLE IF NOT EXISTS public.split_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_percent NUMERIC(5,2) NOT NULL,
  tax_percent NUMERIC(5,2) NOT NULL,
  creator_percent NUMERIC(5,2) NOT NULL,
  affiliate_percent NUMERIC(5,2) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT false,
  updated_by UUID,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT split_config_sum_100 CHECK (
    ROUND(platform_percent + tax_percent + creator_percent + affiliate_percent, 2) = 100.00
  ),
  CONSTRAINT split_config_non_negative CHECK (
    platform_percent >= 0 AND tax_percent >= 0
    AND creator_percent >= 0 AND affiliate_percent >= 0
  )
);

-- Apenas uma linha ativa por vez
CREATE UNIQUE INDEX IF NOT EXISTS split_config_one_active
  ON public.split_config(is_active) WHERE is_active = true;

ALTER TABLE public.split_config ENABLE ROW LEVEL SECURITY;

-- Leitura pública autenticada (frontend de tooltip / cálculo de preview)
DROP POLICY IF EXISTS "split_config_read_authenticated" ON public.split_config;
CREATE POLICY "split_config_read_authenticated"
  ON public.split_config FOR SELECT
  TO authenticated
  USING (true);

-- Escrita apenas via service_role (admin atua através de edge/RPC)
DROP POLICY IF EXISTS "split_config_service_write" ON public.split_config;
CREATE POLICY "split_config_service_write"
  ON public.split_config FOR ALL
  USING (true) WITH CHECK (true);

-- 2. Seed do valor padrão (apenas se não houver config ativa)
INSERT INTO public.split_config
  (platform_percent, tax_percent, creator_percent, affiliate_percent, is_active, notes)
SELECT 20.00, 6.00, 69.00, 5.00, true, 'Configuração inicial padrão'
WHERE NOT EXISTS (SELECT 1 FROM public.split_config WHERE is_active = true);

-- 3. Garantir coluna tax_amount em payment_splits (legado)
ALTER TABLE public.payment_splits
  ADD COLUMN IF NOT EXISTS tax_amount NUMERIC(10,2) DEFAULT 0;

-- 4. Função utilitária: get_active_split_config()
CREATE OR REPLACE FUNCTION public.get_active_split_config()
RETURNS TABLE (
  platform_percent NUMERIC,
  tax_percent NUMERIC,
  creator_percent NUMERIC,
  affiliate_percent NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT platform_percent, tax_percent, creator_percent, affiliate_percent
  FROM public.split_config
  WHERE is_active = true
  ORDER BY updated_at DESC
  LIMIT 1;
$$;

-- 5. RPC para o admin atualizar a config (atômico, valida soma)
CREATE OR REPLACE FUNCTION public.update_split_config(
  p_platform NUMERIC,
  p_tax NUMERIC,
  p_creator NUMERIC,
  p_affiliate NUMERIC,
  p_notes TEXT DEFAULT NULL
)
RETURNS public.split_config
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.split_config;
  v_sum NUMERIC;
BEGIN
  v_sum := ROUND(p_platform + p_tax + p_creator + p_affiliate, 2);
  IF v_sum <> 100.00 THEN
    RAISE EXCEPTION 'A soma dos percentuais deve ser 100%% (recebido: %)', v_sum;
  END IF;

  IF p_platform < 0 OR p_tax < 0 OR p_creator < 0 OR p_affiliate < 0 THEN
    RAISE EXCEPTION 'Percentuais não podem ser negativos';
  END IF;

  -- Desativar configuração atual
  UPDATE public.split_config SET is_active = false WHERE is_active = true;

  -- Inserir nova como ativa
  INSERT INTO public.split_config
    (platform_percent, tax_percent, creator_percent, affiliate_percent, is_active, updated_by, notes)
  VALUES
    (p_platform, p_tax, p_creator, p_affiliate, true, auth.uid(), p_notes)
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

-- 6. Refatorar process_payment_split para ler split_config dinamicamente
--    Mantém assinatura idêntica → asaas-webhook / pix-webhook continuam funcionando
CREATE OR REPLACE FUNCTION public.process_payment_split(
  p_transaction_id TEXT,
  p_payment_external_id TEXT,
  p_flow_type TEXT,
  p_gross_amount DECIMAL(10,2),
  p_creator_id UUID DEFAULT NULL,
  p_affiliate_id UUID DEFAULT NULL,
  p_provider TEXT DEFAULT 'platform'
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
BEGIN
  -- Carregar config ativa (fallback seguro caso tabela esteja vazia)
  SELECT platform_percent, tax_percent, creator_percent, affiliate_percent
    INTO v_cfg
  FROM public.split_config
  WHERE is_active = true
  ORDER BY updated_at DESC
  LIMIT 1;

  IF v_cfg IS NULL THEN
    v_cfg := ROW(20.00, 6.00, 69.00, 5.00)::RECORD;
    v_tax_rate := 0.06; v_platform_rate := 0.20; v_affiliate_rate := 0.05;
  ELSE
    v_tax_rate := v_cfg.tax_percent / 100.0;
    v_platform_rate := v_cfg.platform_percent / 100.0;
    v_affiliate_rate := v_cfg.affiliate_percent / 100.0;
  END IF;

  -- Imposto sobre o bruto
  v_tax := ROUND(p_gross_amount * v_tax_rate, 2);
  v_base := ROUND(p_gross_amount - v_tax, 2);

  IF p_flow_type = 'platform_plan' THEN
    -- Fluxo plataforma: base toda da casa, afiliado leva fatia (se houver)
    IF p_affiliate_id IS NOT NULL THEN
      v_affiliate := ROUND(v_base * v_affiliate_rate, 2);
      v_platform := ROUND(v_base - v_affiliate, 2);
    ELSE
      v_platform := v_base;
    END IF;
    v_creator := 0;

  ELSIF p_flow_type = 'creator_content' THEN
    v_platform := ROUND(v_base * v_platform_rate, 2);
    IF p_affiliate_id IS NOT NULL THEN
      v_affiliate := ROUND(v_base * v_affiliate_rate, 2);
    END IF;
    v_creator := ROUND(v_base - v_platform - v_affiliate, 2);

  ELSE
    -- wallet_topup: sem split
    v_platform := 0; v_creator := 0; v_affiliate := 0;
  END IF;

  -- Creditar criador
  IF v_creator > 0 AND p_creator_id IS NOT NULL THEN
    UPDATE public.profiles
      SET pending_balance = COALESCE(pending_balance, 0) + v_creator
      WHERE id = p_creator_id;
    INSERT INTO public.pending_balance_releases (profile_id, amount, source_type, release_at, status)
    VALUES (p_creator_id, v_creator, 'creator_content_income', now() + INTERVAL '7 days', 'pending');
  END IF;

  -- Creditar afiliado
  IF v_affiliate > 0 AND p_affiliate_id IS NOT NULL THEN
    UPDATE public.profiles
      SET pending_balance = COALESCE(pending_balance, 0) + v_affiliate
      WHERE id = p_affiliate_id;
    INSERT INTO public.pending_balance_releases (profile_id, amount, source_type, release_at, status)
    VALUES (p_affiliate_id, v_affiliate, 'affiliate_commission', now() + INTERVAL '7 days', 'pending');
  END IF;

  -- Log
  INSERT INTO public.transaction_split_logs (
    transaction_id, payment_external_id, flow_type,
    gross_amount, tax_amount, tax_rate, base_amount,
    platform_amount, platform_rate,
    affiliate_amount, affiliate_rate,
    creator_amount, creator_id, affiliate_id, provider
  ) VALUES (
    p_transaction_id, p_payment_external_id, p_flow_type,
    p_gross_amount, v_tax, v_tax_rate, v_base,
    v_platform, CASE WHEN p_flow_type='platform_plan' THEN 1.00 - v_affiliate_rate ELSE v_platform_rate END,
    v_affiliate, v_affiliate_rate,
    v_creator, p_creator_id, p_affiliate_id, p_provider
  );

  v_result := jsonb_build_object(
    'gross', p_gross_amount,
    'tax', v_tax,
    'base', v_base,
    'platform', v_platform,
    'affiliate', v_affiliate,
    'creator', v_creator,
    'flow_type', p_flow_type,
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

-- Permissões
GRANT EXECUTE ON FUNCTION public.get_active_split_config() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_split_config(NUMERIC,NUMERIC,NUMERIC,NUMERIC,TEXT) TO authenticated;

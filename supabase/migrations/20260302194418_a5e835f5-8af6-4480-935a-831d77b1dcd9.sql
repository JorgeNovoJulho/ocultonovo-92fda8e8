
-- ══════════════════════════════════════════════════════════
-- Tabelas de Saldo e Logs Financeiros
-- ══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.user_balances (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    balance_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

ALTER TABLE public.user_balances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own balance"
ON public.user_balances FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "System can manage balances"
ON public.user_balances FOR ALL
USING (true)
WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.transaction_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_id TEXT,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    amount_bruto DECIMAL(12,2) NOT NULL,
    amount_imposto DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    amount_taxa_casa DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    amount_taxa_afiliado DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    amount_liquido_criador DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    transaction_type TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

ALTER TABLE public.transaction_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own transactions"
ON public.transaction_logs FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "System can insert transactions"
ON public.transaction_logs FOR INSERT
WITH CHECK (true);

-- ══════════════════════════════════════════════════════════
-- Função de Split Financeiro Oculto
-- Regras:
--   • 6% imposto sobre o bruto
--   • platform_plan: Casa 95%, Afiliado 5% (da base líquida)
--   • creator_content: Casa 20%, Afiliado 5%, Criador restante
-- ══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.process_oculto_payment_split(
    p_payment_id TEXT,
    p_amount_bruto DECIMAL,
    p_type TEXT,
    p_creator_id UUID DEFAULT NULL,
    p_affiliate_id UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_imposto DECIMAL(12,2);
    v_base DECIMAL(12,2);
    v_taxa_casa DECIMAL(12,2);
    v_taxa_afiliado DECIMAL(12,2);
    v_liquido_criador DECIMAL(12,2);
    v_result JSON;
BEGIN
    -- 1. Calcular imposto (6% do bruto)
    v_imposto := ROUND(p_amount_bruto * 0.06, 2);
    v_base := p_amount_bruto - v_imposto;

    IF p_type = 'platform_plan' THEN
        -- Split plataforma: Casa 95%, Afiliado 5%
        IF p_affiliate_id IS NOT NULL THEN
            v_taxa_afiliado := ROUND(v_base * 0.05, 2);
            v_taxa_casa := v_base - v_taxa_afiliado;
        ELSE
            v_taxa_afiliado := 0.00;
            v_taxa_casa := v_base;
        END IF;
        v_liquido_criador := 0.00;

    ELSIF p_type = 'creator_content' THEN
        -- Split criador: Casa 20%, Afiliado 5% (se houver), Criador restante
        v_taxa_casa := ROUND(v_base * 0.20, 2);
        IF p_affiliate_id IS NOT NULL THEN
            v_taxa_afiliado := ROUND(v_base * 0.05, 2);
        ELSE
            v_taxa_afiliado := 0.00;
        END IF;
        v_liquido_criador := v_base - v_taxa_casa - v_taxa_afiliado;

        -- Creditar saldo do criador
        IF p_creator_id IS NOT NULL AND v_liquido_criador > 0 THEN
            INSERT INTO public.user_balances (user_id, balance_amount, updated_at)
            VALUES (p_creator_id, v_liquido_criador, NOW())
            ON CONFLICT (user_id) DO UPDATE
            SET balance_amount = user_balances.balance_amount + v_liquido_criador,
                updated_at = NOW();
        END IF;
    ELSE
        RAISE EXCEPTION 'Tipo de transação inválido: %', p_type;
    END IF;

    -- Creditar afiliado (se houver)
    IF p_affiliate_id IS NOT NULL AND v_taxa_afiliado > 0 THEN
        INSERT INTO public.user_balances (user_id, balance_amount, updated_at)
        VALUES (p_affiliate_id, v_taxa_afiliado, NOW())
        ON CONFLICT (user_id) DO UPDATE
        SET balance_amount = user_balances.balance_amount + v_taxa_afiliado,
            updated_at = NOW();
    END IF;

    -- Registrar log da transação
    INSERT INTO public.transaction_logs (
        payment_id, user_id, amount_bruto, amount_imposto,
        amount_taxa_casa, amount_taxa_afiliado, amount_liquido_criador,
        transaction_type
    ) VALUES (
        p_payment_id, COALESCE(p_creator_id, p_affiliate_id),
        p_amount_bruto, v_imposto, v_taxa_casa, v_taxa_afiliado,
        v_liquido_criador, p_type
    );

    -- Retornar resultado
    v_result := json_build_object(
        'success', true,
        'payment_id', p_payment_id,
        'bruto', p_amount_bruto,
        'imposto_6pct', v_imposto,
        'base_liquida', v_base,
        'taxa_casa', v_taxa_casa,
        'taxa_afiliado', v_taxa_afiliado,
        'liquido_criador', v_liquido_criador,
        'type', p_type
    );

    RETURN v_result;
END;
$$;

-- =============================================================================
-- VIP Channel ON/OFF toggle (subscription_plans.is_enabled é a autoridade)
--
-- Objetivos:
--  1) Garantir que a coluna `is_enabled` exista em `subscription_plans`.
--  2) Definir o DEFAULT como FALSE — novos canais nascem DESATIVADOS.
--  3) Desativar TODOS os canais existentes para que apenas criadores que
--     ativem explicitamente fiquem visíveis em locais públicos
--     (carrossel "Explorar Criadores VIP", vitrine, etc.).
--  4) Helper `vip_channel_set_enabled` para o frontend alternar com segurança
--     (SECURITY DEFINER, search_path travado).
-- =============================================================================

-- 1) Coluna + default
ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS is_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE public.subscription_plans
  ALTER COLUMN is_enabled SET DEFAULT false;

-- 2) Backfill: por solicitação do produto, todos os canais começam desativados.
--    Cada criador precisa ativar explicitamente em /canal-vip.
UPDATE public.subscription_plans
  SET is_enabled = false
  WHERE is_enabled IS DISTINCT FROM false;

-- 3) Índice parcial para acelerar listagens públicas.
CREATE INDEX IF NOT EXISTS idx_subscription_plans_enabled
  ON public.subscription_plans (profile_id)
  WHERE is_enabled = true;

-- 4) RPC segura para o dono alternar o estado do próprio canal.
CREATE OR REPLACE FUNCTION public.vip_channel_set_enabled(p_enabled boolean)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_id uuid;
  v_affected   int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT id INTO v_profile_id
  FROM public.profiles
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'profile_not_found';
  END IF;

  UPDATE public.subscription_plans
     SET is_enabled = COALESCE(p_enabled, false),
         updated_at = now()
   WHERE profile_id = v_profile_id;

  GET DIAGNOSTICS v_affected = ROW_COUNT;
  RETURN v_affected > 0;
END;
$$;

GRANT EXECUTE ON FUNCTION public.vip_channel_set_enabled(boolean)
  TO authenticated, service_role;

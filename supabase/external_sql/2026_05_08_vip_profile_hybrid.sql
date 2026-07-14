-- =====================================================================
-- 2026-05-08 — Perfil VIP Híbrido: trailer/apresentação no plano de assinatura
-- =====================================================================
-- IDEMPOTENTE: pode ser executado várias vezes sem quebrar nada existente.
--
-- ESCOPO:
--   * Reutiliza tabela existente `subscription_plans` (não duplica nada).
--   * Adiciona colunas OPCIONAIS para trailer/apresentação do perfil VIP:
--       - intro_kind   : 'video' | 'image' | 'gif'  (NULL = sem trailer)
--       - intro_url    : URL pública da mídia
--       - intro_poster : thumbnail/preview (somente se kind='video')
--       - intro_duration_seconds : duração em segundos (limite 90s p/ vídeo)
--   * Adiciona CHECK de domínio para `intro_kind`.
--   * Cria índice parcial p/ vitrine de planos com trailer.
--   * NÃO cria nova tabela, NÃO mexe em RLS de outras tabelas,
--     NÃO altera tipos.ts (front continua compatível: campos lidos via cast).
--
-- COMPATIBILIDADE:
--   * `subscription_plans` já é consumida por VitrinePlansModal e perfil VIP.
--   * Campos novos são opcionais — código antigo continua funcionando.
-- =====================================================================

BEGIN;

-- 1) Colunas opcionais ------------------------------------------------
ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS intro_kind text,
  ADD COLUMN IF NOT EXISTS intro_url text,
  ADD COLUMN IF NOT EXISTS intro_poster text,
  ADD COLUMN IF NOT EXISTS intro_duration_seconds integer;

-- 2) Constraint de domínio do tipo de trailer -------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'subscription_plans_intro_kind_check'
  ) THEN
    ALTER TABLE public.subscription_plans
      ADD CONSTRAINT subscription_plans_intro_kind_check
      CHECK (intro_kind IS NULL OR intro_kind IN ('video','image','gif'));
  END IF;
END $$;

-- 3) Validação de duração via TRIGGER (evita CHECK não-imutável) ------
CREATE OR REPLACE FUNCTION public.validate_subscription_plan_intro()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Se houver vídeo, duração não pode passar de 90s
  IF NEW.intro_kind = 'video'
     AND NEW.intro_duration_seconds IS NOT NULL
     AND NEW.intro_duration_seconds > 90 THEN
    RAISE EXCEPTION 'O trailer em vídeo não pode ultrapassar 90 segundos (recebido: %)',
      NEW.intro_duration_seconds;
  END IF;

  -- Coerência: se kind preenchido, url precisa existir
  IF NEW.intro_kind IS NOT NULL AND (NEW.intro_url IS NULL OR length(trim(NEW.intro_url)) = 0) THEN
    RAISE EXCEPTION 'intro_url é obrigatório quando intro_kind está definido';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_subscription_plan_intro ON public.subscription_plans;
CREATE TRIGGER trg_validate_subscription_plan_intro
  BEFORE INSERT OR UPDATE ON public.subscription_plans
  FOR EACH ROW EXECUTE FUNCTION public.validate_subscription_plan_intro();

-- 4) Índice parcial p/ vitrine de planos com trailer ------------------
-- Detecta dinamicamente se as colunas existem antes de criar índices
DO $$
DECLARE
  has_is_enabled boolean;
  has_sort_order boolean;
  predicate text := 'intro_url IS NOT NULL';
  cols text := 'id';
BEGIN
  SELECT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='subscription_plans' AND column_name='is_enabled')
    INTO has_is_enabled;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='subscription_plans' AND column_name='sort_order')
    INTO has_sort_order;

  IF has_is_enabled THEN
    predicate := 'is_enabled = true AND ' || predicate;
  END IF;
  IF has_sort_order THEN
    cols := 'sort_order';
  END IF;

  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS idx_subscription_plans_with_intro ON public.subscription_plans (%s) WHERE %s',
    cols, predicate
  );
END $$;

COMMIT;

-- =====================================================================
-- VALIDAÇÃO RÁPIDA (executar opcionalmente):
--   SELECT id, title, intro_kind, intro_url, intro_duration_seconds
--   FROM public.subscription_plans
--   WHERE intro_url IS NOT NULL;
-- =====================================================================

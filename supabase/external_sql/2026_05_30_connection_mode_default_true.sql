-- =====================================================================
-- Modo Conexão ATIVO POR PADRÃO para todos os usuários (existentes + novos).
-- Idempotente — pode rodar várias vezes sem efeito colateral.
-- =====================================================================

-- 1) Coluna garantida + default = true + NOT NULL
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS connection_mode boolean;

ALTER TABLE public.profiles
  ALTER COLUMN connection_mode SET DEFAULT true;

-- 2) Backfill: qualquer NULL ou false vira true
UPDATE public.profiles
   SET connection_mode = true
 WHERE connection_mode IS DISTINCT FROM true;

-- 3) Trava NOT NULL para nunca mais voltar a NULL
ALTER TABLE public.profiles
  ALTER COLUMN connection_mode SET NOT NULL;

-- 4) handle_new_user: garante que novos perfis criados pelo trigger
--    de auth.users também recebam connection_mode = true mesmo se o
--    INSERT explicitar NULL. (Mantém a função existente; só adiciona COALESCE.)
DO $$
DECLARE
  fn_src text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO fn_src
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'handle_new_user'
  LIMIT 1;

  -- Nada a fazer se a função não existe — o DEFAULT do schema já cobre.
  IF fn_src IS NULL THEN
    RAISE NOTICE 'handle_new_user not found, default column covers new users';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

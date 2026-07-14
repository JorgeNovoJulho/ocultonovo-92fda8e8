-- =========================================================================
-- Corrige erro: "Could not find the 'body' column of 'notifications'
-- in the schema cache" disparado ao clicar em "Acenar" no Top Auras
-- (e em qualquer outro fluxo que insere notificações com `body`).
--
-- Estratégia idempotente:
--  1. Garante a coluna `body` (text, nullable) em public.notifications.
--  2. Se já existir uma coluna legada `message`, sincroniza os valores
--     existentes para `body` para não perder histórico.
--  3. Recarrega o schema cache do PostgREST para a mudança ficar visível
--     imediatamente, sem precisar de reboot manual.
-- =========================================================================

-- 1) Garantir a coluna `body`
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS body text;

-- 2) Backfill opcional a partir de `message` se essa coluna existir
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name   = 'notifications'
       AND column_name  = 'message'
  ) THEN
    EXECUTE 'UPDATE public.notifications
                SET body = COALESCE(body, message)
              WHERE body IS NULL
                AND message IS NOT NULL';
  END IF;
END $$;

-- 3) Recarregar o schema cache do PostgREST
NOTIFY pgrst, 'reload schema';

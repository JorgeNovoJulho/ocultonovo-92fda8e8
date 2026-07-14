-- ============================================================
-- FORÇA modo de visualização do feed = 'limpo' para TODOS os usuários
-- Externo: rvybbrkzmboqbhcemqar.supabase.co
-- Idempotente: pode rodar várias vezes
-- ============================================================

UPDATE public.profiles
   SET feed_mode = 'limpo'
 WHERE feed_mode IS DISTINCT FROM 'limpo';

ALTER TABLE public.profiles
  ALTER COLUMN feed_mode SET DEFAULT 'limpo';

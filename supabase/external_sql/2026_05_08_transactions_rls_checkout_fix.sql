-- ============================================================================
-- Corrige RLS da tabela public.transactions para checkout PIX / assinatura.
-- Idempotente. Executar no SQL Editor do Supabase EXTERNO.
--
-- Problema corrigido:
--   new row violates row-level security policy for table "transactions"
--
-- Regra do projeto:
--   transactions.user_id referencia public.profiles.id (não auth.users.id)
-- ============================================================================

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "transactions_select_own_profile" ON public.transactions;
CREATE POLICY "transactions_select_own_profile"
  ON public.transactions
  FOR SELECT
  TO authenticated
  USING (
    user_id IN (
      SELECT p.id
      FROM public.profiles p
      WHERE p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "transactions_insert_own_profile" ON public.transactions;
CREATE POLICY "transactions_insert_own_profile"
  ON public.transactions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id IN (
      SELECT p.id
      FROM public.profiles p
      WHERE p.user_id = auth.uid()
    )
    AND COALESCE(status, 'pending') = 'pending'
  );

DROP POLICY IF EXISTS "transactions_update_own_profile_pending" ON public.transactions;
CREATE POLICY "transactions_update_own_profile_pending"
  ON public.transactions
  FOR UPDATE
  TO authenticated
  USING (
    user_id IN (
      SELECT p.id
      FROM public.profiles p
      WHERE p.user_id = auth.uid()
    )
    AND COALESCE(status, 'pending') = 'pending'
  )
  WITH CHECK (
    user_id IN (
      SELECT p.id
      FROM public.profiles p
      WHERE p.user_id = auth.uid()
    )
    AND COALESCE(status, 'pending') = 'pending'
  );

NOTIFY pgrst, 'reload schema';
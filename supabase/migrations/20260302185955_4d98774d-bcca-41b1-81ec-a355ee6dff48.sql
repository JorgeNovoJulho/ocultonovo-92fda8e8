
CREATE OR REPLACE VIEW public.vw_extrato_criador
WITH (security_invoker = on) AS
SELECT
  tsl.id,
  tsl.transaction_id,
  tsl.flow_type,
  tsl.gross_amount,
  tsl.tax_amount,
  tsl.tax_rate,
  tsl.base_amount,
  tsl.platform_amount,
  tsl.platform_rate,
  tsl.affiliate_amount,
  tsl.affiliate_rate,
  tsl.creator_amount,
  tsl.creator_id AS criador_id,
  tsl.affiliate_id,
  tsl.provider,
  tsl.created_at,
  t.type AS transaction_type,
  t.status AS transaction_status,
  t.description,
  t.category,
  t.completed_at,
  t.user_id AS buyer_id
FROM public.transaction_split_logs tsl
LEFT JOIN public.transactions t ON t.id::text = tsl.transaction_id;

-- Garantir que criadores possam ver seus próprios logs de split
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'transaction_split_logs' 
    AND policyname = 'Creators can view own split logs'
  ) THEN
    CREATE POLICY "Creators can view own split logs"
      ON public.transaction_split_logs
      FOR SELECT
      TO authenticated
      USING (
        creator_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid())
        OR affiliate_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid())
      );
  END IF;
END $$;

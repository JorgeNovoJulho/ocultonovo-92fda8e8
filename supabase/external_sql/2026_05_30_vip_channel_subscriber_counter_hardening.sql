-- ============================================================================
-- 2026_05_30_vip_channel_subscriber_counter_hardening.sql
-- Canal VIP: unicidade por assinante, contagem somente de assinaturas ativas,
-- e realtime da tabela subscriptions no banco EXTERNO.
-- Idempotente. Execute manualmente no SQL Editor do Supabase externo.
-- ============================================================================

-- 1) Garante publicação realtime para subscriptions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime'
       AND schemaname = 'public'
       AND tablename = 'subscriptions'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.subscriptions';
  END IF;
END$$;

ALTER TABLE public.subscriptions REPLICA IDENTITY FULL;

-- 2) Garante uma única assinatura por assinante+criador (evita duplicidade no contador)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'subscriptions_subscriber_creator_key'
  ) THEN
    ALTER TABLE public.subscriptions
      ADD CONSTRAINT subscriptions_subscriber_creator_key
      UNIQUE (subscriber_id, creator_id);
  END IF;
END$$;

-- 3) Índice auxiliar para contagem rápida somente de assinaturas potencialmente válidas
CREATE INDEX IF NOT EXISTS idx_subscriptions_creator_active_expires
  ON public.subscriptions (creator_id, subscriber_id, expires_at)
  WHERE status IN ('active', 'trialing');

-- 4) View de apoio para contagem única de assinantes ativos por canal
CREATE OR REPLACE VIEW public.v_creator_active_subscriber_counts
WITH (security_invoker = true) AS
SELECT
  s.creator_id,
  COUNT(DISTINCT s.subscriber_id)::bigint AS active_subscribers
FROM public.subscriptions s
WHERE s.status IN ('active', 'trialing')
  AND (s.expires_at IS NULL OR s.expires_at > now())
GROUP BY s.creator_id;

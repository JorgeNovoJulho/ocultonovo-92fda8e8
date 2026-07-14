-- ============================================================================
-- 2026_05_30_channel_subscribers_count_rpc.sql
-- Canal VIP: RPC pública para contar assinantes ativos ignorando RLS da tabela
-- subscriptions (que só deixa o próprio assinante ou criador enxergar).
-- Sem isso, qualquer visitante do canal vê "0 assinantes".
-- Idempotente. Execute no SQL Editor do Supabase EXTERNO.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_channel_active_subscribers_count(
  p_creator uuid
)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_real integer := 0;
  v_beta integer := 0;
BEGIN
  IF p_creator IS NULL THEN
    RETURN 0;
  END IF;

  -- Assinantes reais (subscriptions ativas/trialing, não expiradas)
  SELECT COUNT(DISTINCT s.subscriber_id)
    INTO v_real
    FROM public.subscriptions s
   WHERE s.creator_id = p_creator
     AND s.status IN ('active','trialing')
     AND (s.expires_at IS NULL OR s.expires_at > now());

  -- Grants beta (usuários liberados em modo beta)
  BEGIN
    SELECT COUNT(DISTINCT g.user_id)
      INTO v_beta
      FROM public.beta_access_grants g
     WHERE g.creator_id = p_creator
       AND g.grant_type = 'creator_subscription'
       AND g.status = 'active'
       AND (g.expires_at IS NULL OR g.expires_at > now());
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    v_beta := 0;
  END;

  RETURN COALESCE(v_real,0) + COALESCE(v_beta,0);
END;
$$;

REVOKE ALL ON FUNCTION public.get_channel_active_subscribers_count(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_channel_active_subscribers_count(uuid) TO anon, authenticated, service_role;

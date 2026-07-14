-- ============================================================================
-- get_channel_subscribers_list — RPC SECURITY DEFINER
-- Retorna a lista de assinantes de um canal VIP.
-- Só o dono do canal (profile.user_id = auth.uid()) pode chamar.
-- Idempotente: pode rodar várias vezes sem efeito colateral.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_channel_subscribers_list(p_creator uuid)
RETURNS TABLE (
  subscription_id uuid,
  subscriber_id   uuid,
  display_name    text,
  username        text,
  avatar_url      text,
  status          text,
  price           numeric,
  started_at      timestamptz,
  expires_at      timestamptz,
  cycle           text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_is_owner boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth required' USING ERRCODE = '28000';
  END IF;

  -- p_creator é profile.id; só o dono (user_id = auth.uid()) pode ver
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_creator AND user_id = v_uid
  ) INTO v_is_owner;

  IF NOT v_is_owner THEN
    RAISE EXCEPTION 'forbidden: only the channel owner can list subscribers' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    s.id                                                    AS subscription_id,
    s.subscriber_id                                         AS subscriber_id,
    COALESCE(NULLIF(TRIM(p.display_name), ''), p.username, '—') AS display_name,
    p.username                                              AS username,
    p.avatar_url                                            AS avatar_url,
    s.status                                                AS status,
    s.price                                                 AS price,
    s.created_at                                            AS started_at,
    s.expires_at                                            AS expires_at,
    CASE
      WHEN s.expires_at IS NULL THEN 'lifetime'
      WHEN EXTRACT(EPOCH FROM (s.expires_at - s.created_at)) > (180 * 86400) THEN 'anual'
      ELSE 'mensal'
    END                                                     AS cycle
  FROM public.subscriptions s
  LEFT JOIN public.profiles p ON p.id = s.subscriber_id
  WHERE s.creator_id = p_creator
  ORDER BY s.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_channel_subscribers_list(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_channel_subscribers_list(uuid) TO authenticated;

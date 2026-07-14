-- Sincronizar o intervalo de tempo para 2 minutos (igual ao frontend)
CREATE OR REPLACE FUNCTION public.master_online_unrewarded_get()
RETURNS TABLE (
  profile_id     uuid,
  user_id        uuid,
  username       text,
  name           text,
  avatar_url     text,
  plan_type      text,
  aura_level     integer,
  last_seen      timestamptz,
  already_gifted boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid              uuid := auth.uid();
  v_sender_profile   uuid;
  v_sender_username  text;
  v_online_cutoff    timestamptz := now() - interval '2 minutes'; -- Reduzido de 5 para 2 min para sincronizar com o card
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;

  SELECT p.id, lower(COALESCE(p.username,''))
    INTO v_sender_profile, v_sender_username
    FROM public.profiles p
   WHERE (p.id = v_uid OR p.user_id = v_uid)
   LIMIT 1;

  -- Se o usuário não for o ocultomaster, ele não deveria estar vendo esta lista (segurança)
  IF v_sender_username <> 'ocultomaster' THEN
    RAISE EXCEPTION 'master only';
  END IF;

  RETURN QUERY
  SELECT
    p.id                                                          AS profile_id,
    p.user_id                                                     AS user_id,
    p.username                                                    AS username,
    p.name                                                        AS name,
    p.avatar_url                                                  AS avatar_url,
    p.plan_type                                                   AS plan_type,
    p.aura_level                                                  AS aura_level,
    p.last_seen                                                   AS last_seen,
    EXISTS (
      SELECT 1 FROM public.oculto_aura_xp_gifts g
       WHERE g.sender_id   = v_uid
         AND g.receiver_id = p.id
    )                                                             AS already_gifted
  FROM public.profiles p
  WHERE p.is_online   = true
    AND p.last_seen  >= v_online_cutoff
    AND COALESCE(p.is_seed, false) = false
    AND p.banned_at IS NULL
    AND lower(COALESCE(p.username, '')) <> 'ocultomaster' -- Exclui o próprio master da contagem
  ORDER BY p.last_seen DESC
  LIMIT 500;
END;
$$;

-- ============================================================
-- AURA ROOM CHAT — Mensagens sociais coletivas em tempo real
-- Idempotente · External Supabase only
-- ============================================================

-- 1) Tabela de mensagens
CREATE TABLE IF NOT EXISTS public.oculto_aura_room_messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_slug   text NOT NULL,
  user_id     uuid NOT NULL,
  body        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_oculto_aura_room_messages_recent
  ON public.oculto_aura_room_messages (room_slug, created_at DESC);

ALTER TABLE public.oculto_aura_room_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "room_msgs_read"  ON public.oculto_aura_room_messages;
DROP POLICY IF EXISTS "room_msgs_write" ON public.oculto_aura_room_messages;
DROP POLICY IF EXISTS "room_msgs_del"   ON public.oculto_aura_room_messages;

CREATE POLICY "room_msgs_read"
  ON public.oculto_aura_room_messages FOR SELECT TO authenticated USING (true);

CREATE POLICY "room_msgs_write"
  ON public.oculto_aura_room_messages FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "room_msgs_del"
  ON public.oculto_aura_room_messages FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- 2) Realtime
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename  = 'oculto_aura_room_messages'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.oculto_aura_room_messages';
  END IF;
END$$;

-- 3) RPC: postar mensagem (com rate-limit 5 msg / 30s e validação)
CREATE OR REPLACE FUNCTION public.aura_room_post_message(
  p_slug text,
  p_body text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_body   text := btrim(coalesce(p_body, ''));
  v_recent int;
  v_id     uuid;
  v_present boolean;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'auth_required');
  END IF;

  IF length(v_body) < 1 OR length(v_body) > 240 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_length');
  END IF;

  -- Precisa estar presente como participante (não observer)
  SELECT EXISTS (
    SELECT 1 FROM public.oculto_aura_room_presence
    WHERE room_slug = p_slug
      AND user_id   = v_uid
      AND is_observer = false
      AND last_ping > now() - interval '5 minutes'
  ) INTO v_present;

  IF NOT v_present THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_present');
  END IF;

  -- Rate limit: 5 mensagens em 30 segundos
  SELECT count(*) INTO v_recent
  FROM public.oculto_aura_room_messages
  WHERE room_slug = p_slug
    AND user_id   = v_uid
    AND created_at > now() - interval '30 seconds';

  IF v_recent >= 5 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'rate_limited');
  END IF;

  INSERT INTO public.oculto_aura_room_messages(room_slug, user_id, body)
  VALUES (p_slug, v_uid, v_body)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.aura_room_post_message(text, text) TO authenticated;

-- 4) RPC: últimas mensagens com perfil (decoupled — uma chamada)
CREATE OR REPLACE FUNCTION public.aura_room_recent_messages(
  p_slug  text,
  p_limit int DEFAULT 40
)
RETURNS TABLE (
  id          uuid,
  user_id     uuid,
  body        text,
  created_at  timestamptz,
  name        text,
  username    text,
  avatar_url  text,
  plan_type   text,
  is_verified boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    m.id, m.user_id, m.body, m.created_at,
    p.name, p.username, p.avatar_url, p.plan_type, p.is_verified
  FROM public.oculto_aura_room_messages m
  LEFT JOIN public.profiles p ON p.user_id = m.user_id
  WHERE m.room_slug = p_slug
    AND m.created_at > now() - interval '6 hours'
  ORDER BY m.created_at DESC
  LIMIT greatest(1, least(coalesce(p_limit, 40), 80));
$$;

GRANT EXECUTE ON FUNCTION public.aura_room_recent_messages(text, int) TO authenticated;

-- 5) Limpeza automática (mantém apenas 6h de histórico)
CREATE OR REPLACE FUNCTION public.aura_room_messages_purge()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.oculto_aura_room_messages
  WHERE created_at < now() - interval '6 hours';
$$;

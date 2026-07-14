-- ============================================================
-- AURA ROOM CHAT — Persistência total das mensagens
-- Remove a janela de 6h do recent_messages e amplia o limite,
-- garantindo que TODAS as mensagens de TODOS os usuários
-- permaneçam visíveis no histórico das salas, mesmo após
-- o autor sair da sala.
-- 100% idempotente.
-- Executar no SQL Editor do Supabase EXTERNO.
-- ============================================================

DROP FUNCTION IF EXISTS public.aura_room_recent_messages(text, int);

CREATE OR REPLACE FUNCTION public.aura_room_recent_messages(
  p_slug  text,
  p_limit int DEFAULT 80
)
RETURNS TABLE (
  id           uuid,
  user_id      uuid,
  body         text,
  created_at   timestamptz,
  name         text,
  username     text,
  avatar_url   text,
  plan_type    text,
  is_verified  boolean,
  profile_type text,
  gender       text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Retorna SEM janela de tempo: TODO o histórico da sala,
  -- ordenado do mais recente para o mais antigo, com cap generoso
  -- para evitar payloads gigantes (frontend pagina via loadOlder).
  SELECT
    m.id, m.user_id, m.body, m.created_at,
    p.name, p.username, p.avatar_url, p.plan_type, p.is_verified,
    p.profile_type,
    COALESCE(NULLIF(p.gender, ''), p.profile_type) AS gender
  FROM public.oculto_aura_room_messages m
  LEFT JOIN public.profiles p ON p.user_id = m.user_id
  WHERE m.room_slug = p_slug
  ORDER BY m.created_at DESC
  LIMIT greatest(1, least(coalesce(p_limit, 80), 500));
$$;

GRANT EXECUTE ON FUNCTION public.aura_room_recent_messages(text, int) TO authenticated;

-- Garante índice para a nova ordenação ampla (sem filtro de tempo)
CREATE INDEX IF NOT EXISTS idx_oculto_aura_room_messages_slug_created
  ON public.oculto_aura_room_messages (room_slug, created_at DESC);

NOTIFY pgrst, 'reload schema';

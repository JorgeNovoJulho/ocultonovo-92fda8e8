-- ============================================================
-- Etapa 58 — Integração Canal VIP (lista itens Play de um criador)
-- Idempotente. Rodar no SQL Editor do Supabase EXTERNO.
-- kind/visibility são enums -> cast para text.
-- ============================================================

CREATE OR REPLACE FUNCTION public.oculto_play_items_by_creator(
  p_creator_id uuid,
  p_limit int DEFAULT 24
)
RETURNS TABLE (
  id uuid, kind text, title text, caption text,
  thumb_url text, media_url text, audio_url text,
  visibility text, view_count integer, like_count integer,
  published_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    i.id, i.kind::text, i.title, i.caption,
    i.thumb_url, i.media_url, i.audio_url,
    COALESCE(i.visibility::text,'public'),
    COALESCE(i.view_count,0), COALESCE(i.like_count,0),
    i.published_at
  FROM public.oculto_play_items i
  WHERE i.author_id = p_creator_id
    AND i.published_at IS NOT NULL
    AND COALESCE(i.visibility::text,'public') IN ('public','premium','vip')
  ORDER BY i.published_at DESC
  LIMIT GREATEST(p_limit, 1);
$$;

GRANT EXECUTE ON FUNCTION public.oculto_play_items_by_creator(uuid, int) TO anon, authenticated;

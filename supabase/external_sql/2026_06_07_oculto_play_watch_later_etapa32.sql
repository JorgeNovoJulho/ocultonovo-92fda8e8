-- Etapa 32 — Assistir Depois (Watch Later) do Oculto Play
-- Tabela por usuário com RLS estrita + função de listagem com join enxuto.

CREATE TABLE IF NOT EXISTS public.oculto_play_watch_later (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  item_id uuid NOT NULL REFERENCES public.oculto_play_items(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_oculto_play_watch_later_user
  ON public.oculto_play_watch_later (user_id, created_at DESC);

GRANT SELECT, INSERT, DELETE ON public.oculto_play_watch_later TO authenticated;
GRANT ALL ON public.oculto_play_watch_later TO service_role;

ALTER TABLE public.oculto_play_watch_later ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "watch_later_select_own" ON public.oculto_play_watch_later;
CREATE POLICY "watch_later_select_own"
  ON public.oculto_play_watch_later FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "watch_later_insert_own" ON public.oculto_play_watch_later;
CREATE POLICY "watch_later_insert_own"
  ON public.oculto_play_watch_later FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "watch_later_delete_own" ON public.oculto_play_watch_later;
CREATE POLICY "watch_later_delete_own"
  ON public.oculto_play_watch_later FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Lista watch later do usuário com dados do item (join enxuto, sem expor outros usuários).
CREATE OR REPLACE FUNCTION public.oculto_play_watch_later_list(
  p_limit int DEFAULT 60
)
RETURNS TABLE (
  item_id uuid,
  kind text,
  title text,
  thumb_url text,
  media_url text,
  view_count bigint,
  like_count bigint,
  author_id uuid,
  saved_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    i.id,
    i.kind::text,
    i.title,
    i.thumb_url,
    i.media_url,
    COALESCE(i.view_count, 0)::bigint,
    COALESCE(i.like_count, 0)::bigint,
    i.author_id,
    w.created_at
  FROM public.oculto_play_watch_later w
  JOIN public.oculto_play_items i ON i.id = w.item_id
  WHERE w.user_id = auth.uid()
    AND i.is_published = true
  ORDER BY w.created_at DESC
  LIMIT GREATEST(p_limit, 1);
$$;

REVOKE ALL ON FUNCTION public.oculto_play_watch_later_list(int) FROM public;
GRANT EXECUTE ON FUNCTION public.oculto_play_watch_later_list(int) TO authenticated, service_role;

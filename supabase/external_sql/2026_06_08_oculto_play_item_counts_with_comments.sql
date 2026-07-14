-- ============================================================
-- OCULTO PLAY — Adiciona comment_count em oculto_play_item_counts
-- 100% idempotente. Pode rodar várias vezes sem erro.
-- ============================================================

ALTER TABLE public.oculto_play_items
  ADD COLUMN IF NOT EXISTS view_count    int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS like_count    int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dislike_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS save_count    int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS share_count   int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS comment_count int NOT NULL DEFAULT 0;

DROP FUNCTION IF EXISTS public.oculto_play_item_counts(uuid[]);

CREATE OR REPLACE FUNCTION public.oculto_play_item_counts(p_item_ids uuid[])
RETURNS TABLE(
  item_id       uuid,
  view_count    int,
  like_count    int,
  dislike_count int,
  save_count    int,
  share_count   int,
  comment_count int
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    id AS item_id,
    COALESCE(view_count, 0)::int,
    COALESCE(like_count, 0)::int,
    COALESCE(dislike_count, 0)::int,
    COALESCE(save_count, 0)::int,
    COALESCE(share_count, 0)::int,
    COALESCE(comment_count, 0)::int
  FROM public.oculto_play_items
  WHERE id = ANY(COALESCE(p_item_ids, ARRAY[]::uuid[]));
$$;

GRANT EXECUTE ON FUNCTION public.oculto_play_item_counts(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.oculto_play_item_counts(uuid[]) TO service_role;

NOTIFY pgrst, 'reload schema';

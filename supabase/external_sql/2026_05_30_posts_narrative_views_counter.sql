-- ============================================================
-- Contador de visualizações narrativas (Diário VIP, Capítulo, Série, Texto…)
-- Idempotente — pode ser rodado várias vezes no SQL Editor externo.
-- ============================================================

-- 1) Coluna no posts
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS narrative_views_count integer NOT NULL DEFAULT 0;

-- 2) RPC para incrementar de forma segura
CREATE OR REPLACE FUNCTION public.register_narrative_view(p_post_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  IF p_post_id IS NULL THEN
    RETURN 0;
  END IF;

  UPDATE public.posts
     SET narrative_views_count = COALESCE(narrative_views_count, 0) + 1
   WHERE id = p_post_id
  RETURNING narrative_views_count INTO v_count;

  RETURN COALESCE(v_count, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_narrative_view(uuid) TO anon, authenticated;

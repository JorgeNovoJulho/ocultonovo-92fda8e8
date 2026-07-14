-- ============================================================
-- Oculto Play — Avaliação por estrelas (1–5) por item
-- Idempotente. Rodar no SQL Editor do Supabase EXTERNO.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.oculto_play_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL,
  user_id uuid NOT NULL,
  stars smallint NOT NULL CHECK (stars BETWEEN 1 AND 5),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (item_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_oculto_play_ratings_item ON public.oculto_play_ratings (item_id);
CREATE INDEX IF NOT EXISTS idx_oculto_play_ratings_user ON public.oculto_play_ratings (user_id);

GRANT SELECT ON public.oculto_play_ratings TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.oculto_play_ratings TO authenticated;
GRANT ALL ON public.oculto_play_ratings TO service_role;

ALTER TABLE public.oculto_play_ratings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "opr_select_all" ON public.oculto_play_ratings;
CREATE POLICY "opr_select_all" ON public.oculto_play_ratings FOR SELECT USING (true);

DROP POLICY IF EXISTS "opr_owner_insert" ON public.oculto_play_ratings;
CREATE POLICY "opr_owner_insert" ON public.oculto_play_ratings FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "opr_owner_update" ON public.oculto_play_ratings;
CREATE POLICY "opr_owner_update" ON public.oculto_play_ratings FOR UPDATE
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "opr_owner_delete" ON public.oculto_play_ratings;
CREATE POLICY "opr_owner_delete" ON public.oculto_play_ratings FOR DELETE
  USING (user_id = auth.uid());

-- ---------- RPC: resumo (avg, count, my_stars) ----------
CREATE OR REPLACE FUNCTION public.oculto_play_rating_summary(p_item_id uuid)
RETURNS TABLE (avg numeric, total bigint, my_stars smallint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    COALESCE(ROUND(AVG(stars)::numeric, 2), 0)::numeric AS avg,
    COUNT(*)::bigint AS total,
    (SELECT stars FROM public.oculto_play_ratings
       WHERE item_id = p_item_id AND user_id = auth.uid() LIMIT 1) AS my_stars
  FROM public.oculto_play_ratings
  WHERE item_id = p_item_id;
$$;
GRANT EXECUTE ON FUNCTION public.oculto_play_rating_summary(uuid) TO anon, authenticated;

-- ---------- RPC: registrar/atualizar nota ----------
CREATE OR REPLACE FUNCTION public.oculto_play_rate_item(p_item_id uuid, p_stars smallint)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF p_stars < 1 OR p_stars > 5 THEN RAISE EXCEPTION 'invalid stars'; END IF;
  INSERT INTO public.oculto_play_ratings(item_id, user_id, stars)
    VALUES (p_item_id, v_uid, p_stars)
    ON CONFLICT (item_id, user_id)
    DO UPDATE SET stars = EXCLUDED.stars, updated_at = now();
END; $$;
GRANT EXECUTE ON FUNCTION public.oculto_play_rate_item(uuid, smallint) TO authenticated;

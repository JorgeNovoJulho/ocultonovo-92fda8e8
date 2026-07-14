-- ============================================================
-- Etapa 49 — Reações na Linha do Tempo (Oculto Play)
-- Idempotente. Rodar no SQL Editor do Supabase EXTERNO.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.oculto_play_timeline_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL,
  user_id uuid NOT NULL,
  position_seconds numeric(10,2) NOT NULL CHECK (position_seconds >= 0),
  emoji text NOT NULL CHECK (char_length(emoji) BETWEEN 1 AND 8),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_oculto_play_timeline_reactions_item
  ON public.oculto_play_timeline_reactions (item_id, position_seconds);
CREATE INDEX IF NOT EXISTS idx_oculto_play_timeline_reactions_user
  ON public.oculto_play_timeline_reactions (user_id, created_at DESC);

GRANT SELECT ON public.oculto_play_timeline_reactions TO anon, authenticated;
GRANT INSERT, DELETE ON public.oculto_play_timeline_reactions TO authenticated;
GRANT ALL ON public.oculto_play_timeline_reactions TO service_role;

ALTER TABLE public.oculto_play_timeline_reactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tl_reactions_select_all" ON public.oculto_play_timeline_reactions;
CREATE POLICY "tl_reactions_select_all"
  ON public.oculto_play_timeline_reactions FOR SELECT USING (true);

DROP POLICY IF EXISTS "tl_reactions_owner_insert" ON public.oculto_play_timeline_reactions;
CREATE POLICY "tl_reactions_owner_insert"
  ON public.oculto_play_timeline_reactions FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "tl_reactions_owner_delete" ON public.oculto_play_timeline_reactions;
CREATE POLICY "tl_reactions_owner_delete"
  ON public.oculto_play_timeline_reactions FOR DELETE
  USING (user_id = auth.uid());

-- ----------------------------------------------------------------
-- Lista agrupada por bucket de 2s (limita carga do player).
-- Retorna até 500 reações ordenadas por position_seconds.
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.oculto_play_list_timeline_reactions(p_item_id uuid)
RETURNS TABLE (
  position_seconds numeric,
  emoji text,
  qty integer
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    (floor(position_seconds / 2.0) * 2.0)::numeric AS position_seconds,
    emoji,
    COUNT(*)::int AS qty
  FROM public.oculto_play_timeline_reactions
  WHERE item_id = p_item_id
  GROUP BY 1, 2
  ORDER BY 1 ASC
  LIMIT 500;
$$;
GRANT EXECUTE ON FUNCTION public.oculto_play_list_timeline_reactions(uuid) TO anon, authenticated;

-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.oculto_play_add_timeline_reaction(
  p_item_id uuid,
  p_position_seconds numeric,
  p_emoji text
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF p_emoji IS NULL OR length(trim(p_emoji)) = 0 THEN
    RAISE EXCEPTION 'emoji required';
  END IF;
  INSERT INTO public.oculto_play_timeline_reactions
    (item_id, user_id, position_seconds, emoji)
  VALUES
    (p_item_id, v_uid, GREATEST(COALESCE(p_position_seconds,0), 0), p_emoji)
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.oculto_play_add_timeline_reaction(uuid,numeric,text) TO authenticated;

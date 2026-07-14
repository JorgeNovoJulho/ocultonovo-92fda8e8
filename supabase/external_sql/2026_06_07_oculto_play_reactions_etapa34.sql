-- ============================================================================
-- OCULTO PLAY — Etapa 34: Reações rápidas (emoji) por item
-- Cole no SQL Editor do Supabase EXTERNO (rvybbrkzmboqbhcemqar).
-- 100% idempotente. Isolado em oculto_play_*.
-- Não toca posts/stories/comunidades/canais VIP/radar/aura.
-- ============================================================================

-- ---------- 1) Tabela de reações ----------
CREATE TABLE IF NOT EXISTS public.oculto_play_reactions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id     uuid NOT NULL REFERENCES public.oculto_play_items(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL,
  emoji       text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT oculto_play_reactions_emoji_chk
    CHECK (emoji IN ('heart','fire','wow','clap','laugh')),
  CONSTRAINT oculto_play_reactions_unique
    UNIQUE (item_id, user_id, emoji)
);

CREATE INDEX IF NOT EXISTS idx_oculto_play_reactions_item
  ON public.oculto_play_reactions(item_id);
CREATE INDEX IF NOT EXISTS idx_oculto_play_reactions_user
  ON public.oculto_play_reactions(user_id);
CREATE INDEX IF NOT EXISTS idx_oculto_play_reactions_created
  ON public.oculto_play_reactions(created_at DESC);

GRANT SELECT, INSERT, DELETE ON public.oculto_play_reactions TO authenticated;
GRANT ALL ON public.oculto_play_reactions TO service_role;

ALTER TABLE public.oculto_play_reactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS oculto_play_reactions_read ON public.oculto_play_reactions;
CREATE POLICY oculto_play_reactions_read
  ON public.oculto_play_reactions
  FOR SELECT
  TO authenticated
  USING (public.can_access_oculto_play());

DROP POLICY IF EXISTS oculto_play_reactions_insert ON public.oculto_play_reactions;
CREATE POLICY oculto_play_reactions_insert
  ON public.oculto_play_reactions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.can_access_oculto_play()
    AND user_id = auth.uid()
  );

DROP POLICY IF EXISTS oculto_play_reactions_delete ON public.oculto_play_reactions;
CREATE POLICY oculto_play_reactions_delete
  ON public.oculto_play_reactions
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- ---------- 2) RPC: toggle reação ----------
CREATE OR REPLACE FUNCTION public.oculto_play_react(
  p_item_id uuid,
  p_emoji   text
) RETURNS TABLE(emoji text, count bigint, mine boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_exists boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;
  IF NOT public.can_access_oculto_play() THEN
    RAISE EXCEPTION 'access denied';
  END IF;
  IF p_emoji NOT IN ('heart','fire','wow','clap','laugh') THEN
    RAISE EXCEPTION 'invalid emoji';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.oculto_play_reactions
    WHERE item_id = p_item_id AND user_id = v_uid AND emoji = p_emoji
  ) INTO v_exists;

  IF v_exists THEN
    DELETE FROM public.oculto_play_reactions
    WHERE item_id = p_item_id AND user_id = v_uid AND emoji = p_emoji;
  ELSE
    INSERT INTO public.oculto_play_reactions(item_id, user_id, emoji)
    VALUES (p_item_id, v_uid, p_emoji)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN QUERY
  SELECT r.emoji,
         COUNT(*)::bigint AS count,
         BOOL_OR(r.user_id = v_uid) AS mine
  FROM public.oculto_play_reactions r
  WHERE r.item_id = p_item_id
  GROUP BY r.emoji
  ORDER BY count DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.oculto_play_react(uuid, text) TO authenticated;

-- ---------- 3) RPC: contagem por lote de itens ----------
CREATE OR REPLACE FUNCTION public.oculto_play_reactions_for_items(
  p_item_ids uuid[]
) RETURNS TABLE(item_id uuid, emoji text, count bigint, mine boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF NOT public.can_access_oculto_play() THEN
    RAISE EXCEPTION 'access denied';
  END IF;

  RETURN QUERY
  SELECT r.item_id,
         r.emoji,
         COUNT(*)::bigint,
         BOOL_OR(r.user_id = v_uid) AS mine
  FROM public.oculto_play_reactions r
  WHERE r.item_id = ANY(p_item_ids)
  GROUP BY r.item_id, r.emoji
  ORDER BY r.item_id, count DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.oculto_play_reactions_for_items(uuid[]) TO authenticated;

-- ---------- 4) RPC admin: totais agregados por emoji nos últimos N dias ----------
CREATE OR REPLACE FUNCTION public.oculto_play_admin_reactions(
  p_days int DEFAULT 7
) RETURNS TABLE(emoji text, total bigint, distinct_items bigint, distinct_users bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- master admin gate via convenção existente
  IF NOT public.is_master_admin(auth.uid()) THEN
    RAISE EXCEPTION 'master required';
  END IF;

  RETURN QUERY
  SELECT r.emoji,
         COUNT(*)::bigint,
         COUNT(DISTINCT r.item_id)::bigint,
         COUNT(DISTINCT r.user_id)::bigint
  FROM public.oculto_play_reactions r
  WHERE r.created_at >= now() - (GREATEST(p_days,1) || ' days')::interval
  GROUP BY r.emoji
  ORDER BY 2 DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.oculto_play_admin_reactions(int) TO authenticated;

-- ---------- 5) Realtime ----------
ALTER TABLE public.oculto_play_reactions REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='oculto_play_reactions'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.oculto_play_reactions';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

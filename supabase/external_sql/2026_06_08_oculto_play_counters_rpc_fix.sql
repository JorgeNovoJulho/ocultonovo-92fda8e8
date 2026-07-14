-- ============================================================
-- OCULTO PLAY — Correção completa de contadores + RPCs
-- Idempotente · Rodar no SQL Editor do Supabase EXTERNO
-- Corrige: column "dislike_count" does not exist
-- Corrige: Could not find the function public.oculto_play_register_share(...)
-- ============================================================

-- 1) Garante TODAS as colunas de contadores antes de recriar RPCs
ALTER TABLE public.oculto_play_items
  ADD COLUMN IF NOT EXISTS view_count    int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS like_count    int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dislike_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS save_count    int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS share_count   int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS comment_count int NOT NULL DEFAULT 0;

-- 2) Tabelas persistentes de dislike e compartilhamento
CREATE TABLE IF NOT EXISTS public.oculto_play_dislikes (
  item_id    uuid NOT NULL REFERENCES public.oculto_play_items(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (item_id, user_id)
);

GRANT SELECT, INSERT, DELETE ON public.oculto_play_dislikes TO authenticated;
GRANT ALL ON public.oculto_play_dislikes TO service_role;

ALTER TABLE public.oculto_play_dislikes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS op_dislikes_self ON public.oculto_play_dislikes;
DROP POLICY IF EXISTS "op_dislikes_self" ON public.oculto_play_dislikes;
CREATE POLICY op_dislikes_self
  ON public.oculto_play_dislikes
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_op_dislikes_item
  ON public.oculto_play_dislikes(item_id);

CREATE TABLE IF NOT EXISTS public.oculto_play_shares (
  item_id    uuid NOT NULL REFERENCES public.oculto_play_items(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (item_id, user_id)
);

GRANT SELECT, INSERT ON public.oculto_play_shares TO authenticated;
GRANT ALL ON public.oculto_play_shares TO service_role;

ALTER TABLE public.oculto_play_shares ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS op_shares_self ON public.oculto_play_shares;
DROP POLICY IF EXISTS "op_shares_self" ON public.oculto_play_shares;
CREATE POLICY op_shares_self
  ON public.oculto_play_shares
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_op_shares_item
  ON public.oculto_play_shares(item_id);

-- 3) Triggers para manter contadores permanentes
CREATE OR REPLACE FUNCTION public.tg_op_dislikes_counter()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.oculto_play_items
       SET dislike_count = dislike_count + 1
     WHERE id = NEW.item_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.oculto_play_items
       SET dislike_count = GREATEST(0, dislike_count - 1)
     WHERE id = OLD.item_id;
    RETURN OLD;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_op_dislikes_counter ON public.oculto_play_dislikes;
CREATE TRIGGER trg_op_dislikes_counter
  AFTER INSERT OR DELETE ON public.oculto_play_dislikes
  FOR EACH ROW EXECUTE FUNCTION public.tg_op_dislikes_counter();

CREATE OR REPLACE FUNCTION public.tg_op_shares_counter()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.oculto_play_items
       SET share_count = share_count + 1
     WHERE id = NEW.item_id;
    RETURN NEW;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_op_shares_counter ON public.oculto_play_shares;
CREATE TRIGGER trg_op_shares_counter
  AFTER INSERT ON public.oculto_play_shares
  FOR EACH ROW EXECUTE FUNCTION public.tg_op_shares_counter();

-- 4) Recalcula contadores já existentes para persistir o resultado correto
UPDATE public.oculto_play_items i
   SET like_count = COALESCE(x.cnt, 0)
  FROM (
    SELECT item_id, COUNT(*)::int AS cnt
      FROM public.oculto_play_likes
     GROUP BY item_id
  ) x
 WHERE i.id = x.item_id;

UPDATE public.oculto_play_items i
   SET like_count = 0
 WHERE NOT EXISTS (
   SELECT 1 FROM public.oculto_play_likes l WHERE l.item_id = i.id
 );

UPDATE public.oculto_play_items i
   SET save_count = COALESCE(x.cnt, 0)
  FROM (
    SELECT item_id, COUNT(*)::int AS cnt
      FROM public.oculto_play_saves
     GROUP BY item_id
  ) x
 WHERE i.id = x.item_id;

UPDATE public.oculto_play_items i
   SET save_count = 0
 WHERE NOT EXISTS (
   SELECT 1 FROM public.oculto_play_saves s WHERE s.item_id = i.id
 );

UPDATE public.oculto_play_items i
   SET dislike_count = COALESCE(x.cnt, 0)
  FROM (
    SELECT item_id, COUNT(*)::int AS cnt
      FROM public.oculto_play_dislikes
     GROUP BY item_id
  ) x
 WHERE i.id = x.item_id;

UPDATE public.oculto_play_items i
   SET dislike_count = 0
 WHERE NOT EXISTS (
   SELECT 1 FROM public.oculto_play_dislikes d WHERE d.item_id = i.id
 );

UPDATE public.oculto_play_items i
   SET share_count = COALESCE(x.cnt, 0)
  FROM (
    SELECT item_id, COUNT(*)::int AS cnt
      FROM public.oculto_play_shares
     GROUP BY item_id
  ) x
 WHERE i.id = x.item_id;

UPDATE public.oculto_play_items i
   SET share_count = 0
 WHERE NOT EXISTS (
   SELECT 1 FROM public.oculto_play_shares sh WHERE sh.item_id = i.id
 );

DO $$
BEGIN
  IF to_regclass('public.oculto_play_comments') IS NOT NULL THEN
    EXECUTE $sql$
      UPDATE public.oculto_play_items i
         SET comment_count = COALESCE(x.cnt, 0)
        FROM (
          SELECT item_id, COUNT(*)::int AS cnt
            FROM public.oculto_play_comments
           WHERE COALESCE(is_hidden, false) = false
           GROUP BY item_id
        ) x
       WHERE i.id = x.item_id
    $sql$;

    EXECUTE $sql$
      UPDATE public.oculto_play_items i
         SET comment_count = 0
       WHERE NOT EXISTS (
         SELECT 1
           FROM public.oculto_play_comments c
          WHERE c.item_id = i.id
            AND COALESCE(c.is_hidden, false) = false
       )
    $sql$;
  END IF;
END $$;

-- 5) RPCs usadas pelo frontend
CREATE OR REPLACE FUNCTION public.oculto_play_toggle_dislike(p_item_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_exists boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth_required' USING ERRCODE = '28000';
  END IF;

  SELECT EXISTS (
    SELECT 1
      FROM public.oculto_play_dislikes
     WHERE item_id = p_item_id
       AND user_id = v_uid
  ) INTO v_exists;

  IF v_exists THEN
    DELETE FROM public.oculto_play_dislikes
     WHERE item_id = p_item_id
       AND user_id = v_uid;
    RETURN false;
  END IF;

  INSERT INTO public.oculto_play_dislikes(item_id, user_id)
  VALUES (p_item_id, v_uid)
  ON CONFLICT DO NOTHING;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.oculto_play_toggle_dislike(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.oculto_play_register_share(p_item_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth_required' USING ERRCODE = '28000';
  END IF;

  INSERT INTO public.oculto_play_shares(item_id, user_id)
  VALUES (p_item_id, v_uid)
  ON CONFLICT DO NOTHING;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.oculto_play_register_share(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.oculto_play_my_reactions(p_item_ids uuid[])
RETURNS TABLE(
  item_id uuid,
  liked boolean,
  saved boolean,
  disliked boolean,
  shared boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT i AS item_id,
    EXISTS (SELECT 1 FROM public.oculto_play_likes l WHERE l.item_id = i AND l.user_id = auth.uid()) AS liked,
    EXISTS (SELECT 1 FROM public.oculto_play_saves s WHERE s.item_id = i AND s.user_id = auth.uid()) AS saved,
    EXISTS (SELECT 1 FROM public.oculto_play_dislikes d WHERE d.item_id = i AND d.user_id = auth.uid()) AS disliked,
    EXISTS (SELECT 1 FROM public.oculto_play_shares sh WHERE sh.item_id = i AND sh.user_id = auth.uid()) AS shared
  FROM unnest(COALESCE(p_item_ids, ARRAY[]::uuid[])) AS i;
$$;

GRANT EXECUTE ON FUNCTION public.oculto_play_my_reactions(uuid[]) TO authenticated;

DROP FUNCTION IF EXISTS public.oculto_play_item_counts(uuid[]);
CREATE OR REPLACE FUNCTION public.oculto_play_item_counts(p_item_ids uuid[])
RETURNS TABLE(
  item_id uuid,
  view_count int,
  like_count int,
  dislike_count int,
  save_count int,
  share_count int,
  comment_count int
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    i.id AS item_id,
    COALESCE(i.view_count, 0)::int AS view_count,
    COALESCE(i.like_count, 0)::int AS like_count,
    COALESCE(i.dislike_count, 0)::int AS dislike_count,
    COALESCE(i.save_count, 0)::int AS save_count,
    COALESCE(i.share_count, 0)::int AS share_count,
    COALESCE(i.comment_count, 0)::int AS comment_count
  FROM public.oculto_play_items i
  WHERE i.id = ANY(COALESCE(p_item_ids, ARRAY[]::uuid[]));
$$;

GRANT EXECUTE ON FUNCTION public.oculto_play_item_counts(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.oculto_play_item_counts(uuid[]) TO service_role;

-- 6) Realtime dos contadores/cards
ALTER TABLE public.oculto_play_items REPLICA IDENTITY FULL;
ALTER TABLE public.oculto_play_dislikes REPLICA IDENTITY FULL;
ALTER TABLE public.oculto_play_shares REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'oculto_play_items'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.oculto_play_items;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'oculto_play_dislikes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.oculto_play_dislikes;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'oculto_play_shares'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.oculto_play_shares;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
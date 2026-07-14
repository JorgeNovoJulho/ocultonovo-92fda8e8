-- Cria a tabela public.comment_likes no Supabase EXTERNO
-- Resolve: "Could not find the table 'public.comment_likes' in the schema cache"
-- Cole este script no SQL Editor do Supabase externo (rvybbrkzmboqbhcemqar).

CREATE TABLE IF NOT EXISTS public.comment_likes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id   uuid NOT NULL REFERENCES public.post_comments(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES public.profiles(id)       ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (comment_id, user_id)
);

CREATE INDEX IF NOT EXISTS comment_likes_comment_idx ON public.comment_likes(comment_id);
CREATE INDEX IF NOT EXISTS comment_likes_user_idx    ON public.comment_likes(user_id);

GRANT SELECT, INSERT, DELETE ON public.comment_likes TO authenticated;
GRANT ALL ON public.comment_likes TO service_role;

ALTER TABLE public.comment_likes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "comment_likes_select_all" ON public.comment_likes;
CREATE POLICY "comment_likes_select_all"
  ON public.comment_likes FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "comment_likes_insert_self" ON public.comment_likes;
CREATE POLICY "comment_likes_insert_self"
  ON public.comment_likes FOR INSERT TO authenticated
  WITH CHECK (
    user_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "comment_likes_delete_self" ON public.comment_likes;
CREATE POLICY "comment_likes_delete_self"
  ON public.comment_likes FOR DELETE TO authenticated
  USING (
    user_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  );

-- Mantém likes_count em post_comments sincronizado
CREATE OR REPLACE FUNCTION public.comment_likes_after_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.post_comments
       SET likes_count = COALESCE(likes_count, 0) + 1
     WHERE id = NEW.comment_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.post_comments
       SET likes_count = GREATEST(COALESCE(likes_count, 0) - 1, 0)
     WHERE id = OLD.comment_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_comment_likes_after_change ON public.comment_likes;
CREATE TRIGGER trg_comment_likes_after_change
AFTER INSERT OR DELETE ON public.comment_likes
FOR EACH ROW EXECUTE FUNCTION public.comment_likes_after_change();

NOTIFY pgrst, 'reload schema';

-- Likes do Mural de Perfil
-- Idempotente. Rodar no SQL Editor do Supabase EXTERNO.

CREATE TABLE IF NOT EXISTS public.oculto_profile_mural_likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mural_post_id uuid NOT NULL REFERENCES public.oculto_profile_mural_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (mural_post_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_mural_likes_post ON public.oculto_profile_mural_likes(mural_post_id);
CREATE INDEX IF NOT EXISTS idx_mural_likes_user ON public.oculto_profile_mural_likes(user_id);

GRANT SELECT, INSERT, DELETE ON public.oculto_profile_mural_likes TO authenticated;
GRANT SELECT ON public.oculto_profile_mural_likes TO anon;
GRANT ALL ON public.oculto_profile_mural_likes TO service_role;

ALTER TABLE public.oculto_profile_mural_likes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mural_likes_select_all" ON public.oculto_profile_mural_likes;
CREATE POLICY "mural_likes_select_all"
  ON public.oculto_profile_mural_likes
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "mural_likes_insert_self" ON public.oculto_profile_mural_likes;
CREATE POLICY "mural_likes_insert_self"
  ON public.oculto_profile_mural_likes
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "mural_likes_delete_self" ON public.oculto_profile_mural_likes;
CREATE POLICY "mural_likes_delete_self"
  ON public.oculto_profile_mural_likes
  FOR DELETE
  USING (auth.uid() = user_id);

ALTER PUBLICATION supabase_realtime ADD TABLE public.oculto_profile_mural_likes;

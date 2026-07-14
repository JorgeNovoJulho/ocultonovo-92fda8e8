-- =====================================================================
-- 2026-06-02 — Mural do perfil
-- Tabela: oculto_profile_mural_posts (mensagens de visitantes no perfil)
-- Bucket: mural-posts (imagens geradas a partir do texto+fundo)
-- Idempotente: pode rodar quantas vezes quiser.
-- =====================================================================

-- 1) Tabela
CREATE TABLE IF NOT EXISTS public.oculto_profile_mural_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content_text text NOT NULL,
  bg_id text NOT NULL DEFAULT 'rosa',
  image_url text,
  mentions text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mural_owner_created
  ON public.oculto_profile_mural_posts (profile_owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mural_author
  ON public.oculto_profile_mural_posts (author_id);

-- 2) GRANTs (Data API)
GRANT SELECT ON public.oculto_profile_mural_posts TO anon;
GRANT SELECT, INSERT, DELETE ON public.oculto_profile_mural_posts TO authenticated;
GRANT ALL ON public.oculto_profile_mural_posts TO service_role;

-- 3) RLS
ALTER TABLE public.oculto_profile_mural_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mural_select_public" ON public.oculto_profile_mural_posts;
CREATE POLICY "mural_select_public"
  ON public.oculto_profile_mural_posts
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "mural_insert_self_author" ON public.oculto_profile_mural_posts;
CREATE POLICY "mural_insert_self_author"
  ON public.oculto_profile_mural_posts
  FOR INSERT
  TO authenticated
  WITH CHECK (
    author_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "mural_delete_author_or_owner" ON public.oculto_profile_mural_posts;
CREATE POLICY "mural_delete_author_or_owner"
  ON public.oculto_profile_mural_posts
  FOR DELETE
  TO authenticated
  USING (
    author_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    OR profile_owner_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  );

-- 4) Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.oculto_profile_mural_posts;

-- 5) Bucket de armazenamento (público) para as imagens geradas
INSERT INTO storage.buckets (id, name, public)
VALUES ('mural-posts', 'mural-posts', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

-- Policies de storage
DROP POLICY IF EXISTS "mural_posts_read_public" ON storage.objects;
CREATE POLICY "mural_posts_read_public"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'mural-posts');

DROP POLICY IF EXISTS "mural_posts_upload_auth" ON storage.objects;
CREATE POLICY "mural_posts_upload_auth"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'mural-posts');

DROP POLICY IF EXISTS "mural_posts_delete_auth" ON storage.objects;
CREATE POLICY "mural_posts_delete_auth"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'mural-posts');

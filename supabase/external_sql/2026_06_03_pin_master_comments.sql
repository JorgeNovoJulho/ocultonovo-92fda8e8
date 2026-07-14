-- =====================================================================
-- 2026-06-03 — Fixar postagem no topo + Comentário Master (tempo real)
-- Execute integralmente no SQL Editor do Supabase EXTERNO. Idempotente.
-- =====================================================================

-- 1) Colunas de fixação na tabela posts -------------------------------
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS is_pinned  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pinned_at  timestamptz;

CREATE INDEX IF NOT EXISTS idx_posts_is_pinned
  ON public.posts (is_pinned, pinned_at DESC NULLS LAST, created_at DESC);

-- 2) Função SECURITY DEFINER: _is_master_admin ------------------------
CREATE OR REPLACE FUNCTION public._is_master_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.profiles p
     WHERE p.user_id = auth.uid()
       AND lower(coalesce(p.username,'')) = 'ocultomaster'
  ) OR EXISTS (
    SELECT 1
      FROM auth.users u
     WHERE u.id = auth.uid()
       AND lower(coalesce(u.email,'')) = 'ocultomaster@ocultoswing.com.br'
  );
$$;

GRANT EXECUTE ON FUNCTION public._is_master_admin() TO anon, authenticated, service_role;

-- 3) Policy UPDATE: permite ao master atualizar QUALQUER post ---------
DROP POLICY IF EXISTS "Master admin can update any post" ON public.posts;
CREATE POLICY "Master admin can update any post"
  ON public.posts
  FOR UPDATE
  TO authenticated
  USING (public._is_master_admin())
  WITH CHECK (public._is_master_admin());

-- 4) Tabela oculto_post_admin_comments --------------------------------
CREATE TABLE IF NOT EXISTS public.oculto_post_admin_comments (
  post_id     uuid PRIMARY KEY REFERENCES public.posts(id) ON DELETE CASCADE,
  content     text NOT NULL,
  bg_color    text NOT NULL DEFAULT '#1f1f1f',
  text_color  text NOT NULL DEFAULT '#ffffff',
  font_size   integer NOT NULL DEFAULT 14,
  font_family text NOT NULL DEFAULT 'sans-serif',
  author_id   uuid NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.oculto_post_admin_comments TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.oculto_post_admin_comments TO authenticated;
GRANT ALL ON public.oculto_post_admin_comments TO service_role;

ALTER TABLE public.oculto_post_admin_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read admin comments"   ON public.oculto_post_admin_comments;
DROP POLICY IF EXISTS "Master can insert admin comments" ON public.oculto_post_admin_comments;
DROP POLICY IF EXISTS "Master can update admin comments" ON public.oculto_post_admin_comments;
DROP POLICY IF EXISTS "Master can delete admin comments" ON public.oculto_post_admin_comments;

CREATE POLICY "Anyone can read admin comments"
  ON public.oculto_post_admin_comments
  FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY "Master can insert admin comments"
  ON public.oculto_post_admin_comments
  FOR INSERT TO authenticated
  WITH CHECK (public._is_master_admin());

CREATE POLICY "Master can update admin comments"
  ON public.oculto_post_admin_comments
  FOR UPDATE TO authenticated
  USING (public._is_master_admin())
  WITH CHECK (public._is_master_admin());

CREATE POLICY "Master can delete admin comments"
  ON public.oculto_post_admin_comments
  FOR DELETE TO authenticated
  USING (public._is_master_admin());

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public._touch_oculto_post_admin_comments()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_touch_oculto_post_admin_comments
  ON public.oculto_post_admin_comments;
CREATE TRIGGER trg_touch_oculto_post_admin_comments
  BEFORE UPDATE ON public.oculto_post_admin_comments
  FOR EACH ROW EXECUTE FUNCTION public._touch_oculto_post_admin_comments();

-- 5) Realtime ---------------------------------------------------------
ALTER TABLE public.posts                        REPLICA IDENTITY FULL;
ALTER TABLE public.oculto_post_admin_comments   REPLICA IDENTITY FULL;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname='supabase_realtime' AND tablename='oculto_post_admin_comments'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.oculto_post_admin_comments';
  END IF;
END $$;

-- 6) Recarrega schema PostgREST --------------------------------------
NOTIFY pgrst, 'reload schema';

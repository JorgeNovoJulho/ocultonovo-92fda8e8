-- Adiciona coluna `bold` ao Comentário Master (oculto_post_admin_comments)
ALTER TABLE public.oculto_post_admin_comments
  ADD COLUMN IF NOT EXISTS bold boolean NOT NULL DEFAULT false;

NOTIFY pgrst, 'reload schema';

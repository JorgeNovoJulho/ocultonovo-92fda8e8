-- Adiciona flag de congelamento + descrição em posts (até 250 chars)
-- Idempotente. Rodar no SQL Editor do Supabase EXTERNO.

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS is_frozen boolean NOT NULL DEFAULT false;

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS description text;

CREATE INDEX IF NOT EXISTS posts_is_frozen_idx
  ON public.posts (author_id, is_frozen)
  WHERE is_frozen = true;

-- Trigger valida tamanho da descrição (mais flexível que CHECK constraint)
CREATE OR REPLACE FUNCTION public.posts_validate_description()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.description IS NOT NULL AND length(NEW.description) > 250 THEN
    NEW.description := substring(NEW.description, 1, 250);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_posts_validate_description ON public.posts;
CREATE TRIGGER tr_posts_validate_description
  BEFORE INSERT OR UPDATE ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.posts_validate_description();

NOTIFY pgrst, 'reload schema';

-- Adiciona coluna de intensidade de blur para conteúdo pago
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS preview_blur text DEFAULT 'medium';

-- Garante valores válidos via trigger (CHECK constraints podem complicar restore)
CREATE OR REPLACE FUNCTION public.posts_validate_preview_blur()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.preview_blur IS NOT NULL AND NEW.preview_blur NOT IN ('light','medium','strong','none') THEN
    NEW.preview_blur := 'medium';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_posts_validate_preview_blur ON public.posts;
CREATE TRIGGER tr_posts_validate_preview_blur
  BEFORE INSERT OR UPDATE ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.posts_validate_preview_blur();

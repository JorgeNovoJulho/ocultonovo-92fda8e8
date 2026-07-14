
-- 1. Adicionar colunas de contagem
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS saves_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shares_count integer NOT NULL DEFAULT 0;

-- 2. Criar tabela post_shares (cada share é uma linha)
CREATE TABLE IF NOT EXISTS public.post_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  channel text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_post_shares_post ON public.post_shares(post_id);

ALTER TABLE public.post_shares ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone authenticated can view share counts" ON public.post_shares;
CREATE POLICY "Anyone authenticated can view share counts"
  ON public.post_shares FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Users insert own shares" ON public.post_shares;
CREATE POLICY "Users insert own shares"
  ON public.post_shares FOR INSERT
  TO authenticated
  WITH CHECK (user_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

-- 3. Trigger para saves_count
CREATE OR REPLACE FUNCTION public.update_post_saves_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.posts SET saves_count = COALESCE(saves_count, 0) + 1 WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.posts SET saves_count = GREATEST(COALESCE(saves_count, 0) - 1, 0) WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_post_saves_count ON public.saved_posts;
CREATE TRIGGER trg_update_post_saves_count
AFTER INSERT OR DELETE ON public.saved_posts
FOR EACH ROW EXECUTE FUNCTION public.update_post_saves_count();

-- 4. Trigger para shares_count
CREATE OR REPLACE FUNCTION public.update_post_shares_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.posts SET shares_count = COALESCE(shares_count, 0) + 1 WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.posts SET shares_count = GREATEST(COALESCE(shares_count, 0) - 1, 0) WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_post_shares_count ON public.post_shares;
CREATE TRIGGER trg_update_post_shares_count
AFTER INSERT OR DELETE ON public.post_shares
FOR EACH ROW EXECUTE FUNCTION public.update_post_shares_count();

-- 5. Backfill dos contadores existentes
UPDATE public.posts p
SET saves_count = COALESCE((SELECT count(*) FROM public.saved_posts s WHERE s.post_id = p.id), 0);

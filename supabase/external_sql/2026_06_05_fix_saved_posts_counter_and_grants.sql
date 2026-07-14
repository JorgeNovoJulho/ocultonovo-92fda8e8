-- =====================================================================
-- FIX: contador de "Salvos" voltando a 0 e post não aparecendo em "Salvos"
-- Garante GRANTs em saved_posts e trigger de sincronia em posts.saves_count.
-- Idempotente — pode rodar quantas vezes precisar.
-- =====================================================================

-- 1) GRANTs explícitos (PostgREST exige) ------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.saved_posts TO authenticated;
GRANT ALL ON public.saved_posts TO service_role;

-- 2) Garantir coluna saves_count em posts -----------------------------
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS saves_count integer NOT NULL DEFAULT 0;

-- 3) Função de sincronia (incrementa/decrementa posts.saves_count) ----
CREATE OR REPLACE FUNCTION public.sync_post_saves_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.posts
       SET saves_count = COALESCE(saves_count, 0) + 1
     WHERE id = NEW.post_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.posts
       SET saves_count = GREATEST(0, COALESCE(saves_count, 1) - 1)
     WHERE id = OLD.post_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

-- 4) (Re)criar triggers ----------------------------------------------
DROP TRIGGER IF EXISTS trg_saved_posts_count_ins ON public.saved_posts;
DROP TRIGGER IF EXISTS trg_saved_posts_count_del ON public.saved_posts;

CREATE TRIGGER trg_saved_posts_count_ins
AFTER INSERT ON public.saved_posts
FOR EACH ROW EXECUTE FUNCTION public.sync_post_saves_count();

CREATE TRIGGER trg_saved_posts_count_del
AFTER DELETE ON public.saved_posts
FOR EACH ROW EXECUTE FUNCTION public.sync_post_saves_count();

-- 5) Reconciliar contadores existentes -------------------------------
WITH agg AS (
  SELECT post_id, COUNT(*)::int AS c
  FROM public.saved_posts
  GROUP BY post_id
)
UPDATE public.posts p
   SET saves_count = COALESCE(agg.c, 0)
  FROM agg
 WHERE p.id = agg.post_id
   AND p.saves_count IS DISTINCT FROM agg.c;

-- Posts sem nenhum save voltam a 0
UPDATE public.posts
   SET saves_count = 0
 WHERE saves_count > 0
   AND id NOT IN (SELECT post_id FROM public.saved_posts);


-- Recria triggers ausentes em post_likes (funções já existem no banco)
DROP TRIGGER IF EXISTS trg_update_post_likes_count ON public.post_likes;
DROP TRIGGER IF EXISTS trg_notify_on_post_like ON public.post_likes;

CREATE TRIGGER trg_update_post_likes_count
AFTER INSERT OR DELETE ON public.post_likes
FOR EACH ROW
EXECUTE FUNCTION public.update_post_likes_count();

CREATE TRIGGER trg_notify_on_post_like
AFTER INSERT ON public.post_likes
FOR EACH ROW
EXECUTE FUNCTION public.notify_on_post_like();

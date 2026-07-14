-- Remove triggers duplicados que estão inflando os contadores de interações.
-- Cada INSERT/DELETE em post_likes/dislikes/comments dispara 3 triggers idênticos,
-- somando 2 ou 3 ao contador em vez de 1. Mantemos apenas trg_post_*_count.

-- LIKES: remover duplicatas, manter trg_post_likes_count
DROP TRIGGER IF EXISTS trg_update_post_likes_count ON public.post_likes;
DROP TRIGGER IF EXISTS trigger_update_likes_count ON public.post_likes;

-- DISLIKES: remover duplicatas, manter trg_post_dislikes_count
DROP TRIGGER IF EXISTS trg_update_post_dislikes_count ON public.post_dislikes;
DROP TRIGGER IF EXISTS trigger_update_dislikes_count ON public.post_dislikes;

-- COMMENTS: remover duplicatas, manter trg_post_comments_count
DROP TRIGGER IF EXISTS trg_update_post_comments_count ON public.post_comments;
DROP TRIGGER IF EXISTS trigger_update_comments_count ON public.post_comments;

-- SHARES: remover duplicata, manter trg_post_shares_count
DROP TRIGGER IF EXISTS trg_update_post_shares_count ON public.post_shares;

-- SAVES: remover duplicata, manter trg_saved_posts_count
DROP TRIGGER IF EXISTS trg_update_post_saves_count ON public.saved_posts;

-- COMMENTS: remover triggers de notificação duplicados, manter trg_notify_on_post_comment
DROP TRIGGER IF EXISTS on_post_comment_notify ON public.post_comments;
DROP TRIGGER IF EXISTS trg_post_comments_notify ON public.post_comments;

-- LIKES/DISLIKES/SAVES/SHARES: remover triggers de notificação duplicados (mantém trg_notify_*)
DROP TRIGGER IF EXISTS trg_post_likes_notify ON public.post_likes;
DROP TRIGGER IF EXISTS trg_post_dislikes_notify ON public.post_dislikes;
DROP TRIGGER IF EXISTS trg_post_shares_notify ON public.post_shares;
DROP TRIGGER IF EXISTS trg_saved_posts_notify ON public.saved_posts;

-- Reconciliar contadores existentes que possam estar inflados ou defasados
UPDATE public.posts p SET
  likes_count = COALESCE((SELECT COUNT(*) FROM public.post_likes WHERE post_id = p.id), 0),
  dislikes_count = COALESCE((SELECT COUNT(*) FROM public.post_dislikes WHERE post_id = p.id), 0),
  comments_count = COALESCE((SELECT COUNT(*) FROM public.post_comments WHERE post_id = p.id), 0),
  saves_count = COALESCE((SELECT COUNT(*) FROM public.saved_posts WHERE post_id = p.id), 0),
  shares_count = COALESCE((SELECT COUNT(*) FROM public.post_shares WHERE post_id = p.id), 0);

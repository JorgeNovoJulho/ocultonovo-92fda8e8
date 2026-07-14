-- 1. Remover view antiga para trocar a estrutura de colunas com segurança
DROP VIEW IF EXISTS public.v_feed_posts;

-- 2. Recriar a VIEW com todas as colunas necessárias para os hooks do frontend
CREATE VIEW public.v_feed_posts AS
SELECT 
    p.id, 
    p.user_id as creator_id,
    p.user_id as author_id,
    p.user_id,
    p.content_text, 
    p.media_url, 
    p.media_urls,
    p.media_type, 
    p.thumbnail_url, 
    COALESCE(p.video_preview_url, p.media_url) as preview_url,
    p.video_duration_seconds,
    p.privacy_level, 
    p.is_locked, 
    p.is_paid, 
    p.paid_price, 
    COALESCE(p.is_hidden, false) as is_hidden,
    COALESCE(p.likes_count, 0) as likes_count, 
    COALESCE(p.dislikes_count, 0) as dislikes_count, 
    COALESCE(p.comments_count, 0) as comments_count,
    COALESCE(p.saves_count, 0) as saves_count,
    COALESCE(p.shares_count, 0) as shares_count,
    COALESCE(p.is_flash, false) as is_flash, 
    p.post_type,
    p.created_at, 
    p.updated_at
FROM public.posts p;

-- 3. Conceder permissões
GRANT SELECT ON public.v_feed_posts TO authenticated;
GRANT SELECT ON public.v_feed_posts TO anon;

-- 4. Índices de suporte para paginação e busca
CREATE INDEX IF NOT EXISTS idx_posts_feed_perf_v1 ON public.posts (created_at DESC) 
WHERE (is_hidden IS NOT TRUE AND (is_flash IS NOT TRUE OR is_flash IS NULL));

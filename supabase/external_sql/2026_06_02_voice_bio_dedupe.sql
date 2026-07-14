-- ============================================================
-- Deduplicação de posts do tipo 'voice_bio' no feed.
-- Mantém apenas o registro MAIS RECENTE por autor e cria
-- índice único parcial para impedir novas duplicatas.
-- Idempotente — pode rodar quantas vezes precisar.
-- ============================================================

BEGIN;

-- 1) Remove todas as duplicatas mantendo só a mais recente por author_id
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY COALESCE(author_id, creator_id)
      ORDER BY created_at DESC, id DESC
    ) AS rn
  FROM public.posts
  WHERE post_type = 'voice_bio'
)
DELETE FROM public.posts p
USING ranked r
WHERE p.id = r.id
  AND r.rn > 1;

-- 2) Índice único parcial: 1 voice_bio por author_id
DROP INDEX IF EXISTS public.posts_voice_bio_unique_author_idx;
CREATE UNIQUE INDEX posts_voice_bio_unique_author_idx
  ON public.posts (author_id)
  WHERE post_type = 'voice_bio';

COMMIT;

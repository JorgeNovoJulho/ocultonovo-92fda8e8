-- =====================================================================
-- 2026_05_17_posts_media_duration_seconds_compat.sql (idempotente)
-- Compatibilidade para publicação de posts públicos e conteúdos pagos.
-- Garante a coluna legada media_duration_seconds e faz backfill cruzado
-- com video_duration_seconds para evitar falhas em clientes antigos.
-- =====================================================================

ALTER TABLE public.posts
ADD COLUMN IF NOT EXISTS media_duration_seconds integer;

ALTER TABLE public.posts
ADD COLUMN IF NOT EXISTS video_duration_seconds integer;

UPDATE public.posts
   SET media_duration_seconds = video_duration_seconds
 WHERE media_duration_seconds IS NULL
   AND video_duration_seconds IS NOT NULL
   AND video_duration_seconds > 0;

UPDATE public.posts
   SET video_duration_seconds = media_duration_seconds
 WHERE video_duration_seconds IS NULL
   AND media_duration_seconds IS NOT NULL
   AND media_duration_seconds > 0;

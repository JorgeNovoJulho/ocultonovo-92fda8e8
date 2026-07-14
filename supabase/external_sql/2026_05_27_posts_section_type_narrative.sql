-- ============================================================
-- 2026-05-27 — Amplia posts_section_type_check para tipos narrativos
-- Idempotente. Rodar no SQL Editor do Supabase EXTERNO.
-- ============================================================
-- Erro corrigido:
--   new row for relation "posts" violates check constraint
--   "posts_section_type_check"
-- Motivo: o CHECK antigo só aceitava 5 tipos de mídia. As seções
-- narrativas (Diário VIP, Histórias, Capítulos, Séries, Textos,
-- Bastidores) precisam dos novos valores.
-- ============================================================

ALTER TABLE public.posts
  DROP CONSTRAINT IF EXISTS posts_section_type_check;

ALTER TABLE public.posts
  ADD CONSTRAINT posts_section_type_check
  CHECK (
    section_type IS NULL OR section_type IN (
      -- mídia
      'short_video','long_video','photo','photo_pack','video_pack',
      'events','promo',
      -- narrativas (Canal VIP)
      'story','chapter','series','diary','article','text_post'
    )
  );

NOTIFY pgrst, 'reload schema';

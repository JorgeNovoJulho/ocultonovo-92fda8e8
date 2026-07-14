-- ============================================================
-- Backfill: posts narrativos que o autor publicou como PÚBLICO
-- mas ficaram marcados como privacy_level='vip' por bug antigo.
--
-- Critério seguro:
--   • section_type narrativo (diary/chapter/story/article/series/text_post/backstage/narrative)
--     OU content_format='narrative'
--   • is_paid = false  (não é PPV — então não era pra ter virado VIP)
--   • is_locked = false (idem)
--   • privacy_level = 'vip'
--
-- Resultado: vira 'public' → passa a aparecer no feed e em /leitura/:id.
-- Idempotente: rodar múltiplas vezes não afeta posts já corretos.
-- ============================================================

UPDATE public.posts
SET privacy_level = 'public'
WHERE privacy_level = 'vip'
  AND COALESCE(is_paid, false)   = false
  AND COALESCE(is_locked, false) = false
  AND (
    content_format = 'narrative'
    OR section_type IN (
      'diary','chapter','story','article','series','text_post','backstage','narrative'
    )
  );

-- Diagnóstico opcional (somente leitura):
-- SELECT id, title, section_type, content_format, privacy_level, is_paid, is_locked, created_at
-- FROM public.posts
-- WHERE content_format = 'narrative' OR section_type IN
--   ('diary','chapter','story','article','series','text_post','backstage','narrative')
-- ORDER BY created_at DESC
-- LIMIT 50;

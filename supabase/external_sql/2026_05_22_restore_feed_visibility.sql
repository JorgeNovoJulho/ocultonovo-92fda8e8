-- ============================================================================
-- 2026_05_22 — Restaurar visibilidade dos posts do feed principal
-- Causa: posts foram criados/marcados com privacy_level='hidden' ("Invisível a
-- Todos") via MediaUploadModal e o filtro do feed (usePosts.tsx) descarta
-- corretamente esses registros. Esta migração reabre todos.
--
-- Idempotente: rodar quantas vezes precisar.
-- Rodar manualmente no SQL Editor do Supabase EXTERNO.
-- ============================================================================

-- 1) Restaura privacidade para 'public' em todos os posts que estavam 'hidden'.
UPDATE public.posts
   SET privacy_level = 'public',
       is_locked     = COALESCE(is_paid, false) OR privacy_level = 'vip',
       updated_at    = now()
 WHERE privacy_level = 'hidden';

-- 2) Garante que a flag complementar is_hidden também esteja limpa,
--    para não ser filtrada por `post?.is_hidden === true` no frontend.
UPDATE public.posts
   SET is_hidden     = false,
       hidden_reason = NULL,
       updated_at    = now()
 WHERE is_hidden = true;

-- 3) Diagnóstico final (opcional — útil para conferir no SQL Editor).
-- SELECT privacy_level, COUNT(*) FROM public.posts GROUP BY 1 ORDER BY 1;

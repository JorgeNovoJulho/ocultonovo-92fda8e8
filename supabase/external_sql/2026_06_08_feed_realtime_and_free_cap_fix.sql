-- ============================================================================
-- FEED — Garantir Realtime + REPLICA IDENTITY + cap de plano FREE razoável
--
-- Diagnóstico (Lorena Villar / lorena_villar):
--   • Posts existem em `posts` e em `v_feed_posts` (não is_hidden, não is_seed).
--   • Slot 2–4 do feed após o pinned. Backend OK.
--   • Causa do "não aparece pra todos":
--       (a) `posts` provavelmente NÃO está na publication `supabase_realtime`
--           → outros usuários só veem após F5 manual.
--       (b) `feed_settings` para plano FREE estava com max_posts=15
--           → qualquer post novo derruba os anteriores do feed FREE em minutos.
--
-- Correções (idempotentes — pode rodar várias vezes):
--   1) Garantir REPLICA IDENTITY FULL em posts/post_likes/post_comments/saved_posts
--      (payload completo em UPDATE/DELETE — necessário pro patchDelete do client).
--   2) Adicionar essas tabelas à publication `supabase_realtime`.
--   3) Subir o teto do feed FREE de 15 → 100 (mantém leve em mobile).
-- ============================================================================

-- 1) REPLICA IDENTITY FULL (sem erro se já estiver assim)
ALTER TABLE public.posts          REPLICA IDENTITY FULL;
ALTER TABLE public.post_likes     REPLICA IDENTITY FULL;
ALTER TABLE public.post_comments  REPLICA IDENTITY FULL;
ALTER TABLE public.saved_posts    REPLICA IDENTITY FULL;

-- 2) Adicionar à publication supabase_realtime (silencia "already member")
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'public.posts',
    'public.post_likes',
    'public.post_comments',
    'public.saved_posts'
  ]
  LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %s', t);
    EXCEPTION
      WHEN duplicate_object THEN
        -- tabela já está na publication, segue
        NULL;
      WHEN undefined_object THEN
        -- publication ainda não existe; cria e re-adiciona
        EXECUTE 'CREATE PUBLICATION supabase_realtime';
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %s', t);
    END;
  END LOOP;
END$$;

-- 3) Cap do feed FREE: 15 → 100 (assina max_posts; show_all/is_enabled inalterados)
UPDATE public.feed_settings
   SET max_posts = 100,
       updated_at = now()
 WHERE plan_type = 'free'
   AND COALESCE(max_posts, 0) < 100;

NOTIFY pgrst, 'reload schema';

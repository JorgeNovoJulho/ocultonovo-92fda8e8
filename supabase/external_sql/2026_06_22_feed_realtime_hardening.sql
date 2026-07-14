-- =====================================================================
-- 2026-06-22 — Hardening do Realtime do Feed Principal
-- =====================================================================
-- Sintoma: posts novos só apareciam para outros usuários após recarregar
-- a página 2/3 vezes. Causa: a publication `supabase_realtime` do banco
-- externo perdeu (de novo) as tabelas-chave do feed em alguma rotina de
-- manutenção, então o websocket parou de entregar INSERTs.
--
-- Este script:
--   1) Garante a publication.
--   2) Adiciona posts/post_likes/post_comments/post_shares/saved_posts.
--   3) Garante REPLICA IDENTITY FULL para payload completo em UPDATE/DELETE.
--   4) Recarrega o schema cache do PostgREST.
--
-- Idempotente — pode rodar quantas vezes precisar.
-- =====================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END$$;

DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'posts','post_likes','post_dislikes','post_comments','post_shares','saved_posts','profiles'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema='public' AND table_name=t
    ) THEN
      BEGIN
        EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', t);
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
      IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename=t
      ) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
      END IF;
    END IF;
  END LOOP;
END$$;

NOTIFY pgrst, 'reload schema';

-- Verificação (deve listar pelo menos: posts, post_likes, post_comments,
-- post_shares, saved_posts, profiles)
SELECT tablename
FROM pg_publication_tables
WHERE pubname='supabase_realtime' AND schemaname='public'
ORDER BY tablename;

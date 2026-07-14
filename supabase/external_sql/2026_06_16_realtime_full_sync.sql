-- ============================================================================
-- 2026-06-16 — Realtime FULL SYNC para Mobile + Desktop
-- Garante que TODAS as tabelas críticas (feed, perfis, oculto play, comunidades,
-- notificações, mensagens, stories, subscriptions etc.) entreguem eventos em
-- tempo real via websocket, refletindo novas atualizações instantaneamente
-- tanto no mobile quanto no desktop, sem necessidade de F5.
--
-- Idempotente — rode quantas vezes quiser no SQL Editor do Supabase EXTERNO
-- (rvybbrkzmboqbhcemqar).
-- ============================================================================

-- 1) Garante a publication supabase_realtime
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END $$;

-- 2) Tabelas que precisam de realtime
DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    -- Feed principal
    'posts','post_likes','post_dislikes','post_comments','post_shares','saved_posts',
    -- Perfis / social
    'profiles','follows','profile_likes','profile_visits',
    -- Notificações & mensagens
    'notifications','admin_notifications','messages','conversations','conversation_participants','typing_indicators',
    -- Stories
    'story_likes','story_dislikes','story_views',
    -- Oculto Play
    'oculto_play_items','oculto_play_reports','oculto_play_config',
    -- Comunidades
    'oculto_community_topics','oculto_community_replies','oculto_community_members',
    -- Subscriptions / monetização
    'subscriptions','subscription_plans','transactions','pix_payments',
    -- Retenção / aura
    'oculto_retention_progress','xp_transactions',
    -- Eventos / experiências
    'events','event_rsvps','event_messages','event_ratings',
    -- Sistema
    'system_settings','landing_settings'
  ];
  already_member BOOLEAN;
BEGIN
  FOREACH t IN ARRAY tables LOOP
    -- só age se a tabela existe
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema='public' AND table_name=t
    ) THEN
      -- REPLICA IDENTITY FULL (payload completo em UPDATE/DELETE)
      BEGIN
        EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', t);
      EXCEPTION WHEN OTHERS THEN NULL;
      END;

      SELECT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname='supabase_realtime'
          AND schemaname='public'
          AND tablename=t
      ) INTO already_member;

      IF NOT already_member THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
      END IF;
    END IF;
  END LOOP;
END $$;

-- 3) Índices úteis (idempotentes) p/ paginação rápida do feed
CREATE INDEX IF NOT EXISTS idx_posts_created_at_desc      ON public.posts (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_post_comments_post_created ON public.post_comments (post_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_post_likes_post            ON public.post_likes (post_id);

-- 4) Recarrega cache de schema do PostgREST
NOTIFY pgrst, 'reload schema';

-- 5) Verificação (opcional)
SELECT schemaname, tablename
FROM pg_publication_tables
WHERE pubname='supabase_realtime' AND schemaname='public'
ORDER BY tablename;

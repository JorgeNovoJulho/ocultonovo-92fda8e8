-- =====================================================================
-- 2026-06-18 — RESTAURAÇÃO COMPLETA da publication supabase_realtime
-- =====================================================================
-- Diagnóstico: a publication `supabase_realtime` no banco EXTERNO estava
-- VAZIA (0 tabelas). Por isso o feed só atualizava ao recarregar a página
-- — nenhum INSERT/UPDATE/DELETE chegava ao websocket.
--
-- Este script é IDEMPOTENTE: pode ser executado várias vezes sem erro.
-- =====================================================================

-- 1) Garante existência da publication
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END$$;

-- 2) Adiciona todas as tabelas críticas + REPLICA IDENTITY FULL
DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    -- Feed principal
    'posts','post_likes','post_dislikes','post_comments','post_shares','saved_posts','comment_likes',
    -- Perfis/social
    'profiles','follows','profile_likes','profile_visits',
    -- Notificações/mensagens
    'notifications','admin_notifications','messages','conversations','conversation_participants','typing_indicators',
    -- Stories
    'story_likes','story_dislikes','story_views',
    -- Subscriptions/monetização
    'subscriptions','subscription_plans','transactions','pix_payments',
    -- Eventos
    'events','event_rsvps','event_messages','event_ratings',
    -- Sistema
    'system_settings','landing_settings'
  ];
  already_member BOOLEAN;
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
END$$;

NOTIFY pgrst, 'reload schema';

-- Verificação
SELECT tablename FROM pg_publication_tables
WHERE pubname='supabase_realtime' AND schemaname='public'
ORDER BY tablename;

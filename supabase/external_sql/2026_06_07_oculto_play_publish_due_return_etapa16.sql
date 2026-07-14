-- ============================================================================
-- OCULTO PLAY — Etapa 16: RPC que publica agendados e RETORNA os itens
-- publicados (com user_id do autor) para a edge function disparar Web Push.
--
-- Cole no SQL Editor do Supabase EXTERNO. 100% idempotente.
-- Depende das Etapas 13 e 15.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.oculto_play_publish_due_return()
RETURNS TABLE (
  item_id     uuid,
  author_id   uuid,
  author_user uuid,
  title       text,
  kind        text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row record;
  v_user uuid;
BEGIN
  FOR v_row IN
    UPDATE public.oculto_play_items
       SET is_published   = true,
           is_draft       = false,
           scheduled_for  = NULL,
           schedule_error = NULL,
           published_at   = COALESCE(published_at, now())
     WHERE is_published = false
       AND is_draft     = false
       AND scheduled_for IS NOT NULL
       AND scheduled_for <= now()
    RETURNING id, author_id, title, kind
  LOOP
    SELECT p.user_id INTO v_user
      FROM public.profiles p
     WHERE p.id = v_row.author_id
     LIMIT 1;

    -- best-effort in-app notification (mantém comportamento da Etapa 15)
    IF v_user IS NOT NULL THEN
      BEGIN
        INSERT INTO public.notifications (user_id, type, title, body, data, is_read)
        VALUES (
          v_user,
          'oculto_play_scheduled_published',
          'Sua publicação no PLAY foi ao ar',
          COALESCE(NULLIF(v_row.title, ''), 'Item agendado publicado com sucesso.'),
          jsonb_build_object('item_id', v_row.id, 'kind', v_row.kind, 'source', 'scheduled'),
          false
        );
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
    END IF;

    item_id     := v_row.id;
    author_id   := v_row.author_id;
    author_user := v_user;
    title       := v_row.title;
    kind        := v_row.kind::text;
    RETURN NEXT;
  END LOOP;
END $$;

GRANT EXECUTE ON FUNCTION public.oculto_play_publish_due_return() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

-- ----------------------------------------------------------------------------
-- Cron: substituir o job da Etapa 13 para chamar a EDGE FUNCTION
-- (que publica + dispara Web Push). Idempotente.
-- Requer pg_cron + pg_net habilitados.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  PERFORM cron.unschedule('oculto-play-publish-due');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('oculto-play-scheduled-push');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'oculto-play-scheduled-push',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://rvybbrkzmboqbhcemqar.supabase.co/functions/v1/oculto-play-scheduled-push',
    headers := '{"Content-Type":"application/json","apikey":"sb_publishable_N7z0XdqdGGm5VwHeWZDoVQ_a3b_WzL3"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

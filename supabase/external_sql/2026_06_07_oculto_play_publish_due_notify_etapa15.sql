-- ============================================================================
-- OCULTO PLAY — Etapa 15: Notificação ao autor quando agendado é publicado
-- Cole no SQL Editor do Supabase EXTERNO. 100% idempotente.
-- Depende de 2026_06_07_oculto_play_drafts_schedule_etapa13.sql.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.oculto_play_publish_due()
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count int := 0;
  v_row   record;
  v_user  uuid;
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
    v_count := v_count + 1;

    -- Resolve auth user do autor (profiles.id -> profiles.user_id)
    SELECT p.user_id INTO v_user
      FROM public.profiles p
     WHERE p.id = v_row.author_id
     LIMIT 1;

    IF v_user IS NOT NULL THEN
      BEGIN
        INSERT INTO public.notifications (user_id, type, title, body, data, is_read)
        VALUES (
          v_user,
          'oculto_play_scheduled_published',
          'Sua publicação no PLAY foi ao ar',
          COALESCE(NULLIF(v_row.title, ''), 'Item agendado publicado com sucesso.'),
          jsonb_build_object(
            'item_id', v_row.id,
            'kind', v_row.kind,
            'source', 'scheduled'
          ),
          false
        );
      EXCEPTION WHEN OTHERS THEN
        -- Notificação é best-effort; nunca bloqueia a publicação
        NULL;
      END;
    END IF;
  END LOOP;

  RETURN v_count;
END $$;

GRANT EXECUTE ON FUNCTION public.oculto_play_publish_due() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

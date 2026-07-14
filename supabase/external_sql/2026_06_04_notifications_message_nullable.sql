-- ============================================================
-- 2026_06_04: Relaxa notifications.message (coluna legada NOT NULL)
-- O trigger novo grava em `body`; `message` deixa de bloquear inserts.
-- Idempotente · Supabase Externo.
-- ============================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='notifications' AND column_name='message'
  ) THEN
    -- 1) Default vazio (para inserts antigos que não passam message)
    EXECUTE 'ALTER TABLE public.notifications ALTER COLUMN message SET DEFAULT '''' ';
    -- 2) Permitir NULL
    EXECUTE 'ALTER TABLE public.notifications ALTER COLUMN message DROP NOT NULL';
    -- 3) Backfill: nunca NULL em linhas existentes
    EXECUTE 'UPDATE public.notifications SET message = COALESCE(message, body, title, '''') WHERE message IS NULL';
  END IF;
END $$;

-- Mantém o trigger de comment_reactions populando `message` também (defensivo),
-- caso outra instalação ainda tenha o NOT NULL ativo.
CREATE OR REPLACE FUNCTION public.oculto_post_comment_reactions_after_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_comment record;
  v_recipient_auth uuid;
  v_actor_username text;
  v_actor_name text;
  v_title text;
  v_body text;
  v_type text;
  v_has_message boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='notifications' AND column_name='message'
  ) INTO v_has_message;

  IF (TG_OP = 'INSERT') THEN
    PERFORM public.oculto_recalc_comment_reaction_counts(NEW.comment_id);

    SELECT pc.id, pc.user_id, pc.post_id, pc.content
      INTO v_comment
      FROM public.post_comments pc
      WHERE pc.id = NEW.comment_id;

    IF v_comment.user_id IS NOT NULL AND v_comment.user_id <> NEW.user_id THEN
      SELECT p.user_id, p.username, COALESCE(p.display_name, p.name, p.username, 'Alguém')
        INTO v_recipient_auth, v_actor_username, v_actor_name
      FROM public.profiles p
      WHERE p.id = v_comment.user_id;

      SELECT pa.username, COALESCE(pa.display_name, pa.name, pa.username, 'Alguém')
        INTO v_actor_username, v_actor_name
      FROM public.profiles pa
      WHERE pa.user_id = NEW.user_id
      LIMIT 1;

      IF v_recipient_auth IS NOT NULL THEN
        IF NEW.reaction = 'like' THEN
          v_type  := 'comment_like';
          v_title := COALESCE('@' || v_actor_username, v_actor_name) || ' curtiu seu comentário';
        ELSE
          v_type  := 'comment_dislike';
          v_title := COALESCE('@' || v_actor_username, v_actor_name) || ' não curtiu seu comentário';
        END IF;
        v_body := LEFT(COALESCE(v_comment.content, ''), 140);

        IF v_has_message THEN
          EXECUTE 'INSERT INTO public.notifications (user_id, type, title, body, message, data) VALUES ($1,$2,$3,$4,$4,$5)'
            USING v_recipient_auth, v_type, v_title, v_body,
                  jsonb_build_object(
                    'actor_user_id', NEW.user_id,
                    'comment_id',    NEW.comment_id,
                    'post_id',       v_comment.post_id,
                    'reaction',      NEW.reaction
                  );
        ELSE
          INSERT INTO public.notifications (user_id, type, title, body, data)
          VALUES (
            v_recipient_auth, v_type, v_title, v_body,
            jsonb_build_object(
              'actor_user_id', NEW.user_id,
              'comment_id',    NEW.comment_id,
              'post_id',       v_comment.post_id,
              'reaction',      NEW.reaction
            )
          );
        END IF;
      END IF;
    END IF;
    RETURN NEW;
  ELSIF (TG_OP = 'UPDATE') THEN
    PERFORM public.oculto_recalc_comment_reaction_counts(NEW.comment_id);
    RETURN NEW;
  ELSIF (TG_OP = 'DELETE') THEN
    PERFORM public.oculto_recalc_comment_reaction_counts(OLD.comment_id);
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

NOTIFY pgrst, 'reload schema';

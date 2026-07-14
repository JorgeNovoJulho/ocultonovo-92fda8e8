-- ============================================================================
-- COMMENT REACTIONS (like / dislike) + counters + notifications
-- Idempotent. Run no SQL Editor do Supabase EXTERNO.
-- ============================================================================

-- 1) Coluna dislikes_count em post_comments (likes_count já existe)
ALTER TABLE public.post_comments
  ADD COLUMN IF NOT EXISTS dislikes_count integer NOT NULL DEFAULT 0;

-- 2) Tabela de reações (isolada com prefixo oculto_)
CREATE TABLE IF NOT EXISTS public.oculto_post_comment_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id uuid NOT NULL REFERENCES public.post_comments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  reaction text NOT NULL CHECK (reaction IN ('like','dislike')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (comment_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_ocpc_reactions_comment
  ON public.oculto_post_comment_reactions(comment_id);
CREATE INDEX IF NOT EXISTS idx_ocpc_reactions_user
  ON public.oculto_post_comment_reactions(user_id);

GRANT SELECT ON public.oculto_post_comment_reactions TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.oculto_post_comment_reactions TO authenticated;
GRANT ALL ON public.oculto_post_comment_reactions TO service_role;

ALTER TABLE public.oculto_post_comment_reactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ocpc_reactions_select_all"   ON public.oculto_post_comment_reactions;
DROP POLICY IF EXISTS "ocpc_reactions_insert_own"   ON public.oculto_post_comment_reactions;
DROP POLICY IF EXISTS "ocpc_reactions_update_own"   ON public.oculto_post_comment_reactions;
DROP POLICY IF EXISTS "ocpc_reactions_delete_own"   ON public.oculto_post_comment_reactions;

CREATE POLICY "ocpc_reactions_select_all"
  ON public.oculto_post_comment_reactions
  FOR SELECT
  USING (true);

CREATE POLICY "ocpc_reactions_insert_own"
  ON public.oculto_post_comment_reactions
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "ocpc_reactions_update_own"
  ON public.oculto_post_comment_reactions
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "ocpc_reactions_delete_own"
  ON public.oculto_post_comment_reactions
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- 3) Recalcula counters de um comentário (defensivo)
CREATE OR REPLACE FUNCTION public.oculto_recalc_comment_reaction_counts(p_comment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.post_comments pc
  SET
    likes_count    = COALESCE((SELECT count(*) FROM public.oculto_post_comment_reactions r WHERE r.comment_id = p_comment_id AND r.reaction = 'like'), 0),
    dislikes_count = COALESCE((SELECT count(*) FROM public.oculto_post_comment_reactions r WHERE r.comment_id = p_comment_id AND r.reaction = 'dislike'), 0)
  WHERE pc.id = p_comment_id;
END;
$$;

-- 4) Trigger: mantém counters + cria notificação para o autor do comentário
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
BEGIN
  IF (TG_OP = 'INSERT') THEN
    PERFORM public.oculto_recalc_comment_reaction_counts(NEW.comment_id);

    -- Notifica autor do comentário (se não for o próprio ator)
    SELECT pc.id, pc.user_id, pc.post_id, pc.content
      INTO v_comment
      FROM public.post_comments pc
      WHERE pc.id = NEW.comment_id;

    IF v_comment.user_id IS NOT NULL AND v_comment.user_id <> NEW.user_id THEN
      -- profiles.id -> auth.user_id
      SELECT p.user_id, p.username, COALESCE(p.display_name, p.name, p.username, 'Alguém')
        INTO v_recipient_auth, v_actor_username, v_actor_name
      FROM public.profiles p
      WHERE p.id = v_comment.user_id;

      -- Dados do ATOR (quem reagiu) — sobrescreve os campos com info correta
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

        INSERT INTO public.notifications (user_id, type, title, body, data)
        VALUES (
          v_recipient_auth,
          v_type,
          v_title,
          v_body,
          jsonb_build_object(
            'actor_user_id', NEW.user_id,
            'comment_id',    NEW.comment_id,
            'post_id',       v_comment.post_id,
            'reaction',      NEW.reaction
          )
        );
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

DROP TRIGGER IF EXISTS trg_ocpc_reactions_aiud ON public.oculto_post_comment_reactions;
CREATE TRIGGER trg_ocpc_reactions_aiud
AFTER INSERT OR UPDATE OR DELETE
ON public.oculto_post_comment_reactions
FOR EACH ROW
EXECUTE FUNCTION public.oculto_post_comment_reactions_after_change();

-- 5) Backfill: zera dislikes_count para comentários antigos
UPDATE public.post_comments SET dislikes_count = COALESCE(dislikes_count, 0);

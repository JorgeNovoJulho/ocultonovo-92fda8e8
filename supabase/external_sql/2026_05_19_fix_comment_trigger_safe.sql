-- ============================================================================
-- FIX: INSERT em post_comments falhava com 42703 por trigger legado
-- quando o trigger AFTER INSERT (_trg_social_comment_award) chamava
-- public.social_score_award() e algo dentro estourava (ex.: regra ausente,
-- coluna divergente em tabela auxiliar, RLS interna). O erro do trigger
-- abortava o INSERT principal.
--
-- Causa real encontrada:
--   o trigger consultava `posts.author_id`, mas no schema externo atual
--   a tabela `public.posts` expõe `user_id`.
--
-- Solução:
--   1) Reescrever a função do trigger com EXCEPTION WHEN OTHERS NULL,
--      garantindo que o comentário nunca falhe por causa de scoring.
--   2) Acesso dinâmico aos campos via to_jsonb(NEW) — evita erro de parse
--      caso a tabela mude no futuro.
--   3) NOTIFY pgrst para invalidar o cache do PostgREST.
--
-- 100% idempotente — cole no SQL Editor do Supabase EXTERNO.
-- ============================================================================

CREATE OR REPLACE FUNCTION public._trg_social_comment_award()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  j         jsonb := to_jsonb(NEW);
  v_post_id uuid;
  v_post    jsonb;
  v_owner   uuid;
  v_ref     text;
BEGIN
  v_post_id := NULLIF(j->>'post_id','')::uuid;
  v_ref     := j->>'id';

  IF v_post_id IS NULL THEN
    RETURN NEW;
  END IF;

  BEGIN
    SELECT to_jsonb(p) INTO v_post
      FROM public.posts p
     WHERE p.id = v_post_id;

    v_owner := COALESCE(
      NULLIF(v_post->>'user_id', '')::uuid,
      NULLIF(v_post->>'author_id', '')::uuid
    );

    IF v_owner IS NOT NULL THEN
      PERFORM public.social_score_award(
        public._social_resolve_uid(v_owner),
        'comment_received',
        v_ref
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- nunca quebrar o INSERT do comentário por causa de scoring
    NULL;
  END;

  RETURN NEW;
END;
$$;

-- Garante que o trigger continua apontando para a função reescrita
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='post_comments'
  ) THEN
    DROP TRIGGER IF EXISTS trg_social_comment_award ON public.post_comments;
    CREATE TRIGGER trg_social_comment_award
      AFTER INSERT ON public.post_comments
      FOR EACH ROW EXECUTE FUNCTION public._trg_social_comment_award();
  END IF;
END $$;

-- Reload do cache do PostgREST
NOTIFY pgrst, 'reload schema';

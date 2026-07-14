-- ============================================================================
-- FIX FINAL: drift de schema/policies/triggers em public.post_comments
-- Sintoma no app: INSERT falha com 42703 "column \"user_id\" does not exist"
-- mesmo com SELECT expondo post_comments.user_id na API REST.
--
-- Este script:
-- 1) garante a coluna public.post_comments.user_id
-- 2) migra dados legados de profile_id/author_id -> user_id, se existirem
-- 3) recria políticas RLS usando profiles.id
-- 4) recria trigger de score de comentário de forma resiliente
-- 5) recria trigger de contador de comentários
-- 6) força reload do schema cache do PostgREST
--
-- Idempotente — cole inteiro no SQL Editor do banco EXTERNO.
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'post_comments'
       AND column_name = 'user_id'
  ) THEN
    ALTER TABLE public.post_comments ADD COLUMN user_id uuid;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'post_comments'
       AND column_name = 'profile_id'
  ) THEN
    EXECUTE 'UPDATE public.post_comments SET user_id = COALESCE(user_id, profile_id) WHERE user_id IS NULL';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'post_comments'
       AND column_name = 'author_id'
  ) THEN
    EXECUTE 'UPDATE public.post_comments SET user_id = COALESCE(user_id, author_id) WHERE user_id IS NULL';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'post_comments'
       AND column_name = 'user_id'
  ) THEN
    ALTER TABLE public.post_comments ALTER COLUMN user_id SET NOT NULL;
  END IF;
EXCEPTION WHEN others THEN
  NULL;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'post_comments_user_id_fkey'
  ) THEN
    ALTER TABLE public.post_comments
      ADD CONSTRAINT post_comments_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN duplicate_object THEN
  NULL;
WHEN others THEN
  NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_post_comments_user ON public.post_comments (user_id);
CREATE INDEX IF NOT EXISTS idx_post_comments_post_created ON public.post_comments (post_id, created_at DESC);

ALTER TABLE public.post_comments ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname
      FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename = 'post_comments'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.post_comments', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY "Anyone can read comments"
  ON public.post_comments FOR SELECT
  TO authenticated, anon
  USING (true);

DROP POLICY IF EXISTS "Users can insert own comments" ON public.post_comments;
CREATE POLICY "Users can insert own comments"
  ON public.post_comments FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id IN (
      SELECT p.id
        FROM public.profiles p
       WHERE p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can update own comments" ON public.post_comments;
CREATE POLICY "Users can update own comments"
  ON public.post_comments FOR UPDATE
  TO authenticated
  USING (
    user_id IN (
      SELECT p.id
        FROM public.profiles p
       WHERE p.user_id = auth.uid()
    )
  )
  WITH CHECK (
    user_id IN (
      SELECT p.id
        FROM public.profiles p
       WHERE p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can delete own comments" ON public.post_comments;
CREATE POLICY "Users can delete own comments"
  ON public.post_comments FOR DELETE
  TO authenticated
  USING (
    user_id IN (
      SELECT p.id
        FROM public.profiles p
       WHERE p.user_id = auth.uid()
    )
  );

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
  v_post_id := NULLIF(j->>'post_id', '')::uuid;
  v_ref := j->>'id';

  IF v_post_id IS NULL THEN
    RETURN NEW;
  END IF;

  BEGIN
    SELECT to_jsonb(p) INTO v_post
      FROM public.posts p
     WHERE p.id = v_post_id;

    v_owner := COALESCE(
      NULLIF(v_post->>'author_id', '')::uuid,
      NULLIF(v_post->>'user_id', '')::uuid
    );

    IF v_owner IS NOT NULL THEN
      PERFORM public.social_score_award(
        public._social_resolve_uid(v_owner),
        'comment_received',
        v_ref
      );
    END IF;
  EXCEPTION WHEN others THEN
    NULL;
  END;

  RETURN NEW;
END;
$$;

DO $$
DECLARE
  trg record;
BEGIN
  FOR trg IN
    SELECT trigger_name
      FROM information_schema.triggers
     WHERE event_object_schema = 'public'
       AND event_object_table = 'post_comments'
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.post_comments', trg.trigger_name);
  END LOOP;
END $$;

CREATE TRIGGER trg_social_comment_award
  AFTER INSERT ON public.post_comments
  FOR EACH ROW EXECUTE FUNCTION public._trg_social_comment_award();

CREATE OR REPLACE FUNCTION public.fn_trg_post_comments_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  BEGIN
    IF TG_OP = 'INSERT' THEN
      PERFORM public.fn_post_counter_bump(NEW.post_id, 'comments_count', 1);
      RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
      PERFORM public.fn_post_counter_bump(OLD.post_id, 'comments_count', -1);
      RETURN OLD;
    END IF;
  EXCEPTION WHEN others THEN
    IF TG_OP = 'INSERT' THEN
      RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
  END;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_post_comments_count
  AFTER INSERT OR DELETE ON public.post_comments
  FOR EACH ROW EXECUTE FUNCTION public.fn_trg_post_comments_count();

DO $$
BEGIN
  BEGIN
    EXECUTE 'ALTER TABLE public.post_comments REPLICA IDENTITY FULL';
  EXCEPTION WHEN others THEN NULL; END;

  BEGIN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.post_comments';
  EXCEPTION WHEN duplicate_object THEN NULL; WHEN others THEN NULL; END;
END $$;

NOTIFY pgrst, 'reload schema';
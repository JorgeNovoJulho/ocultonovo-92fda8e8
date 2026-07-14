-- ============================================================================
-- FIX DEFINITIVO — public.post_comments
-- Objetivo: garantir que QUALQUER usuário autenticado consiga inserir
-- comentários sem erros de schema, RLS ou triggers legados.
--
-- Cole INTEIRO no SQL Editor do Supabase EXTERNO. 100% idempotente.
--
-- Ele faz:
--   1) Cria a tabela se não existir (estrutura completa esperada pelo app)
--   2) Garante TODAS as colunas usadas pelo frontend (user_id, parent_id,
--      mentioned_users, depth, likes_count, is_seed, is_hidden, spam_reason,
--      updated_at)
--   3) Migra dados legados de profile_id/author_id -> user_id
--   4) Constraint FK user_id -> profiles(id)
--   5) Índices de performance
--   6) RLS aberta para SELECT e restrita por profiles.id no INSERT/UPDATE/DELETE
--   7) Reescreve TODOS os triggers AFTER INSERT/DELETE com EXCEPTION WHEN
--      OTHERS NULL — nunca quebra o insert por scoring/contador
--   8) Realtime + reload do cache PostgREST
-- ============================================================================

-- 1) Tabela base
CREATE TABLE IF NOT EXISTS public.post_comments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id     uuid NOT NULL,
  user_id     uuid,
  content     text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- 2) Colunas necessárias
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='post_comments' AND column_name='user_id') THEN
    ALTER TABLE public.post_comments ADD COLUMN user_id uuid;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='post_comments' AND column_name='parent_id') THEN
    ALTER TABLE public.post_comments ADD COLUMN parent_id uuid;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='post_comments' AND column_name='mentioned_users') THEN
    ALTER TABLE public.post_comments ADD COLUMN mentioned_users uuid[] DEFAULT '{}'::uuid[];
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='post_comments' AND column_name='depth') THEN
    ALTER TABLE public.post_comments ADD COLUMN depth integer NOT NULL DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='post_comments' AND column_name='likes_count') THEN
    ALTER TABLE public.post_comments ADD COLUMN likes_count integer NOT NULL DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='post_comments' AND column_name='is_seed') THEN
    ALTER TABLE public.post_comments ADD COLUMN is_seed boolean NOT NULL DEFAULT false;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='post_comments' AND column_name='is_hidden') THEN
    ALTER TABLE public.post_comments ADD COLUMN is_hidden boolean NOT NULL DEFAULT false;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='post_comments' AND column_name='spam_reason') THEN
    ALTER TABLE public.post_comments ADD COLUMN spam_reason text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='post_comments' AND column_name='updated_at') THEN
    ALTER TABLE public.post_comments ADD COLUMN updated_at timestamptz;
  END IF;
END $$;

-- 3) Migrar dados legados
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='post_comments' AND column_name='profile_id') THEN
    EXECUTE 'UPDATE public.post_comments SET user_id = COALESCE(user_id, profile_id) WHERE user_id IS NULL';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='post_comments' AND column_name='author_id') THEN
    EXECUTE 'UPDATE public.post_comments SET user_id = COALESCE(user_id, author_id) WHERE user_id IS NULL';
  END IF;
END $$;

-- Garante NOT NULL no user_id (só se não houver órfãos)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.post_comments WHERE user_id IS NULL) THEN
    BEGIN
      ALTER TABLE public.post_comments ALTER COLUMN user_id SET NOT NULL;
    EXCEPTION WHEN others THEN NULL; END;
  END IF;
END $$;

-- 4) FK user_id -> profiles(id)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'post_comments_user_id_fkey'
  ) THEN
    BEGIN
      ALTER TABLE public.post_comments
        ADD CONSTRAINT post_comments_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
    EXCEPTION WHEN others THEN NULL; END;
  END IF;
END $$;

-- 5) Índices
CREATE INDEX IF NOT EXISTS idx_post_comments_user         ON public.post_comments (user_id);
CREATE INDEX IF NOT EXISTS idx_post_comments_post_created ON public.post_comments (post_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_post_comments_parent       ON public.post_comments (parent_id);

-- 6) RLS: apaga TODAS as policies e recria
ALTER TABLE public.post_comments ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
     WHERE schemaname='public' AND tablename='post_comments'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.post_comments', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY "Anyone can read comments"
  ON public.post_comments FOR SELECT
  TO authenticated, anon
  USING (true);

CREATE POLICY "Users can insert own comments"
  ON public.post_comments FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id IN (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid())
  );

CREATE POLICY "Users can update own comments"
  ON public.post_comments FOR UPDATE
  TO authenticated
  USING (user_id IN (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid()))
  WITH CHECK (user_id IN (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid()));

CREATE POLICY "Users can delete own comments"
  ON public.post_comments FOR DELETE
  TO authenticated
  USING (user_id IN (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid()));

-- 7) Triggers seguros (nunca abortam o INSERT)

-- 7a) Scoring social (resiliente)
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
  BEGIN
    v_post_id := NULLIF(j->>'post_id','')::uuid;
    v_ref     := j->>'id';

    IF v_post_id IS NULL THEN RETURN NEW; END IF;

    SELECT to_jsonb(p) INTO v_post FROM public.posts p WHERE p.id = v_post_id;

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
    NULL; -- nunca quebra o insert
  END;
  RETURN NEW;
END;
$$;

-- 7b) Contador de comentários (resiliente)
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
  EXCEPTION WHEN OTHERS THEN
    IF TG_OP = 'INSERT' THEN RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN RETURN OLD;
    END IF;
  END;
  RETURN NULL;
END;
$$;

-- Apaga TODOS os triggers da tabela e recria só os seguros
DO $$
DECLARE trg record;
BEGIN
  FOR trg IN
    SELECT trigger_name FROM information_schema.triggers
     WHERE event_object_schema='public' AND event_object_table='post_comments'
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.post_comments', trg.trigger_name);
  END LOOP;
END $$;

CREATE TRIGGER trg_social_comment_award
  AFTER INSERT ON public.post_comments
  FOR EACH ROW EXECUTE FUNCTION public._trg_social_comment_award();

CREATE TRIGGER trg_post_comments_count
  AFTER INSERT OR DELETE ON public.post_comments
  FOR EACH ROW EXECUTE FUNCTION public.fn_trg_post_comments_count();

-- 8) Realtime + reload de cache
DO $$
BEGIN
  BEGIN EXECUTE 'ALTER TABLE public.post_comments REPLICA IDENTITY FULL';
  EXCEPTION WHEN OTHERS THEN NULL; END;

  BEGIN EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.post_comments';
  EXCEPTION WHEN duplicate_object THEN NULL; WHEN OTHERS THEN NULL; END;
END $$;

NOTIFY pgrst, 'reload schema';

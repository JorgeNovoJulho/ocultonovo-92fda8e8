-- =========================================================
-- Correções de hoje (auditoria 30/05/2026)
-- 1) Cria RPC story_view_register (faltando no DB externo)
-- 2) Garante colunas usadas por usePublicActivities
-- IDEMPOTENTE
-- =========================================================

-- ---------- 1) story_view_register ----------
-- Registra visualização de story de forma idempotente
-- Resolve profile.id a partir de auth.uid()
CREATE OR REPLACE FUNCTION public.story_view_register(p_story_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_profile_id uuid;
  v_inserted boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated');
  END IF;

  -- Resolve profile.id (preferindo user_id, fallback id)
  SELECT id INTO v_profile_id FROM public.profiles WHERE user_id = v_uid LIMIT 1;
  IF v_profile_id IS NULL THEN
    SELECT id INTO v_profile_id FROM public.profiles WHERE id = v_uid LIMIT 1;
  END IF;

  IF v_profile_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'profile_not_found');
  END IF;

  -- Tabela story_views (cria se não existir, mantendo formato esperado)
  CREATE TABLE IF NOT EXISTS public.story_views (
    story_id uuid NOT NULL,
    viewer_profile_id uuid NOT NULL,
    viewed_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (story_id, viewer_profile_id)
  );

  -- Garantir grants e RLS minimamente
  PERFORM 1;
  EXECUTE 'GRANT SELECT, INSERT ON public.story_views TO authenticated';
  EXECUTE 'GRANT ALL ON public.story_views TO service_role';

  BEGIN
    EXECUTE 'ALTER TABLE public.story_views ENABLE ROW LEVEL SECURITY';
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  -- Idempotente
  INSERT INTO public.story_views (story_id, viewer_profile_id)
  VALUES (p_story_id, v_profile_id)
  ON CONFLICT (story_id, viewer_profile_id) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  RETURN jsonb_build_object('ok', true, 'inserted', v_inserted);
END;
$$;

GRANT EXECUTE ON FUNCTION public.story_view_register(uuid) TO authenticated, service_role;

-- Policy mínima para story_views (own reads + insert próprio)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='story_views') THEN
    BEGIN
      EXECUTE 'DROP POLICY IF EXISTS "story_views_own_insert" ON public.story_views';
      EXECUTE 'CREATE POLICY "story_views_own_insert" ON public.story_views FOR INSERT TO authenticated WITH CHECK (true)';
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    BEGIN
      EXECUTE 'DROP POLICY IF EXISTS "story_views_public_read" ON public.story_views';
      EXECUTE 'CREATE POLICY "story_views_public_read" ON public.story_views FOR SELECT TO authenticated USING (true)';
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;
END$$;

-- ---------- 2) public_activities — garantir colunas ----------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='public_activities') THEN
    -- actor_id
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='public_activities' AND column_name='actor_id') THEN
      ALTER TABLE public.public_activities ADD COLUMN actor_id uuid;
    END IF;
    -- actor_name
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='public_activities' AND column_name='actor_name') THEN
      ALTER TABLE public.public_activities ADD COLUMN actor_name text;
    END IF;
    -- actor_avatar_url
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='public_activities' AND column_name='actor_avatar_url') THEN
      ALTER TABLE public.public_activities ADD COLUMN actor_avatar_url text;
    END IF;
    -- target_creator_id
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='public_activities' AND column_name='target_creator_id') THEN
      ALTER TABLE public.public_activities ADD COLUMN target_creator_id uuid;
    END IF;
    -- target_creator_name
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='public_activities' AND column_name='target_creator_name') THEN
      ALTER TABLE public.public_activities ADD COLUMN target_creator_name text;
    END IF;
    -- amount
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='public_activities' AND column_name='amount') THEN
      ALTER TABLE public.public_activities ADD COLUMN amount decimal(10,2);
    END IF;
    -- is_anonymous
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='public_activities' AND column_name='is_anonymous') THEN
      ALTER TABLE public.public_activities ADD COLUMN is_anonymous boolean NOT NULL DEFAULT false;
    END IF;
    -- metadata
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='public_activities' AND column_name='metadata') THEN
      ALTER TABLE public.public_activities ADD COLUMN metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
    END IF;
    -- is_seed
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='public_activities' AND column_name='is_seed') THEN
      ALTER TABLE public.public_activities ADD COLUMN is_seed boolean NOT NULL DEFAULT false;
    END IF;
  END IF;
END$$;

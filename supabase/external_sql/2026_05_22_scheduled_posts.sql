-- ============================================================================
-- AGENDAMENTO DE POSTS — oculto_scheduled_posts
-- Idempotente. Rode no SQL Editor do Supabase EXTERNO (rvybbrkzmboqbhcemqar).
--
-- Estratégia:
--   1) O frontend faz upload da mídia normalmente (para post-media / vip-paid-media)
--      e em seguida chama schedule_post(p_payload jsonb, p_scheduled_for timestamptz).
--   2) A linha fica em oculto_scheduled_posts com status='pending'.
--   3) O job pg_cron 'publish-due-scheduled-posts' roda a cada minuto e move
--      posts cujo scheduled_for <= now() para public.posts.
--   4) RLS: o dono enxerga/cancela apenas os seus agendamentos.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 1) Tabela ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.oculto_scheduled_posts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL,
  payload      jsonb NOT NULL,
  scheduled_for timestamptz NOT NULL,
  status       text NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending','published','failed','canceled')),
  published_post_id uuid,
  last_error   text,
  attempts     int  NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_oculto_scheduled_posts_user
  ON public.oculto_scheduled_posts (user_id, scheduled_for DESC);

CREATE INDEX IF NOT EXISTS idx_oculto_scheduled_posts_due
  ON public.oculto_scheduled_posts (scheduled_for)
  WHERE status = 'pending';

ALTER TABLE public.oculto_scheduled_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "scheduled_posts_select_own"   ON public.oculto_scheduled_posts;
DROP POLICY IF EXISTS "scheduled_posts_insert_own"   ON public.oculto_scheduled_posts;
DROP POLICY IF EXISTS "scheduled_posts_update_own"   ON public.oculto_scheduled_posts;
DROP POLICY IF EXISTS "scheduled_posts_delete_own"   ON public.oculto_scheduled_posts;

CREATE POLICY "scheduled_posts_select_own"
  ON public.oculto_scheduled_posts FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "scheduled_posts_insert_own"
  ON public.oculto_scheduled_posts FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "scheduled_posts_update_own"
  ON public.oculto_scheduled_posts FOR UPDATE
  TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "scheduled_posts_delete_own"
  ON public.oculto_scheduled_posts FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- 2) RPC: agendar -----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.schedule_post(
  p_payload jsonb,
  p_scheduled_for timestamptz
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_id  uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF p_scheduled_for <= now() + interval '30 seconds' THEN
    RAISE EXCEPTION 'scheduled_for deve ser pelo menos 1 minuto no futuro';
  END IF;

  INSERT INTO public.oculto_scheduled_posts (user_id, payload, scheduled_for)
  VALUES (v_uid, p_payload, p_scheduled_for)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.schedule_post(jsonb, timestamptz) TO authenticated;

-- 3) RPC: listar meus agendamentos pendentes --------------------------------
CREATE OR REPLACE FUNCTION public.list_my_scheduled_posts()
RETURNS TABLE (
  id uuid,
  scheduled_for timestamptz,
  status text,
  payload jsonb,
  last_error text,
  created_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT id, scheduled_for, status, payload, last_error, created_at
    FROM public.oculto_scheduled_posts
   WHERE user_id = auth.uid()
     AND status IN ('pending','failed')
   ORDER BY scheduled_for ASC;
$$;

GRANT EXECUTE ON FUNCTION public.list_my_scheduled_posts() TO authenticated;

-- 4) RPC: cancelar -----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_scheduled_post(p_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  DELETE FROM public.oculto_scheduled_posts
   WHERE id = p_id AND user_id = v_uid AND status IN ('pending','failed');

  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_scheduled_post(uuid) TO authenticated;

-- 5) Worker: publica agendamentos vencidos ----------------------------------
CREATE OR REPLACE FUNCTION public.publish_due_scheduled_posts()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_count int := 0;
  v_author_id uuid;
  v_new_post_id uuid;
  v_payload jsonb;
BEGIN
  FOR r IN
    SELECT *
      FROM public.oculto_scheduled_posts
     WHERE status = 'pending'
       AND scheduled_for <= now()
     ORDER BY scheduled_for ASC
     LIMIT 50
  LOOP
    BEGIN
      -- author_id = profiles.id (sem usar auth.uid pois é um job)
      SELECT id INTO v_author_id
        FROM public.profiles
       WHERE user_id = r.user_id
       LIMIT 1;

      IF v_author_id IS NULL THEN
        v_author_id := r.user_id;
      END IF;

      v_payload := r.payload;

      INSERT INTO public.posts (
        author_id,
        creator_id,
        content_text,
        media_url,
        media_urls,
        media_type,
        video_duration_seconds,
        privacy_level,
        is_locked,
        is_flash,
        thumbnail_url,
        preview_url,
        media_storage_path,
        media_bucket,
        is_paid,
        paid_price,
        preview_blur
      ) VALUES (
        v_author_id,
        r.user_id,
        NULLIF(v_payload->>'content_text',''),
        NULLIF(v_payload->>'media_url',''),
        CASE WHEN jsonb_typeof(v_payload->'media_urls') = 'array'
             THEN ARRAY(SELECT jsonb_array_elements_text(v_payload->'media_urls'))
             ELSE NULL END,
        NULLIF(v_payload->>'media_type',''),
        NULLIF(v_payload->>'video_duration_seconds','')::int,
        COALESCE(NULLIF(v_payload->>'privacy_level',''),'public'),
        COALESCE((v_payload->>'is_locked')::boolean, false),
        COALESCE((v_payload->>'is_flash')::boolean,  false),
        NULLIF(v_payload->>'thumbnail_url',''),
        NULLIF(v_payload->>'preview_url',''),
        NULLIF(v_payload->>'media_storage_path',''),
        COALESCE(NULLIF(v_payload->>'media_bucket',''),'post-media'),
        COALESCE((v_payload->>'is_paid')::boolean, false),
        NULLIF(v_payload->>'paid_price','')::numeric,
        NULLIF(v_payload->>'preview_blur','')
      )
      RETURNING id INTO v_new_post_id;

      UPDATE public.oculto_scheduled_posts
         SET status = 'published',
             published_post_id = v_new_post_id,
             updated_at = now()
       WHERE id = r.id;

      v_count := v_count + 1;
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.oculto_scheduled_posts
         SET attempts = attempts + 1,
             last_error = SQLERRM,
             status = CASE WHEN attempts + 1 >= 5 THEN 'failed' ELSE 'pending' END,
             updated_at = now()
       WHERE id = r.id;
    END;
  END LOOP;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.publish_due_scheduled_posts() TO authenticated;

-- 6) pg_cron: a cada minuto -------------------------------------------------
DO $$
DECLARE
  v_jobid bigint;
BEGIN
  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'publish-due-scheduled-posts';
  IF v_jobid IS NOT NULL THEN
    PERFORM cron.unschedule(v_jobid);
  END IF;
  PERFORM cron.schedule(
    'publish-due-scheduled-posts',
    '* * * * *',
    $cmd$ SELECT public.publish_due_scheduled_posts(); $cmd$
  );
END $$;

-- 7) Reload PostgREST -------------------------------------------------------
NOTIFY pgrst, 'reload schema';

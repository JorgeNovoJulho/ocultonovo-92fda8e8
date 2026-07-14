-- ============================================================
-- OCULTO PLAY — backfill de previews de áudio existentes
-- Rodar no SQL Editor do Supabase EXTERNO.
-- Idempotente.
-- ============================================================

ALTER TABLE public.oculto_play_items
  ADD COLUMN IF NOT EXISTS audio_preview_url text;

-- Marca todos os áudios antigos para usarem uma janela curta e consistente
-- imediatamente. A geração física do arquivo leve é feita pelo botão/admin
-- no app, sem precisar editar um a um.
UPDATE public.oculto_play_items
SET
  preview_start_seconds = COALESCE(preview_start_seconds, 0),
  preview_end_seconds = CASE
    WHEN audio_preview_url IS NOT NULL THEN COALESCE(preview_end_seconds, 30)
    WHEN preview_end_seconds IS NULL OR preview_end_seconds <= COALESCE(preview_start_seconds, 0)
      THEN LEAST(COALESCE(preview_start_seconds, 0) + 30, COALESCE(duration_sec, COALESCE(preview_start_seconds, 0) + 30))
    WHEN preview_end_seconds > COALESCE(preview_start_seconds, 0) + 30
      THEN COALESCE(preview_start_seconds, 0) + 30
    ELSE preview_end_seconds
  END
WHERE kind = 'audio'
  AND audio_url IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.oculto_play_audio_preview_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.oculto_play_items(id) ON DELETE CASCADE,
  audio_url text NOT NULL,
  start_seconds numeric NOT NULL DEFAULT 0,
  end_seconds numeric NOT NULL DEFAULT 30,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','done','failed')),
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (item_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.oculto_play_audio_preview_jobs TO authenticated;
GRANT ALL ON public.oculto_play_audio_preview_jobs TO service_role;

ALTER TABLE public.oculto_play_audio_preview_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audio preview jobs master manage" ON public.oculto_play_audio_preview_jobs;
CREATE POLICY "audio preview jobs master manage"
ON public.oculto_play_audio_preview_jobs
FOR ALL
TO authenticated
USING (public.is_oculto_master(auth.uid()))
WITH CHECK (public.is_oculto_master(auth.uid()));

INSERT INTO public.oculto_play_audio_preview_jobs (item_id, audio_url, start_seconds, end_seconds, status)
SELECT
  i.id,
  i.audio_url,
  COALESCE(i.preview_start_seconds, 0),
  CASE
    WHEN i.preview_end_seconds IS NULL OR i.preview_end_seconds <= COALESCE(i.preview_start_seconds, 0)
      THEN COALESCE(i.preview_start_seconds, 0) + 30
    ELSE LEAST(i.preview_end_seconds, COALESCE(i.preview_start_seconds, 0) + 30)
  END,
  'pending'
FROM public.oculto_play_items i
WHERE i.kind = 'audio'
  AND i.audio_url IS NOT NULL
  AND i.audio_preview_url IS NULL
ON CONFLICT (item_id) DO UPDATE SET
  audio_url = EXCLUDED.audio_url,
  start_seconds = EXCLUDED.start_seconds,
  end_seconds = EXCLUDED.end_seconds,
  status = CASE WHEN public.oculto_play_audio_preview_jobs.status = 'done' THEN 'done' ELSE 'pending' END,
  updated_at = now();

CREATE OR REPLACE FUNCTION public.oculto_play_audio_preview_backfill_list(p_limit int DEFAULT 20)
RETURNS TABLE (
  item_id uuid,
  audio_url text,
  start_seconds numeric,
  end_seconds numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT j.item_id, j.audio_url, j.start_seconds, j.end_seconds
  FROM public.oculto_play_audio_preview_jobs j
  JOIN public.oculto_play_items i ON i.id = j.item_id
  WHERE j.status IN ('pending','failed')
    AND i.audio_preview_url IS NULL
    AND public.is_oculto_master(auth.uid())
  ORDER BY j.created_at ASC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 20), 50));
$$;

GRANT EXECUTE ON FUNCTION public.oculto_play_audio_preview_backfill_list(int) TO authenticated;

CREATE OR REPLACE FUNCTION public.oculto_play_audio_preview_backfill_done(
  p_item_id uuid,
  p_audio_preview_url text,
  p_error_message text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_oculto_master(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF p_audio_preview_url IS NOT NULL AND length(trim(p_audio_preview_url)) > 0 THEN
    UPDATE public.oculto_play_items
    SET audio_preview_url = trim(p_audio_preview_url),
        preview_start_seconds = 0,
        preview_end_seconds = 30
    WHERE id = p_item_id;

    UPDATE public.oculto_play_audio_preview_jobs
    SET status = 'done', error_message = NULL, updated_at = now()
    WHERE item_id = p_item_id;
  ELSE
    UPDATE public.oculto_play_audio_preview_jobs
    SET status = 'failed', error_message = COALESCE(p_error_message, 'preview_generation_failed'), updated_at = now()
    WHERE item_id = p_item_id;
  END IF;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.oculto_play_audio_preview_backfill_done(uuid, text, text) TO authenticated;
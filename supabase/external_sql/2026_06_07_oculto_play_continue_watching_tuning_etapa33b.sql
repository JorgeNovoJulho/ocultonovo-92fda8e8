-- Etapa 33b — Ajuste fino dos limiares de "Continuar Assistindo"
-- Entrada: progresso > 10s (antes era >5s).
-- Saída/Conclusão: marca completed quando faltam <=3s para o fim (antes 1.5s).
-- Idempotente: substitui as funções.

CREATE OR REPLACE FUNCTION public.oculto_play_save_progress(
  p_item_id uuid,
  p_progress_seconds numeric,
  p_duration_seconds numeric DEFAULT NULL,
  p_completed boolean DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_completed boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;

  v_completed := COALESCE(
    p_completed,
    CASE
      WHEN p_duration_seconds IS NOT NULL
       AND p_duration_seconds > 0
       AND p_progress_seconds >= (p_duration_seconds - 3.0)
      THEN true
      ELSE false
    END
  );

  INSERT INTO public.oculto_play_playback_progress
    (user_id, item_id, progress_seconds, duration_seconds, completed, updated_at)
  VALUES
    (v_uid, p_item_id, GREATEST(p_progress_seconds, 0), p_duration_seconds, v_completed, now())
  ON CONFLICT (user_id, item_id) DO UPDATE
  SET progress_seconds = GREATEST(EXCLUDED.progress_seconds, public.oculto_play_playback_progress.progress_seconds),
      duration_seconds = COALESCE(EXCLUDED.duration_seconds, public.oculto_play_playback_progress.duration_seconds),
      completed = public.oculto_play_playback_progress.completed OR EXCLUDED.completed,
      updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.oculto_play_save_progress(uuid, numeric, numeric, boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.oculto_play_save_progress(uuid, numeric, numeric, boolean) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.oculto_play_continue_watching_list(
  p_limit int DEFAULT 24
)
RETURNS TABLE (
  item_id uuid,
  kind text,
  title text,
  thumb_url text,
  media_url text,
  author_id uuid,
  progress_seconds numeric,
  duration_seconds numeric,
  progress_ratio numeric,
  updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    i.id,
    i.kind::text,
    i.title,
    i.thumb_url,
    i.media_url,
    i.author_id,
    p.progress_seconds,
    p.duration_seconds,
    CASE
      WHEN p.duration_seconds IS NOT NULL AND p.duration_seconds > 0
        THEN LEAST(1, GREATEST(0, p.progress_seconds / p.duration_seconds))
      ELSE NULL
    END,
    p.updated_at
  FROM public.oculto_play_playback_progress p
  JOIN public.oculto_play_items i ON i.id = p.item_id
  WHERE p.user_id = auth.uid()
    AND p.completed = false
    AND p.progress_seconds > 10
    AND i.is_published = true
  ORDER BY p.updated_at DESC
  LIMIT GREATEST(p_limit, 1);
$$;

REVOKE ALL ON FUNCTION public.oculto_play_continue_watching_list(int) FROM public;
GRANT EXECUTE ON FUNCTION public.oculto_play_continue_watching_list(int) TO authenticated, service_role;

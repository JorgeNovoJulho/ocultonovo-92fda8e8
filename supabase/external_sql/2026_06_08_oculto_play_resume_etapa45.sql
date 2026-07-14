-- =====================================================================
-- Etapa 45 — Oculto Play: Resume Watching
-- RPC para retornar a melhor posição salva do usuário em um item.
-- Aproveita oculto_play_watch_progress (Etapa 44).
-- Externo: rvybbrkzmboqbhcemqar — Idempotente.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.oculto_play_resume_position(p_item_id uuid)
RETURNS TABLE (
  position_seconds integer,
  duration_seconds integer,
  watched_pct      numeric,
  completed        boolean,
  last_seen_at     timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR p_item_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    COALESCE(wp.position_seconds, 0)::integer,
    COALESCE(wp.duration_seconds, 0)::integer,
    COALESCE(wp.watched_pct, 0)::numeric,
    COALESCE(wp.completed, false),
    wp.created_at
  FROM public.oculto_play_watch_progress wp
  WHERE wp.user_id = v_uid
    AND wp.item_id = p_item_id
  ORDER BY wp.created_at DESC
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.oculto_play_resume_position(uuid) TO authenticated;

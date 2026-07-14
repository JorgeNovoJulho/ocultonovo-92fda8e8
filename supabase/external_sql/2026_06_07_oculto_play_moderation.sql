-- ============================================================================
-- OCULTO PLAY — Etapa 5: Moderação (fila de denúncias + ações Master)
-- Cole no SQL Editor do Supabase EXTERNO. 100% idempotente.
-- Depende das tabelas criadas em 2026_06_07_oculto_play_content.sql.
-- ============================================================================

-- ---------- 1) Listagem da fila de denúncias (apenas Master) ----------
CREATE OR REPLACE FUNCTION public.oculto_play_pending_reports(
  p_status text DEFAULT 'pending',
  p_limit  int  DEFAULT 50
)
RETURNS TABLE (
  report_id      uuid,
  item_id        uuid,
  reporter_id    uuid,
  reporter_username text,
  reason         text,
  details        text,
  status         text,
  created_at     timestamptz,
  item_kind      public.oculto_play_kind,
  item_title     text,
  item_caption   text,
  item_media_url text,
  item_thumb_url text,
  item_visibility public.oculto_play_visibility,
  item_is_published boolean,
  item_report_count int,
  author_id      uuid,
  author_username text,
  author_display_name text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin_master') THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    r.id, r.item_id, r.reporter_id, rp.username, r.reason, r.details, r.status, r.created_at,
    i.kind, i.title, i.caption, i.media_url, i.thumb_url, i.visibility, i.is_published, i.report_count,
    i.author_id, ap.username, ap.display_name
  FROM public.oculto_play_reports r
  LEFT JOIN public.oculto_play_items i ON i.id = r.item_id
  LEFT JOIN public.profiles ap ON ap.id = i.author_id
  LEFT JOIN public.profiles rp ON rp.user_id = r.reporter_id
  WHERE (p_status = 'all' OR r.status = p_status)
  ORDER BY r.created_at DESC
  LIMIT GREATEST(1, LEAST(p_limit, 200));
END $$;

GRANT EXECUTE ON FUNCTION public.oculto_play_pending_reports(text,int) TO authenticated;

-- ---------- 2) Resolver uma denúncia (Master only) ----------
-- Actions:
--   'dismiss'        -> marca como dismissed (item segue publicado)
--   'remove'         -> unpublish item + status='removed'
--   'remove_purge'   -> DELETE item + status='removed'
CREATE OR REPLACE FUNCTION public.oculto_play_review_report(
  p_report_id uuid,
  p_action    text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_report record;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin_master') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT * INTO v_report FROM public.oculto_play_reports WHERE id = p_report_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'report not found';
  END IF;

  IF p_action = 'dismiss' THEN
    UPDATE public.oculto_play_reports
       SET status='dismissed', reviewed_at=now(), reviewed_by=auth.uid()
     WHERE id = p_report_id;

  ELSIF p_action = 'remove' THEN
    UPDATE public.oculto_play_items SET is_published = false WHERE id = v_report.item_id;
    UPDATE public.oculto_play_reports
       SET status='removed', reviewed_at=now(), reviewed_by=auth.uid()
     WHERE id = p_report_id;
    -- também resolve outras denúncias pendentes do mesmo item
    UPDATE public.oculto_play_reports
       SET status='removed', reviewed_at=now(), reviewed_by=auth.uid()
     WHERE item_id = v_report.item_id AND status = 'pending';

  ELSIF p_action = 'remove_purge' THEN
    UPDATE public.oculto_play_reports
       SET status='removed', reviewed_at=now(), reviewed_by=auth.uid()
     WHERE item_id = v_report.item_id;
    DELETE FROM public.oculto_play_items WHERE id = v_report.item_id;

  ELSE
    RAISE EXCEPTION 'invalid action: %', p_action;
  END IF;

  RETURN jsonb_build_object('ok', true, 'action', p_action, 'report_id', p_report_id);
END $$;

GRANT EXECUTE ON FUNCTION public.oculto_play_review_report(uuid,text) TO authenticated;

-- ---------- 3) Estatísticas do painel Master ----------
CREATE OR REPLACE FUNCTION public.oculto_play_admin_stats()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin_master') THEN
    RETURN jsonb_build_object('forbidden', true);
  END IF;

  SELECT jsonb_build_object(
    'items_total',     (SELECT count(*) FROM public.oculto_play_items),
    'items_published', (SELECT count(*) FROM public.oculto_play_items WHERE is_published),
    'items_today',     (SELECT count(*) FROM public.oculto_play_items WHERE section='today' AND is_published),
    'items_comeback',  (SELECT count(*) FROM public.oculto_play_items WHERE section='comeback' AND is_published),
    'reports_pending', (SELECT count(*) FROM public.oculto_play_reports WHERE status='pending'),
    'reports_total',   (SELECT count(*) FROM public.oculto_play_reports),
    'views_total',     (SELECT count(*) FROM public.oculto_play_views),
    'likes_total',     (SELECT count(*) FROM public.oculto_play_likes),
    'saves_total',     (SELECT count(*) FROM public.oculto_play_saves)
  ) INTO v;
  RETURN v;
END $$;

GRANT EXECUTE ON FUNCTION public.oculto_play_admin_stats() TO authenticated;

NOTIFY pgrst, 'reload schema';

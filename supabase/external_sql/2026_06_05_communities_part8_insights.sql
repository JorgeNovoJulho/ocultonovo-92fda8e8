-- ============================================================
-- COMUNIDADES OCULTAS — PARTE 8
-- Insights da comunidade (apenas owner/master)
-- Cole no SQL Editor do Supabase EXTERNO. Idempotente.
-- ============================================================

CREATE OR REPLACE FUNCTION public.community_insights(_community uuid, _days int DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_role        text;
  v_is_master   boolean := public.oculto_is_master(auth.uid());
  v_since       timestamptz := NOW() - (_days || ' days')::interval;
  v_totals      jsonb;
  v_new_members int;
  v_new_topics  int;
  v_new_replies int;
  v_active_users int;
  v_members_series jsonb;
  v_topics_series  jsonb;
  v_top_topics    jsonb;
  v_top_members   jsonb;
BEGIN
  IF NOT v_is_master THEN
    SELECT role INTO v_role
      FROM public.oculto_community_members
     WHERE community_id = _community
       AND user_id = auth.uid()
       AND status = 'active';
    IF v_role IS NULL OR v_role NOT IN ('owner','moderator') THEN
      RAISE EXCEPTION 'forbidden';
    END IF;
  END IF;

  SELECT jsonb_build_object(
    'members_count', members_count,
    'topics_count',  topics_count,
    'replies_count', COALESCE((SELECT COUNT(*) FROM public.oculto_community_replies r
                                 JOIN public.oculto_community_topics t ON t.id = r.topic_id
                                WHERE t.community_id = _community), 0),
    'pending_count', COALESCE((SELECT COUNT(*) FROM public.oculto_community_members
                                WHERE community_id = _community AND status = 'pending'), 0)
  )
  INTO v_totals
  FROM public.oculto_communities WHERE id = _community;

  SELECT COUNT(*) INTO v_new_members
    FROM public.oculto_community_members
   WHERE community_id = _community AND status = 'active' AND joined_at >= v_since;

  SELECT COUNT(*) INTO v_new_topics
    FROM public.oculto_community_topics
   WHERE community_id = _community AND created_at >= v_since;

  SELECT COUNT(*) INTO v_new_replies
    FROM public.oculto_community_replies r
    JOIN public.oculto_community_topics t ON t.id = r.topic_id
   WHERE t.community_id = _community AND r.created_at >= v_since;

  SELECT COUNT(DISTINCT u) INTO v_active_users
  FROM (
    SELECT author_id AS u FROM public.oculto_community_topics
     WHERE community_id = _community AND created_at >= v_since
    UNION ALL
    SELECT r.author_id FROM public.oculto_community_replies r
     JOIN public.oculto_community_topics t ON t.id = r.topic_id
     WHERE t.community_id = _community AND r.created_at >= v_since
  ) s;

  -- Série diária — novos membros
  WITH days AS (
    SELECT generate_series(date_trunc('day', v_since), date_trunc('day', NOW()), interval '1 day')::date AS d
  ),
  mm AS (
    SELECT date_trunc('day', joined_at)::date AS d, COUNT(*)::int AS c
      FROM public.oculto_community_members
     WHERE community_id = _community AND status = 'active' AND joined_at >= v_since
     GROUP BY 1
  )
  SELECT jsonb_agg(jsonb_build_object('d', to_char(days.d, 'YYYY-MM-DD'), 'c', COALESCE(mm.c, 0)) ORDER BY days.d)
    INTO v_members_series
    FROM days LEFT JOIN mm ON mm.d = days.d;

  -- Série diária — novos tópicos
  WITH days AS (
    SELECT generate_series(date_trunc('day', v_since), date_trunc('day', NOW()), interval '1 day')::date AS d
  ),
  tt AS (
    SELECT date_trunc('day', created_at)::date AS d, COUNT(*)::int AS c
      FROM public.oculto_community_topics
     WHERE community_id = _community AND created_at >= v_since
     GROUP BY 1
  )
  SELECT jsonb_agg(jsonb_build_object('d', to_char(days.d, 'YYYY-MM-DD'), 'c', COALESCE(tt.c, 0)) ORDER BY days.d)
    INTO v_topics_series
    FROM days LEFT JOIN tt ON tt.d = days.d;

  -- Top 5 tópicos por replies + reações (peso replies x2)
  SELECT jsonb_agg(row_to_json(x) ORDER BY x.score DESC)
    INTO v_top_topics
    FROM (
      SELECT t.id, t.title,
             COALESCE((SELECT COUNT(*) FROM public.oculto_community_replies r WHERE r.topic_id = t.id), 0)::int AS replies,
             COALESCE((SELECT COUNT(*) FROM public.oculto_community_reactions x WHERE x.topic_id = t.id), 0)::int AS reactions,
             (COALESCE((SELECT COUNT(*) FROM public.oculto_community_replies r WHERE r.topic_id = t.id), 0) * 2
              + COALESCE((SELECT COUNT(*) FROM public.oculto_community_reactions x WHERE x.topic_id = t.id), 0))::int AS score
        FROM public.oculto_community_topics t
       WHERE t.community_id = _community AND t.created_at >= v_since
       ORDER BY score DESC
       LIMIT 5
    ) x;

  -- Top 5 membros mais ativos (tópicos + replies)
  SELECT jsonb_agg(row_to_json(y) ORDER BY y.score DESC)
    INTO v_top_members
    FROM (
      SELECT u AS user_id,
             SUM(topics)::int AS topics,
             SUM(replies)::int AS replies,
             (SUM(topics) * 3 + SUM(replies))::int AS score,
             p.username, p.display_name, p.name, p.avatar_url
        FROM (
          SELECT author_id AS u, COUNT(*) AS topics, 0 AS replies
            FROM public.oculto_community_topics
           WHERE community_id = _community AND created_at >= v_since
           GROUP BY author_id
          UNION ALL
          SELECT r.author_id, 0, COUNT(*)
            FROM public.oculto_community_replies r
            JOIN public.oculto_community_topics t ON t.id = r.topic_id
           WHERE t.community_id = _community AND r.created_at >= v_since
           GROUP BY r.author_id
        ) agg
        LEFT JOIN public.profiles p ON p.id = agg.u
       GROUP BY u, p.username, p.display_name, p.name, p.avatar_url
       ORDER BY score DESC
       LIMIT 5
    ) y;

  RETURN jsonb_build_object(
    'totals', v_totals,
    'period_days', _days,
    'new_members', v_new_members,
    'new_topics', v_new_topics,
    'new_replies', v_new_replies,
    'active_users', v_active_users,
    'members_series', COALESCE(v_members_series, '[]'::jsonb),
    'topics_series',  COALESCE(v_topics_series, '[]'::jsonb),
    'top_topics',     COALESCE(v_top_topics, '[]'::jsonb),
    'top_members',    COALESCE(v_top_members, '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.community_insights(uuid, int) TO authenticated;

-- ============================================================
-- FIM PARTE 8
-- ============================================================

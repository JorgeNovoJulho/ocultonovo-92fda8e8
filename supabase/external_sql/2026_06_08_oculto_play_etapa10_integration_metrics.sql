-- =============================================================================
-- OCULTO PLAY — ETAPA 10: Integração VIP/Comunidades + Métricas Admin finais
-- Cole no SQL Editor do Supabase EXTERNO. 100% idempotente.
-- Sem quebrar tabelas existentes (oculto_play_items, _views, _likes, _saves,
-- _comments, _reports, _xp_log, retention).
--
-- O que faz:
--   1) Tabela leve oculto_play_outbound_clicks (tracking Play→VIP/Comunidade/
--      Perfil/Chat/Assinatura/Seguir) — RLS self-insert + master leitura
--   2) RPC oculto_play_track_outbound(p_item_id, p_kind, p_target_id?)
--   3) RPC oculto_play_admin_metrics(p_days int default 30) — agregada leve
--      para o painel Master, somente admin/master.
-- =============================================================================

-- 1) Outbound clicks --------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.oculto_play_outbound_clicks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  item_id uuid,
  target_kind text NOT NULL CHECK (target_kind IN (
    'vip_channel','vip_subscription','community','community_topic',
    'profile','chat','follow'
  )),
  target_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.oculto_play_outbound_clicks TO authenticated;
GRANT ALL ON public.oculto_play_outbound_clicks TO service_role;

ALTER TABLE public.oculto_play_outbound_clicks ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "outbound_self_insert" ON public.oculto_play_outbound_clicks
    FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "outbound_self_read" ON public.oculto_play_outbound_clicks
    FOR SELECT TO authenticated
    USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin_master'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_oculto_play_outbound_created
  ON public.oculto_play_outbound_clicks (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_oculto_play_outbound_kind
  ON public.oculto_play_outbound_clicks (target_kind, created_at DESC);

-- 2) RPC de tracking --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.oculto_play_track_outbound(
  p_item_id   uuid,
  p_kind      text,
  p_target_id text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RETURN NULL; END IF;
  INSERT INTO public.oculto_play_outbound_clicks(user_id, item_id, target_kind, target_id)
  VALUES (v_uid, p_item_id, p_kind, p_target_id)
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

GRANT EXECUTE ON FUNCTION public.oculto_play_track_outbound(uuid, text, text) TO authenticated;

-- 3) RPC de métricas admin --------------------------------------------------
DROP FUNCTION IF EXISTS public.oculto_play_admin_metrics(integer);

CREATE OR REPLACE FUNCTION public.oculto_play_admin_metrics(p_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_master boolean;
  v_since timestamptz := now() - make_interval(days => GREATEST(1, COALESCE(p_days, 30)));
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('error','unauthenticated');
  END IF;

  SELECT public.has_role(v_uid,'admin_master')
      OR EXISTS (SELECT 1 FROM public.profiles
                  WHERE user_id = v_uid AND COALESCE(is_admin,false) = true)
    INTO v_is_master;

  IF NOT COALESCE(v_is_master,false) THEN
    RETURN jsonb_build_object('error','forbidden');
  END IF;

  WITH
  v AS (
    SELECT user_id, item_id, completed, seconds, created_at
      FROM public.oculto_play_views
     WHERE created_at >= v_since
  ),
  daily_users AS (
    SELECT date_trunc('day', created_at)::date AS d, count(DISTINCT user_id) AS u
      FROM v GROUP BY 1
  ),
  totals AS (
    SELECT
      (SELECT count(*) FROM v) AS total_views,
      (SELECT count(*) FROM v WHERE completed) AS completed_views,
      (SELECT COALESCE(avg(seconds),0)::numeric(10,2) FROM v WHERE seconds > 0) AS avg_seconds,
      (SELECT count(DISTINCT user_id) FROM v) AS active_users,
      (SELECT count(*) FROM public.oculto_play_likes WHERE created_at >= v_since) AS likes,
      (SELECT count(*) FROM public.oculto_play_saves WHERE created_at >= v_since) AS saves,
      (SELECT count(*) FROM public.oculto_play_comments WHERE created_at >= v_since) AS comments,
      (SELECT count(*) FROM public.oculto_play_items WHERE published_at >= v_since) AS items_published
  ),
  outbound AS (
    SELECT target_kind, count(*) AS c
      FROM public.oculto_play_outbound_clicks
     WHERE created_at >= v_since
     GROUP BY 1
  ),
  top_saved AS (
    SELECT i.id, i.title, i.kind, count(s.*) AS saves
      FROM public.oculto_play_items i
      JOIN public.oculto_play_saves s ON s.item_id = i.id
     WHERE s.created_at >= v_since
     GROUP BY i.id, i.title, i.kind
     ORDER BY saves DESC LIMIT 10
  ),
  top_viewed AS (
    SELECT i.id, i.title, i.kind, count(v2.*) AS views
      FROM public.oculto_play_items i
      JOIN public.oculto_play_views v2 ON v2.item_id = i.id
     WHERE v2.created_at >= v_since
     GROUP BY i.id, i.title, i.kind
     ORDER BY views DESC LIMIT 10
  ),
  top_creators AS (
    SELECT i.author_id, count(v3.*) AS views
      FROM public.oculto_play_items i
      JOIN public.oculto_play_views v3 ON v3.item_id = i.id
     WHERE v3.created_at >= v_since
     GROUP BY i.author_id
     ORDER BY views DESC LIMIT 10
  )
  SELECT jsonb_build_object(
    'window_days', p_days,
    'since', v_since,
    'totals', (SELECT row_to_json(totals) FROM totals),
    'daily_active_users', (SELECT COALESCE(jsonb_agg(jsonb_build_object('day',d,'users',u) ORDER BY d), '[]'::jsonb) FROM daily_users),
    'outbound_by_kind', (SELECT COALESCE(jsonb_object_agg(target_kind, c), '{}'::jsonb) FROM outbound),
    'top_saved',    (SELECT COALESCE(jsonb_agg(row_to_json(top_saved)), '[]'::jsonb) FROM top_saved),
    'top_viewed',   (SELECT COALESCE(jsonb_agg(row_to_json(top_viewed)), '[]'::jsonb) FROM top_viewed),
    'top_creators', (SELECT COALESCE(jsonb_agg(row_to_json(top_creators)), '[]'::jsonb) FROM top_creators)
  ) INTO v_result;

  RETURN v_result;
END $$;

GRANT EXECUTE ON FUNCTION public.oculto_play_admin_metrics(integer) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- OCULTO PLAY — Etapa 9: Insights do Criador
-- Cole no SQL Editor do Supabase EXTERNO (rvybbrkzmboqbhcemqar).
-- 100% idempotente. Apenas funções de leitura. Não cria/altera tabelas.
-- ----------------------------------------------------------------------------
-- O que faz:
--   1) RPC oculto_play_creator_summary(p_days int)
--        Retorna 1 linha: total de itens, views, likes, saves, shares,
--        publicados nas últimas N horas, melhor item (id+title+views).
--   2) RPC oculto_play_creator_daily(p_days int)
--        Série diária dos últimos N dias: views/likes/saves agregados por dia.
--   3) RPC oculto_play_creator_top(p_limit int)
--        Top itens do próprio criador por views (decrescente).
-- Todas as funções resolvem o autor pelo auth.uid() -> profiles.id e respeitam
-- can_access_oculto_play() (sem gate = retorno vazio).
-- ============================================================================

-- 1) Summary -----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.oculto_play_creator_summary(p_days int DEFAULT 14)
RETURNS TABLE (
  total_items     bigint,
  total_views     bigint,
  total_likes     bigint,
  total_saves     bigint,
  total_shares    bigint,
  items_last_24h  bigint,
  top_item_id     uuid,
  top_item_title  text,
  top_item_views  bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_author_id uuid;
BEGIN
  IF NOT public.can_access_oculto_play() THEN RETURN; END IF;

  SELECT p.id INTO v_author_id
    FROM public.profiles p
   WHERE p.user_id = auth.uid()
   LIMIT 1;

  IF v_author_id IS NULL THEN RETURN; END IF;

  RETURN QUERY
  WITH base AS (
    SELECT *
      FROM public.oculto_play_items
     WHERE author_id = v_author_id
       AND is_published = true
       AND COALESCE(is_seed, false) = false
       AND published_at >= now() - make_interval(days => GREATEST(1, p_days))
  ),
  top1 AS (
    SELECT id, title, view_count
      FROM base
     ORDER BY view_count DESC NULLS LAST, published_at DESC
     LIMIT 1
  )
  SELECT
    (SELECT count(*) FROM base),
    (SELECT COALESCE(sum(view_count), 0) FROM base),
    (SELECT COALESCE(sum(like_count), 0) FROM base),
    (SELECT COALESCE(sum(save_count), 0) FROM base),
    (SELECT COALESCE(sum(share_count), 0) FROM base),
    (SELECT count(*) FROM base WHERE published_at >= now() - interval '24 hours'),
    (SELECT id FROM top1),
    (SELECT title FROM top1),
    (SELECT COALESCE(view_count, 0)::bigint FROM top1);
END;
$$;

GRANT EXECUTE ON FUNCTION public.oculto_play_creator_summary(int) TO authenticated;

-- 2) Daily series -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.oculto_play_creator_daily(p_days int DEFAULT 14)
RETURNS TABLE (
  day    date,
  views  bigint,
  likes  bigint,
  saves  bigint,
  items  bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_author_id uuid;
  v_days int := GREATEST(1, LEAST(p_days, 90));
BEGIN
  IF NOT public.can_access_oculto_play() THEN RETURN; END IF;

  SELECT p.id INTO v_author_id
    FROM public.profiles p
   WHERE p.user_id = auth.uid()
   LIMIT 1;

  IF v_author_id IS NULL THEN RETURN; END IF;

  RETURN QUERY
  WITH cal AS (
    SELECT (current_date - g)::date AS day
      FROM generate_series(0, v_days - 1) g
  ),
  agg AS (
    SELECT date_trunc('day', published_at)::date AS day,
           sum(view_count)::bigint AS views,
           sum(like_count)::bigint AS likes,
           sum(save_count)::bigint AS saves,
           count(*)::bigint AS items
      FROM public.oculto_play_items
     WHERE author_id = v_author_id
       AND is_published = true
       AND COALESCE(is_seed, false) = false
       AND published_at >= current_date - (v_days - 1)
     GROUP BY 1
  )
  SELECT c.day,
         COALESCE(a.views, 0),
         COALESCE(a.likes, 0),
         COALESCE(a.saves, 0),
         COALESCE(a.items, 0)
    FROM cal c
    LEFT JOIN agg a ON a.day = c.day
   ORDER BY c.day ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.oculto_play_creator_daily(int) TO authenticated;

-- 3) Top items do criador ----------------------------------------------------
CREATE OR REPLACE FUNCTION public.oculto_play_creator_top(p_limit int DEFAULT 6)
RETURNS TABLE (
  id            uuid,
  kind          text,
  title         text,
  thumb_url     text,
  media_url     text,
  view_count    int,
  like_count    int,
  save_count    int,
  share_count   int,
  published_at  timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_author_id uuid;
BEGIN
  IF NOT public.can_access_oculto_play() THEN RETURN; END IF;

  SELECT p.id INTO v_author_id
    FROM public.profiles p
   WHERE p.user_id = auth.uid()
   LIMIT 1;

  IF v_author_id IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT i.id, i.kind::text, i.title, i.thumb_url, i.media_url,
         i.view_count, i.like_count, i.save_count, i.share_count,
         i.published_at
    FROM public.oculto_play_items i
   WHERE i.author_id = v_author_id
     AND i.is_published = true
     AND COALESCE(i.is_seed, false) = false
   ORDER BY i.view_count DESC NULLS LAST, i.published_at DESC
   LIMIT GREATEST(1, LEAST(p_limit, 30));
END;
$$;

GRANT EXECUTE ON FUNCTION public.oculto_play_creator_top(int) TO authenticated;

-- ============================================================================
-- FIM — Etapa 9
-- ============================================================================

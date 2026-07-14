-- =====================================================================
-- 2026_05_14_admin_stats_aggregated_rpc.sql
-- RPC agregada para o painel admin (estatísticas de posts).
-- Substitui o SELECT de até 5000 linhas por COUNT/SUM no banco.
-- 100% idempotente, SECURITY DEFINER (bypass RLS para agregar tudo),
-- restrito a admins via has_role / is_admin (com fallback gracioso).
-- =====================================================================

CREATE OR REPLACE FUNCTION public.admin_post_stats_aggregated()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_admin boolean := false;
  v_total bigint := 0;
  v_hidden bigint := 0;
  v_real_count bigint := 0;
  v_real_likes bigint := 0;
  v_real_comments bigint := 0;
  v_seed_count bigint := 0;
  v_seed_likes bigint := 0;
  v_seed_comments bigint := 0;
BEGIN
  -- Gate de admin (tenta múltiplas formas, sem quebrar se a função não existir)
  BEGIN
    SELECT public.has_role(v_uid, 'admin'::public.app_role) INTO v_is_admin;
  EXCEPTION WHEN OTHERS THEN
    v_is_admin := false;
  END;

  IF NOT v_is_admin THEN
    BEGIN
      SELECT public.is_admin(v_uid) INTO v_is_admin;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  IF NOT v_is_admin THEN
    -- fallback: ocultomaster
    SELECT EXISTS(
      SELECT 1 FROM public.profiles
      WHERE (user_id = v_uid OR id = v_uid)
        AND lower(coalesce(username,'')) = 'ocultomaster'
    ) INTO v_is_admin;
  END IF;

  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'access_denied' USING ERRCODE = '42501';
  END IF;

  -- Agregação única em uma passada
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE is_hidden = true),
    COUNT(*) FILTER (WHERE coalesce(is_seed, false) = false),
    COALESCE(SUM(likes_count)    FILTER (WHERE coalesce(is_seed, false) = false), 0),
    COALESCE(SUM(comments_count) FILTER (WHERE coalesce(is_seed, false) = false), 0),
    COUNT(*) FILTER (WHERE coalesce(is_seed, false) = true),
    COALESCE(SUM(likes_count)    FILTER (WHERE coalesce(is_seed, false) = true), 0),
    COALESCE(SUM(comments_count) FILTER (WHERE coalesce(is_seed, false) = true), 0)
  INTO
    v_total, v_hidden,
    v_real_count, v_real_likes, v_real_comments,
    v_seed_count, v_seed_likes, v_seed_comments
  FROM public.posts;

  RETURN jsonb_build_object(
    'total',  v_total,
    'hidden', v_hidden,
    'real',   jsonb_build_object(
                'count',         v_real_count,
                'totalLikes',    v_real_likes,
                'totalComments', v_real_comments
              ),
    'seed',   jsonb_build_object(
                'count',         v_seed_count,
                'totalLikes',    v_seed_likes,
                'totalComments', v_seed_comments
              )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_post_stats_aggregated() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_post_stats_aggregated() TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- AUDITORIA E CORREÇÃO DEFINITIVA — Explorar novos misteriosos(as)
-- Objetivo:
--   1) Consolidar a lista de perfis que DEVEM ser excluídos do carrossel
--   2) Reconciliar matches antigos entre looking_now_matches e oculto_discovery_likes
--   3) Garantir leitura estável via RPC única para o frontend
-- Idempotente.
-- ============================================================================

ALTER TABLE public.oculto_discovery_likes
  ADD COLUMN IF NOT EXISTS matched_at timestamptz;

ALTER TABLE public.oculto_discovery_likes
  ADD COLUMN IF NOT EXISTS match_id uuid;

CREATE INDEX IF NOT EXISTS idx_oculto_discovery_likes_pair_source_status
  ON public.oculto_discovery_likes (source, user_profile_id, target_profile_id, status);

DO $$
BEGIN
  IF to_regclass('public.looking_now_matches') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_looking_now_matches_pair_active_v2 ON public.looking_now_matches (user1_id, user2_id, is_expired)';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.reconcile_discovery_match_state_safe()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated integer := 0;
BEGIN
  IF to_regclass('public.oculto_discovery_likes') IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'oculto_discovery_likes_missing');
  END IF;

  IF to_regclass('public.looking_now_matches') IS NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'skipped', true,
      'reason', 'looking_now_matches_missing',
      'updated_rows', 0
    );
  END IF;

  EXECUTE $sql$
    WITH active_pairs AS (
      SELECT
        lnm.id AS match_id,
        lnm.user1_id,
        lnm.user2_id,
        lnm.matched_at,
        COALESCE(lnm.is_expired, false) AS is_expired
      FROM public.looking_now_matches lnm
    ), patched AS (
      UPDATE public.oculto_discovery_likes odl
         SET status = CASE WHEN ap.is_expired THEN 'cancelled' ELSE 'matched' END,
             match_id = ap.match_id,
             matched_at = CASE
               WHEN ap.is_expired THEN COALESCE(odl.matched_at, ap.matched_at, now())
               ELSE COALESCE(ap.matched_at, odl.matched_at, now())
             END
        FROM active_pairs ap
       WHERE odl.source = 'explorar_misteriosos'
         AND (
           (odl.user_profile_id = ap.user1_id AND odl.target_profile_id = ap.user2_id)
           OR
           (odl.user_profile_id = ap.user2_id AND odl.target_profile_id = ap.user1_id)
         )
         AND (
           odl.status IS DISTINCT FROM CASE WHEN ap.is_expired THEN 'cancelled' ELSE 'matched' END
           OR odl.match_id IS DISTINCT FROM ap.match_id
           OR (NOT ap.is_expired AND odl.matched_at IS NULL)
         )
      RETURNING 1
    )
    SELECT COUNT(*) FROM patched
  $sql$ INTO v_updated;

  RETURN jsonb_build_object(
    'ok', true,
    'skipped', false,
    'updated_rows', v_updated
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.discovery_excluded_profiles()
RETURNS TABLE (
  other_profile_id uuid,
  reason text,
  match_id uuid
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid := public._discovery_my_profile_id();
BEGIN
  IF v_me IS NULL THEN
    RETURN;
  END IF;

  PERFORM public.reconcile_discovery_match_state_safe();

  RETURN QUERY
  SELECT DISTINCT ON (x.other_profile_id)
    x.other_profile_id,
    x.reason,
    x.match_id
  FROM (
    SELECT DISTINCT
      CASE
        WHEN odl.user_profile_id = v_me THEN odl.target_profile_id
        ELSE odl.user_profile_id
      END AS other_profile_id,
      'discovery_like_matched'::text AS reason,
      odl.match_id
    FROM public.oculto_discovery_likes odl
    WHERE odl.source = 'explorar_misteriosos'
      AND odl.status = 'matched'
      AND (odl.user_profile_id = v_me OR odl.target_profile_id = v_me)

    UNION ALL

    SELECT DISTINCT
      CASE
        WHEN lnm.user1_id = v_me THEN lnm.user2_id
        ELSE lnm.user1_id
      END AS other_profile_id,
      'looking_now_match'::text AS reason,
      lnm.id AS match_id
    FROM public.looking_now_matches lnm
    WHERE to_regclass('public.looking_now_matches') IS NOT NULL
      AND COALESCE(lnm.is_expired, false) = false
      AND (lnm.user1_id = v_me OR lnm.user2_id = v_me)

    UNION ALL

    SELECT DISTINCT
      CASE
        WHEN lm.user_id = v_me THEN lm.matched_user_id
        ELSE lm.user_id
      END AS other_profile_id,
      'lucky_match'::text AS reason,
      NULL::uuid AS match_id
    FROM public.lucky_matches lm
    WHERE to_regclass('public.lucky_matches') IS NOT NULL
      AND (lm.user_id = v_me OR lm.matched_user_id = v_me)

    UNION ALL

    SELECT DISTINCT
      out_like.target_id AS other_profile_id,
      'perfect_pair_mutual'::text AS reason,
      NULL::uuid AS match_id
    FROM public.perfect_pairs out_like
    JOIN public.perfect_pairs in_like
      ON in_like.user_id = out_like.target_id
     AND in_like.target_id = out_like.user_id
     AND in_like.action = 'liked'
    WHERE to_regclass('public.perfect_pairs') IS NOT NULL
      AND out_like.user_id = v_me
      AND out_like.action = 'liked'
  ) AS x
  WHERE x.other_profile_id IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.discovery_excluded_profiles() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.discovery_excluded_profiles() TO authenticated;

SELECT public.reconcile_discovery_match_state_safe();

NOTIFY pgrst, 'reload schema';
-- ============================================================================
-- RECONCILIAÇÃO DEFINITIVA — Explorar novos misteriosos(as) x looking_now_matches
-- Projeto: Supabase EXTERNO (rvybbrkzmboqbhcemqar)
-- Objetivo:
--   1) Corrigir pares já matchados que continuaram aparecendo no carrossel
--   2) Sincronizar `oculto_discovery_likes` com `looking_now_matches`
--   3) Garantir que, se o match for desfeito, o card possa voltar a aparecer
-- Idempotente.
-- ============================================================================

ALTER TABLE public.oculto_discovery_likes
  ADD COLUMN IF NOT EXISTS matched_at timestamptz;

ALTER TABLE public.oculto_discovery_likes
  ADD COLUMN IF NOT EXISTS match_id uuid;

CREATE INDEX IF NOT EXISTS idx_oculto_discovery_likes_pair_source
  ON public.oculto_discovery_likes (source, user_profile_id, target_profile_id);

CREATE INDEX IF NOT EXISTS idx_looking_now_matches_pair_active
  ON public.looking_now_matches (user1_id, user2_id, is_expired);

CREATE OR REPLACE FUNCTION public.sync_discovery_likes_from_looking_now_matches()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.oculto_discovery_likes odl
     SET status = CASE WHEN COALESCE(NEW.is_expired, false) THEN 'cancelled' ELSE 'matched' END,
         match_id = NEW.id,
         matched_at = CASE
           WHEN COALESCE(NEW.is_expired, false) THEN COALESCE(odl.matched_at, NEW.matched_at, now())
           ELSE COALESCE(NEW.matched_at, odl.matched_at, now())
         END
   WHERE odl.source = 'explorar_misteriosos'
     AND (
       (odl.user_profile_id = NEW.user1_id AND odl.target_profile_id = NEW.user2_id)
       OR
       (odl.user_profile_id = NEW.user2_id AND odl.target_profile_id = NEW.user1_id)
     );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_discovery_likes_from_looking_now_matches ON public.looking_now_matches;

CREATE TRIGGER trg_sync_discovery_likes_from_looking_now_matches
AFTER INSERT OR UPDATE OF is_expired, matched_at, updated_at
ON public.looking_now_matches
FOR EACH ROW
EXECUTE FUNCTION public.sync_discovery_likes_from_looking_now_matches();

CREATE OR REPLACE FUNCTION public.reconcile_discovery_match_state()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated integer := 0;
BEGIN
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
  SELECT COUNT(*) INTO v_updated FROM patched;

  RETURN jsonb_build_object(
    'ok', true,
    'updated_rows', v_updated
  );
END;
$$;

SELECT public.reconcile_discovery_match_state();
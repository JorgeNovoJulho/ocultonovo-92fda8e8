
-- =====================================================
-- perfect_pair_actions: tabela canônica de interações
-- Substitui/complementa perfect_pairs para garantir
-- índice composto e lógica de upsert correta.
-- =====================================================

CREATE TABLE IF NOT EXISTS public.perfect_pair_actions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  target_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  action_type text NOT NULL CHECK (action_type IN ('like', 'dislike', 'super_like')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, target_id)
);

-- Índice composto primário para lookup instantâneo
CREATE INDEX IF NOT EXISTS idx_ppa_user_target
  ON public.perfect_pair_actions (user_id, target_id);

-- Índice para filtrar por action_type + updated_at (reciclagem de 10 dias)
CREATE INDEX IF NOT EXISTS idx_ppa_user_action_updated
  ON public.perfect_pair_actions (user_id, action_type, updated_at);

-- =====================================================
-- RLS
-- =====================================================
ALTER TABLE public.perfect_pair_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ppa_insert_own"
  ON public.perfect_pair_actions FOR INSERT
  WITH CHECK (
    auth.uid() = (SELECT user_id FROM profiles WHERE id = perfect_pair_actions.user_id)
  );

CREATE POLICY "ppa_select_own"
  ON public.perfect_pair_actions FOR SELECT
  USING (
    auth.uid() = (SELECT user_id FROM profiles WHERE id = perfect_pair_actions.user_id)
    OR
    auth.uid() = (SELECT user_id FROM profiles WHERE id = perfect_pair_actions.target_id)
  );

CREATE POLICY "ppa_update_own"
  ON public.perfect_pair_actions FOR UPDATE
  USING (
    auth.uid() = (SELECT user_id FROM profiles WHERE id = perfect_pair_actions.user_id)
  );

-- =====================================================
-- Trigger: atualiza updated_at automaticamente
-- Isso garante que um novo dislike reseta o ciclo de 10 dias
-- =====================================================
CREATE OR REPLACE FUNCTION public.ppa_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ppa_updated_at ON public.perfect_pair_actions;
CREATE TRIGGER trg_ppa_updated_at
  BEFORE INSERT OR UPDATE ON public.perfect_pair_actions
  FOR EACH ROW EXECUTE FUNCTION public.ppa_set_updated_at();

-- =====================================================
-- Sincroniza perfect_pairs existente → perfect_pair_actions
-- (migração de dados históricos, sem duplicatas)
-- =====================================================
INSERT INTO public.perfect_pair_actions (user_id, target_id, action_type, created_at, updated_at)
SELECT
  pp.user_id,
  pp.target_id,
  pp.action,
  pp.created_at,
  COALESCE(pp.rejected_at, pp.created_at)
FROM public.perfect_pairs pp
ON CONFLICT (user_id, target_id) DO UPDATE
  SET action_type = EXCLUDED.action_type,
      updated_at  = EXCLUDED.updated_at;

-- =====================================================
-- Recria get_perfect_pairs usando perfect_pair_actions
-- Lógica:
--   - Exclui action_type = 'like' ou 'super_like'  (definitivo)
--   - Exclui action_type = 'dislike' se updated_at > NOW() - 10 dias
--   - Perfis com dislike > 10 dias voltam (ciclo reiniciado pelo upsert)
-- =====================================================
DROP FUNCTION IF EXISTS public.get_perfect_pairs(UUID, INT, DOUBLE PRECISION, DOUBLE PRECISION);

CREATE OR REPLACE FUNCTION public.get_perfect_pairs(
  p_user_id    UUID,
  p_limit      INT             DEFAULT 10,
  p_viewer_lat DOUBLE PRECISION DEFAULT NULL,
  p_viewer_lng DOUBLE PRECISION DEFAULT NULL
)
RETURNS TABLE (
  id               UUID,
  name             TEXT,
  username         TEXT,
  avatar_url       TEXT,
  bio              TEXT,
  pair_bio         TEXT,
  plan_type        TEXT,
  tags_social      TEXT[],
  tags_adult       TEXT[],
  pair_photos      TEXT[],
  is_boosted       BOOLEAN,
  shared_tags      TEXT[],
  shared_tags_count INT,
  age              INT,
  distance_km      DOUBLE PRECISION
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_viewer_tags_social TEXT[];
  v_viewer_tags_adult  TEXT[];
  v_viewer_plan        TEXT;
  v_viewer_oculto      BOOLEAN;
BEGIN
  SELECT
    COALESCE(p.tags_social, ARRAY[]::TEXT[]),
    COALESCE(p.tags_adult,  ARRAY[]::TEXT[]),
    p.plan_type,
    COALESCE(p.is_oculto_verified, FALSE)
  INTO v_viewer_tags_social, v_viewer_tags_adult, v_viewer_plan, v_viewer_oculto
  FROM profiles p
  WHERE p.id = p_user_id;

  RETURN QUERY
  WITH viewer_all_tags AS (
    SELECT ARRAY(
      SELECT UNNEST(v_viewer_tags_social)
      UNION
      SELECT UNNEST(v_viewer_tags_adult)
    ) AS all_tags
  ),
  eligible AS (
    SELECT
      p.id,
      p.name,
      p.username,
      p.avatar_url,
      p.bio,
      p.pair_bio,
      p.plan_type,
      COALESCE(p.tags_social,  ARRAY[]::TEXT[]) AS tags_social,
      COALESCE(p.tags_adult,   ARRAY[]::TEXT[]) AS tags_adult,
      COALESCE(p.pair_photos,  ARRAY[]::TEXT[]) AS pair_photos,
      COALESCE(p.is_boosted,   FALSE)           AS is_boosted,
      p.location_lat,
      p.location_lng,
      p.birth_date,
      COALESCE(p.is_oculto_verified, FALSE) AS is_oculto_verified
    FROM profiles p
    WHERE
      p.id <> p_user_id
      AND COALESCE(p.is_test_account, FALSE) = FALSE
      AND COALESCE(p.is_seed,         FALSE) = FALSE
      AND COALESCE(p.is_invisible,    FALSE) = FALSE
      AND COALESCE(p.is_anonymized,   FALSE) = FALSE
      AND p.name IS NOT NULL
      -- Se o viewer é verificado, só exibe perfis verificados
      AND (
        v_viewer_oculto = FALSE
        OR COALESCE(p.is_oculto_verified, FALSE) = TRUE
      )
      -- Exclui via LEFT JOIN na tabela canônica perfect_pair_actions
      -- Regra 1: like/super_like → excluído permanentemente
      -- Regra 2: dislike → excluído por 10 dias a partir de updated_at
      AND NOT EXISTS (
        SELECT 1
        FROM perfect_pair_actions ppa
        WHERE ppa.user_id   = p_user_id
          AND ppa.target_id = p.id
          AND (
            ppa.action_type IN ('like', 'super_like')
            OR (
              ppa.action_type = 'dislike'
              AND ppa.updated_at > (NOW() - INTERVAL '10 days')
            )
          )
      )
  ),
  with_distance AS (
    SELECT
      e.*,
      CASE
        WHEN p_viewer_lat IS NOT NULL AND p_viewer_lng IS NOT NULL
             AND e.location_lat IS NOT NULL AND e.location_lng IS NOT NULL
        THEN ROUND(
          (6371 * 2 * ASIN(SQRT(
            POWER(SIN((e.location_lat - p_viewer_lat) * PI() / 180 / 2), 2) +
            COS(p_viewer_lat  * PI() / 180) *
            COS(e.location_lat * PI() / 180) *
            POWER(SIN((e.location_lng - p_viewer_lng) * PI() / 180 / 2), 2)
          )))::NUMERIC, 1
        )::DOUBLE PRECISION
        ELSE NULL
      END AS distance_km
    FROM eligible e
  ),
  with_affinity AS (
    SELECT
      d.*,
      ARRAY(
        SELECT t FROM UNNEST(d.tags_social || d.tags_adult) t
        WHERE t = ANY((SELECT all_tags FROM viewer_all_tags))
      ) AS shared_tags,
      EXTRACT(YEAR FROM AGE(CURRENT_DATE, d.birth_date))::INT AS age_calc
    FROM with_distance d
    WHERE (
      d.distance_km IS NULL
      OR d.distance_km <= 50
      OR p_viewer_lat IS NULL
    )
  )
  SELECT
    a.id,
    a.name::TEXT,
    a.username::TEXT,
    a.avatar_url::TEXT,
    a.bio::TEXT,
    a.pair_bio::TEXT,
    a.plan_type::TEXT,
    a.tags_social,
    a.tags_adult,
    a.pair_photos,
    a.is_boosted,
    a.shared_tags,
    COALESCE(array_length(a.shared_tags, 1), 0) AS shared_tags_count,
    a.age_calc AS age,
    a.distance_km
  FROM with_affinity a
  ORDER BY
    a.is_boosted DESC,
    (a.plan_type = 'vip') DESC,
    COALESCE(array_length(a.shared_tags, 1), 0) DESC,
    COALESCE(a.distance_km, 9999) ASC,
    RANDOM()
  LIMIT p_limit;
END;
$$;

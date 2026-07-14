-- =========================================================================
-- 2026_05_27 — Avaliações por estrelas + Depoimentos + Recomendações reais
-- Projeto: Supabase EXTERNO (rvybbrkzmboqbhcemqar)
-- Idempotente — pode rodar quantas vezes precisar
-- =========================================================================

-- 1) Colunas agregadas em profiles -----------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS rating_avg   numeric(3,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rating_count integer      NOT NULL DEFAULT 0;

-- 2) Ratings ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.oculto_profile_ratings (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rater_profile_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  target_profile_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  stars               smallint NOT NULL CHECK (stars BETWEEN 1 AND 5),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT oculto_profile_ratings_unique UNIQUE (rater_profile_id, target_profile_id),
  CONSTRAINT oculto_profile_ratings_no_self CHECK (rater_profile_id <> target_profile_id)
);
CREATE INDEX IF NOT EXISTS idx_oculto_ratings_target ON public.oculto_profile_ratings (target_profile_id);

GRANT SELECT ON public.oculto_profile_ratings TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.oculto_profile_ratings TO authenticated;
GRANT ALL ON public.oculto_profile_ratings TO service_role;
ALTER TABLE public.oculto_profile_ratings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ratings public read"   ON public.oculto_profile_ratings;
DROP POLICY IF EXISTS "ratings rater insert"  ON public.oculto_profile_ratings;
DROP POLICY IF EXISTS "ratings rater update"  ON public.oculto_profile_ratings;
DROP POLICY IF EXISTS "ratings rater delete"  ON public.oculto_profile_ratings;

CREATE POLICY "ratings public read" ON public.oculto_profile_ratings FOR SELECT USING (true);
CREATE POLICY "ratings rater insert" ON public.oculto_profile_ratings FOR INSERT TO authenticated
  WITH CHECK (rater_profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));
CREATE POLICY "ratings rater update" ON public.oculto_profile_ratings FOR UPDATE TO authenticated
  USING (rater_profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));
CREATE POLICY "ratings rater delete" ON public.oculto_profile_ratings FOR DELETE TO authenticated
  USING (rater_profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

-- Recalcula agregados de profiles
CREATE OR REPLACE FUNCTION public.oculto_recalc_profile_rating(p_target uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_avg numeric(3,2); v_count int;
BEGIN
  SELECT COALESCE(ROUND(AVG(stars)::numeric, 2), 0), COUNT(*)
    INTO v_avg, v_count
    FROM public.oculto_profile_ratings
   WHERE target_profile_id = p_target;
  UPDATE public.profiles
     SET rating_avg = v_avg, rating_count = v_count
   WHERE id = p_target;
END $$;

CREATE OR REPLACE FUNCTION public.oculto_ratings_after_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.oculto_recalc_profile_rating(OLD.target_profile_id);
    RETURN OLD;
  ELSE
    PERFORM public.oculto_recalc_profile_rating(NEW.target_profile_id);
    NEW.updated_at := now();
    RETURN NEW;
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_oculto_ratings_after_change ON public.oculto_profile_ratings;
CREATE TRIGGER trg_oculto_ratings_after_change
AFTER INSERT OR UPDATE OR DELETE ON public.oculto_profile_ratings
FOR EACH ROW EXECUTE FUNCTION public.oculto_ratings_after_change();

-- 3) Depoimentos -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.oculto_profile_testimonials (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_profile_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  target_profile_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content             text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 250),
  reply               text NULL CHECK (reply IS NULL OR char_length(reply) BETWEEN 1 AND 500),
  hearts              integer NOT NULL DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT oculto_testimonials_no_self CHECK (author_profile_id <> target_profile_id)
);
CREATE INDEX IF NOT EXISTS idx_oculto_testimonials_target ON public.oculto_profile_testimonials (target_profile_id, created_at DESC);

GRANT SELECT ON public.oculto_profile_testimonials TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.oculto_profile_testimonials TO authenticated;
GRANT ALL ON public.oculto_profile_testimonials TO service_role;
ALTER TABLE public.oculto_profile_testimonials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "testimonials public read"  ON public.oculto_profile_testimonials;
DROP POLICY IF EXISTS "testimonials author insert" ON public.oculto_profile_testimonials;
DROP POLICY IF EXISTS "testimonials target reply" ON public.oculto_profile_testimonials;
DROP POLICY IF EXISTS "testimonials delete"       ON public.oculto_profile_testimonials;

CREATE POLICY "testimonials public read" ON public.oculto_profile_testimonials FOR SELECT USING (true);
CREATE POLICY "testimonials author insert" ON public.oculto_profile_testimonials FOR INSERT TO authenticated
  WITH CHECK (author_profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));
-- target pode editar reply; author NÃO edita o próprio depoimento (mantém integridade pública)
CREATE POLICY "testimonials target reply" ON public.oculto_profile_testimonials FOR UPDATE TO authenticated
  USING (target_profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));
-- Delete: author (arrependeu) OU target (moderou)
CREATE POLICY "testimonials delete" ON public.oculto_profile_testimonials FOR DELETE TO authenticated
  USING (
    author_profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    OR target_profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  );

CREATE OR REPLACE FUNCTION public.oculto_testimonials_touch()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS trg_oculto_testimonials_touch ON public.oculto_profile_testimonials;
CREATE TRIGGER trg_oculto_testimonials_touch
BEFORE UPDATE ON public.oculto_profile_testimonials
FOR EACH ROW EXECUTE FUNCTION public.oculto_testimonials_touch();

-- 4) Hearts (corações) ----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.oculto_testimonial_hearts (
  testimonial_id  uuid NOT NULL REFERENCES public.oculto_profile_testimonials(id) ON DELETE CASCADE,
  profile_id      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (testimonial_id, profile_id)
);

GRANT SELECT ON public.oculto_testimonial_hearts TO anon;
GRANT SELECT, INSERT, DELETE ON public.oculto_testimonial_hearts TO authenticated;
GRANT ALL ON public.oculto_testimonial_hearts TO service_role;
ALTER TABLE public.oculto_testimonial_hearts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hearts public read" ON public.oculto_testimonial_hearts;
DROP POLICY IF EXISTS "hearts self insert" ON public.oculto_testimonial_hearts;
DROP POLICY IF EXISTS "hearts self delete" ON public.oculto_testimonial_hearts;

CREATE POLICY "hearts public read" ON public.oculto_testimonial_hearts FOR SELECT USING (true);
CREATE POLICY "hearts self insert" ON public.oculto_testimonial_hearts FOR INSERT TO authenticated
  WITH CHECK (profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));
CREATE POLICY "hearts self delete" ON public.oculto_testimonial_hearts FOR DELETE TO authenticated
  USING (profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.oculto_testimonial_hearts_sync()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; v_count int;
BEGIN
  v_id := COALESCE(NEW.testimonial_id, OLD.testimonial_id);
  SELECT COUNT(*) INTO v_count FROM public.oculto_testimonial_hearts WHERE testimonial_id = v_id;
  UPDATE public.oculto_profile_testimonials SET hearts = v_count WHERE id = v_id;
  RETURN COALESCE(NEW, OLD);
END $$;
DROP TRIGGER IF EXISTS trg_oculto_hearts_sync ON public.oculto_testimonial_hearts;
CREATE TRIGGER trg_oculto_hearts_sync
AFTER INSERT OR DELETE ON public.oculto_testimonial_hearts
FOR EACH ROW EXECUTE FUNCTION public.oculto_testimonial_hearts_sync();

-- 5) Recomendações "real" -------------------------------------------------
CREATE TABLE IF NOT EXISTS public.oculto_real_recommendations (
  recommender_profile_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  target_profile_id       uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at              timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (recommender_profile_id, target_profile_id),
  CONSTRAINT oculto_real_no_self CHECK (recommender_profile_id <> target_profile_id)
);
CREATE INDEX IF NOT EXISTS idx_oculto_real_target ON public.oculto_real_recommendations (target_profile_id);

GRANT SELECT ON public.oculto_real_recommendations TO anon;
GRANT SELECT, INSERT, DELETE ON public.oculto_real_recommendations TO authenticated;
GRANT ALL ON public.oculto_real_recommendations TO service_role;
ALTER TABLE public.oculto_real_recommendations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "real public read"  ON public.oculto_real_recommendations;
DROP POLICY IF EXISTS "real self insert"  ON public.oculto_real_recommendations;
DROP POLICY IF EXISTS "real self delete"  ON public.oculto_real_recommendations;
CREATE POLICY "real public read" ON public.oculto_real_recommendations FOR SELECT USING (true);
CREATE POLICY "real self insert" ON public.oculto_real_recommendations FOR INSERT TO authenticated
  WITH CHECK (recommender_profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));
CREATE POLICY "real self delete" ON public.oculto_real_recommendations FOR DELETE TO authenticated
  USING (recommender_profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

-- 6) Realtime --------------------------------------------------------------
DO $$
BEGIN
  PERFORM 1;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.oculto_profile_testimonials;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.oculto_testimonial_hearts;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

-- =====================================================================
-- OCULTO PLAY — gêneros personalizados +18 (catálogo separado)
-- Idempotente. Rode no SQL Editor do Supabase EXTERNO.
-- =====================================================================

ALTER TABLE public.oculto_play_movie_genres
  ADD COLUMN IF NOT EXISTS is_adult boolean NOT NULL DEFAULT false;

-- Slug agora é único POR variante (normal/adult). Removemos o UNIQUE antigo
-- (se existir) e criamos um índice composto idempotente.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.oculto_play_movie_genres'::regclass
       AND conname  = 'oculto_play_movie_genres_slug_key'
  ) THEN
    EXECUTE 'ALTER TABLE public.oculto_play_movie_genres DROP CONSTRAINT oculto_play_movie_genres_slug_key';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS oculto_play_movie_genres_slug_variant_uk
  ON public.oculto_play_movie_genres (slug, is_adult);

CREATE INDEX IF NOT EXISTS oculto_play_movie_genres_adult_idx
  ON public.oculto_play_movie_genres (is_adult);

CREATE OR REPLACE FUNCTION public.oculto_play_upsert_movie_genre_v2(
  p_name text,
  p_is_adult boolean DEFAULT false
)
RETURNS public.oculto_play_movie_genres
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid  uuid := auth.uid();
  v_name text;
  v_slug text;
  v_row  public.oculto_play_movie_genres;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth_required' USING ERRCODE = '28000';
  END IF;

  v_name := btrim(coalesce(p_name, ''));
  IF length(v_name) = 0 OR length(v_name) > 24 THEN
    RAISE EXCEPTION 'invalid_name' USING ERRCODE = '22023';
  END IF;

  BEGIN
    v_slug := lower(regexp_replace(unaccent(v_name), '[^a-zA-Z0-9]+', '-', 'g'));
  EXCEPTION WHEN undefined_function THEN
    v_slug := lower(regexp_replace(v_name, '[^a-zA-Z0-9]+', '-', 'g'));
  END;
  v_slug := btrim(v_slug, '-');
  IF length(v_slug) = 0 THEN v_slug := lower(v_name); END IF;

  INSERT INTO public.oculto_play_movie_genres (name, slug, created_by, is_adult)
  VALUES (v_name, v_slug, v_uid, coalesce(p_is_adult, false))
  ON CONFLICT (slug, is_adult) DO UPDATE
    SET usage_count = public.oculto_play_movie_genres.usage_count + 1,
        updated_at  = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.oculto_play_upsert_movie_genre_v2(text, boolean)
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

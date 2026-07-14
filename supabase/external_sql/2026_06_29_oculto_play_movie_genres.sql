-- =====================================================================
-- OCULTO PLAY — Catálogo global de gêneros personalizados para FILMES (links)
-- Idempotente. Rodar no SQL Editor do Supabase EXTERNO.
--
-- Permite que usuários adicionem novos gêneros (ex.: "Luta", "Suspense")
-- que ficam salvos no banco e aparecem para TODOS em futuras publicações
-- e edições. Os gêneros fixos (Ação, Ficção, etc.) continuam no front.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.oculto_play_movie_genres (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,
  slug         text NOT NULL UNIQUE,
  usage_count  integer NOT NULL DEFAULT 1,
  created_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS oculto_play_movie_genres_name_idx
  ON public.oculto_play_movie_genres (lower(name));

GRANT SELECT ON public.oculto_play_movie_genres TO anon, authenticated;
GRANT ALL    ON public.oculto_play_movie_genres TO service_role;

ALTER TABLE public.oculto_play_movie_genres ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS movie_genres_read_all ON public.oculto_play_movie_genres;
CREATE POLICY movie_genres_read_all
  ON public.oculto_play_movie_genres
  FOR SELECT
  USING (true);

-- Escrita somente via RPC SECURITY DEFINER abaixo.

CREATE OR REPLACE FUNCTION public.oculto_play_upsert_movie_genre(p_name text)
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

  v_slug := lower(regexp_replace(unaccent(v_name), '[^a-zA-Z0-9]+', '-', 'g'));
  v_slug := btrim(v_slug, '-');
  IF length(v_slug) = 0 THEN v_slug := lower(v_name); END IF;

  INSERT INTO public.oculto_play_movie_genres (name, slug, created_by)
  VALUES (v_name, v_slug, v_uid)
  ON CONFLICT (slug) DO UPDATE
    SET usage_count = public.oculto_play_movie_genres.usage_count + 1,
        updated_at  = now()
  RETURNING * INTO v_row;

  RETURN v_row;
EXCEPTION WHEN undefined_function THEN
  -- fallback se extensão unaccent não estiver instalada
  v_slug := lower(regexp_replace(v_name, '[^a-zA-Z0-9]+', '-', 'g'));
  v_slug := btrim(v_slug, '-');
  IF length(v_slug) = 0 THEN v_slug := lower(v_name); END IF;
  INSERT INTO public.oculto_play_movie_genres (name, slug, created_by)
  VALUES (v_name, v_slug, v_uid)
  ON CONFLICT (slug) DO UPDATE
    SET usage_count = public.oculto_play_movie_genres.usage_count + 1,
        updated_at  = now()
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.oculto_play_upsert_movie_genre(text)
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

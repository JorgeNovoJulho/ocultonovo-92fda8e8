-- ============================================================================
-- SLIDE GUIDES — Customização do "Saiba mais" por card (admin master)
-- Tabela isolada `oculto_slide_guides` armazena overrides do conteúdo do modal
-- por slug. Frontend faz merge com fallback hard-coded.
-- 100% idempotente.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.oculto_slide_guides (
  slug          text PRIMARY KEY,
  title         text,
  intro         text,
  steps         jsonb NOT NULL DEFAULT '[]'::jsonb,
  tip           text,
  faq           jsonb NOT NULL DEFAULT '[]'::jsonb,
  cta_label     text,
  cta_route     text,
  is_published  boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.oculto_slide_guides ENABLE ROW LEVEL SECURITY;

-- Leitura pública (somente publicados)
DROP POLICY IF EXISTS "slide_guides_read_published" ON public.oculto_slide_guides;
CREATE POLICY "slide_guides_read_published"
  ON public.oculto_slide_guides FOR SELECT
  USING (is_published = true);

-- Escrita: somente via RPC SECURITY DEFINER (sem policy direta)

-- ----------------------------------------------------------------------------
-- RPC: slide_guide_get(p_slug) → JSON com guide ou null
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.slide_guide_get(p_slug text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT to_jsonb(g) FROM public.oculto_slide_guides g
  WHERE g.slug = p_slug AND g.is_published = true
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.slide_guide_get(text) TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- RPC: slide_guides_list_admin() → lista completa (master only)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.slide_guides_list_admin()
RETURNS SETOF public.oculto_slide_guides
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_master boolean;
BEGIN
  SELECT COALESCE(p.is_master_admin, false) INTO v_is_master
    FROM public.profiles p WHERE p.user_id = auth.uid();
  IF NOT COALESCE(v_is_master, false) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY SELECT * FROM public.oculto_slide_guides ORDER BY slug ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.slide_guides_list_admin() TO authenticated;

-- ----------------------------------------------------------------------------
-- RPC: slide_guide_upsert(...) — master only
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.slide_guide_upsert(
  p_slug         text,
  p_title        text DEFAULT NULL,
  p_intro        text DEFAULT NULL,
  p_steps        jsonb DEFAULT '[]'::jsonb,
  p_tip          text DEFAULT NULL,
  p_faq          jsonb DEFAULT '[]'::jsonb,
  p_cta_label    text DEFAULT NULL,
  p_cta_route    text DEFAULT NULL,
  p_is_published boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_master boolean;
  v_row public.oculto_slide_guides;
BEGIN
  SELECT COALESCE(p.is_master_admin, false) INTO v_is_master
    FROM public.profiles p WHERE p.user_id = auth.uid();
  IF NOT COALESCE(v_is_master, false) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF p_slug IS NULL OR length(trim(p_slug)) = 0 THEN
    RAISE EXCEPTION 'slug obrigatório';
  END IF;

  INSERT INTO public.oculto_slide_guides
    (slug, title, intro, steps, tip, faq, cta_label, cta_route, is_published, updated_at)
  VALUES
    (p_slug, p_title, p_intro,
     COALESCE(p_steps, '[]'::jsonb), p_tip,
     COALESCE(p_faq, '[]'::jsonb),
     p_cta_label, p_cta_route, COALESCE(p_is_published, true), now())
  ON CONFLICT (slug) DO UPDATE
    SET title = EXCLUDED.title,
        intro = EXCLUDED.intro,
        steps = EXCLUDED.steps,
        tip   = EXCLUDED.tip,
        faq   = EXCLUDED.faq,
        cta_label    = EXCLUDED.cta_label,
        cta_route    = EXCLUDED.cta_route,
        is_published = EXCLUDED.is_published,
        updated_at   = now()
  RETURNING * INTO v_row;

  RETURN to_jsonb(v_row);
END;
$$;

GRANT EXECUTE ON FUNCTION public.slide_guide_upsert(text, text, text, jsonb, text, jsonb, text, text, boolean)
  TO authenticated;

-- ----------------------------------------------------------------------------
-- RPC: slide_guide_delete(p_slug) — master only
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.slide_guide_delete(p_slug text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_master boolean;
BEGIN
  SELECT COALESCE(p.is_master_admin, false) INTO v_is_master
    FROM public.profiles p WHERE p.user_id = auth.uid();
  IF NOT COALESCE(v_is_master, false) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  DELETE FROM public.oculto_slide_guides WHERE slug = p_slug;
  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.slide_guide_delete(text) TO authenticated;

-- Realtime (opcional — para painel admin refletir mudanças entre abas)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime'
      AND schemaname='public'
      AND tablename='oculto_slide_guides'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.oculto_slide_guides';
  END IF;
END $$;

ALTER TABLE public.oculto_slide_guides REPLICA IDENTITY FULL;

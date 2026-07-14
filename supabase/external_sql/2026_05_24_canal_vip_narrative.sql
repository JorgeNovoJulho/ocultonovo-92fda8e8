-- =====================================================================
-- Canal VIP — Conteúdo Narrativo (idempotente)
-- Cole no SQL Editor do Supabase EXTERNO (rvybbrkzmboqbhcemqar)
-- =====================================================================

-- 1) Campos narrativos opcionais em posts (sem quebrar nada existente)
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS section_type        TEXT,
  ADD COLUMN IF NOT EXISTS teaser              TEXT,
  ADD COLUMN IF NOT EXISTS subtitle            TEXT,
  ADD COLUMN IF NOT EXISTS series_id           UUID,
  ADD COLUMN IF NOT EXISTS series_title        TEXT,
  ADD COLUMN IF NOT EXISTS chapter_number      INTEGER,
  ADD COLUMN IF NOT EXISTS scheduled_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS read_time_minutes   INTEGER,
  ADD COLUMN IF NOT EXISTS narrative_status    TEXT DEFAULT 'published',
  ADD COLUMN IF NOT EXISTS content_format      TEXT DEFAULT 'media';

CREATE INDEX IF NOT EXISTS idx_posts_section_type ON public.posts(section_type);
CREATE INDEX IF NOT EXISTS idx_posts_series_id    ON public.posts(series_id);
CREATE INDEX IF NOT EXISTS idx_posts_content_format ON public.posts(content_format);

-- 2) Validação via trigger (sem CHECK rígido — regra do projeto)
CREATE OR REPLACE FUNCTION public.tg_validate_post_section()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.section_type IS NOT NULL AND NEW.section_type NOT IN (
    'short_video','long_video','photo','photo_pack','video_pack','events','promo',
    'story','chapter','diary','article','series','text_post'
  ) THEN
    RAISE EXCEPTION 'section_type inválido: %', NEW.section_type;
  END IF;
  IF NEW.content_format IS NOT NULL AND NEW.content_format NOT IN ('media','narrative') THEN
    RAISE EXCEPTION 'content_format inválido: %', NEW.content_format;
  END IF;
  IF NEW.narrative_status IS NOT NULL AND NEW.narrative_status NOT IN ('draft','scheduled','published','archived') THEN
    RAISE EXCEPTION 'narrative_status inválido: %', NEW.narrative_status;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS validate_post_section ON public.posts;
CREATE TRIGGER validate_post_section
  BEFORE INSERT OR UPDATE ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.tg_validate_post_section();

-- 3) Tabela auxiliar de séries (apenas índice/capa — capítulos vivem em posts)
CREATE TABLE IF NOT EXISTS public.creator_content_series (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id  UUID NOT NULL,
  title       TEXT NOT NULL,
  description TEXT,
  cover_url   TEXT,
  status      TEXT DEFAULT 'active',
  sort_order  INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ccs_creator ON public.creator_content_series(creator_id);

ALTER TABLE public.creator_content_series ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='ccs_public_read') THEN
    CREATE POLICY ccs_public_read ON public.creator_content_series
      FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='ccs_owner_manage') THEN
    CREATE POLICY ccs_owner_manage ON public.creator_content_series
      FOR ALL
      USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = creator_id AND p.user_id = auth.uid()))
      WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = creator_id AND p.user_id = auth.uid()));
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

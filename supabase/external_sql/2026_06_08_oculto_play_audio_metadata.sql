-- ============================================================
-- OCULTO PLAY — Metadados de áudio (gênero, compositor, IA)
-- Idempotente · Rodar no SQL Editor do Supabase EXTERNO
-- ============================================================

-- 1) Colunas extras no item
ALTER TABLE public.oculto_play_items
  ADD COLUMN IF NOT EXISTS composer_name text,
  ADD COLUMN IF NOT EXISTS ai_tool       text,
  ADD COLUMN IF NOT EXISTS genre_tags    text[] NOT NULL DEFAULT '{}'::text[];

-- 2) Catálogo global de tags de áudio (gênero / IA), compartilhado entre todos
CREATE TABLE IF NOT EXISTS public.oculto_play_audio_tags (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,
  slug         text NOT NULL,
  kind         text NOT NULL CHECK (kind IN ('genre','ai')),
  usage_count  integer NOT NULL DEFAULT 0,
  is_preset    boolean NOT NULL DEFAULT false,
  created_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, slug)
);

GRANT SELECT ON public.oculto_play_audio_tags TO anon, authenticated;
GRANT ALL    ON public.oculto_play_audio_tags TO service_role;

ALTER TABLE public.oculto_play_audio_tags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audio_tags_select_all" ON public.oculto_play_audio_tags;
CREATE POLICY "audio_tags_select_all"
  ON public.oculto_play_audio_tags FOR SELECT
  TO anon, authenticated
  USING (true);

-- Inserção somente via RPC (security definer), não direto
DROP POLICY IF EXISTS "audio_tags_insert_authenticated" ON public.oculto_play_audio_tags;
CREATE POLICY "audio_tags_insert_authenticated"
  ON public.oculto_play_audio_tags FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

-- 3) Seed dos presets (gêneros + IAs conhecidas)
INSERT INTO public.oculto_play_audio_tags (name, slug, kind, is_preset) VALUES
  ('Rock','rock','genre',true),
  ('Heavy Metal','heavy-metal','genre',true),
  ('Doom Gothic','doom-gothic','genre',true),
  ('DarkSynth','darksynth','genre',true),
  ('DarkCountry','darkcountry','genre',true),
  ('Nu Metal','nu-metal','genre',true),
  ('Eletrônico','eletronico','genre',true),
  ('Cyberpunk','cyberpunk','genre',true),
  ('Balada Pop','balada-pop','genre',true),
  ('Romântico','romantico','genre',true),
  ('Sertanejo','sertanejo','genre',true),
  ('Retrowave','retrowave','genre',true),
  ('Synthwave','synthwave','genre',true),
  ('AOR','aor','genre',true),
  ('Suno','suno','ai',true),
  ('Udio','udio','ai',true),
  ('Riffusion','riffusion','ai',true),
  ('Stable Audio','stable-audio','ai',true),
  ('AIVA','aiva','ai',true),
  ('Soundraw','soundraw','ai',true),
  ('Mubert','mubert','ai',true),
  ('Boomy','boomy','ai',true),
  ('MusicLM','musiclm','ai',true),
  ('ElevenLabs Music','elevenlabs-music','ai',true)
ON CONFLICT (kind, slug) DO NOTHING;

-- 4) Helper: slugify simples
CREATE OR REPLACE FUNCTION public.oculto_play_slugify(p_text text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT trim(both '-' from
    regexp_replace(
      regexp_replace(
        lower(unaccent(coalesce(p_text,''))),
        '[^a-z0-9]+', '-', 'g'
      ),
      '-+', '-', 'g'
    )
  );
$$;

-- 5) RPC para criar/obter tag (qualquer usuário autenticado adiciona)
CREATE OR REPLACE FUNCTION public.oculto_play_upsert_audio_tag(
  p_name text,
  p_kind text
)
RETURNS public.oculto_play_audio_tags
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slug text;
  v_row  public.oculto_play_audio_tags;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'auth_required' USING ERRCODE = '28000';
  END IF;
  IF p_kind NOT IN ('genre','ai') THEN
    RAISE EXCEPTION 'invalid_kind' USING ERRCODE = '22023';
  END IF;
  IF p_name IS NULL OR length(trim(p_name)) < 2 THEN
    RAISE EXCEPTION 'invalid_name' USING ERRCODE = '22023';
  END IF;

  v_slug := public.oculto_play_slugify(p_name);
  IF v_slug = '' THEN
    RAISE EXCEPTION 'invalid_name' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_row FROM public.oculto_play_audio_tags
   WHERE kind = p_kind AND slug = v_slug;

  IF NOT FOUND THEN
    INSERT INTO public.oculto_play_audio_tags (name, slug, kind, created_by)
    VALUES (trim(p_name), v_slug, p_kind, auth.uid())
    RETURNING * INTO v_row;
  END IF;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.oculto_play_upsert_audio_tag(text,text)
  TO authenticated, service_role;

-- 6) RPC para incrementar uso (chamado quando o áudio é publicado)
CREATE OR REPLACE FUNCTION public.oculto_play_bump_audio_tags(
  p_kind text,
  p_slugs text[]
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.oculto_play_audio_tags
     SET usage_count = usage_count + 1
   WHERE kind = p_kind
     AND slug = ANY(p_slugs);
$$;

GRANT EXECUTE ON FUNCTION public.oculto_play_bump_audio_tags(text,text[])
  TO authenticated, service_role;

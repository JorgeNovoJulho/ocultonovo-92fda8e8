-- ============================================================
-- COMMUNITIES — Parte 15: Sub-fóruns / Canais
-- Rodar no SQL Editor do Supabase EXTERNO (rvybbrkzmboqbhcemqar)
-- 100% idempotente.
-- ============================================================

-- ───────────────────────────────────────────────────────────
-- 1) Tabela de canais (sub-fóruns) por comunidade
-- ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.oculto_community_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL REFERENCES public.oculto_communities(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  description text,
  position int NOT NULL DEFAULT 0,
  is_archived boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (community_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_oculto_community_channels_community
  ON public.oculto_community_channels(community_id, position, created_at);

GRANT SELECT ON public.oculto_community_channels TO authenticated, anon;
GRANT ALL ON public.oculto_community_channels TO service_role;

ALTER TABLE public.oculto_community_channels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "channels select all" ON public.oculto_community_channels;
CREATE POLICY "channels select all"
  ON public.oculto_community_channels FOR SELECT
  USING (true);

-- Inserts/updates/deletes só via RPC SECURITY DEFINER (não exponho INSERT direto).

-- ───────────────────────────────────────────────────────────
-- 2) Coluna channel_id em tópicos (nullable, FK ON DELETE SET NULL)
-- ───────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'oculto_community_topics'
      AND column_name = 'channel_id'
  ) THEN
    ALTER TABLE public.oculto_community_topics
      ADD COLUMN channel_id uuid REFERENCES public.oculto_community_channels(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_oculto_community_topics_channel
      ON public.oculto_community_topics(community_id, channel_id, last_reply_at DESC);
  END IF;
END $$;

-- ───────────────────────────────────────────────────────────
-- 3) RPC: criar / atualizar canal (owner/mod ou master)
-- ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.community_channel_upsert(
  _community uuid,
  _id uuid,
  _name text,
  _slug text DEFAULT NULL,
  _description text DEFAULT NULL,
  _position int DEFAULT NULL,
  _is_archived boolean DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_can boolean := false;
  v_slug text;
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  IF _community IS NULL OR coalesce(trim(_name), '') = '' THEN
    RAISE EXCEPTION 'invalid_input';
  END IF;

  -- master bypass
  BEGIN
    v_can := public.oculto_is_master(v_uid);
  EXCEPTION WHEN OTHERS THEN v_can := false; END;

  IF NOT v_can THEN
    SELECT true INTO v_can
    FROM public.oculto_community_members m
    WHERE m.community_id = _community
      AND m.user_id = v_uid
      AND COALESCE(m.status, 'active') = 'active'
      AND m.role IN ('owner', 'moderator')
    LIMIT 1;
  END IF;

  IF NOT COALESCE(v_can, false) THEN RAISE EXCEPTION 'forbidden'; END IF;

  v_slug := COALESCE(
    NULLIF(regexp_replace(lower(coalesce(_slug, _name)), '[^a-z0-9]+', '-', 'g'), ''),
    'canal'
  );
  v_slug := regexp_replace(v_slug, '^-+|-+$', '', 'g');
  IF length(v_slug) > 40 THEN v_slug := substr(v_slug, 1, 40); END IF;

  IF _id IS NULL THEN
    INSERT INTO public.oculto_community_channels
      (community_id, name, slug, description, position, is_archived, created_by)
    VALUES (
      _community,
      substr(trim(_name), 1, 40),
      v_slug,
      NULLIF(trim(coalesce(_description, '')), ''),
      COALESCE(_position, (SELECT COALESCE(MAX(position), 0) + 1 FROM public.oculto_community_channels WHERE community_id = _community)),
      COALESCE(_is_archived, false),
      v_uid
    )
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.oculto_community_channels SET
      name = substr(trim(_name), 1, 40),
      slug = v_slug,
      description = NULLIF(trim(coalesce(_description, '')), ''),
      position = COALESCE(_position, position),
      is_archived = COALESCE(_is_archived, is_archived),
      updated_at = now()
    WHERE id = _id AND community_id = _community
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  END IF;

  RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION public.community_channel_upsert(uuid, uuid, text, text, text, int, boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.community_channel_upsert(uuid, uuid, text, text, text, int, boolean) TO authenticated;

-- ───────────────────────────────────────────────────────────
-- 4) RPC: deletar canal (tópicos ficam com channel_id NULL)
-- ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.community_channel_delete(_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_community uuid;
  v_can boolean := false;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  SELECT community_id INTO v_community FROM public.oculto_community_channels WHERE id = _id;
  IF v_community IS NULL THEN RETURN false; END IF;

  BEGIN
    v_can := public.oculto_is_master(v_uid);
  EXCEPTION WHEN OTHERS THEN v_can := false; END;

  IF NOT v_can THEN
    SELECT true INTO v_can
    FROM public.oculto_community_members m
    WHERE m.community_id = v_community
      AND m.user_id = v_uid
      AND COALESCE(m.status, 'active') = 'active'
      AND m.role IN ('owner', 'moderator')
    LIMIT 1;
  END IF;

  IF NOT COALESCE(v_can, false) THEN RAISE EXCEPTION 'forbidden'; END IF;

  DELETE FROM public.oculto_community_channels WHERE id = _id;
  RETURN true;
END $$;

REVOKE ALL ON FUNCTION public.community_channel_delete(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.community_channel_delete(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';

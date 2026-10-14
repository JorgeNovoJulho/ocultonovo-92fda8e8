-- ============================================================
-- Canais Play · FASE 1 — canais de vídeo/áudio para todos os usuários.
-- Idempotente · Rodar no SQL Editor do Supabase EXTERNO.
--
-- O que faz:
--  1. Tabela public.oculto_play_channels (nome e endereço próprios).
--  2. Itens do Play ganham channel_id e content_origin (original/ia/licença).
--  3. Regras no SERVIDOR (gatilho): publicar só no próprio canal, canal do
--     tipo certo (áudio x vídeo), +18 só para perfis verificados, seções
--     "Hoje no Oculto"/"Volte para Ver" e Desafios só para o master.
--  4. Funções: criar/editar canal, buscar por endereço, faixa de canais por
--     seção, meus canais, canais de um perfil.
--  5. Cria os canais "Oculto Oficial" (vídeo e áudio) do master e liga todo
--     o conteúdo atual a eles.
-- ============================================================

-- ---------- 1. Tabela ----------
CREATE TABLE IF NOT EXISTS public.oculto_play_channels (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id         uuid NOT NULL,              -- auth.users.id do dono
  profile_id       uuid,                       -- profiles.id do dono
  kind             text NOT NULL CHECK (kind IN ('video','audio')),
  name             text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 2 AND 60),
  slug             text NOT NULL,
  description      text CHECK (description IS NULL OR char_length(description) <= 1000),
  avatar_url       text,
  banner_url       text,
  accent_color     text,
  is_official      boolean NOT NULL DEFAULT false,
  is_extra         boolean NOT NULL DEFAULT false,
  status           text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  subscriber_count integer NOT NULL DEFAULT 0,
  slug_changed_at  timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_play_channels_slug ON public.oculto_play_channels (lower(slug));
CREATE INDEX IF NOT EXISTS idx_play_channels_owner ON public.oculto_play_channels (owner_id, kind);

GRANT SELECT ON public.oculto_play_channels TO authenticated;
GRANT ALL ON public.oculto_play_channels TO service_role;
ALTER TABLE public.oculto_play_channels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "play_channels_select" ON public.oculto_play_channels;
CREATE POLICY "play_channels_select" ON public.oculto_play_channels
  FOR SELECT TO authenticated
  USING (status = 'active' OR owner_id = auth.uid() OR public.is_admin_master(auth.uid()));
-- Criação/edição só pelas funções abaixo (que validam limites e endereço).

-- ---------- 2. Colunas nos itens ----------
ALTER TABLE public.oculto_play_items ADD COLUMN IF NOT EXISTS channel_id uuid;
ALTER TABLE public.oculto_play_items ADD COLUMN IF NOT EXISTS content_origin text;
ALTER TABLE public.oculto_play_items ADD COLUMN IF NOT EXISTS ai_tool text;
ALTER TABLE public.oculto_play_items ADD COLUMN IF NOT EXISTS is_adult boolean DEFAULT false;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'oculto_play_items_channel_fk') THEN
    ALTER TABLE public.oculto_play_items
      ADD CONSTRAINT oculto_play_items_channel_fk FOREIGN KEY (channel_id)
      REFERENCES public.oculto_play_channels(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'oculto_play_items_origin_chk') THEN
    ALTER TABLE public.oculto_play_items
      ADD CONSTRAINT oculto_play_items_origin_chk
      CHECK (content_origin IS NULL OR content_origin IN ('original','ai','licensed'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_op_items_channel ON public.oculto_play_items (channel_id, published_at DESC);

-- ---------- 3. Funções auxiliares ----------
CREATE OR REPLACE FUNCTION public._play_is_verified(p_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = p_uid
      AND (COALESCE(p.is_verified, false) OR COALESCE(p.is_verified_couple, false))
  );
$$;

CREATE OR REPLACE FUNCTION public._play_channel_kind_for(p_item_kind text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN p_item_kind = 'audio' THEN 'audio' ELSE 'video' END;
$$;

CREATE OR REPLACE FUNCTION public._play_slugify(p_text text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT left(btrim(regexp_replace(
           translate(lower(COALESCE(p_text, '')),
                     'áàâãäåéèêëíìîïóòôõöúùûüçñý',
                     'aaaaaaeeeeiiiiooooouuuucny'),
           '[^a-z0-9]+', '-', 'g'), '-'), 40);
$$;

CREATE OR REPLACE FUNCTION public._play_slug_is_valid(p_slug text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT p_slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'
     AND p_slug NOT LIKE '%--%'
     AND p_slug NOT IN ('novo','nova','estudio','admin','api','play','canal','canais',
                        'oculto','oficial','oculto-oficial','oculto-oficial-audio',
                        'configuracoes','ajuda','suporte','master');
$$;

-- ---------- 4. Gatilho de regras nos itens ----------
CREATE OR REPLACE FUNCTION public._play_items_channel_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_master boolean;
  v_need   text := public._play_channel_kind_for(NEW.kind::text);
  v_owner  uuid;
  v_ch     public.oculto_play_channels%ROWTYPE;
BEGIN
  -- Rotinas do sistema (agendador, service role): não interferir.
  IF v_uid IS NULL THEN RETURN NEW; END IF;

  -- Atualizações que não mexem em canal/tipo/+18/seção (contadores, título…).
  IF TG_OP = 'UPDATE'
     AND NEW.channel_id IS NOT DISTINCT FROM OLD.channel_id
     AND NEW.is_adult   IS NOT DISTINCT FROM OLD.is_adult
     AND NEW.section    IS NOT DISTINCT FROM OLD.section
     AND NEW.kind       IS NOT DISTINCT FROM OLD.kind THEN
    RETURN NEW;
  END IF;

  v_master := public.is_admin_master(v_uid);
  SELECT p.user_id INTO v_owner FROM public.profiles p WHERE p.id = NEW.author_id LIMIT 1;

  IF NEW.channel_id IS NULL THEN
    SELECT * INTO v_ch FROM public.oculto_play_channels c
     WHERE c.owner_id = COALESCE(v_owner, v_uid) AND c.kind = v_need AND c.status = 'active'
     ORDER BY c.is_official DESC, c.is_extra ASC, c.created_at
     LIMIT 1;
    IF v_ch.id IS NULL THEN
      IF v_master THEN RETURN NEW; END IF;
      RAISE EXCEPTION 'Crie seu canal de % antes de publicar.',
        CASE v_need WHEN 'audio' THEN 'áudio' ELSE 'vídeo' END USING ERRCODE = 'P0001';
    END IF;
    NEW.channel_id := v_ch.id;
  ELSE
    SELECT * INTO v_ch FROM public.oculto_play_channels WHERE id = NEW.channel_id;
    IF v_ch.id IS NULL THEN
      RAISE EXCEPTION 'Canal não encontrado.' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF v_ch.kind <> v_need THEN
    RAISE EXCEPTION 'Este é um canal de %. Escolha um canal de % para este conteúdo.',
      CASE v_ch.kind WHEN 'audio' THEN 'áudio' ELSE 'vídeo' END,
      CASE v_need WHEN 'audio' THEN 'áudio' ELSE 'vídeo' END USING ERRCODE = 'P0001';
  END IF;

  IF NOT v_master THEN
    IF v_ch.owner_id <> v_uid THEN
      RAISE EXCEPTION 'Você só pode publicar nos seus próprios canais.' USING ERRCODE = 'P0001';
    END IF;
    IF v_ch.status <> 'active' THEN
      RAISE EXCEPTION 'Este canal está suspenso.' USING ERRCODE = 'P0001';
    END IF;
    IF COALESCE(NEW.is_adult, false) AND NOT public._play_is_verified(v_uid) THEN
      RAISE EXCEPTION 'Conteúdo +18 só pode ser publicado por perfis verificados.' USING ERRCODE = 'P0001';
    END IF;
    IF NEW.kind::text IN ('challenge', 'community_post') THEN
      RAISE EXCEPTION 'Este tipo de publicação é reservado à equipe Oculto.' USING ERRCODE = 'P0001';
    END IF;
    -- "Hoje no Oculto" / "Volte para Ver" são curadoria do master.
    IF NEW.section::text <> 'normal' THEN
      NEW.section := 'normal';
    END IF;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_play_items_channel_guard ON public.oculto_play_items;
CREATE TRIGGER trg_play_items_channel_guard
  BEFORE INSERT OR UPDATE ON public.oculto_play_items
  FOR EACH ROW EXECUTE FUNCTION public._play_items_channel_guard();

-- ---------- 5. Funções de canal ----------
CREATE OR REPLACE FUNCTION public.play_channel_create(
  p_kind text,
  p_name text,
  p_slug text DEFAULT NULL,
  p_description text DEFAULT NULL
)
RETURNS public.oculto_play_channels
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_master boolean;
  v_slug   text;
  v_pid    uuid;
  v_row    public.oculto_play_channels;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Faça login para criar um canal.' USING ERRCODE = 'P0001'; END IF;
  IF p_kind NOT IN ('video', 'audio') THEN RAISE EXCEPTION 'Tipo de canal inválido.' USING ERRCODE = 'P0001'; END IF;
  IF char_length(btrim(COALESCE(p_name, ''))) < 2 OR char_length(btrim(p_name)) > 60 THEN
    RAISE EXCEPTION 'O nome do canal precisa ter de 2 a 60 caracteres.' USING ERRCODE = 'P0001';
  END IF;
  v_master := public.is_admin_master(v_uid);

  IF NOT v_master AND NOT public.can_access_oculto_play() THEN
    RAISE EXCEPTION 'O Oculto Play ainda não está liberado para sua conta.' USING ERRCODE = 'P0001';
  END IF;

  IF NOT v_master AND EXISTS (
    SELECT 1 FROM public.oculto_play_channels WHERE owner_id = v_uid AND kind = p_kind
  ) THEN
    RAISE EXCEPTION 'Você já tem um canal de %. Canais extras chegam junto com a monetização.',
      CASE p_kind WHEN 'audio' THEN 'áudio' ELSE 'vídeo' END USING ERRCODE = 'P0001';
  END IF;

  v_slug := public._play_slugify(COALESCE(NULLIF(btrim(p_slug), ''), p_name));
  IF NOT public._play_slug_is_valid(v_slug) AND NOT (v_master AND v_slug ~ '^[a-z0-9-]{3,40}$') THEN
    RAISE EXCEPTION 'Endereço inválido: use de 3 a 40 letras, números ou hífens.' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM public.oculto_play_channels WHERE lower(slug) = v_slug) THEN
    RAISE EXCEPTION 'O endereço "%" já está em uso. Escolha outro.', v_slug USING ERRCODE = 'P0001';
  END IF;

  SELECT p.id INTO v_pid FROM public.profiles p WHERE p.user_id = v_uid ORDER BY p.created_at LIMIT 1;

  INSERT INTO public.oculto_play_channels (owner_id, profile_id, kind, name, slug, description)
  VALUES (v_uid, v_pid, p_kind, btrim(p_name), v_slug, NULLIF(btrim(COALESCE(p_description, '')), ''))
  RETURNING * INTO v_row;
  RETURN v_row;
END $$;

CREATE OR REPLACE FUNCTION public.play_channel_update(
  p_id uuid,
  p_name text DEFAULT NULL,
  p_slug text DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_avatar_url text DEFAULT NULL,
  p_banner_url text DEFAULT NULL,
  p_accent_color text DEFAULT NULL
)
RETURNS public.oculto_play_channels
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_master boolean;
  v_ch     public.oculto_play_channels;
  v_slug   text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Faça login.' USING ERRCODE = 'P0001'; END IF;
  v_master := public.is_admin_master(v_uid);
  SELECT * INTO v_ch FROM public.oculto_play_channels WHERE id = p_id FOR UPDATE;
  IF v_ch.id IS NULL THEN RAISE EXCEPTION 'Canal não encontrado.' USING ERRCODE = 'P0001'; END IF;
  IF v_ch.owner_id <> v_uid AND NOT v_master THEN
    RAISE EXCEPTION 'Só o dono pode editar este canal.' USING ERRCODE = 'P0001';
  END IF;

  IF p_name IS NOT NULL AND (char_length(btrim(p_name)) < 2 OR char_length(btrim(p_name)) > 60) THEN
    RAISE EXCEPTION 'O nome do canal precisa ter de 2 a 60 caracteres.' USING ERRCODE = 'P0001';
  END IF;

  IF p_slug IS NOT NULL THEN
    v_slug := public._play_slugify(p_slug);
    IF v_slug <> lower(v_ch.slug) THEN
      IF NOT public._play_slug_is_valid(v_slug) AND NOT v_master THEN
        RAISE EXCEPTION 'Endereço inválido: use de 3 a 40 letras, números ou hífens.' USING ERRCODE = 'P0001';
      END IF;
      IF NOT v_master AND v_ch.slug_changed_at IS NOT NULL AND v_ch.slug_changed_at > now() - interval '30 days' THEN
        RAISE EXCEPTION 'O endereço só pode ser trocado a cada 30 dias (próxima troca em %).',
          to_char(v_ch.slug_changed_at + interval '30 days', 'DD/MM/YYYY') USING ERRCODE = 'P0001';
      END IF;
      IF EXISTS (SELECT 1 FROM public.oculto_play_channels WHERE lower(slug) = v_slug AND id <> p_id) THEN
        RAISE EXCEPTION 'O endereço "%" já está em uso. Escolha outro.', v_slug USING ERRCODE = 'P0001';
      END IF;
    ELSE
      v_slug := NULL;
    END IF;
  END IF;

  UPDATE public.oculto_play_channels SET
    name            = COALESCE(NULLIF(btrim(p_name), ''), name),
    slug            = COALESCE(v_slug, slug),
    slug_changed_at = CASE WHEN v_slug IS NOT NULL THEN now() ELSE slug_changed_at END,
    description     = CASE WHEN p_description IS NULL THEN description ELSE NULLIF(btrim(p_description), '') END,
    avatar_url      = CASE WHEN p_avatar_url IS NULL THEN avatar_url ELSE NULLIF(btrim(p_avatar_url), '') END,
    banner_url      = CASE WHEN p_banner_url IS NULL THEN banner_url ELSE NULLIF(btrim(p_banner_url), '') END,
    accent_color    = CASE WHEN p_accent_color IS NULL THEN accent_color ELSE NULLIF(btrim(p_accent_color), '') END,
    updated_at      = now()
  WHERE id = p_id
  RETURNING * INTO v_ch;
  RETURN v_ch;
END $$;

-- Canal por endereço, com dados do dono e contagens por aba.
DROP FUNCTION IF EXISTS public.play_channel_by_slug(text);
CREATE OR REPLACE FUNCTION public.play_channel_by_slug(p_slug text)
RETURNS TABLE (
  id uuid, owner_id uuid, profile_id uuid, kind text, name text, slug text,
  description text, avatar_url text, banner_url text, accent_color text,
  is_official boolean, status text, subscriber_count integer, created_at timestamptz,
  slug_changed_at timestamptz,
  owner_username text, owner_avatar_url text, owner_is_verified boolean,
  items_total integer, shorts_count integer, links_count integer, memes_count integer,
  adult_count integer, audio_count integer, views_total bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.id, c.owner_id, c.profile_id, c.kind, c.name, c.slug,
         c.description, c.avatar_url, c.banner_url, c.accent_color,
         c.is_official, c.status, c.subscriber_count, c.created_at, c.slug_changed_at,
         pr.username::text, pr.avatar_url::text,
         (COALESCE(pr.is_verified, false) OR COALESCE(pr.is_verified_couple, false)),
         COALESCE(s.total, 0), COALESCE(s.shorts, 0), COALESCE(s.links, 0), COALESCE(s.memes, 0),
         COALESCE(s.adult, 0), COALESCE(s.audio, 0), COALESCE(s.views, 0)
  FROM public.oculto_play_channels c
  LEFT JOIN LATERAL (
    SELECT p.* FROM public.profiles p
    WHERE p.id = c.profile_id OR p.user_id = c.owner_id
    ORDER BY (p.id = c.profile_id) DESC, p.created_at
    LIMIT 1
  ) pr ON true
  LEFT JOIN LATERAL (
    SELECT
      count(*)::int AS total,
      count(*) FILTER (WHERE i.kind::text IN ('short_video','vip_teaser') AND NOT COALESCE(i.is_adult, false))::int AS shorts,
      count(*) FILTER (WHERE i.kind::text = 'link' AND NOT COALESCE(i.is_adult, false))::int AS links,
      count(*) FILTER (WHERE i.kind::text = 'meme' AND NOT COALESCE(i.is_adult, false))::int AS memes,
      count(*) FILTER (WHERE COALESCE(i.is_adult, false))::int AS adult,
      count(*) FILTER (WHERE i.kind::text = 'audio')::int AS audio,
      COALESCE(sum(i.view_count), 0)::bigint AS views
    FROM public.oculto_play_items i
    WHERE i.channel_id = c.id AND i.is_published = true
      AND (i.expires_at IS NULL OR i.expires_at > now())
  ) s ON true
  WHERE auth.uid() IS NOT NULL
    AND lower(c.slug) = lower(btrim(p_slug))
    AND (c.status = 'active' OR c.owner_id = auth.uid() OR public.is_admin_master(auth.uid()));
$$;

-- Faixa "Canais" dentro de cada seção do Play.
-- p_section: 'shorts' | 'links' | 'links_adult' | 'memes' | 'audio' | NULL (qualquer)
DROP FUNCTION IF EXISTS public.play_channels_strip(text, integer);
CREATE OR REPLACE FUNCTION public.play_channels_strip(p_section text DEFAULT NULL, p_limit integer DEFAULT 20)
RETURNS TABLE (
  id uuid, slug text, name text, kind text, avatar_url text, is_official boolean,
  item_count integer, last_published_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH me AS (SELECT auth.uid() AS uid),
  agg AS (
    SELECT i.channel_id, count(*)::int AS n, max(i.published_at) AS last_at
    FROM public.oculto_play_items i
    WHERE i.channel_id IS NOT NULL AND i.is_published = true
      AND (i.expires_at IS NULL OR i.expires_at > now())
      AND (
        p_section IS NULL
        OR (p_section = 'shorts'      AND i.kind::text IN ('short_video','vip_teaser') AND NOT COALESCE(i.is_adult, false))
        OR (p_section = 'links'       AND i.kind::text = 'link' AND NOT COALESCE(i.is_adult, false))
        OR (p_section = 'links_adult' AND i.kind::text = 'link' AND COALESCE(i.is_adult, false))
        OR (p_section = 'memes'       AND i.kind::text = 'meme')
        OR (p_section = 'audio'       AND i.kind::text = 'audio')
      )
    GROUP BY i.channel_id
  )
  SELECT c.id, c.slug, c.name, c.kind,
         COALESCE(c.avatar_url, pr.avatar_url)::text,
         c.is_official, a.n, a.last_at
  FROM agg a
  JOIN public.oculto_play_channels c ON c.id = a.channel_id AND c.status = 'active'
  LEFT JOIN LATERAL (
    SELECT p.avatar_url FROM public.profiles p
    WHERE p.id = c.profile_id OR p.user_id = c.owner_id
    ORDER BY (p.id = c.profile_id) DESC LIMIT 1
  ) pr ON true
  CROSS JOIN me
  WHERE me.uid IS NOT NULL
    AND (p_section IS DISTINCT FROM 'links_adult' OR public._play_is_verified(me.uid) OR public.is_admin_master(me.uid))
  ORDER BY a.last_at DESC NULLS LAST, a.n DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 60);
$$;

-- Meus canais.
DROP FUNCTION IF EXISTS public.play_my_channels();
CREATE OR REPLACE FUNCTION public.play_my_channels()
RETURNS SETOF public.oculto_play_channels
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM public.oculto_play_channels
  WHERE owner_id = auth.uid()
  ORDER BY is_official DESC, kind, created_at;
$$;

-- Canais de um perfil (aceita profiles.id ou auth user id) — botão "Ver canal".
DROP FUNCTION IF EXISTS public.play_channels_of(uuid);
CREATE OR REPLACE FUNCTION public.play_channels_of(p_user_or_profile uuid)
RETURNS TABLE (id uuid, slug text, name text, kind text, is_official boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.id, c.slug, c.name, c.kind, c.is_official
  FROM public.oculto_play_channels c
  WHERE auth.uid() IS NOT NULL
    AND c.status = 'active'
    AND (
      c.owner_id = p_user_or_profile
      OR c.profile_id = p_user_or_profile
      OR c.owner_id IN (SELECT p.user_id FROM public.profiles p WHERE p.id = p_user_or_profile)
    )
  ORDER BY c.is_official DESC, c.kind, c.created_at;
$$;

REVOKE ALL ON FUNCTION public.play_channel_create(text, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.play_channel_update(uuid, text, text, text, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.play_channel_by_slug(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.play_channels_strip(text, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.play_my_channels() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.play_channels_of(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.play_channel_create(text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.play_channel_update(uuid, text, text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.play_channel_by_slug(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.play_channels_strip(text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.play_my_channels() TO authenticated;
GRANT EXECUTE ON FUNCTION public.play_channels_of(uuid) TO authenticated;

-- ---------- 6. Canais "Oculto Oficial" + conteúdo atual ----------
DO $$
DECLARE
  v_master uuid;
  v_mpid   uuid;
  r        record;
  v_chan   uuid;
  v_base   text;
  v_slug   text;
  v_n      integer;
BEGIN
  -- Master que mais publicou no Play (ou o primeiro master).
  SELECT p.user_id INTO v_master
  FROM public.oculto_play_items i
  JOIN public.profiles p ON p.id = i.author_id
  WHERE public.is_admin_master(p.user_id)
  GROUP BY p.user_id
  ORDER BY count(*) DESC
  LIMIT 1;
  IF v_master IS NULL THEN
    SELECT ur.user_id INTO v_master FROM public.user_roles ur WHERE ur.role::text = 'admin_master' LIMIT 1;
  END IF;

  IF v_master IS NOT NULL THEN
    SELECT p.id INTO v_mpid FROM public.profiles p WHERE p.user_id = v_master ORDER BY p.created_at LIMIT 1;
    INSERT INTO public.oculto_play_channels (owner_id, profile_id, kind, name, slug, description, is_official)
    SELECT v_master, v_mpid, 'video', 'Oculto Oficial', 'oculto-oficial', 'Canal oficial do Oculto Play.', true
    WHERE NOT EXISTS (SELECT 1 FROM public.oculto_play_channels WHERE lower(slug) = 'oculto-oficial');
    INSERT INTO public.oculto_play_channels (owner_id, profile_id, kind, name, slug, description, is_official)
    SELECT v_master, v_mpid, 'audio', 'Oculto Oficial · Músicas', 'oculto-oficial-audio', 'Músicas e áudios oficiais do Oculto Play.', true
    WHERE NOT EXISTS (SELECT 1 FROM public.oculto_play_channels WHERE lower(slug) = 'oculto-oficial-audio');
  END IF;

  -- Liga cada item sem canal ao canal do dono (cria um se não existir).
  FOR r IN
    SELECT DISTINCT p.user_id AS owner, public._play_channel_kind_for(i.kind::text) AS need
    FROM public.oculto_play_items i
    JOIN public.profiles p ON p.id = i.author_id
    WHERE i.channel_id IS NULL AND p.user_id IS NOT NULL
  LOOP
    SELECT c.id INTO v_chan FROM public.oculto_play_channels c
     WHERE c.owner_id = r.owner AND c.kind = r.need
     ORDER BY c.is_official DESC, c.created_at LIMIT 1;

    IF v_chan IS NULL THEN
      SELECT public._play_slugify(COALESCE(p.username, 'canal')) INTO v_base
      FROM public.profiles p WHERE p.user_id = r.owner ORDER BY p.created_at LIMIT 1;
      IF v_base IS NULL OR char_length(v_base) < 3 THEN v_base := 'canal-' || left(replace(r.owner::text, '-', ''), 8); END IF;
      IF r.need = 'audio' THEN v_base := left(v_base, 34) || '-audio'; END IF;
      v_slug := v_base; v_n := 1;
      WHILE EXISTS (SELECT 1 FROM public.oculto_play_channels WHERE lower(slug) = v_slug) OR NOT public._play_slug_is_valid(v_slug) LOOP
        v_n := v_n + 1;
        v_slug := left(v_base, 36) || '-' || v_n;
      END LOOP;
      INSERT INTO public.oculto_play_channels (owner_id, profile_id, kind, name, slug)
      SELECT r.owner, p.id, r.need,
             left(COALESCE(NULLIF(p.username, ''), 'Meu canal') || CASE WHEN r.need = 'audio' THEN ' · Áudios' ELSE '' END, 60),
             v_slug
      FROM public.profiles p WHERE p.user_id = r.owner ORDER BY p.created_at LIMIT 1
      RETURNING id INTO v_chan;
    END IF;

    UPDATE public.oculto_play_items i SET channel_id = v_chan
    FROM public.profiles p
    WHERE i.channel_id IS NULL AND p.id = i.author_id AND p.user_id = r.owner
      AND public._play_channel_kind_for(i.kind::text) = r.need;
    v_chan := NULL;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- COMUNIDADES — Convites: fix gen_random_bytes + preview público (read-only)
-- Cole no SQL Editor do Supabase EXTERNO. Idempotente.
-- ----------------------------------------------------------------------------
-- Problema 1: "function gen_random_bytes(integer) does not exist"
--   community_invite_create define SET search_path = public, mas no Supabase a
--   extensão pgcrypto fica no schema `extensions`. Incluímos `extensions` no
--   search_path da função.
--
-- Problema 2: convite hoje exige login para abrir. Precisamos de uma RPC pública
--   que devolve um snapshot SEGURO da comunidade (capa, tema, descrição e
--   tópicos recentes em modo leitura) para qualquer visitante anônimo.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ---------------------------------------------------------------------------
-- 1) FIX: community_invite_create — search_path inclui extensions
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.community_invite_create(
  _community UUID,
  _expires_at TIMESTAMPTZ DEFAULT NULL,
  _max_uses INTEGER DEFAULT NULL
)
RETURNS TABLE(id UUID, code TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_code TEXT;
  v_id UUID;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.oculto_community_members m
    WHERE m.community_id = _community
      AND m.user_id = v_uid
      AND m.role IN ('owner','moderator')
      AND m.status = 'active'
  ) AND NOT public.is_admin(v_uid) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  -- Fallback seguro: tenta gen_random_bytes; se falhar, usa gen_random_uuid().
  BEGIN
    v_code := encode(gen_random_bytes(8), 'hex');
  EXCEPTION WHEN undefined_function THEN
    v_code := replace(gen_random_uuid()::text, '-', '');
    v_code := substr(v_code, 1, 16);
  END;

  INSERT INTO public.oculto_community_invites(community_id, code, created_by, expires_at, max_uses)
  VALUES (_community, v_code, v_uid, _expires_at, _max_uses)
  RETURNING oculto_community_invites.id INTO v_id;

  RETURN QUERY SELECT v_id, v_code;
END;
$$;

GRANT EXECUTE ON FUNCTION public.community_invite_create(UUID, TIMESTAMPTZ, INTEGER) TO authenticated;

-- ---------------------------------------------------------------------------
-- 2) NOVO: community_invite_preview — snapshot público read-only
--    Retorna apenas dados não-sensíveis para landing do convite.
--    NUNCA retorna body completo dos tópicos, apenas trecho (<= 280 chars).
--    Visitante anônimo pode ler; qualquer interação exige cadastro.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.community_invite_preview(_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_inv RECORD;
  v_community RECORD;
  v_topics JSONB;
BEGIN
  IF _code IS NULL OR length(trim(_code)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invite_required');
  END IF;

  SELECT * INTO v_inv
    FROM public.oculto_community_invites
   WHERE code = _code
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invite_not_found');
  END IF;

  IF v_inv.is_active = FALSE THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invite_revoked');
  END IF;

  IF v_inv.expires_at IS NOT NULL AND v_inv.expires_at < NOW() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invite_expired');
  END IF;

  IF v_inv.max_uses IS NOT NULL AND v_inv.uses_count >= v_inv.max_uses THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invite_exhausted');
  END IF;

  SELECT id, title, slug, description, cover_url, avatar_url, visibility,
         is_adult, members_count, topics_count, last_activity_at, rules
    INTO v_community
    FROM public.oculto_communities
   WHERE id = v_inv.community_id
     AND status = 'active'
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'community_unavailable');
  END IF;

  SELECT COALESCE(jsonb_agg(t ORDER BY t.created_at DESC), '[]'::jsonb)
    INTO v_topics
    FROM (
      SELECT
        id,
        title,
        CASE
          WHEN body IS NULL THEN NULL
          WHEN length(body) > 280 THEN substring(body from 1 for 277) || '…'
          ELSE body
        END AS body_preview,
        is_pinned,
        replies_count,
        reactions_count,
        created_at
        FROM public.oculto_community_topics
       WHERE community_id = v_community.id
         AND status = 'published'
         AND is_adult = FALSE
       ORDER BY is_pinned DESC, created_at DESC
       LIMIT 8
    ) t;

  RETURN jsonb_build_object(
    'ok', true,
    'community', jsonb_build_object(
      'id', v_community.id,
      'title', v_community.title,
      'slug', v_community.slug,
      'description', v_community.description,
      'cover_url', v_community.cover_url,
      'avatar_url', v_community.avatar_url,
      'visibility', v_community.visibility,
      'is_adult', v_community.is_adult,
      'members_count', v_community.members_count,
      'topics_count', v_community.topics_count,
      'last_activity_at', v_community.last_activity_at,
      'rules', v_community.rules
    ),
    'topics', v_topics,
    'invite', jsonb_build_object(
      'code', v_inv.code,
      'expires_at', v_inv.expires_at,
      'max_uses', v_inv.max_uses,
      'uses_count', v_inv.uses_count
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.community_invite_preview(TEXT) FROM public;
GRANT EXECUTE ON FUNCTION public.community_invite_preview(TEXT) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

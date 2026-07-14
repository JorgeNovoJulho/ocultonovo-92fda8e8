-- =====================================================================
-- 2026_06_05 — COMUNIDADES OCULTAS — PARTE 9
-- Convites por link para comunidades privadas.
-- Idempotente. Rodar no SQL Editor do Supabase EXTERNO.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. TABELA DE CONVITES
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.oculto_community_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL REFERENCES public.oculto_communities(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  created_by UUID NOT NULL,
  expires_at TIMESTAMPTZ,
  max_uses INTEGER,
  uses_count INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_oculto_community_invites_community
  ON public.oculto_community_invites(community_id);
CREATE INDEX IF NOT EXISTS idx_oculto_community_invites_code
  ON public.oculto_community_invites(code);

GRANT SELECT, INSERT, UPDATE ON public.oculto_community_invites TO authenticated;
GRANT ALL ON public.oculto_community_invites TO service_role;

ALTER TABLE public.oculto_community_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "invites_select_owner_mod" ON public.oculto_community_invites;
CREATE POLICY "invites_select_owner_mod"
  ON public.oculto_community_invites FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.oculto_community_members m
      WHERE m.community_id = oculto_community_invites.community_id
        AND m.user_id = auth.uid()
        AND m.role IN ('owner','moderator')
        AND m.status = 'active'
    )
    OR public.is_admin(auth.uid())
  );

-- Inserts/updates só via RPC (security definer); deny por padrão.
DROP POLICY IF EXISTS "invites_no_direct_write" ON public.oculto_community_invites;
CREATE POLICY "invites_no_direct_write"
  ON public.oculto_community_invites FOR ALL
  TO authenticated
  USING (false) WITH CHECK (false);

-- ---------------------------------------------------------------------
-- 2. RPC: CRIAR CONVITE (owner/mod)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.community_invite_create(
  _community UUID,
  _expires_at TIMESTAMPTZ DEFAULT NULL,
  _max_uses INTEGER DEFAULT NULL
)
RETURNS TABLE(id UUID, code TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

  v_code := encode(gen_random_bytes(8), 'hex');

  INSERT INTO public.oculto_community_invites(community_id, code, created_by, expires_at, max_uses)
  VALUES (_community, v_code, v_uid, _expires_at, _max_uses)
  RETURNING oculto_community_invites.id INTO v_id;

  RETURN QUERY SELECT v_id, v_code;
END;
$$;

GRANT EXECUTE ON FUNCTION public.community_invite_create(UUID, TIMESTAMPTZ, INTEGER) TO authenticated;

-- ---------------------------------------------------------------------
-- 3. RPC: ACEITAR CONVITE (qualquer autenticado)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.community_invite_accept(_code TEXT)
RETURNS TABLE(community_id UUID, slug TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_inv RECORD;
  v_slug TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_inv
    FROM public.oculto_community_invites
   WHERE code = _code AND is_active = TRUE
   LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invite_not_found';
  END IF;

  IF v_inv.expires_at IS NOT NULL AND v_inv.expires_at < NOW() THEN
    RAISE EXCEPTION 'invite_expired';
  END IF;

  IF v_inv.max_uses IS NOT NULL AND v_inv.uses_count >= v_inv.max_uses THEN
    RAISE EXCEPTION 'invite_exhausted';
  END IF;

  -- Insere/reativa membership como ATIVO (bypass de aprovação).
  INSERT INTO public.oculto_community_members(community_id, user_id, role, status, joined_at, approved_by, approved_at)
  VALUES (v_inv.community_id, v_uid, 'member', 'active', NOW(), v_inv.created_by, NOW())
  ON CONFLICT (community_id, user_id) DO UPDATE
    SET status = 'active',
        approved_by = EXCLUDED.approved_by,
        approved_at = NOW();

  UPDATE public.oculto_community_invites
     SET uses_count = uses_count + 1
   WHERE id = v_inv.id;

  SELECT c.slug INTO v_slug
    FROM public.oculto_communities c
   WHERE c.id = v_inv.community_id;

  RETURN QUERY SELECT v_inv.community_id, v_slug;
END;
$$;

GRANT EXECUTE ON FUNCTION public.community_invite_accept(TEXT) TO authenticated;

-- ---------------------------------------------------------------------
-- 4. RPC: REVOGAR CONVITE
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.community_invite_revoke(_invite UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_community UUID;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT community_id INTO v_community
    FROM public.oculto_community_invites
   WHERE id = _invite;

  IF v_community IS NULL THEN RAISE EXCEPTION 'invite_not_found'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.oculto_community_members m
    WHERE m.community_id = v_community
      AND m.user_id = v_uid
      AND m.role IN ('owner','moderator')
      AND m.status = 'active'
  ) AND NOT public.is_admin(v_uid) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  UPDATE public.oculto_community_invites SET is_active = FALSE WHERE id = _invite;
END;
$$;

GRANT EXECUTE ON FUNCTION public.community_invite_revoke(UUID) TO authenticated;

-- =====================================================================
-- FIM PARTE 9
-- =====================================================================

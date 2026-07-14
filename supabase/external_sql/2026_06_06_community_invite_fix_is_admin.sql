-- =====================================================================
-- 2026_06_06 — FIX: community_invite_create estava chamando
-- public.is_admin(uuid), função que NÃO existe no banco externo.
-- No restante do projeto usamos public.oculto_is_master(uuid).
-- Recriamos as 3 RPCs de convite trocando a checagem de admin.
-- Idempotente. Rodar no SQL Editor do Supabase EXTERNO.
-- =====================================================================

-- 1. CRIAR CONVITE -----------------------------------------------------
CREATE OR REPLACE FUNCTION public.community_invite_create(
  _community  UUID,
  _expires_at TIMESTAMPTZ DEFAULT NULL,
  _max_uses   INTEGER     DEFAULT NULL
)
RETURNS TABLE(id UUID, code TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid  UUID := auth.uid();
  v_code TEXT;
  v_id   UUID;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.oculto_community_members m
     WHERE m.community_id = _community
       AND m.user_id      = v_uid
       AND m.role IN ('owner','moderator')
       AND m.status       = 'active'
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.oculto_communities c
     WHERE c.id = _community AND c.owner_id = v_uid
  )
  AND NOT public.oculto_is_master(v_uid) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  v_code := encode(gen_random_bytes(8), 'hex');

  INSERT INTO public.oculto_community_invites(
    community_id, code, created_by, expires_at, max_uses
  ) VALUES (
    _community, v_code, v_uid, _expires_at, _max_uses
  )
  RETURNING oculto_community_invites.id INTO v_id;

  RETURN QUERY SELECT v_id, v_code;
END;
$$;

GRANT EXECUTE ON FUNCTION public.community_invite_create(UUID, TIMESTAMPTZ, INTEGER) TO authenticated;

-- 2. REVOGAR CONVITE ---------------------------------------------------
CREATE OR REPLACE FUNCTION public.community_invite_revoke(_invite UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid       UUID := auth.uid();
  v_community UUID;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT community_id INTO v_community
    FROM public.oculto_community_invites
   WHERE id = _invite;

  IF v_community IS NULL THEN
    RAISE EXCEPTION 'invite_not_found';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.oculto_community_members m
     WHERE m.community_id = v_community
       AND m.user_id      = v_uid
       AND m.role IN ('owner','moderator')
       AND m.status       = 'active'
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.oculto_communities c
     WHERE c.id = v_community AND c.owner_id = v_uid
  )
  AND NOT public.oculto_is_master(v_uid) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  UPDATE public.oculto_community_invites
     SET is_active = FALSE
   WHERE id = _invite;
END;
$$;

GRANT EXECUTE ON FUNCTION public.community_invite_revoke(UUID) TO authenticated;

-- 3. POLICY DE LEITURA (também usava is_admin) -------------------------
DROP POLICY IF EXISTS "invites_select_owner_mod" ON public.oculto_community_invites;
CREATE POLICY "invites_select_owner_mod"
  ON public.oculto_community_invites FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.oculto_community_members m
      WHERE m.community_id = oculto_community_invites.community_id
        AND m.user_id      = auth.uid()
        AND m.role IN ('owner','moderator')
        AND m.status       = 'active'
    )
    OR EXISTS (
      SELECT 1 FROM public.oculto_communities c
       WHERE c.id = oculto_community_invites.community_id
         AND c.owner_id = auth.uid()
    )
    OR public.oculto_is_master(auth.uid())
  );

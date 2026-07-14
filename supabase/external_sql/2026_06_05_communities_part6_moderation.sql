-- ============================================================
-- COMUNIDADES OCULTAS — PARTE 6
-- Moderação avançada: papéis, banimento, exclusão da comunidade
-- Cole no SQL Editor do Supabase EXTERNO. Idempotente.
-- ============================================================

-- ─────────────────────────────────────────────
-- 1) Promover / rebaixar membro (owner ou master)
--    _new_role IN ('moderator','member')
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.community_set_member_role(
  _community uuid,
  _user uuid,
  _new_role text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_master boolean := public.oculto_is_master(auth.uid());
  v_is_owner  boolean;
BEGIN
  IF _new_role NOT IN ('moderator','member') THEN
    RAISE EXCEPTION 'invalid_role';
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.oculto_community_members
    WHERE community_id = _community AND user_id = auth.uid()
      AND status = 'active' AND role = 'owner'
  ) INTO v_is_owner;

  IF NOT (v_is_master OR v_is_owner) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- Nunca rebaixa o dono via este RPC
  IF EXISTS (
    SELECT 1 FROM public.oculto_community_members
    WHERE community_id = _community AND user_id = _user AND role = 'owner'
  ) THEN
    RAISE EXCEPTION 'cannot_change_owner';
  END IF;

  UPDATE public.oculto_community_members
     SET role = _new_role
   WHERE community_id = _community
     AND user_id = _user
     AND status = 'active';

  INSERT INTO public.oculto_community_audit_logs (community_id, actor_id, target_user_id, action, payload)
  VALUES (_community, auth.uid(), _user, 'member_set_role', jsonb_build_object('role', _new_role));
END;
$$;

GRANT EXECUTE ON FUNCTION public.community_set_member_role(uuid, uuid, text) TO authenticated;

-- ─────────────────────────────────────────────
-- 2) Banir / desbanir membro (owner, moderator ou master)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.community_ban_member(
  _community uuid,
  _user uuid,
  _reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_is_master boolean := public.oculto_is_master(auth.uid());
BEGIN
  IF NOT v_is_master THEN
    SELECT role INTO v_role
      FROM public.oculto_community_members
     WHERE community_id = _community AND user_id = auth.uid() AND status = 'active';
    IF v_role IS NULL OR v_role NOT IN ('owner','moderator') THEN
      RAISE EXCEPTION 'forbidden';
    END IF;
  END IF;

  -- Não banir o dono
  IF EXISTS (
    SELECT 1 FROM public.oculto_community_members
    WHERE community_id = _community AND user_id = _user AND role = 'owner'
  ) THEN
    RAISE EXCEPTION 'cannot_ban_owner';
  END IF;

  -- Upsert para banido
  INSERT INTO public.oculto_community_members (community_id, user_id, role, status, joined_at)
  VALUES (_community, _user, 'member', 'banned', NOW())
  ON CONFLICT (community_id, user_id)
  DO UPDATE SET status = 'banned', role = 'member';

  INSERT INTO public.oculto_community_audit_logs (community_id, actor_id, target_user_id, action, payload)
  VALUES (_community, auth.uid(), _user, 'member_ban', jsonb_build_object('reason', _reason));
END;
$$;

GRANT EXECUTE ON FUNCTION public.community_ban_member(uuid, uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.community_unban_member(
  _community uuid,
  _user uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_is_master boolean := public.oculto_is_master(auth.uid());
BEGIN
  IF NOT v_is_master THEN
    SELECT role INTO v_role
      FROM public.oculto_community_members
     WHERE community_id = _community AND user_id = auth.uid() AND status = 'active';
    IF v_role IS NULL OR v_role NOT IN ('owner','moderator') THEN
      RAISE EXCEPTION 'forbidden';
    END IF;
  END IF;

  DELETE FROM public.oculto_community_members
   WHERE community_id = _community
     AND user_id = _user
     AND status = 'banned';

  INSERT INTO public.oculto_community_audit_logs (community_id, actor_id, target_user_id, action, payload)
  VALUES (_community, auth.uid(), _user, 'member_unban', '{}'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.community_unban_member(uuid, uuid) TO authenticated;

-- ─────────────────────────────────────────────
-- 3) Listar membros banidos (owner/moderator/master)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.community_banned_members(_community uuid)
RETURNS TABLE (
  user_id uuid,
  joined_at timestamptz,
  username text,
  display_name text,
  name text,
  avatar_url text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_is_master boolean := public.oculto_is_master(auth.uid());
BEGIN
  IF NOT v_is_master THEN
    SELECT role INTO v_role
      FROM public.oculto_community_members
     WHERE community_id = _community AND user_id = auth.uid() AND status = 'active';
    IF v_role IS NULL OR v_role NOT IN ('owner','moderator') THEN
      RAISE EXCEPTION 'forbidden';
    END IF;
  END IF;

  RETURN QUERY
    SELECT m.user_id, m.joined_at, p.username, p.display_name, p.name, p.avatar_url
      FROM public.oculto_community_members m
      LEFT JOIN public.profiles p ON p.id = m.user_id
     WHERE m.community_id = _community
       AND m.status = 'banned'
     ORDER BY m.joined_at DESC
     LIMIT 200;
END;
$$;

GRANT EXECUTE ON FUNCTION public.community_banned_members(uuid) TO authenticated;

-- ─────────────────────────────────────────────
-- 4) Excluir comunidade (somente owner ou master)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.community_delete(_community uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_master boolean := public.oculto_is_master(auth.uid());
  v_is_owner  boolean;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM public.oculto_community_members
    WHERE community_id = _community AND user_id = auth.uid()
      AND status = 'active' AND role = 'owner'
  ) INTO v_is_owner;

  IF NOT (v_is_master OR v_is_owner) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  INSERT INTO public.oculto_community_audit_logs (community_id, actor_id, action, payload)
  VALUES (_community, auth.uid(), 'community_delete', '{}'::jsonb);

  -- Cascata por FKs configuradas; demais tabelas dependentes serão removidas.
  DELETE FROM public.oculto_communities WHERE id = _community;
END;
$$;

GRANT EXECUTE ON FUNCTION public.community_delete(uuid) TO authenticated;

-- ============================================================
-- FIM PARTE 6
-- ============================================================

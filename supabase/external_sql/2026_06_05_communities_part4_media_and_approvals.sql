-- ============================================================
-- COMUNIDADES OCULTAS — PARTE 4
-- Storage RLS + RPCs de aprovação de membros + reações UI
-- Cole no SQL Editor do Supabase EXTERNO.
-- Idempotente.
-- ============================================================

-- ─────────────────────────────────────────────
-- 1) STORAGE — bucket 'community-media'
--    (criado pela plataforma como privado)
-- ─────────────────────────────────────────────
-- Leitura pública controlada via signed URL (bucket privado).
-- Política: qualquer usuário autenticado pode listar/baixar arquivos do bucket
-- (Frontend gera signed URLs ou usa createSignedUrl). Upload restrito ao próprio user_id na pasta.

DROP POLICY IF EXISTS "community_media_select_auth" ON storage.objects;
CREATE POLICY "community_media_select_auth"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'community-media');

DROP POLICY IF EXISTS "community_media_insert_own" ON storage.objects;
CREATE POLICY "community_media_insert_own"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'community-media'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "community_media_update_own" ON storage.objects;
CREATE POLICY "community_media_update_own"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'community-media'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "community_media_delete_own_or_master" ON storage.objects;
CREATE POLICY "community_media_delete_own_or_master"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'community-media'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR public.oculto_is_master(auth.uid())
  )
);

-- ─────────────────────────────────────────────
-- 2) APROVAÇÃO DE MEMBROS PENDENTES
-- ─────────────────────────────────────────────

-- Lista membros pendentes (apenas owner/moderator ou master)
CREATE OR REPLACE FUNCTION public.community_pending_members(_community uuid)
RETURNS TABLE (
  user_id uuid,
  joined_at timestamptz,
  username text,
  display_name text,
  name text,
  avatar_url text,
  is_vip boolean,
  plan_type text
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
    SELECT m.role INTO v_role
      FROM public.oculto_community_members m
     WHERE m.community_id = _community
       AND m.user_id = auth.uid()
       AND m.status = 'active';
    IF v_role IS NULL OR v_role NOT IN ('owner','moderator') THEN
      RAISE EXCEPTION 'forbidden';
    END IF;
  END IF;

  RETURN QUERY
    SELECT m.user_id,
           m.joined_at,
           p.username,
           p.display_name,
           p.name,
           p.avatar_url,
           p.is_vip,
           p.plan_type
      FROM public.oculto_community_members m
      LEFT JOIN public.profiles p ON p.id = m.user_id
     WHERE m.community_id = _community
       AND m.status = 'pending'
     ORDER BY m.joined_at ASC
     LIMIT 200;
END;
$$;

GRANT EXECUTE ON FUNCTION public.community_pending_members(uuid) TO authenticated;

-- Aprovar
CREATE OR REPLACE FUNCTION public.community_approve_member(_community uuid, _user uuid)
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
     WHERE community_id = _community
       AND user_id = auth.uid()
       AND status = 'active';
    IF v_role IS NULL OR v_role NOT IN ('owner','moderator') THEN
      RAISE EXCEPTION 'forbidden';
    END IF;
  END IF;

  UPDATE public.oculto_community_members
     SET status = 'active', joined_at = NOW()
   WHERE community_id = _community
     AND user_id = _user
     AND status = 'pending';

  INSERT INTO public.oculto_community_audit_logs (community_id, actor_id, target_user_id, action, payload)
  VALUES (_community, auth.uid(), _user, 'member_approve', '{}'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.community_approve_member(uuid, uuid) TO authenticated;

-- Rejeitar / remover
CREATE OR REPLACE FUNCTION public.community_reject_member(_community uuid, _user uuid)
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
     WHERE community_id = _community
       AND user_id = auth.uid()
       AND status = 'active';
    IF v_role IS NULL OR v_role NOT IN ('owner','moderator') THEN
      RAISE EXCEPTION 'forbidden';
    END IF;
  END IF;

  DELETE FROM public.oculto_community_members
   WHERE community_id = _community
     AND user_id = _user
     AND status IN ('pending','banned');

  INSERT INTO public.oculto_community_audit_logs (community_id, actor_id, target_user_id, action, payload)
  VALUES (_community, auth.uid(), _user, 'member_reject', '{}'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.community_reject_member(uuid, uuid) TO authenticated;

-- ─────────────────────────────────────────────
-- 3) Helper para checar se já reagiu (UI otimista)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.community_my_reactions(_topic_ids uuid[])
RETURNS TABLE (topic_id uuid, reaction text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT topic_id, reaction
    FROM public.oculto_community_reactions
   WHERE user_id = auth.uid()
     AND topic_id = ANY(_topic_ids);
$$;

GRANT EXECUTE ON FUNCTION public.community_my_reactions(uuid[]) TO authenticated;

-- ============================================================
-- FIM PARTE 4
-- ============================================================

-- ============================================================
-- AURA ROOM INVITES + RESET DE MATCHES (5 usuários reais)
-- Idempotente · External Supabase only
-- ============================================================

-- 1) RESET DE MATCHES — libera as bolhas no Aura Match para os 5 reais
--    (apaga curtidas/swipes/matches MUTUAS entre eles, sem tocar em outros usuários)
DO $$
DECLARE
  v_ids uuid[];
BEGIN
  SELECT array_agg(id) INTO v_ids
  FROM public.profiles
  WHERE username IN ('ocultomaster','casaltomate','demeter','thaisinha_39','breno_benicio_martins');

  IF v_ids IS NULL OR array_length(v_ids, 1) IS NULL THEN
    RAISE NOTICE 'Nenhum dos usuários alvo encontrado.';
    RETURN;
  END IF;

  -- profile_likes (sender/receiver -> profile.id)
  IF to_regclass('public.profile_likes') IS NOT NULL THEN
    DELETE FROM public.profile_likes
     WHERE sender_id = ANY (v_ids) AND receiver_id = ANY (v_ids);
  END IF;

  -- perfect_pair_actions (user_id/target_id -> profile.id)
  IF to_regclass('public.perfect_pair_actions') IS NOT NULL THEN
    DELETE FROM public.perfect_pair_actions
     WHERE user_id = ANY (v_ids) AND target_id = ANY (v_ids);
  END IF;

  -- perfect_pairs (legacy)
  IF to_regclass('public.perfect_pairs') IS NOT NULL THEN
    DELETE FROM public.perfect_pairs
     WHERE user_id = ANY (v_ids) AND target_id = ANY (v_ids);
  END IF;

  -- pair_matches (caso exista) — apaga só matches entre eles
  IF to_regclass('public.pair_matches') IS NOT NULL THEN
    DELETE FROM public.pair_matches
     WHERE (user_a = ANY (v_ids) AND user_b = ANY (v_ids));
  END IF;

  RAISE NOTICE 'Reset concluído para % perfis.', array_length(v_ids,1);
END$$;

-- ============================================================
-- 2) AURA ROOM INVITES — convites em tempo real entre usuários
-- ============================================================

CREATE TABLE IF NOT EXISTS public.oculto_aura_room_invites (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_slug    text NOT NULL,
  room_name    text,
  from_user    uuid NOT NULL,
  to_user      uuid NOT NULL,
  reason       text,
  status       text NOT NULL DEFAULT 'pending', -- pending|accepted|ignored|expired
  created_at   timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_room_invites_to_pending
  ON public.oculto_aura_room_invites(to_user, created_at DESC)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_room_invites_recent
  ON public.oculto_aura_room_invites(room_slug, created_at DESC);

ALTER TABLE public.oculto_aura_room_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "room_invites_read"   ON public.oculto_aura_room_invites;
DROP POLICY IF EXISTS "room_invites_write"  ON public.oculto_aura_room_invites;
DROP POLICY IF EXISTS "room_invites_update" ON public.oculto_aura_room_invites;

CREATE POLICY "room_invites_read"
  ON public.oculto_aura_room_invites FOR SELECT TO authenticated
  USING (auth.uid() = to_user OR auth.uid() = from_user);

CREATE POLICY "room_invites_write"
  ON public.oculto_aura_room_invites FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = from_user);

CREATE POLICY "room_invites_update"
  ON public.oculto_aura_room_invites FOR UPDATE TO authenticated
  USING (auth.uid() = to_user OR auth.uid() = from_user);

-- Realtime
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public'
      AND tablename='oculto_aura_room_invites'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.oculto_aura_room_invites';
  END IF;
END$$;

-- 2.1) Enviar convite (rate limit 1 por destinatário a cada 60s)
CREATE OR REPLACE FUNCTION public.aura_room_invite_send(
  p_slug    text,
  p_name    text,
  p_to_user uuid,
  p_reason  text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_recent int;
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'auth_required');
  END IF;
  IF p_to_user IS NULL OR p_to_user = v_uid THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_target');
  END IF;

  SELECT count(*) INTO v_recent
  FROM public.oculto_aura_room_invites
  WHERE from_user = v_uid AND to_user = p_to_user
    AND created_at > now() - interval '60 seconds';

  IF v_recent > 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'rate_limited');
  END IF;

  INSERT INTO public.oculto_aura_room_invites (room_slug, room_name, from_user, to_user, reason)
  VALUES (p_slug, p_name, v_uid, p_to_user, btrim(coalesce(p_reason,'')))
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$$;
GRANT EXECUTE ON FUNCTION public.aura_room_invite_send(text,text,uuid,text) TO authenticated;

-- 2.2) Responder convite (accept/ignore)
CREATE OR REPLACE FUNCTION public.aura_room_invite_respond(
  p_id     uuid,
  p_action text -- 'accept' | 'ignore'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.oculto_aura_room_invites%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'auth_required');
  END IF;
  SELECT * INTO v_row FROM public.oculto_aura_room_invites WHERE id = p_id;
  IF NOT FOUND OR v_row.to_user <> v_uid THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;
  IF v_row.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_responded');
  END IF;

  UPDATE public.oculto_aura_room_invites
     SET status = CASE WHEN p_action = 'accept' THEN 'accepted' ELSE 'ignored' END,
         responded_at = now()
   WHERE id = p_id;

  RETURN jsonb_build_object('ok', true, 'slug', v_row.room_slug, 'status', CASE WHEN p_action='accept' THEN 'accepted' ELSE 'ignored' END);
END;
$$;
GRANT EXECUTE ON FUNCTION public.aura_room_invite_respond(uuid,text) TO authenticated;

-- 2.3) Buscar convites pendentes do usuário com perfil do remetente
CREATE OR REPLACE FUNCTION public.aura_room_invite_pending()
RETURNS TABLE (
  id          uuid,
  room_slug   text,
  room_name   text,
  reason      text,
  created_at  timestamptz,
  from_user   uuid,
  from_name   text,
  from_username text,
  from_avatar text,
  from_plan   text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT i.id, i.room_slug, i.room_name, i.reason, i.created_at,
         i.from_user, p.name, p.username, p.avatar_url, p.plan_type
    FROM public.oculto_aura_room_invites i
    LEFT JOIN public.profiles p ON p.user_id = i.from_user
   WHERE i.to_user = auth.uid()
     AND i.status = 'pending'
     AND i.created_at > now() - interval '10 minutes'
   ORDER BY i.created_at DESC
   LIMIT 10;
$$;
GRANT EXECUTE ON FUNCTION public.aura_room_invite_pending() TO authenticated;

-- 2.4) Hidratar perfil do remetente para 1 convite (usado quando chega via realtime)
CREATE OR REPLACE FUNCTION public.aura_room_invite_get(p_id uuid)
RETURNS TABLE (
  id          uuid,
  room_slug   text,
  room_name   text,
  reason      text,
  created_at  timestamptz,
  from_user   uuid,
  from_name   text,
  from_username text,
  from_avatar text,
  from_plan   text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT i.id, i.room_slug, i.room_name, i.reason, i.created_at,
         i.from_user, p.name, p.username, p.avatar_url, p.plan_type
    FROM public.oculto_aura_room_invites i
    LEFT JOIN public.profiles p ON p.user_id = i.from_user
   WHERE i.id = p_id
     AND (i.to_user = auth.uid() OR i.from_user = auth.uid());
$$;
GRANT EXECUTE ON FUNCTION public.aura_room_invite_get(uuid) TO authenticated;

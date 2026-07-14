-- ============================================================
-- AURA ROOM — VALIDAÇÃO DE REQUISITOS DO CONVIDADO + BUSCA POR USERNAME
-- + NOTIFICAÇÃO DE "REQUISITOS PENDENTES" PARA O CONVIDADO
-- + RPC DE SAÍDA EXPLÍCITA DE TODAS AS SALAS (single-room enforcement)
-- Idempotente · External Supabase only
-- ============================================================

-- 1) Buscar usuário por username/nome para o modal de convite
CREATE OR REPLACE FUNCTION public.aura_room_invite_search_targets(p_query text)
RETURNS TABLE (
  user_id    uuid,
  name       text,
  username   text,
  avatar_url text,
  plan_type  text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT p.user_id, p.name, p.username, p.avatar_url, p.plan_type
    FROM public.profiles p
   WHERE p.user_id IS NOT NULL
     AND p.user_id <> auth.uid()
     AND coalesce(p.is_seed, false) = false
     AND coalesce(p.is_invisible, false) = false
     AND (
       length(coalesce(p_query,'')) = 0
       OR p.username ILIKE '%' || p_query || '%'
       OR p.name     ILIKE '%' || p_query || '%'
     )
   ORDER BY (p.username ILIKE p_query || '%') DESC,
            (p.name     ILIKE p_query || '%') DESC,
            p.updated_at DESC NULLS LAST
   LIMIT 20;
$$;
GRANT EXECUTE ON FUNCTION public.aura_room_invite_search_targets(text) TO authenticated;

-- 2) Verifica se o destinatário cumpre os requisitos mínimos da sala
--    Retorna { ok, missing[], hint }. Se a sala não existir como entrada
--    explícita, considera como sala social aberta (ok=true).
CREATE OR REPLACE FUNCTION public.aura_room_invite_target_check(
  p_slug    text,
  p_to_user uuid
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_plan       text;
  v_kyc        boolean;
  v_aura_lvl   int;
  v_social     int;
  v_missing    text[] := ARRAY[]::text[];
  v_req        record;
BEGIN
  IF p_to_user IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'missing', ARRAY['user']::text[]);
  END IF;

  SELECT plan_type,
         coalesce(document_verified,false),
         coalesce(aura_level, 0),
         coalesce(social_score, 0)
    INTO v_plan, v_kyc, v_aura_lvl, v_social
    FROM public.profiles
   WHERE user_id = p_to_user;

  -- Se a sala existir em uma tabela de definição, ler requisitos
  IF to_regclass('public.oculto_aura_rooms') IS NOT NULL THEN
    EXECUTE format(
      'SELECT plan_required, kyc_required, min_aura_level, min_social_score
         FROM public.oculto_aura_rooms WHERE slug = %L LIMIT 1', p_slug
    ) INTO v_req;
  END IF;

  IF v_req.plan_required IS NOT NULL AND v_req.plan_required <> '' AND v_req.plan_required <> 'free' THEN
    IF (v_req.plan_required = 'vip' AND coalesce(v_plan,'') NOT IN ('vip')) OR
       (v_req.plan_required = 'premium' AND coalesce(v_plan,'') NOT IN ('premium','vip')) THEN
      v_missing := array_append(v_missing, 'plan:' || v_req.plan_required);
    END IF;
  END IF;

  IF coalesce(v_req.kyc_required,false) AND NOT v_kyc THEN
    v_missing := array_append(v_missing, 'kyc');
  END IF;

  IF coalesce(v_req.min_aura_level,0) > v_aura_lvl THEN
    v_missing := array_append(v_missing, 'aura_level:' || v_req.min_aura_level);
  END IF;

  IF coalesce(v_req.min_social_score,0) > v_social THEN
    v_missing := array_append(v_missing, 'social_score:' || v_req.min_social_score);
  END IF;

  RETURN jsonb_build_object(
    'ok', array_length(v_missing,1) IS NULL,
    'missing', v_missing
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.aura_room_invite_target_check(text,uuid) TO authenticated;

-- 3) Notificar o convidado que ele precisa subir requisitos no Aura Match
CREATE OR REPLACE FUNCTION public.aura_room_invite_nudge_to_aura(
  p_to_user uuid,
  p_room    text,
  p_missing text[]
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR p_to_user IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'auth_required');
  END IF;

  IF to_regclass('public.notifications') IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, type, title, message, data)
    VALUES (
      p_to_user,
      'aura_room_invite_blocked',
      'Você foi convidado para uma sala VIP',
      'Mas ainda faltam requisitos. Suba seu nível no Aura Match para entrar.',
      jsonb_build_object('room', p_room, 'missing', p_missing, 'cta', '/aura-match')
    );
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;
GRANT EXECUTE ON FUNCTION public.aura_room_invite_nudge_to_aura(uuid,text,text[]) TO authenticated;

-- 4) Saída explícita de TODAS as salas — usado pelo single-room enforcement
CREATE OR REPLACE FUNCTION public.aura_room_leave_all()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'auth_required');
  END IF;
  IF to_regclass('public.oculto_aura_room_presence') IS NOT NULL THEN
    DELETE FROM public.oculto_aura_room_presence WHERE user_id = v_uid;
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;
GRANT EXECUTE ON FUNCTION public.aura_room_leave_all() TO authenticated;

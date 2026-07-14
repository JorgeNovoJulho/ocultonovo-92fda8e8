-- =========================================================================
-- 2026-05-20 — Welcome Message: fonte (trigger/rpc/ensure) + RPC admin
-- 1) send_welcome_message_to_user(uuid, boolean, text) com p_source
-- 2) trigger AFTER INSERT em profiles agora marca source='trigger'
-- 3) ensure_welcome_message_for_me() marca source='ensure'
-- 4) admin_list_welcome_logs() — lista paginada com join de profiles
-- 5) admin_welcome_log_stats() — contagens por fonte + pendentes
-- Idempotente — pode reexecutar.
-- =========================================================================

-- 1) Função principal aceita p_source
DROP FUNCTION IF EXISTS public.send_welcome_message_to_user(uuid, boolean, text);
DROP FUNCTION IF EXISTS public.send_welcome_message_to_user(uuid, boolean);
DROP FUNCTION IF EXISTS public.send_welcome_message_to_user(uuid);

CREATE OR REPLACE FUNCTION public.send_welcome_message_to_user(
  p_user_id uuid,
  p_force   boolean,
  p_source  text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings  public.oculto_welcome_message_settings%ROWTYPE;
  v_sender_id uuid;
  v_conv_id   uuid;
  v_username  text;
  v_link      text;
  v_content   text;
  v_msg_id    uuid;
  v_existing  uuid;
  v_src       text := COALESCE(NULLIF(p_source, ''), 'rpc');
BEGIN
  IF p_user_id IS NULL THEN RETURN NULL; END IF;

  SELECT * INTO v_settings FROM public.oculto_welcome_message_settings WHERE id = 1;
  IF NOT FOUND OR NOT COALESCE(v_settings.is_enabled, true) THEN RETURN NULL; END IF;
  IF COALESCE(v_settings.template, '') = '' THEN RETURN NULL; END IF;

  SELECT id INTO v_sender_id FROM auth.users
   WHERE lower(email) = lower(v_settings.sender_email) LIMIT 1;
  IF v_sender_id IS NULL OR v_sender_id = p_user_id THEN RETURN NULL; END IF;

  SELECT COALESCE(NULLIF(username, ''), NULLIF(name, ''), 'usuario')
    INTO v_username FROM public.profiles WHERE user_id = p_user_id LIMIT 1;
  IF v_username IS NULL THEN v_username := 'usuario'; END IF;

  v_link := rtrim(COALESCE(v_settings.base_invite_url, 'https://www.ocultoswing.com.br/creator-invite/'), '/')
            || '/' || upper(v_username);

  v_content := replace(v_settings.template, '{{username}}',      v_username);
  v_content := replace(v_content,           '{{referral_link}}', v_link);

  SELECT cp1.conversation_id INTO v_conv_id
    FROM public.conversation_participants cp1
    JOIN public.conversation_participants cp2
      ON cp1.conversation_id = cp2.conversation_id
   WHERE cp1.user_id = v_sender_id AND cp2.user_id = p_user_id
   LIMIT 1;

  IF v_conv_id IS NULL THEN
    INSERT INTO public.conversations (created_at, updated_at) VALUES (now(), now())
    RETURNING id INTO v_conv_id;
    INSERT INTO public.conversation_participants (conversation_id, user_id)
    VALUES (v_conv_id, v_sender_id), (v_conv_id, p_user_id);
  ELSE
    IF NOT COALESCE(p_force, false) THEN
      SELECT id INTO v_existing FROM public.messages
       WHERE conversation_id = v_conv_id AND sender_id = v_sender_id
         AND is_auto_reply = true LIMIT 1;
      IF v_existing IS NOT NULL THEN
        INSERT INTO public.oculto_welcome_message_log
          (user_id, conversation_id, message_id, sender_id, sent_at, source)
        VALUES (p_user_id, v_conv_id, v_existing, v_sender_id, now(), 'idempotent')
        ON CONFLICT (user_id) DO NOTHING;
        RETURN v_existing;
      END IF;
    END IF;
  END IF;

  INSERT INTO public.messages (conversation_id, sender_id, content, is_auto_reply, is_read)
  VALUES (v_conv_id, v_sender_id, v_content, true, false) RETURNING id INTO v_msg_id;

  UPDATE public.conversations SET updated_at = now() WHERE id = v_conv_id;

  INSERT INTO public.oculto_welcome_message_log
    (user_id, conversation_id, message_id, sender_id, sent_at, source)
  VALUES (p_user_id, v_conv_id, v_msg_id, v_sender_id, now(), v_src)
  ON CONFLICT (user_id) DO UPDATE
    SET sent_at         = EXCLUDED.sent_at,
        conversation_id = EXCLUDED.conversation_id,
        message_id      = EXCLUDED.message_id,
        source          = EXCLUDED.source;

  RETURN v_msg_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.send_welcome_message_to_user(uuid, boolean, text)
  TO authenticated, anon, service_role;

-- Mantém as overloads antigas como wrappers
CREATE OR REPLACE FUNCTION public.send_welcome_message_to_user(p_user_id uuid)
RETURNS uuid LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT public.send_welcome_message_to_user(p_user_id, false, 'rpc'::text);
$$;
CREATE OR REPLACE FUNCTION public.send_welcome_message_to_user(p_user_id uuid, p_force boolean)
RETURNS uuid LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT public.send_welcome_message_to_user(p_user_id, p_force, 'rpc'::text);
$$;
GRANT EXECUTE ON FUNCTION public.send_welcome_message_to_user(uuid) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.send_welcome_message_to_user(uuid, boolean) TO authenticated, anon, service_role;

-- 2) Trigger usa source='trigger'
CREATE OR REPLACE FUNCTION public.trg_send_welcome_message()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.user_id IS NOT NULL AND COALESCE(NEW.is_seed, false) = false THEN
    BEGIN
      PERFORM public.send_welcome_message_to_user(NEW.user_id, false, 'trigger');
    EXCEPTION WHEN others THEN NULL; END;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS profiles_send_welcome_message ON public.profiles;
CREATE TRIGGER profiles_send_welcome_message
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.trg_send_welcome_message();

-- 3) ensure usa source='ensure'
CREATE OR REPLACE FUNCTION public.ensure_welcome_message_for_me()
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RETURN NULL; END IF;
  IF EXISTS (SELECT 1 FROM public.oculto_welcome_message_log WHERE user_id = v_uid) THEN
    RETURN NULL;
  END IF;
  RETURN public.send_welcome_message_to_user(v_uid, false, 'ensure');
END;
$$;
GRANT EXECUTE ON FUNCTION public.ensure_welcome_message_for_me() TO authenticated;

-- 4) Helper master admin (reusa has_role se existir; senão usa email)
CREATE OR REPLACE FUNCTION public._is_master_admin()
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_email text; v_ok boolean;
BEGIN
  IF v_uid IS NULL THEN RETURN false; END IF;
  BEGIN
    SELECT public.has_role(v_uid, 'admin_master'::app_role) INTO v_ok;
    IF v_ok THEN RETURN true; END IF;
  EXCEPTION WHEN others THEN NULL; END;
  SELECT email INTO v_email FROM auth.users WHERE id = v_uid;
  RETURN lower(COALESCE(v_email,'')) = 'ocultomaster@ocultoswing.com.br';
END;
$$;
GRANT EXECUTE ON FUNCTION public._is_master_admin() TO authenticated;

-- 5) Lista paginada de logs com perfil
CREATE OR REPLACE FUNCTION public.admin_list_welcome_logs(
  p_search text DEFAULT NULL,
  p_source text DEFAULT NULL,
  p_limit  int  DEFAULT 100,
  p_offset int  DEFAULT 0
)
RETURNS TABLE (
  user_id uuid,
  username text,
  name text,
  avatar_url text,
  is_seed boolean,
  profile_created_at timestamptz,
  source text,
  sent_at timestamptz,
  conversation_id uuid,
  message_id uuid
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public._is_master_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY
  SELECT l.user_id, p.username, p.name, p.avatar_url, p.is_seed,
         p.created_at, l.source, l.sent_at, l.conversation_id, l.message_id
    FROM public.oculto_welcome_message_log l
    LEFT JOIN public.profiles p ON p.user_id = l.user_id
   WHERE (p_source IS NULL OR p_source = '' OR l.source = p_source)
     AND (p_search IS NULL OR p_search = '' OR
          p.username ILIKE '%'||p_search||'%' OR p.name ILIKE '%'||p_search||'%')
   ORDER BY p.created_at DESC NULLS LAST, l.sent_at DESC
   LIMIT GREATEST(1, LEAST(COALESCE(p_limit,100), 500))
   OFFSET GREATEST(0, COALESCE(p_offset,0));
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_list_welcome_logs(text, text, int, int) TO authenticated;

-- 6) Estatísticas + pendentes
CREATE OR REPLACE FUNCTION public.admin_welcome_log_stats()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_total int; v_trigger int; v_rpc int; v_ensure int; v_idem int;
  v_humans int; v_pending int;
BEGIN
  IF NOT public._is_master_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;

  SELECT count(*) INTO v_total   FROM public.oculto_welcome_message_log;
  SELECT count(*) INTO v_trigger FROM public.oculto_welcome_message_log WHERE source='trigger';
  SELECT count(*) INTO v_rpc     FROM public.oculto_welcome_message_log WHERE source='rpc';
  SELECT count(*) INTO v_ensure  FROM public.oculto_welcome_message_log WHERE source='ensure';
  SELECT count(*) INTO v_idem    FROM public.oculto_welcome_message_log WHERE source='idempotent';

  SELECT count(*) INTO v_humans
    FROM public.profiles WHERE user_id IS NOT NULL AND COALESCE(is_seed,false)=false;

  SELECT count(*) INTO v_pending
    FROM public.profiles p
    LEFT JOIN public.oculto_welcome_message_log l ON l.user_id = p.user_id
   WHERE p.user_id IS NOT NULL AND COALESCE(p.is_seed,false)=false AND l.user_id IS NULL;

  RETURN jsonb_build_object(
    'total', v_total, 'trigger', v_trigger, 'rpc', v_rpc,
    'ensure', v_ensure, 'idempotent', v_idem,
    'humans_total', v_humans, 'pending', v_pending,
    'coverage_pct', CASE WHEN v_humans>0 THEN round((v_total::numeric/v_humans)*100,1) ELSE 0 END
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_welcome_log_stats() TO authenticated;

-- 7) Lista de pendentes (humanos sem log)
CREATE OR REPLACE FUNCTION public.admin_list_welcome_pending(p_limit int DEFAULT 100)
RETURNS TABLE (
  user_id uuid, username text, name text, avatar_url text, profile_created_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public._is_master_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY
  SELECT p.user_id, p.username, p.name, p.avatar_url, p.created_at
    FROM public.profiles p
    LEFT JOIN public.oculto_welcome_message_log l ON l.user_id = p.user_id
   WHERE p.user_id IS NOT NULL AND COALESCE(p.is_seed,false)=false AND l.user_id IS NULL
   ORDER BY p.created_at DESC NULLS LAST
   LIMIT GREATEST(1, LEAST(COALESCE(p_limit,100), 500));
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_list_welcome_pending(int) TO authenticated;

NOTIFY pgrst, 'reload schema';

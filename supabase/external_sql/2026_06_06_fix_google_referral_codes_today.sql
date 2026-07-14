-- =============================================================================
-- 2026-06-06 — Corrige usernames NULL e reenvia mensagem de boas-vindas
-- com link /creator-invite/<username> para TODOS os signups Google de hoje.
-- Idempotente.
-- =============================================================================
DROP TABLE IF EXISTS public._tmp_fix_google_today_20260606;
CREATE TABLE public._tmp_fix_google_today_20260606(
  user_id uuid, profile_id uuid, email text, provider text,
  old_username text, new_username text,
  welcome_message_id uuid, note text, processed_at timestamptz DEFAULT now()
);

DO $$
DECLARE
  r RECORD; v_base text; v_new text; v_n int; v_msg uuid;
BEGIN
  FOR r IN
    SELECT p.id AS profile_id, p.user_id, p.username, p.name,
           u.email, u.raw_app_meta_data->>'provider' AS provider
      FROM public.profiles p
      JOIN auth.users u ON u.id = p.user_id
     WHERE (u.created_at AT TIME ZONE 'America/Sao_Paulo')::date
         = (now() AT TIME ZONE 'America/Sao_Paulo')::date
       AND u.raw_app_meta_data->>'provider' = 'google'
  LOOP
    IF coalesce(length(r.username),0) < 3 THEN
      v_base := regexp_replace(lower(coalesce(r.name,'')), '[^a-z0-9]+', '_', 'g');
      IF coalesce(length(v_base),0) < 3 THEN
        v_base := regexp_replace(lower(split_part(coalesce(r.email,''),'@',1)), '[^a-z0-9]+', '_', 'g');
      END IF;
      v_base := regexp_replace(v_base, '^_+|_+$', '', 'g');
      IF coalesce(length(v_base),0) < 3 THEN
        v_base := 'oculto_' || substr(replace(r.user_id::text,'-',''),1,6);
      END IF;
      v_new := v_base; v_n := 1;
      WHILE EXISTS (
        SELECT 1 FROM public.profiles
         WHERE lower(coalesce(username,'')) = v_new AND id <> r.profile_id
      ) LOOP
        v_n := v_n + 1; v_new := v_base || '_' || v_n::text;
      END LOOP;
      UPDATE public.profiles SET username = v_new, updated_at = now() WHERE id = r.profile_id;
    ELSE
      v_new := r.username;
    END IF;

    BEGIN v_msg := public.send_welcome_message_to_user(r.user_id);
    EXCEPTION WHEN OTHERS THEN v_msg := NULL;
    END;

    INSERT INTO public._tmp_fix_google_today_20260606
      VALUES (r.user_id, r.profile_id, r.email, r.provider, r.username, v_new, v_msg,
              CASE WHEN v_msg IS NULL THEN 'welcome resend failed' ELSE 'ok' END);
  END LOOP;
END $$;

SELECT count(*) AS total,
       count(*) FILTER (WHERE note='ok') AS ok,
       count(*) FILTER (WHERE note<>'ok') AS com_erro
  FROM public._tmp_fix_google_today_20260606;

SELECT email, provider, old_username, new_username,
       '/creator-invite/' || lower(new_username) AS novo_link_convite,
       welcome_message_id, note, processed_at
  FROM public._tmp_fix_google_today_20260606
 ORDER BY note, new_username;

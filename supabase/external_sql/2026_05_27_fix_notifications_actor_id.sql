-- ============================================================
-- HOTFIX: column "actor_id" of relation "notifications" does not exist
-- Causado pelos triggers de rating/testimonial/recommendation que
-- inserem em notifications(actor_id, ...) sem a coluna existir.
--
-- Estratégia (segura, NÃO quebra nada que já funciona):
--   1) Adiciona a coluna actor_id em notifications se faltar.
--   2) Recria as funções de notificação de forma DEFENSIVA: detecta
--      se a coluna existe e monta o INSERT correto em runtime.
--   3) Mantém actor_id também no jsonb `data` (já era assim) para
--      compatibilidade com o front que lê de `data.actor_id`.
-- Idempotente — pode rodar quantas vezes precisar.
-- Rodar no SQL Editor do Supabase EXTERNO (rvybbrkzmboqbhcemqar).
-- ============================================================

-- 1) Garante a coluna actor_id em notifications -----------------------------
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS actor_id uuid NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_actor_id
  ON public.notifications (actor_id);

-- 2) Função de notificação social — versão defensiva -----------------------
CREATE OR REPLACE FUNCTION public.notify_profile_social_event(
  p_target_profile_id uuid,
  p_actor_profile_id  uuid,
  p_type              text,
  p_title             text,
  p_body              text,
  p_extra             jsonb DEFAULT '{}'::jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target_user uuid;
  v_actor_user  uuid;
  v_actor_user_name text;
  v_has_actor_col boolean;
  v_data jsonb;
BEGIN
  IF p_target_profile_id IS NULL OR p_actor_profile_id IS NULL THEN
    RETURN;
  END IF;
  IF p_target_profile_id = p_actor_profile_id THEN
    RETURN;
  END IF;

  SELECT user_id INTO v_target_user
    FROM public.profiles WHERE id = p_target_profile_id;
  SELECT user_id, COALESCE(username, name, '')
    INTO v_actor_user, v_actor_user_name
    FROM public.profiles WHERE id = p_actor_profile_id;

  IF v_target_user IS NULL THEN RETURN; END IF;

  v_data := jsonb_build_object(
    'actor_id',          v_actor_user,
    'actor_profile_id',  p_actor_profile_id,
    'target_profile_id', p_target_profile_id,
    'actor_username',    v_actor_user_name
  ) || COALESCE(p_extra, '{}'::jsonb);

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='notifications' AND column_name='actor_id'
  ) INTO v_has_actor_col;

  IF v_has_actor_col THEN
    INSERT INTO public.notifications (user_id, actor_id, type, title, body, data, is_read)
    VALUES (v_target_user, v_actor_user, p_type, p_title, p_body, v_data, false);
  ELSE
    INSERT INTO public.notifications (user_id, type, title, body, data, is_read)
    VALUES (v_target_user, p_type, p_title, p_body, v_data, false);
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- Best-effort: não derruba o INSERT principal (rating/testimonial)
  RAISE WARNING 'notify_profile_social_event falhou: %', SQLERRM;
END;
$$;

GRANT EXECUTE ON FUNCTION public.notify_profile_social_event(uuid,uuid,text,text,text,jsonb)
  TO authenticated, service_role;

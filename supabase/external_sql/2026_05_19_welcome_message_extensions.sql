-- =========================================================================
-- Extensões da Mensagem de Boas-Vindas (idempotente)
--  * Novas colunas em oculto_welcome_message_settings:
--      badge_text, copy_button_label, share_button_label,
--      disable_for_seed, disable_for_bots, disable_for_flags (jsonb)
--  * Tabela oculto_welcome_message_metrics  (telemetria de cliques)
--  * RPC welcome_metric_increment(action, user_id)
--  * RPC admin_send_welcome_to_username(username)  -- envio manual p/ teste
--  * Trigger respeita novas regras de desativação por tipo de usuário
-- =========================================================================

ALTER TABLE public.oculto_welcome_message_settings
  ADD COLUMN IF NOT EXISTS badge_text          text    NOT NULL DEFAULT 'Boas-vindas OCULTO',
  ADD COLUMN IF NOT EXISTS copy_button_label   text    NOT NULL DEFAULT 'Copiar link de divulgação',
  ADD COLUMN IF NOT EXISTS share_button_label  text    NOT NULL DEFAULT 'Compartilhar',
  ADD COLUMN IF NOT EXISTS disable_for_seed    boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS disable_for_bots    boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS disable_for_flags   jsonb   NOT NULL DEFAULT '[]'::jsonb;
  -- disable_for_flags: lista de nomes de colunas booleanas em profiles
  -- (ex.: ["is_test","is_internal"]) — se NEW.<col> = true, pula o welcome.

-- =========================================================================
-- Telemetria de cliques (mock simples)
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.oculto_welcome_message_metrics (
  id          bigserial PRIMARY KEY,
  user_id     uuid,
  action      text NOT NULL CHECK (action IN ('copy','share','view')),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_welcome_metrics_action_created
  ON public.oculto_welcome_message_metrics (action, created_at DESC);

ALTER TABLE public.oculto_welcome_message_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS welcome_metrics_insert ON public.oculto_welcome_message_metrics;
CREATE POLICY welcome_metrics_insert
  ON public.oculto_welcome_message_metrics
  FOR INSERT TO authenticated, anon
  WITH CHECK (true);

DROP POLICY IF EXISTS welcome_metrics_read ON public.oculto_welcome_message_metrics;
CREATE POLICY welcome_metrics_read
  ON public.oculto_welcome_message_metrics
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM auth.users u
      WHERE u.id = auth.uid()
        AND lower(u.email) = 'ocultomaster@ocultoswing.com.br'
    )
  );

-- =========================================================================
-- RPC: incrementa métrica (chamado pelo ChatBubble nos cliques)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.welcome_metric_increment(
  p_action  text,
  p_user_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_action NOT IN ('copy','share','view') THEN RETURN; END IF;
  INSERT INTO public.oculto_welcome_message_metrics (user_id, action)
  VALUES (coalesce(p_user_id, auth.uid()), p_action);
END;
$$;

GRANT EXECUTE ON FUNCTION public.welcome_metric_increment(text, uuid)
  TO authenticated, anon, service_role;

-- =========================================================================
-- RPC: envio manual (admin) por username  — usado pelo painel
-- =========================================================================
CREATE OR REPLACE FUNCTION public.admin_send_welcome_to_username(p_username text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
BEGIN
  IF p_username IS NULL OR length(trim(p_username)) = 0 THEN
    RETURN NULL;
  END IF;
  SELECT user_id INTO v_uid
    FROM public.profiles
   WHERE lower(username) = lower(trim(p_username))
   LIMIT 1;
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Usuário não encontrado: %', p_username;
  END IF;
  RETURN public.send_welcome_message_to_user(v_uid);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_send_welcome_to_username(text)
  TO authenticated, service_role;

-- =========================================================================
-- Trigger atualizado: respeita regras de desativação por tipo de usuário
-- =========================================================================
CREATE OR REPLACE FUNCTION public.trg_send_welcome_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_set      record;
  v_flag     text;
  v_skip     boolean := false;
  v_row_json jsonb;
BEGIN
  IF NEW.user_id IS NULL THEN RETURN NEW; END IF;

  SELECT * INTO v_set FROM public.oculto_welcome_message_settings WHERE id = 1;
  IF v_set IS NULL OR NOT coalesce(v_set.is_enabled, true) THEN
    RETURN NEW;
  END IF;

  IF coalesce(v_set.disable_for_seed, true) AND coalesce(NEW.is_seed, false) THEN
    v_skip := true;
  END IF;

  IF NOT v_skip AND coalesce(v_set.disable_for_bots, true) THEN
    -- detecção genérica: colunas bot/is_bot, se existirem
    v_row_json := to_jsonb(NEW);
    IF coalesce((v_row_json->>'is_bot')::boolean, false)
       OR coalesce((v_row_json->>'bot')::boolean, false) THEN
      v_skip := true;
    END IF;
  END IF;

  IF NOT v_skip AND jsonb_array_length(coalesce(v_set.disable_for_flags, '[]'::jsonb)) > 0 THEN
    v_row_json := coalesce(v_row_json, to_jsonb(NEW));
    FOR v_flag IN
      SELECT jsonb_array_elements_text(v_set.disable_for_flags)
    LOOP
      IF coalesce((v_row_json->>v_flag)::boolean, false) THEN
        v_skip := true;
        EXIT;
      END IF;
    END LOOP;
  END IF;

  IF v_skip THEN RETURN NEW; END IF;

  BEGIN
    PERFORM public.send_welcome_message_to_user(NEW.user_id);
  EXCEPTION WHEN others THEN
    NULL; -- nunca quebra o cadastro
  END;

  RETURN NEW;
END;
$$;

-- Trigger já criado no script anterior; recria por segurança.
DROP TRIGGER IF EXISTS profiles_send_welcome_message ON public.profiles;
CREATE TRIGGER profiles_send_welcome_message
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_send_welcome_message();

-- =====================================================================
-- Aura Match — Configurações administrativas + ação "Chamar Atenção"
-- Tabelas:
--   oculto_aura_settings      (key/value JSON, editável só pelo Master)
--   oculto_aura_attentions    (auditoria de quem chamou atenção de quem)
-- RPCs:
--   aura_get_settings()                       -> retorna todas as configs
--   aura_admin_set_setting(key, value jsonb)  -> Master Admin only
--   aura_send_attention(target_user_id)       -> debita XP e registra
-- Tudo idempotente.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.oculto_aura_settings (
  key         text PRIMARY KEY,
  value       jsonb NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid
);

ALTER TABLE public.oculto_aura_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "aura_settings_read_authenticated" ON public.oculto_aura_settings;
CREATE POLICY "aura_settings_read_authenticated"
  ON public.oculto_aura_settings FOR SELECT
  TO authenticated
  USING (true);

-- Sem políticas de INSERT/UPDATE → só via RPC SECURITY DEFINER.

-- Default: 50 XP por "Chamar atenção"
INSERT INTO public.oculto_aura_settings (key, value)
VALUES ('attention_cost_xp', to_jsonb(50))
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.oculto_aura_attentions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id   uuid NOT NULL,
  target_id   uuid NOT NULL,
  cost_xp     integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_aura_attentions_target_recent
  ON public.oculto_aura_attentions (target_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_aura_attentions_sender_recent
  ON public.oculto_aura_attentions (sender_id, created_at DESC);

ALTER TABLE public.oculto_aura_attentions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "aura_attentions_select_own" ON public.oculto_aura_attentions;
CREATE POLICY "aura_attentions_select_own"
  ON public.oculto_aura_attentions FOR SELECT
  TO authenticated
  USING (auth.uid() = sender_id OR auth.uid() = target_id);

-- ============== Helper: Master Admin (username = 'ocultomaster') ==============
CREATE OR REPLACE FUNCTION public.aura_is_master_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
     WHERE p.user_id = auth.uid()
       AND lower(p.username) = 'ocultomaster'
  );
$$;

-- ============== Get all settings ==============
CREATE OR REPLACE FUNCTION public.aura_get_settings()
RETURNS TABLE(key text, value jsonb, updated_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.key, s.value, s.updated_at
    FROM public.oculto_aura_settings s
   ORDER BY s.key;
$$;

-- ============== Admin upsert (master only) ==============
CREATE OR REPLACE FUNCTION public.aura_admin_set_setting(p_key text, p_value jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF NOT public.aura_is_master_admin() THEN
    RAISE EXCEPTION 'forbidden: master admin only';
  END IF;
  INSERT INTO public.oculto_aura_settings (key, value, updated_at, updated_by)
  VALUES (p_key, p_value, now(), v_uid)
  ON CONFLICT (key)
  DO UPDATE SET value = EXCLUDED.value, updated_at = now(), updated_by = v_uid;
END;
$$;

-- ============== Send "Attention" (debita XP) ==============
CREATE OR REPLACE FUNCTION public.aura_send_attention(p_target_user_id uuid)
RETURNS TABLE(ok boolean, cost_xp integer, remaining_xp integer, message text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_cost    integer;
  v_balance integer;
  v_recent  integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF p_target_user_id IS NULL OR p_target_user_id = v_uid THEN
    RAISE EXCEPTION 'invalid target';
  END IF;

  -- Cost from settings (default 50)
  SELECT COALESCE((value)::int, 50) INTO v_cost
    FROM public.oculto_aura_settings WHERE key = 'attention_cost_xp';
  v_cost := COALESCE(v_cost, 50);

  -- Saldo atual
  SELECT COALESCE(aura_xp, 0) INTO v_balance
    FROM public.profiles WHERE user_id = v_uid;
  IF v_balance IS NULL THEN v_balance := 0; END IF;

  IF v_balance < v_cost THEN
    ok := false; cost_xp := v_cost; remaining_xp := v_balance;
    message := 'XP insuficiente';
    RETURN NEXT; RETURN;
  END IF;

  -- Anti-spam: máximo 1 "atenção" por par a cada 6h
  SELECT count(*) INTO v_recent
    FROM public.oculto_aura_attentions
   WHERE sender_id = v_uid AND target_id = p_target_user_id
     AND created_at > now() - interval '6 hours';
  IF v_recent > 0 THEN
    ok := false; cost_xp := v_cost; remaining_xp := v_balance;
    message := 'Aguarde 6h para chamar atenção desse perfil novamente';
    RETURN NEXT; RETURN;
  END IF;

  -- Debita XP via função existente (suporta amount negativo)
  PERFORM public.aura_award_xp(-v_cost, 'attention:' || p_target_user_id::text);

  INSERT INTO public.oculto_aura_attentions (sender_id, target_id, cost_xp)
  VALUES (v_uid, p_target_user_id, v_cost);

  SELECT COALESCE(aura_xp,0) INTO v_balance FROM public.profiles WHERE user_id = v_uid;

  ok := true; cost_xp := v_cost; remaining_xp := v_balance;
  message := 'Atenção enviada';
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.aura_is_master_admin()                  TO authenticated;
GRANT EXECUTE ON FUNCTION public.aura_get_settings()                     TO authenticated;
GRANT EXECUTE ON FUNCTION public.aura_admin_set_setting(text, jsonb)     TO authenticated;
GRANT EXECUTE ON FUNCTION public.aura_send_attention(uuid)               TO authenticated;

NOTIFY pgrst, 'reload schema';

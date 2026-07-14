-- ============================================================
-- 2026-05-27 — Pioneiros reais (auto-tag) + Chamar Atenção (ping)
-- Idempotente. Rodar no SQL Editor do Supabase EXTERNO.
-- ============================================================

-- ─────────────────────────────────────────────
-- 1. PIONEIROS REAIS — contagem por usuários reais
-- ─────────────────────────────────────────────
-- Marca como pioneiros todos os usuários reais (não-seed) atuais
UPDATE public.profiles
SET is_pioneiro = true
WHERE COALESCE(is_seed, false) = false
  AND COALESCE(is_pioneiro, false) = false;

-- Atualiza função para contar usuários reais (é o critério da campanha)
CREATE OR REPLACE FUNCTION public.get_pioneer_slots_status()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  total_slots int := 1000;
  filled_slots int;
BEGIN
  SELECT COUNT(*) INTO filled_slots
  FROM public.profiles
  WHERE is_pioneiro = true
    AND COALESCE(is_seed, false) = false;

  RETURN json_build_object(
    'total', total_slots,
    'filled', filled_slots,
    'remaining', GREATEST(0, total_slots - filled_slots),
    'is_full', filled_slots >= total_slots
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_pioneer_slots_status() TO anon, authenticated, service_role;

-- Trigger: novos usuários reais já entram como pioneiros enquanto houver vaga
CREATE OR REPLACE FUNCTION public.trg_auto_pioneer_real_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_filled int;
BEGIN
  IF COALESCE(NEW.is_seed, false) = true THEN
    RETURN NEW;
  END IF;
  IF COALESCE(NEW.is_pioneiro, false) = true THEN
    RETURN NEW;
  END IF;
  SELECT COUNT(*) INTO v_filled FROM public.profiles
    WHERE is_pioneiro = true AND COALESCE(is_seed,false) = false;
  IF v_filled < 1000 THEN
    NEW.is_pioneiro := true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_auto_pioneer ON public.profiles;
CREATE TRIGGER trg_profiles_auto_pioneer
BEFORE INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.trg_auto_pioneer_real_user();

-- ─────────────────────────────────────────────
-- 2. CHAMAR ATENÇÃO — tabela de pings + RPC + realtime
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.oculto_attention_pings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id uuid NOT NULL,
  to_user_id   uuid NOT NULL,
  from_profile_id uuid,
  to_profile_id   uuid,
  conversation_id uuid,
  message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.oculto_attention_pings TO authenticated;
GRANT ALL ON public.oculto_attention_pings TO service_role;

ALTER TABLE public.oculto_attention_pings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "attention_ping_recipient_can_read" ON public.oculto_attention_pings;
CREATE POLICY "attention_ping_recipient_can_read"
ON public.oculto_attention_pings
FOR SELECT TO authenticated
USING (to_user_id = auth.uid() OR from_user_id = auth.uid());

DROP POLICY IF EXISTS "attention_ping_sender_can_insert" ON public.oculto_attention_pings;
CREATE POLICY "attention_ping_sender_can_insert"
ON public.oculto_attention_pings
FOR INSERT TO authenticated
WITH CHECK (from_user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_attention_pings_to_user
  ON public.oculto_attention_pings (to_user_id, created_at DESC);

-- Realtime
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'oculto_attention_pings'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.oculto_attention_pings';
  END IF;
END $$;

-- RPC: enviar ping (com anti-flood básico — 1 por 5s do mesmo remetente p/ mesmo destinatário)
CREATE OR REPLACE FUNCTION public.send_attention_ping(
  p_to_user_id uuid,
  p_conversation_id uuid DEFAULT NULL,
  p_message text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from uuid := auth.uid();
  v_from_profile uuid;
  v_to_profile uuid;
  v_id uuid;
BEGIN
  IF v_from IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;
  IF p_to_user_id IS NULL OR p_to_user_id = v_from THEN
    RAISE EXCEPTION 'invalid_target';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.oculto_attention_pings
    WHERE from_user_id = v_from
      AND to_user_id = p_to_user_id
      AND created_at > now() - interval '5 seconds'
  ) THEN
    RAISE EXCEPTION 'rate_limited';
  END IF;

  SELECT id INTO v_from_profile FROM public.profiles WHERE user_id = v_from LIMIT 1;
  SELECT id INTO v_to_profile   FROM public.profiles WHERE user_id = p_to_user_id LIMIT 1;

  INSERT INTO public.oculto_attention_pings
    (from_user_id, to_user_id, from_profile_id, to_profile_id, conversation_id, message)
  VALUES (v_from, p_to_user_id, v_from_profile, v_to_profile, p_conversation_id, p_message)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.send_attention_ping(uuid, uuid, text) TO authenticated, service_role;

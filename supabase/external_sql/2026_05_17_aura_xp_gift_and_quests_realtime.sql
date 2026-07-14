-- =====================================================================
-- Aura — Presente de XP (P2P) + Realtime das Missões Diárias
-- Idempotente. Rodar no SQL Editor do Supabase externo.
--
-- O que faz:
--   1) Cria tabela de log oculto_aura_xp_gifts (sender, receiver, amount).
--   2) RPC aura_send_xp_gift(p_receiver_profile_id, p_amount):
--       - debita aura_xp do remetente, credita no destinatário
--       - recalcula aura_level dos dois
--       - registra log e progride a missão "send_gift" do remetente
--   3) Habilita REPLICA IDENTITY FULL e publication realtime para
--      oculto_aura_daily_quests (atualização em tempo real do quadro).
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.oculto_aura_xp_gifts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id    uuid NOT NULL,           -- profiles.id ou auth.uid (compat)
  receiver_id  uuid NOT NULL,           -- profiles.id do destinatário
  amount       integer NOT NULL CHECK (amount > 0 AND amount <= 500),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_aura_xp_gifts_sender
  ON public.oculto_aura_xp_gifts (sender_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_aura_xp_gifts_receiver
  ON public.oculto_aura_xp_gifts (receiver_id, created_at DESC);

ALTER TABLE public.oculto_aura_xp_gifts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "aura_xp_gifts_select_own" ON public.oculto_aura_xp_gifts;
CREATE POLICY "aura_xp_gifts_select_own"
  ON public.oculto_aura_xp_gifts FOR SELECT
  USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

-- ---------------------------------------------------------------------
-- RPC: aura_send_xp_gift
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.aura_send_xp_gift(
  p_receiver_profile_id uuid,
  p_amount integer
)
RETURNS TABLE (
  success         boolean,
  sender_xp       integer,
  sender_level    integer,
  receiver_xp     integer,
  gift_id         uuid
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_sender_profile uuid;
  v_receiver_profile uuid;
  v_sender_xp integer;
  v_receiver_xp integer;
  v_new_sender_xp integer;
  v_new_sender_level integer;
  v_new_receiver_xp integer;
  v_gift_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;
  IF p_amount IS NULL OR p_amount < 5 OR p_amount > 500 THEN
    RAISE EXCEPTION 'amount must be between 5 and 500';
  END IF;
  IF p_receiver_profile_id IS NULL THEN
    RAISE EXCEPTION 'receiver required';
  END IF;

  -- Resolve perfil do remetente (id OR user_id)
  SELECT id, COALESCE(aura_xp,0) INTO v_sender_profile, v_sender_xp
    FROM public.profiles
   WHERE id = v_uid OR user_id = v_uid
   LIMIT 1;

  IF v_sender_profile IS NULL THEN
    RAISE EXCEPTION 'sender profile not found';
  END IF;

  -- Resolve perfil do destinatário (id OR user_id)
  SELECT id, COALESCE(aura_xp,0) INTO v_receiver_profile, v_receiver_xp
    FROM public.profiles
   WHERE id = p_receiver_profile_id OR user_id = p_receiver_profile_id
   LIMIT 1;

  IF v_receiver_profile IS NULL THEN
    RAISE EXCEPTION 'receiver profile not found';
  END IF;

  IF v_receiver_profile = v_sender_profile THEN
    RAISE EXCEPTION 'cannot send gift to yourself';
  END IF;

  IF v_sender_xp < p_amount THEN
    RAISE EXCEPTION 'insufficient aura_xp (balance=%, need=%)', v_sender_xp, p_amount;
  END IF;

  -- Debita do remetente
  UPDATE public.profiles
     SET aura_xp = GREATEST(0, COALESCE(aura_xp,0) - p_amount),
         aura_level = public.aura_level_from_xp(GREATEST(0, COALESCE(aura_xp,0) - p_amount))
   WHERE id = v_sender_profile
   RETURNING aura_xp, aura_level INTO v_new_sender_xp, v_new_sender_level;

  -- Credita no destinatário
  UPDATE public.profiles
     SET aura_xp = COALESCE(aura_xp,0) + p_amount,
         aura_level = public.aura_level_from_xp(COALESCE(aura_xp,0) + p_amount)
   WHERE id = v_receiver_profile
   RETURNING aura_xp INTO v_new_receiver_xp;

  -- Log
  INSERT INTO public.oculto_aura_xp_gifts (sender_id, receiver_id, amount)
  VALUES (v_uid, v_receiver_profile, p_amount)
  RETURNING id INTO v_gift_id;

  -- Progride a missão "send_gift" do remetente (não-bloqueante)
  BEGIN
    PERFORM public.aura_progress_quest('send_gift', 1);
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN QUERY SELECT true, v_new_sender_xp, v_new_sender_level, v_new_receiver_xp, v_gift_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.aura_send_xp_gift(uuid, integer) TO authenticated;

-- ---------------------------------------------------------------------
-- Realtime para o quadro de missões (atualiza sem reload)
-- ---------------------------------------------------------------------
ALTER TABLE public.oculto_aura_daily_quests REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime'
       AND schemaname = 'public'
       AND tablename = 'oculto_aura_daily_quests'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.oculto_aura_daily_quests';
  END IF;
END $$;

-- Recarrega o cache de schema do PostgREST para que o RPC apareça imediatamente
NOTIFY pgrst, 'reload schema';

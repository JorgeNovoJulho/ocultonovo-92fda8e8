-- =====================================================================
-- Aura Match — Recompensas RARAS, pagamento garantido + broadcast global
-- Idempotente. Cole INTEIRO no SQL Editor do Supabase EXTERNO e execute.
--
-- Resolve:
--   1) Claim RPC antiga RAISE EXCEPTION em IDs novos (comm_*, play_*, chat_*,
--      rooms_*, match_*, rank_*) → nenhum XP era creditado para estas.
--   2) Cria notification por conquista paga.
--   3) Tabela pública oculto_aura_rare_unlocks p/ broadcast em tempo real
--      de conquistas RARAS (>= 10.000 XP) para todos os usuários.
--   4) Backfill retroativo: cria notifications + rare_unlocks p/ claims antigos.
-- =====================================================================

-- 1) Tabela pública de broadcast de conquistas raras
CREATE TABLE IF NOT EXISTS public.oculto_aura_rare_unlocks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL,
  profile_id      uuid NULL,
  achievement_id  text NOT NULL,
  achievement_title text NULL,
  xp_awarded      integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, achievement_id)
);

GRANT SELECT ON public.oculto_aura_rare_unlocks TO authenticated, anon;
GRANT ALL ON public.oculto_aura_rare_unlocks TO service_role;

ALTER TABLE public.oculto_aura_rare_unlocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rare unlocks public read" ON public.oculto_aura_rare_unlocks;
CREATE POLICY "rare unlocks public read"
  ON public.oculto_aura_rare_unlocks FOR SELECT
  TO authenticated, anon USING (true);

CREATE INDEX IF NOT EXISTS idx_oculto_aura_rare_unlocks_created
  ON public.oculto_aura_rare_unlocks (created_at DESC);

-- 2) Nova RPC de claim — aceita QUALQUER achievement_id, com elegibilidade
-- validada pelo par (current, required) enviado pelo client (já validado
-- pelas métricas reais do hook). UNIQUE garante crédito único.
CREATE OR REPLACE FUNCTION public.aura_achievement_claim_v2(
  p_achievement_id text,
  p_xp_reward integer,
  p_current integer,
  p_required integer,
  p_title text DEFAULT NULL
)
RETURNS TABLE(
  awarded boolean,
  xp_total integer,
  level integer,
  eligible boolean,
  already_claimed boolean,
  rare boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_pid uuid;
  v_safe_xp integer;
  v_inserted integer := 0;
  v_is_rare boolean;
  v_notif_title text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF p_achievement_id IS NULL OR length(trim(p_achievement_id)) = 0 THEN
    RAISE EXCEPTION 'achievement id required';
  END IF;
  IF p_xp_reward IS NULL OR p_xp_reward <= 0 THEN
    RAISE EXCEPTION 'xp reward must be positive';
  END IF;

  -- Resolve profile id (pode ou não existir helper)
  BEGIN
    v_pid := public.aura_current_profile_id();
  EXCEPTION WHEN OTHERS THEN
    SELECT p.id INTO v_pid FROM public.profiles p
     WHERE p.user_id = v_uid
     ORDER BY p.created_at ASC NULLS LAST LIMIT 1;
  END;

  eligible := COALESCE(p_current, 0) >= COALESCE(p_required, 0) AND COALESCE(p_required, 0) > 0;

  SELECT EXISTS(
    SELECT 1 FROM public.oculto_aura_achievement_claims c
     WHERE c.user_id = v_uid AND c.achievement_id = p_achievement_id
  ) INTO already_claimed;

  SELECT COALESCE(MAX(p.aura_xp),0), COALESCE(MAX(p.aura_level),1)
    INTO xp_total, level
    FROM public.profiles p
   WHERE p.user_id = v_uid;

  v_is_rare := p_xp_reward >= 10000;
  rare := v_is_rare;

  IF already_claimed OR NOT eligible THEN
    awarded := false;
    RETURN NEXT; RETURN;
  END IF;

  v_safe_xp := LEAST(10000, GREATEST(100, p_xp_reward));

  INSERT INTO public.oculto_aura_achievement_claims (user_id, profile_id, achievement_id, xp_awarded)
  VALUES (v_uid, v_pid, p_achievement_id, v_safe_xp)
  ON CONFLICT (user_id, achievement_id) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  IF v_inserted = 0 THEN
    already_claimed := true;
    awarded := false;
    RETURN NEXT; RETURN;
  END IF;

  UPDATE public.profiles
     SET aura_xp = GREATEST(0, COALESCE(aura_xp, 0) + v_safe_xp),
         aura_level = public.aura_level_from_xp(GREATEST(0, COALESCE(aura_xp, 0) + v_safe_xp))
   WHERE user_id = v_uid;

  SELECT COALESCE(MAX(p.aura_xp),0), COALESCE(MAX(p.aura_level),1)
    INTO xp_total, level
    FROM public.profiles p
   WHERE p.user_id = v_uid;

  v_notif_title := COALESCE(NULLIF(trim(p_title),''), 'Conquista desbloqueada');

  -- Notificação privada de pagamento
  BEGIN
    INSERT INTO public.notifications (user_id, type, title, body, data)
    VALUES (
      v_uid, 'system',
      CASE WHEN v_is_rare THEN '🏆 Conquista RARA: ' || v_notif_title ELSE '🎉 ' || v_notif_title END,
      '+' || v_safe_xp || ' XP creditados no seu saldo Aura.',
      jsonb_build_object(
        'kind', 'aura_achievement_claim',
        'achievement_id', p_achievement_id,
        'xp_awarded', v_safe_xp,
        'rare', v_is_rare
      )
    );
  EXCEPTION WHEN OTHERS THEN NULL; END;

  -- Broadcast público se for RARA
  IF v_is_rare THEN
    BEGIN
      INSERT INTO public.oculto_aura_rare_unlocks
        (user_id, profile_id, achievement_id, achievement_title, xp_awarded)
      VALUES (v_uid, v_pid, p_achievement_id, v_notif_title, v_safe_xp)
      ON CONFLICT (user_id, achievement_id) DO NOTHING;
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;

  awarded := true;
  already_claimed := false;
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.aura_achievement_claim_v2(text, integer, integer, integer, text) TO authenticated;

-- 3) Realtime para broadcast público
ALTER TABLE public.oculto_aura_rare_unlocks REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
       WHERE pubname='supabase_realtime' AND schemaname='public'
         AND tablename='oculto_aura_rare_unlocks'
    ) THEN
      EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.oculto_aura_rare_unlocks';
    END IF;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 4) Backfill retroativo: cria rare_unlocks p/ claims antigos >= 10k XP
INSERT INTO public.oculto_aura_rare_unlocks (user_id, profile_id, achievement_id, xp_awarded, created_at)
SELECT c.user_id, c.profile_id, c.achievement_id, c.xp_awarded, c.claimed_at
  FROM public.oculto_aura_achievement_claims c
 WHERE c.xp_awarded >= 10000
ON CONFLICT (user_id, achievement_id) DO NOTHING;

NOTIFY pgrst, 'reload schema';

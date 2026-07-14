-- ============================================================================
-- CASALTOMATE — Reset forçado: Aura Level 1, XP Total = 1500
-- Remove conquistas que exigem nível > 1 ou XP > 1500.
-- Idempotente. Executar no SQL Editor do Supabase EXTERNO.
-- ============================================================================

DO $$
DECLARE
  v_uid uuid;
  v_pid uuid;
BEGIN
  SELECT user_id, id INTO v_uid, v_pid
    FROM public.profiles
   WHERE lower(username) = 'casaltomate'
   LIMIT 1;

  IF v_uid IS NULL THEN
    RAISE NOTICE 'casaltomate não encontrado';
    RETURN;
  END IF;

  -- 1) Força XP=1500, level=1, streak=0
  UPDATE public.profiles
     SET aura_xp = 1500,
         aura_level = 1,
         aura_streak_days = 0
   WHERE user_id = v_uid;

  -- 2) Limpa ledger de XP (interações)
  IF to_regclass('public.oculto_aura_xp_interaction_ledger') IS NOT NULL THEN
    DELETE FROM public.oculto_aura_xp_interaction_ledger
     WHERE receiver_id = v_pid OR sender_id = v_pid;
  END IF;

  -- 3) Limpa presentes de XP enviados/recebidos
  IF to_regclass('public.oculto_aura_xp_gifts') IS NOT NULL THEN
    DELETE FROM public.oculto_aura_xp_gifts
     WHERE receiver_id = v_pid OR sender_id = v_pid;
  END IF;

  -- 4) Remove TODAS as conquistas reivindicadas (não é nv 1 puro)
  IF to_regclass('public.oculto_aura_achievement_claims') IS NOT NULL THEN
    DELETE FROM public.oculto_aura_achievement_claims
     WHERE user_id = v_uid OR profile_id = v_pid;
  END IF;

  -- 5) Remove unlocks raros
  IF to_regclass('public.oculto_aura_rare_unlocks') IS NOT NULL THEN
    DELETE FROM public.oculto_aura_rare_unlocks
     WHERE user_id = v_uid OR profile_id = v_pid;
  END IF;

  -- 6) Limpa histórico de XP repair audit (opcional)
  IF to_regclass('public.oculto_aura_xp_repair_audit') IS NOT NULL THEN
    DELETE FROM public.oculto_aura_xp_repair_audit WHERE user_id = v_uid;
  END IF;

  -- 7) Limpa snapshots antigos contaminados
  IF to_regclass('public.oculto_aura_user_snapshots') IS NOT NULL THEN
    DELETE FROM public.oculto_aura_user_snapshots WHERE user_id = v_uid;
  END IF;

  -- 8) Limpa streak histórico se existir
  IF to_regclass('public.oculto_aura_streak_history') IS NOT NULL THEN
    DELETE FROM public.oculto_aura_streak_history WHERE user_id = v_uid;
  END IF;

  -- 9) Insere XP base de 1500 como ledger sintético (origem do número)
  IF to_regclass('public.oculto_aura_xp_repair_audit') IS NOT NULL THEN
    INSERT INTO public.oculto_aura_xp_repair_audit (user_id, previous_xp, new_xp, reason, created_at)
    VALUES (v_uid, 46377, 1500, 'manual_reset_master', now());
  END IF;

  RAISE NOTICE 'casaltomate resetado: level=1, xp=1500';
END $$;

-- Diagnóstico
SELECT username, aura_xp, aura_level, aura_streak_days
  FROM public.profiles
 WHERE lower(username) = 'casaltomate';

SELECT 'claims restantes' AS step, count(*)
  FROM public.oculto_aura_achievement_claims c
  JOIN public.profiles p ON p.user_id = c.user_id
 WHERE lower(p.username) = 'casaltomate';

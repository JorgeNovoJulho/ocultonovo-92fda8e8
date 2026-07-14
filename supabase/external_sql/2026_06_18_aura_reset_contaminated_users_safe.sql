-- =====================================================================
-- Aura Match — RESET seguro de usuários contaminados pelo bug do master
-- Idempotente. Cole INTEIRO no SQL Editor do Supabase EXTERNO e execute.
--
-- Diferencial desta versão: TODAS as operações em tabelas opcionais são
-- envolvidas em `to_regclass(...) IS NOT NULL`, evitando o erro
-- "relation ... does not exist" no banco externo.
--
-- Alvo:
--   • @casaltomate (sempre incluído)
--   • Qualquer usuário com claim onde profile_id <> user_id (vazamento)
--   • Qualquer usuário cujo aura_xp E aura_level coincidam EXATAMENTE
--     com os valores do @ocultomaster (sintoma do vazamento)
--   • @ocultomaster é PRESERVADO em todas as etapas.
--
-- Restauração:
--   • Se existir snapshot em oculto_aura_xp_repair_audit (original_xp),
--     restaura para o último valor anterior conhecido.
--   • Caso contrário, zera aura_xp/aura_level/aura_streak_days.
-- =====================================================================

-- 0) Master UID + alvos --------------------------------------------------
DROP TABLE IF EXISTS _master_uid;
CREATE TEMP TABLE _master_uid(uid uuid, xp int, lvl int);

INSERT INTO _master_uid(uid, xp, lvl)
SELECT user_id, COALESCE(aura_xp,0), COALESCE(aura_level,1)
  FROM public.profiles
 WHERE lower(username) IN ('ocultomaster','oculto_master','oculto.master')
 ORDER BY created_at ASC NULLS LAST
 LIMIT 1;

DROP TABLE IF EXISTS _targets;
CREATE TEMP TABLE _targets(user_id uuid PRIMARY KEY);

-- (a) @casaltomate
INSERT INTO _targets(user_id)
SELECT p.user_id FROM public.profiles p
 WHERE lower(p.username) = 'casaltomate'
   AND p.user_id IS DISTINCT FROM (SELECT uid FROM _master_uid)
ON CONFLICT DO NOTHING;

-- (b) Vazamento direto (claim com profile_id apontando para perfil errado)
DO $$
BEGIN
  IF to_regclass('public.oculto_aura_achievement_claims') IS NOT NULL THEN
    INSERT INTO _targets(user_id)
    SELECT DISTINCT c.user_id
      FROM public.oculto_aura_achievement_claims c
      JOIN public.profiles p ON p.id = c.profile_id
     WHERE p.user_id IS DISTINCT FROM c.user_id
       AND c.user_id IS DISTINCT FROM (SELECT uid FROM _master_uid)
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- (c) XP+Level idênticos ao master (vulnerável/contaminado)
INSERT INTO _targets(user_id)
SELECT p.user_id
  FROM public.profiles p, _master_uid m
 WHERE p.user_id IS DISTINCT FROM m.uid
   AND COALESCE(p.aura_xp,0) = m.xp
   AND COALESCE(p.aura_level,1) = m.lvl
   AND COALESCE(p.aura_xp,0) > 0
ON CONFLICT DO NOTHING;

-- 1) LIMPEZA — só executa se a tabela existir ----------------------------
DO $$
DECLARE
  t_master uuid := (SELECT uid FROM _master_uid);
BEGIN
  -- Aura claims & unlocks
  IF to_regclass('public.oculto_aura_achievement_claims') IS NOT NULL THEN
    DELETE FROM public.oculto_aura_achievement_claims
     WHERE user_id IN (SELECT user_id FROM _targets)
       AND user_id IS DISTINCT FROM t_master;
  END IF;

  IF to_regclass('public.oculto_aura_rare_unlocks') IS NOT NULL THEN
    DELETE FROM public.oculto_aura_rare_unlocks
     WHERE user_id IN (SELECT user_id FROM _targets)
       AND user_id IS DISTINCT FROM t_master;
  END IF;

  -- Presentes XP (por profile_id)
  IF to_regclass('public.oculto_aura_xp_gifts') IS NOT NULL THEN
    DELETE FROM public.oculto_aura_xp_gifts g
     USING public.profiles p
     WHERE (g.sender_id = p.id OR g.receiver_id = p.id)
       AND p.user_id IN (SELECT user_id FROM _targets)
       AND p.user_id IS DISTINCT FROM t_master;
  END IF;

  -- Ledger de interação
  IF to_regclass('public.oculto_aura_xp_interaction_ledger') IS NOT NULL THEN
    DELETE FROM public.oculto_aura_xp_interaction_ledger l
     USING public.profiles p
     WHERE (l.actor_id = p.id OR l.receiver_id = p.id)
       AND p.user_id IN (SELECT user_id FROM _targets)
       AND p.user_id IS DISTINCT FROM t_master;
  END IF;

  -- xp_transactions (filtra por action_type/description; coluna `reason` não existe)
  IF to_regclass('public.xp_transactions') IS NOT NULL THEN
    DELETE FROM public.xp_transactions
     WHERE user_id IN (SELECT user_id FROM _targets)
       AND user_id IS DISTINCT FROM t_master
       AND (
            lower(COALESCE(action_type,'')) LIKE '%aura%'
         OR lower(COALESCE(action_type,'')) LIKE '%match%'
         OR lower(COALESCE(action_type,'')) LIKE '%conquista%'
         OR lower(COALESCE(action_type,'')) LIKE '%achievement%'
         OR lower(COALESCE(action_type,'')) LIKE '%mining%'
         OR lower(COALESCE(action_type,'')) LIKE '%quest%'
         OR lower(COALESCE(action_type,'')) LIKE '%chest%'
         OR lower(COALESCE(description,'')) LIKE '%aura%'
         OR lower(COALESCE(description,'')) LIKE '%match%'
         OR lower(COALESCE(description,'')) LIKE '%conquista%'
         OR lower(COALESCE(description,'')) LIKE '%achievement%'
         OR lower(COALESCE(description,'')) LIKE '%mining%'
         OR lower(COALESCE(description,'')) LIKE '%quest%'
         OR lower(COALESCE(description,'')) LIKE '%chest%'
       );
  END IF;

  -- user_levels (pode não existir no externo)
  IF to_regclass('public.user_levels') IS NOT NULL THEN
    DELETE FROM public.user_levels
     WHERE user_id IN (SELECT user_id FROM _targets)
       AND user_id IS DISTINCT FROM t_master;
  END IF;

  -- Demais tabelas oculto_aura_* opcionais
  IF to_regclass('public.oculto_aura_daily_quests') IS NOT NULL THEN
    DELETE FROM public.oculto_aura_daily_quests
     WHERE user_id IN (SELECT user_id FROM _targets) AND user_id IS DISTINCT FROM t_master;
  END IF;
  IF to_regclass('public.oculto_aura_visits') IS NOT NULL THEN
    DELETE FROM public.oculto_aura_visits
     WHERE user_id IN (SELECT user_id FROM _targets) AND user_id IS DISTINCT FROM t_master;
  END IF;
  IF to_regclass('public.oculto_aura_streaks') IS NOT NULL THEN
    DELETE FROM public.oculto_aura_streaks
     WHERE user_id IN (SELECT user_id FROM _targets) AND user_id IS DISTINCT FROM t_master;
  END IF;
  IF to_regclass('public.oculto_aura_weekly_chests') IS NOT NULL THEN
    DELETE FROM public.oculto_aura_weekly_chests
     WHERE user_id IN (SELECT user_id FROM _targets) AND user_id IS DISTINCT FROM t_master;
  END IF;
  IF to_regclass('public.oculto_aura_boosts') IS NOT NULL THEN
    DELETE FROM public.oculto_aura_boosts
     WHERE user_id IN (SELECT user_id FROM _targets) AND user_id IS DISTINCT FROM t_master;
  END IF;
  IF to_regclass('public.oculto_aura_duels') IS NOT NULL THEN
    DELETE FROM public.oculto_aura_duels
     WHERE (challenger_id IN (SELECT user_id FROM _targets) OR opponent_id IN (SELECT user_id FROM _targets))
       AND challenger_id IS DISTINCT FROM t_master AND opponent_id IS DISTINCT FROM t_master;
  END IF;
  IF to_regclass('public.oculto_aura_pulses') IS NOT NULL THEN
    DELETE FROM public.oculto_aura_pulses
     WHERE user_id IN (SELECT user_id FROM _targets) AND user_id IS DISTINCT FROM t_master;
  END IF;
  IF to_regclass('public.oculto_aura_attention') IS NOT NULL THEN
    DELETE FROM public.oculto_aura_attention
     WHERE user_id IN (SELECT user_id FROM _targets) AND user_id IS DISTINCT FROM t_master;
  END IF;
  IF to_regclass('public.oculto_aura_room_actions') IS NOT NULL THEN
    DELETE FROM public.oculto_aura_room_actions
     WHERE user_id IN (SELECT user_id FROM _targets) AND user_id IS DISTINCT FROM t_master;
  END IF;
  IF to_regclass('public.oculto_aura_mining_log') IS NOT NULL THEN
    DELETE FROM public.oculto_aura_mining_log
     WHERE user_id IN (SELECT user_id FROM _targets) AND user_id IS DISTINCT FROM t_master;
  END IF;
END $$;

-- 2) ZERAR profiles dos alvos -------------------------------------------
UPDATE public.profiles p
   SET aura_xp = 0,
       aura_level = 1,
       aura_streak_days = 0
  FROM _targets t, _master_uid m
 WHERE p.user_id = t.user_id
   AND p.user_id IS DISTINCT FROM m.uid;

-- 3) RESTAURAR via snapshot histórico se existir ------------------------
DO $$
BEGIN
  IF to_regclass('public.oculto_aura_xp_repair_audit') IS NOT NULL THEN
    WITH last_snap AS (
      SELECT DISTINCT ON (a.user_id) a.user_id, a.original_xp
        FROM public.oculto_aura_xp_repair_audit a
        JOIN _targets t ON t.user_id = a.user_id
       WHERE a.original_xp IS NOT NULL
       ORDER BY a.user_id, a.created_at DESC NULLS LAST
    )
    UPDATE public.profiles p
       SET aura_xp = GREATEST(0, s.original_xp),
           aura_level = CASE
             WHEN to_regprocedure('public.aura_level_from_xp(int)') IS NOT NULL
               THEN public.aura_level_from_xp(GREATEST(0, s.original_xp))
             ELSE 1
           END
      FROM last_snap s, _master_uid m
     WHERE p.user_id = s.user_id
       AND p.user_id IS DISTINCT FROM m.uid;
  END IF;
END $$;

-- 4) Relatório final -----------------------------------------------------
SELECT p.username, p.aura_xp, p.aura_level, p.aura_streak_days
  FROM public.profiles p
  JOIN _targets t ON t.user_id = p.user_id
 ORDER BY p.username;

NOTIFY pgrst, 'reload schema';

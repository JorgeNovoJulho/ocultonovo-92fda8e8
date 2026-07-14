-- =====================================================================
-- Fix: Cofre Semanal usando nível de OUTRO usuário
-- =====================================================================
-- Bug: as RPCs aura_weekly_chest_status() e aura_weekly_chest_claim()
-- resolviam o perfil apenas por `profiles.user_id = auth.uid()`. Como o
-- vínculo canônico na base é `profiles.id = auth.uid()` (user_id pode
-- estar nulo/divergente/duplicado entre perfis), a função podia retornar
-- o aura_level de OUTRO perfil — efeito visto na conta @andarilha
-- (nível real 2 aparecendo como nível 15 no cofre).
--
-- Correção: resolver o perfil priorizando `id = auth.uid()` e só usando
-- `user_id = auth.uid()` como fallback, com LIMIT 1.
--
-- Também: limpar linhas de oculto_aura_weekly_chests cujo user_id NÃO
-- corresponda a nenhum perfil real (órfãs do bug anterior).
--
-- Idempotente.
-- =====================================================================

-- ---------------------------------------------------------------------
-- DIAGNÓSTICO (ANTES) — perfil(is) ligados a @andarilha
-- ---------------------------------------------------------------------
SELECT 'ANTES — profiles andarilha' AS step,
       id, user_id, username, aura_xp
  FROM public.profiles
 WHERE username = 'andarilha';

SELECT 'ANTES — chests andarilha' AS step,
       c.user_id, c.week_key, c.level_at_claim, c.xp_awarded, c.claimed_at
  FROM public.oculto_aura_weekly_chests c
  JOIN public.profiles p
    ON p.id = c.user_id OR p.user_id = c.user_id
 WHERE p.username = 'andarilha'
 ORDER BY c.claimed_at DESC;

-- ---------------------------------------------------------------------
-- 1) aura_weekly_chest_status — resolver perfil por id primeiro
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.aura_weekly_chest_status()
RETURNS TABLE(
  week_key      text,
  claimed       boolean,
  claimed_at    timestamptz,
  next_claim_at timestamptz,
  level         int,
  xp_preview    int,
  super_dm_preview int
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_wk  text := public.aura_current_week_key();
  v_row record;
  v_level int;
  v_xp_preview int;
  v_sdm_preview int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;

  -- Resolve nível APENAS do perfil do próprio usuário, preferindo id.
  SELECT p.aura_level INTO v_level
    FROM public.profiles p
   WHERE p.id = v_uid
   LIMIT 1;

  IF v_level IS NULL THEN
    SELECT p.aura_level INTO v_level
      FROM public.profiles p
     WHERE p.user_id = v_uid
     ORDER BY p.created_at ASC NULLS LAST
     LIMIT 1;
  END IF;

  v_level := COALESCE(v_level, 1);

  v_xp_preview  := LEAST(500, 50 + (v_level - 1) * 25);
  v_sdm_preview := CASE WHEN v_level >= 5 THEN 1 ELSE 0 END
                 + CASE WHEN v_level >= 10 THEN 1 ELSE 0 END
                 + CASE WHEN v_level >= 20 THEN 1 ELSE 0 END;

  SELECT * INTO v_row FROM public.oculto_aura_weekly_chests
   WHERE user_id = v_uid AND week_key = v_wk
   ORDER BY claimed_at DESC LIMIT 1;

  week_key      := v_wk;
  claimed       := v_row.id IS NOT NULL;
  claimed_at    := v_row.claimed_at;
  next_claim_at := CASE
    WHEN v_row.id IS NULL THEN now()
    ELSE date_trunc('week', (now() at time zone 'America/Sao_Paulo'))::timestamptz + interval '7 days'
  END;
  level         := v_level;
  xp_preview    := v_xp_preview;
  super_dm_preview := v_sdm_preview;
  RETURN NEXT;
END;
$$;

-- ---------------------------------------------------------------------
-- 2) aura_weekly_chest_claim — mesma correção de resolução de perfil
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.aura_weekly_chest_claim()
RETURNS TABLE(
  ok           boolean,
  message      text,
  xp_awarded   int,
  super_dm_awarded int,
  level        int,
  level_up     boolean
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_wk  text := public.aura_current_week_key();
  v_profile_id uuid;
  v_level int;
  v_xp int;
  v_sdm int;
  v_old_level int;
  v_new_level int;
  v_new_xp int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;

  -- Resolve o perfil canônico do usuário (id primeiro, depois user_id).
  SELECT p.id, p.aura_level
    INTO v_profile_id, v_level
    FROM public.profiles p
   WHERE p.id = v_uid
   LIMIT 1;

  IF v_profile_id IS NULL THEN
    SELECT p.id, p.aura_level
      INTO v_profile_id, v_level
      FROM public.profiles p
     WHERE p.user_id = v_uid
     ORDER BY p.created_at ASC NULLS LAST
     LIMIT 1;
  END IF;

  IF v_profile_id IS NULL THEN
    ok := false; message := 'Perfil não encontrado';
    xp_awarded := 0; super_dm_awarded := 0; level := 1; level_up := false;
    RETURN NEXT; RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM public.oculto_aura_weekly_chests
              WHERE user_id = v_uid AND week_key = v_wk) THEN
    ok := false; message := 'Cofre desta semana já foi reivindicado';
    xp_awarded := 0; super_dm_awarded := 0;
    level := COALESCE(v_level, 1); level_up := false;
    RETURN NEXT; RETURN;
  END IF;

  v_level := COALESCE(v_level, 1);
  v_old_level := v_level;

  v_xp  := LEAST(500, 50 + (v_level - 1) * 25);
  v_sdm := CASE WHEN v_level >= 5 THEN 1 ELSE 0 END
         + CASE WHEN v_level >= 10 THEN 1 ELSE 0 END
         + CASE WHEN v_level >= 20 THEN 1 ELSE 0 END;

  INSERT INTO public.oculto_aura_weekly_chests
    (user_id, week_key, level_at_claim, xp_awarded, super_dm_awarded)
    VALUES (v_uid, v_wk, v_level, v_xp, v_sdm);

  UPDATE public.profiles
     SET aura_xp = GREATEST(0, aura_xp + v_xp),
         aura_level = public.aura_level_from_xp(GREATEST(0, aura_xp + v_xp))
   WHERE id = v_profile_id
   RETURNING aura_xp, aura_level INTO v_new_xp, v_new_level;

  ok := true;
  message := 'Cofre reivindicado!';
  xp_awarded := v_xp;
  super_dm_awarded := v_sdm;
  level := COALESCE(v_new_level, v_level);
  level_up := COALESCE(v_new_level, v_level) > v_old_level;
  RETURN NEXT;
END;
$$;

-- ---------------------------------------------------------------------
-- 3) Limpeza de cofres órfãos (user_id sem perfil correspondente)
-- ---------------------------------------------------------------------
DELETE FROM public.oculto_aura_weekly_chests c
 WHERE NOT EXISTS (
   SELECT 1 FROM public.profiles p
    WHERE p.id = c.user_id OR p.user_id = c.user_id
 );

-- ---------------------------------------------------------------------
-- DIAGNÓSTICO (DEPOIS)
-- ---------------------------------------------------------------------
SELECT 'DEPOIS — profiles andarilha' AS step,
       id, user_id, username, aura_xp
  FROM public.profiles
 WHERE username = 'andarilha';

SELECT 'DEPOIS — chests andarilha' AS step,
       c.user_id, c.week_key, c.level_at_claim, c.xp_awarded, c.claimed_at
  FROM public.oculto_aura_weekly_chests c
  JOIN public.profiles p
    ON p.id = c.user_id OR p.user_id = c.user_id
 WHERE p.username = 'andarilha'
 ORDER BY c.claimed_at DESC;

GRANT EXECUTE ON FUNCTION public.aura_weekly_chest_status() TO authenticated;
GRANT EXECUTE ON FUNCTION public.aura_weekly_chest_claim()  TO authenticated;
NOTIFY pgrst, 'reload schema';

-- =============================================================================
-- Correção definitiva: nenhum usuário no dia de entrada pode receber 10.000 XP
-- EXTERNO APENAS. Idempotente. Cole e execute INTEIRO no SQL Editor externo.
--
-- Regras aplicadas:
-- 1) Perfil novo nasce com 100 XP e nível 2.
-- 2) Qualquer tentativa de gravar >= 10.000 XP no dia de entrada é reduzida para 100 XP.
-- 3) Claims, broadcasts raros e notificações de conquista rara são bloqueados no dia de entrada.
-- 4) Usuários recentes já contaminados por +10.000 XP são corrigidos para 100 XP / nível 2.
-- =============================================================================

BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS aura_xp integer NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS aura_level integer NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS aura_streak_days integer NOT NULL DEFAULT 0;

ALTER TABLE public.profiles
  ALTER COLUMN aura_xp SET DEFAULT 100,
  ALTER COLUMN aura_level SET DEFAULT 2;

CREATE OR REPLACE FUNCTION public.aura_level_from_xp(p_xp integer)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT GREATEST(1, FLOOR(SQRT(GREATEST(COALESCE(p_xp, 0), 0)::numeric / 50))::int + 1);
$$;

GRANT EXECUTE ON FUNCTION public.aura_level_from_xp(integer) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.oculto_profile_aura_entry_day_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND COALESCE(NEW.aura_xp, 0) < 100 THEN
    NEW.aura_xp := 100;
  END IF;

  NEW.aura_xp := GREATEST(0, COALESCE(NEW.aura_xp, 0));

  IF COALESCE(NEW.created_at, now()) >= now() - interval '1 day'
     AND NEW.aura_xp >= 10000 THEN
    NEW.aura_xp := 100;
  END IF;

  NEW.aura_level := public.aura_level_from_xp(NEW.aura_xp);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_oculto_profile_aura_level_guard ON public.profiles;
DROP TRIGGER IF EXISTS trg_oculto_profile_aura_entry_day_guard ON public.profiles;
CREATE TRIGGER trg_oculto_profile_aura_entry_day_guard
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.oculto_profile_aura_entry_day_guard();

CREATE OR REPLACE FUNCTION public.oculto_is_entry_day_profile(p_user_id uuid, p_profile_id uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.profiles p
     WHERE (p.user_id = p_user_id OR p.id = p_user_id OR (p_profile_id IS NOT NULL AND p.id = p_profile_id))
       AND COALESCE(p.created_at, now()) >= now() - interval '1 day'
  );
$$;

GRANT EXECUTE ON FUNCTION public.oculto_is_entry_day_profile(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.oculto_block_entry_day_rare_claim()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(NEW.xp_awarded, 0) >= 10000
     AND public.oculto_is_entry_day_profile(NEW.user_id, NEW.profile_id) THEN
    RETURN NULL;
  END IF;

  IF NEW.achievement_id IN ('xp_10000','lvl_50','rank_top10','match_50','play_views_1k','play_listen_streak_10','streak_30','gifts_10')
     AND public.oculto_is_entry_day_profile(NEW.user_id, NEW.profile_id) THEN
    RETURN NULL;
  END IF;

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.oculto_aura_achievement_claims') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_oculto_block_entry_day_rare_claim ON public.oculto_aura_achievement_claims;
    CREATE TRIGGER trg_oculto_block_entry_day_rare_claim
    BEFORE INSERT OR UPDATE ON public.oculto_aura_achievement_claims
    FOR EACH ROW EXECUTE FUNCTION public.oculto_block_entry_day_rare_claim();
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.oculto_block_entry_day_rare_unlock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(NEW.xp_awarded, 0) >= 10000
     AND public.oculto_is_entry_day_profile(NEW.user_id, NEW.profile_id) THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.oculto_aura_rare_unlocks') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_oculto_block_entry_day_rare_unlock ON public.oculto_aura_rare_unlocks;
    CREATE TRIGGER trg_oculto_block_entry_day_rare_unlock
    BEFORE INSERT OR UPDATE ON public.oculto_aura_rare_unlocks
    FOR EACH ROW EXECUTE FUNCTION public.oculto_block_entry_day_rare_unlock();
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.oculto_block_entry_day_rare_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_xp integer := 0;
  v_achievement_id text := NULL;
BEGIN
  IF NEW.data IS NULL OR NEW.data->>'kind' <> 'aura_achievement' THEN
    RETURN NEW;
  END IF;

  BEGIN
    v_xp := COALESCE((NEW.data->>'xp')::integer, 0);
  EXCEPTION WHEN OTHERS THEN
    v_xp := 0;
  END;

  v_achievement_id := NEW.data->>'achievement_id';

  IF public.oculto_is_entry_day_profile(NEW.user_id, NULL)
     AND (
       v_xp >= 10000
       OR v_achievement_id IN ('xp_10000','lvl_50','rank_top10','match_50','play_views_1k','play_listen_streak_10','streak_30','gifts_10')
     ) THEN
    RETURN NULL;
  END IF;

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.notifications') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_oculto_block_entry_day_rare_notification ON public.notifications;
    CREATE TRIGGER trg_oculto_block_entry_day_rare_notification
    BEFORE INSERT OR UPDATE ON public.notifications
    FOR EACH ROW EXECUTE FUNCTION public.oculto_block_entry_day_rare_notification();
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.oculto_aura_achievement_claims') IS NOT NULL THEN
    DELETE FROM public.oculto_aura_achievement_claims c
    USING public.profiles p
    WHERE (c.user_id = p.user_id OR c.user_id = p.id OR c.profile_id = p.id)
      AND p.created_at >= now() - interval '1 day'
      AND (
        COALESCE(c.xp_awarded, 0) >= 10000
        OR c.achievement_id IN ('xp_10000','lvl_50','rank_top10','match_50','play_views_1k','play_listen_streak_10','streak_30','gifts_10')
      );
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.oculto_aura_rare_unlocks') IS NOT NULL THEN
    DELETE FROM public.oculto_aura_rare_unlocks ru
    USING public.profiles p
    WHERE (ru.user_id = p.user_id OR ru.user_id = p.id OR ru.profile_id = p.id)
      AND p.created_at >= now() - interval '1 day'
      AND COALESCE(ru.xp_awarded, 0) >= 10000;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.notifications') IS NOT NULL THEN
    DELETE FROM public.notifications n
    USING public.profiles p
    WHERE (n.user_id = p.user_id OR n.user_id = p.id)
      AND p.created_at >= now() - interval '1 day'
      AND n.data->>'kind' = 'aura_achievement'
      AND (
        COALESCE(NULLIF(regexp_replace(COALESCE(n.data->>'xp','0'), '[^0-9-]', '', 'g'), '')::integer, 0) >= 10000
        OR n.data->>'achievement_id' IN ('xp_10000','lvl_50','rank_top10','match_50','play_views_1k','play_listen_streak_10','streak_30','gifts_10')
      );
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.xp_transactions') IS NOT NULL THEN
    DELETE FROM public.xp_transactions x
    USING public.profiles p
    WHERE (x.user_id = p.user_id OR x.user_id = p.id)
      AND p.created_at >= now() - interval '1 day'
      AND COALESCE(x.amount, 0) >= 10000;
  END IF;
END $$;

UPDATE public.profiles p
   SET aura_xp = 100
 WHERE p.created_at >= now() - interval '1 day'
   AND (COALESCE(p.aura_xp, 0) < 100 OR COALESCE(p.aura_xp, 0) >= 10000 OR COALESCE(p.aura_level, 1) >= 25);

DO $$
BEGIN
  IF to_regclass('public.user_levels') IS NOT NULL THEN
    UPDATE public.user_levels ul
       SET total_xp = 100,
           current_xp = 100,
           current_level = 2,
           updated_at = now()
      FROM public.profiles p
     WHERE (ul.user_id = p.user_id OR ul.user_id = p.id)
       AND p.created_at >= now() - interval '1 day'
       AND (COALESCE(ul.total_xp, 0) >= 10000 OR COALESCE(ul.current_level, 1) >= 25);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- Verificação pós-execução:
-- SELECT username, created_at, aura_xp, aura_level, public.aura_level_from_xp(aura_xp) AS nivel_calculado
--   FROM public.profiles
--  WHERE created_at >= now() - interval '1 day'
--    AND (aura_xp >= 10000 OR aura_level >= 25)
--  ORDER BY created_at DESC;
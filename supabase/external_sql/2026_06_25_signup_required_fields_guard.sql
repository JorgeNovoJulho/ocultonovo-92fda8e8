-- =====================================================================
-- Oculto Swing — Guard: signup completo exige foto + cidade + GPS
-- Executar no SQL Editor do Supabase EXTERNO (rvybbrkzmboqbhcemqar)
-- Idempotente: pode ser rodado múltiplas vezes sem efeitos colaterais.
-- =====================================================================

-- 1) Função que valida campos mínimos quando o onboarding for concluído.
--    NÃO impacta perfis legados (só dispara quando onboarding_completed=true
--    está sendo gravado/atualizado para true OU em INSERT já com true).
CREATE OR REPLACE FUNCTION public.enforce_signup_required_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_master boolean := false;
BEGIN
  -- Bypass para master admin (manutenção/correções manuais)
  BEGIN
    SELECT EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = COALESCE(NEW.user_id, NEW.id)
        AND ur.role::text IN ('master', 'admin')
    ) INTO is_master;
  EXCEPTION WHEN OTHERS THEN
    is_master := false;
  END;
  IF is_master THEN
    RETURN NEW;
  END IF;

  -- Só valida quando o registro está sendo MARCADO como concluído
  IF COALESCE(NEW.onboarding_completed, false) = true THEN
    IF NEW.avatar_url IS NULL OR length(trim(NEW.avatar_url)) = 0 THEN
      RAISE EXCEPTION 'SIGNUP_INCOMPLETO: foto de perfil obrigatória (avatar_url).'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.address_city IS NULL OR length(trim(NEW.address_city)) = 0 THEN
      RAISE EXCEPTION 'SIGNUP_INCOMPLETO: cidade obrigatória (address_city).'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.address_state IS NULL OR length(trim(NEW.address_state)) = 0 THEN
      RAISE EXCEPTION 'SIGNUP_INCOMPLETO: estado/UF obrigatório (address_state).'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.location_lat IS NULL OR NEW.location_lng IS NULL THEN
      RAISE EXCEPTION 'SIGNUP_INCOMPLETO: GPS obrigatório (location_lat/location_lng).'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- 2) Trigger BEFORE INSERT OR UPDATE on profiles
DROP TRIGGER IF EXISTS trg_enforce_signup_required_fields ON public.profiles;
CREATE TRIGGER trg_enforce_signup_required_fields
BEFORE INSERT OR UPDATE OF onboarding_completed, avatar_url, address_city, address_state, location_lat, location_lng
ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.enforce_signup_required_fields();

-- 3) Diagnóstico — lista perfis legados incompletos (não bloqueia, só inventário)
--    Útil para o admin migrar/notificar usuários antigos.
--    SELECT id, user_id, username, avatar_url, address_city, location_lat
--      FROM public.profiles
--     WHERE onboarding_completed = true
--       AND (avatar_url IS NULL OR address_city IS NULL OR location_lat IS NULL);

-- =====================================================================
-- FIM
-- =====================================================================

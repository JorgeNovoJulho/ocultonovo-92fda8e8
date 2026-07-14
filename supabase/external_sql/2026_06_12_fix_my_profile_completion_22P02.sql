-- =====================================================================
-- FIX 22P02 — my_profile_completion()
-- Projeto EXTERNO: rvybbrkzmboqbhcemqar
-- IDEMPOTENTE.
--
-- Problema:
--   O operador `miss || 'terms'` (text[] || unknown) era resolvido
--   ambiguamente pelo Postgres como `text[] || text[]`, tentando
--   converter 'terms' em array literal e disparando:
--     22P02 — malformed array literal: "terms"
--
-- Correção:
--   Trocar todas as concatenações por `array_append(miss, 'xxx')`,
--   que é inequívoco e seguro com text[].
--
-- COMO APLICAR:
--   1) Abra o SQL Editor do Supabase EXTERNO (rvybbrkzmboqbhcemqar).
--   2) Cole TODO este arquivo e clique em RUN.
--   3) Recarregue o app — o warning [useProfileCompletion] some.
-- =====================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.my_profile_completion()
RETURNS TABLE(is_complete boolean, missing text[])
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p    public.profiles%ROWTYPE;
  miss text[] := ARRAY[]::text[];
BEGIN
  SELECT * INTO p FROM public.profiles WHERE id = auth.uid() LIMIT 1;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, ARRAY['profile_not_found']::text[];
    RETURN;
  END IF;

  IF p.username   IS NULL OR length(trim(p.username)) = 0 THEN miss := array_append(miss, 'username');   END IF;
  IF p.name       IS NULL OR length(trim(p.name))     = 0 THEN miss := array_append(miss, 'name');       END IF;
  IF p.birth_date IS NULL                                  THEN miss := array_append(miss, 'birth_date'); END IF;
  IF p.gender     IS NULL OR length(trim(p.gender))   = 0 THEN miss := array_append(miss, 'gender');     END IF;
  IF p.terms_accepted_at   IS NULL THEN miss := array_append(miss, 'terms');      END IF;
  IF p.privacy_accepted_at IS NULL THEN miss := array_append(miss, 'privacy');    END IF;
  IF p.adult_confirmed_at  IS NULL THEN miss := array_append(miss, 'adult');      END IF;
  IF NOT COALESCE(p.onboarding_completed, false) THEN miss := array_append(miss, 'onboarding'); END IF;

  RETURN QUERY SELECT (array_length(miss, 1) IS NULL), miss;
END;
$$;

GRANT EXECUTE ON FUNCTION public.my_profile_completion() TO authenticated;

COMMIT;

-- =====================================================================
-- Master username reservation — 2026-06-04
-- Bloqueia qualquer variação de "oculto master" para terceiros e
-- padroniza o master canônico como @oculto_master.
-- Rodar manualmente no SQL Editor do Supabase EXTERNO.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.normalize_reserved_master_username(value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(regexp_replace(coalesce(unaccent(value), ''), '[^a-zA-Z0-9]+', '', 'g'))
$$;

CREATE OR REPLACE FUNCTION public.is_reserved_master_username(value text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT public.normalize_reserved_master_username(value) = 'ocultomaster'
$$;

CREATE OR REPLACE FUNCTION public.can_use_master_username(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM auth.users u
    WHERE u.id = _user_id
      AND lower(coalesce(u.email, '')) = 'ocultomaster@ocultoswing.com.br'
  )
$$;

CREATE OR REPLACE FUNCTION public.enforce_master_username_reservation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NEW.username IS NULL OR btrim(NEW.username) = '' THEN
    RETURN NEW;
  END IF;

  IF public.is_reserved_master_username(NEW.username) THEN
    IF public.can_use_master_username(coalesce(NEW.user_id, NEW.id)) THEN
      NEW.username := 'oculto_master';
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'username reservado: use outro identificador';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_master_username_reservation ON public.profiles;
CREATE TRIGGER trg_enforce_master_username_reservation
BEFORE INSERT OR UPDATE OF username ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.enforce_master_username_reservation();

UPDATE public.profiles
SET username = 'oculto_master'
WHERE public.is_reserved_master_username(username)
  AND public.can_use_master_username(coalesce(user_id, id));

-- Reduz dedupe de visitas de 1h para 5min para que re-visitas reais apareçam
-- em "Quem espiou seu perfil". Mantém a verificação de autoria.

CREATE OR REPLACE FUNCTION public.record_profile_visit(p_visitor_id uuid, p_visited_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  visitor_user_id UUID;
BEGIN
  IF p_visitor_id IS NULL OR p_visited_id IS NULL THEN
    RETURN;
  END IF;

  -- Prevent self-visits
  IF p_visitor_id = p_visited_id THEN
    RETURN;
  END IF;

  -- Verifica autoria do visitante
  SELECT user_id INTO visitor_user_id
  FROM profiles
  WHERE id = p_visitor_id;

  IF visitor_user_id IS NULL OR visitor_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized: Can only record visits as yourself';
  END IF;

  -- Dedupe curto: ignora apenas se visitou nos últimos 5 minutos
  IF EXISTS (
    SELECT 1 FROM profile_visits
    WHERE visitor_id = p_visitor_id
      AND visited_id = p_visited_id
      AND visited_at > now() - interval '5 minutes'
  ) THEN
    RETURN;
  END IF;

  INSERT INTO profile_visits (visitor_id, visited_id, visited_at)
  VALUES (p_visitor_id, p_visited_id, now());
END;
$function$;

GRANT EXECUTE ON FUNCTION public.record_profile_visit(uuid, uuid) TO authenticated;

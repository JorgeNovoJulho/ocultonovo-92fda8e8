-- =====================================================================
-- 2026-05-29 — Contador persistente de presentes recebidos por perfil
-- Idempotente — rodar no SQL Editor do Supabase EXTERNO.
-- Usado pelos cards "Boas-vindas aos novos do OCULTO".
-- =====================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS gifts_received_count integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.update_profile_gift_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    UPDATE public.profiles
       SET gifts_received_count = COALESCE(gifts_received_count, 0) + 1
     WHERE id = NEW.receiver_id;
  ELSIF (TG_OP = 'DELETE') THEN
    UPDATE public.profiles
       SET gifts_received_count = GREATEST(0, COALESCE(gifts_received_count, 0) - 1)
     WHERE id = OLD.receiver_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS tr_update_profile_gift_count ON public.oculto_aura_xp_gifts;
CREATE TRIGGER tr_update_profile_gift_count
AFTER INSERT OR DELETE ON public.oculto_aura_xp_gifts
FOR EACH ROW EXECUTE FUNCTION public.update_profile_gift_count();

-- Backfill inicial (rodar uma vez)
UPDATE public.profiles p
   SET gifts_received_count = sub.cnt
  FROM (
    SELECT receiver_id, COUNT(*)::int AS cnt
      FROM public.oculto_aura_xp_gifts
     GROUP BY receiver_id
  ) sub
 WHERE p.id = sub.receiver_id;

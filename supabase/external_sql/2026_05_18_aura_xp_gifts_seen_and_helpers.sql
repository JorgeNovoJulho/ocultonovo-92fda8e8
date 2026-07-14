-- =====================================================================
-- Aura XP Gifts — Coluna `seen`, RPC para marcar como visto e
-- RPC para contar presentes não vistos. Idempotente.
-- Rodar no SQL Editor do Supabase EXTERNO.
-- =====================================================================

-- 1) Coluna `seen` no log de presentes (default = NOT seen).
ALTER TABLE public.oculto_aura_xp_gifts
  ADD COLUMN IF NOT EXISTS seen boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_aura_xp_gifts_receiver_unseen
  ON public.oculto_aura_xp_gifts (receiver_id)
  WHERE seen = false;

-- 2) RPC: contar presentes não vistos do usuário autenticado.
CREATE OR REPLACE FUNCTION public.aura_xp_gifts_unseen_count()
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH me AS (
    SELECT id FROM public.profiles
     WHERE id = auth.uid() OR user_id = auth.uid()
     LIMIT 1
  )
  SELECT COUNT(*)::int
    FROM public.oculto_aura_xp_gifts g, me
   WHERE g.receiver_id = me.id
     AND g.seen = false;
$$;

GRANT EXECUTE ON FUNCTION public.aura_xp_gifts_unseen_count() TO authenticated;

-- 3) RPC: marcar todos os presentes recebidos como vistos.
CREATE OR REPLACE FUNCTION public.aura_xp_gifts_mark_all_seen()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_profile uuid;
  v_count   integer := 0;
BEGIN
  SELECT id INTO v_profile FROM public.profiles
   WHERE id = auth.uid() OR user_id = auth.uid()
   LIMIT 1;
  IF v_profile IS NULL THEN
    RETURN 0;
  END IF;
  UPDATE public.oculto_aura_xp_gifts
     SET seen = true
   WHERE receiver_id = v_profile
     AND seen = false;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.aura_xp_gifts_mark_all_seen() TO authenticated;

-- 4) Realtime para atualização automática do badge.
ALTER TABLE public.oculto_aura_xp_gifts REPLICA IDENTITY FULL;
DO $$ BEGIN
  PERFORM 1 FROM pg_publication_tables
   WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='oculto_aura_xp_gifts';
  IF NOT FOUND THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.oculto_aura_xp_gifts';
  END IF;
END $$;

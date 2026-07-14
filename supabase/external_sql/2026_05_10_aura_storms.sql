-- =====================================================================
-- Aura Match V3 — Tempestade Social (oculto_aura_storms)
-- Eventos temporários leves de "energia" no universo do Aura Match.
-- Sem realtime: o app faz polling de 60s no RPC `aura_current_storm()`.
-- Idempotente.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.oculto_aura_storms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('tempestade','aurora','eclipse','meteoros')),
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz NOT NULL,
  intensity smallint NOT NULL DEFAULT 1 CHECK (intensity BETWEEN 1 AND 3),
  message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index sem predicado (now() não é IMMUTABLE). Ordena por ends_at DESC para
-- as queries "tempestade ativa" varrerem poucas linhas no topo.
CREATE INDEX IF NOT EXISTS idx_aura_storms_ends_at
  ON public.oculto_aura_storms (ends_at DESC);

ALTER TABLE public.oculto_aura_storms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anyone reads active storms" ON public.oculto_aura_storms;
CREATE POLICY "anyone reads active storms"
  ON public.oculto_aura_storms FOR SELECT
  TO authenticated
  USING (ends_at > now());

-- RPC: devolve a tempestade ativa (a mais recente que ainda não expirou)
CREATE OR REPLACE FUNCTION public.aura_current_storm()
RETURNS TABLE(id uuid, kind text, starts_at timestamptz, ends_at timestamptz, intensity smallint, message text, remaining_seconds integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.id, s.kind, s.starts_at, s.ends_at, s.intensity, s.message,
         GREATEST(0, EXTRACT(EPOCH FROM (s.ends_at - now()))::int) AS remaining_seconds
  FROM public.oculto_aura_storms s
  WHERE s.ends_at > now() AND s.starts_at <= now()
  ORDER BY s.starts_at DESC
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.aura_current_storm() TO authenticated;

-- Helper opcional p/ admin disparar manualmente uma tempestade
CREATE OR REPLACE FUNCTION public.aura_trigger_storm(p_kind text, p_minutes int DEFAULT 15, p_intensity int DEFAULT 2, p_message text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.oculto_aura_storms(kind, ends_at, intensity, message)
  VALUES (p_kind, now() + make_interval(mins => GREATEST(1, p_minutes)), GREATEST(1, LEAST(3, p_intensity)), p_message)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.aura_trigger_storm(text,int,int,text) TO authenticated;

NOTIFY pgrst, 'reload schema';

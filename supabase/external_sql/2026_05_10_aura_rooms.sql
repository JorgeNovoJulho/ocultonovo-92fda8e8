-- =====================================================================
-- Aura Match V3 — Salas de Energia (oculto_aura_rooms)
-- Mini ambientes temporários sociais. NÃO é chat — apenas presença/descoberta.
-- 3 salas iniciais: madrugada-quente, conexoes-secretas, energia-vip.
-- Idempotente.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.oculto_aura_rooms (
  slug text PRIMARY KEY,
  name text NOT NULL,
  theme text,
  hue smallint NOT NULL DEFAULT 280,
  emoji text,
  active boolean NOT NULL DEFAULT true,
  vip_only boolean NOT NULL DEFAULT false,
  hour_from smallint,
  hour_to smallint,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.oculto_aura_rooms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anyone reads rooms" ON public.oculto_aura_rooms;
CREATE POLICY "anyone reads rooms"
  ON public.oculto_aura_rooms FOR SELECT
  TO authenticated
  USING (active = true);

INSERT INTO public.oculto_aura_rooms(slug, name, theme, hue, emoji, vip_only, hour_from, hour_to)
VALUES
  ('madrugada-quente', 'Madrugada Quente', 'Auras intensas após meia-noite', 280, '🌌', false, 0, 5),
  ('conexoes-secretas', 'Conexões Secretas', 'Encontros discretos e curiosos', 320, '💜', false, NULL, NULL),
  ('energia-vip',       'Energia VIP',       'Apenas auras VIP brilham aqui', 45,  '⚡', true,  NULL, NULL)
ON CONFLICT (slug) DO NOTHING;

-- RPC: presença na sala (até 12 user_ids) — usa profiles.last_seen_at se existir,
-- senão recai para profiles que tenham `is_invisible = false` e atualizaram nos últimos 30min.
CREATE OR REPLACE FUNCTION public.aura_room_presence(p_slug text)
RETURNS TABLE(user_id uuid, name text, avatar_url text, plan_type text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_room public.oculto_aura_rooms;
  v_hour int := EXTRACT(HOUR FROM now() at time zone 'America/Sao_Paulo')::int;
  v_within boolean := true;
BEGIN
  SELECT * INTO v_room FROM public.oculto_aura_rooms WHERE slug = p_slug AND active = true;
  IF NOT FOUND THEN RETURN; END IF;

  IF v_room.hour_from IS NOT NULL AND v_room.hour_to IS NOT NULL THEN
    IF v_room.hour_from < v_room.hour_to THEN
      v_within := v_hour >= v_room.hour_from AND v_hour < v_room.hour_to;
    ELSE
      v_within := v_hour >= v_room.hour_from OR v_hour < v_room.hour_to;
    END IF;
  END IF;

  IF NOT v_within THEN RETURN; END IF;

  RETURN QUERY
  SELECT p.user_id, p.name, p.avatar_url, p.plan_type
  FROM public.profiles p
  WHERE COALESCE(p.is_invisible, false) = false
    AND COALESCE(p.is_seed, false) = false
    AND p.user_id IS NOT NULL
    AND p.user_id <> auth.uid()
    AND p.updated_at > now() - interval '30 minutes'
    AND (NOT v_room.vip_only OR LOWER(COALESCE(p.plan_type,'')) LIKE '%vip%')
  ORDER BY p.updated_at DESC
  LIMIT 12;
END;
$$;

GRANT EXECUTE ON FUNCTION public.aura_room_presence(text) TO authenticated;

NOTIFY pgrst, 'reload schema';

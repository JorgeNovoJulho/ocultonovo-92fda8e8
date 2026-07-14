-- =============================================================================
-- CICLOS ESPECIAIS — AUTO-TICK SOB DEMANDA (sem dependência de pg_cron)
-- Backend: Supabase externo (rvybbrkzmboqbhcemqar). Idempotente.
--
-- Problema: a tabela oculto_special_cycle_sessions só era populada pelo cron
-- chamando special_cycle_tick(). Sem cron, nunca havia sessão aberta e o
-- badge "Ciclo social agora" nunca virava "Ciclo especial agora".
--
-- Solução: special_room_active() agora é VOLATILE plpgsql e dispara o
-- evaluate_and_open + tick antes de retornar. Inclui debounce de 20s via
-- tabela oculto_special_cycle_ticks para evitar overhead em consultas
-- frequentes (realtime / múltiplos clientes).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0) Tabela de debounce (somente 1 linha)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.oculto_special_cycle_ticks (
  id           int PRIMARY KEY DEFAULT 1,
  last_tick_at timestamptz NOT NULL DEFAULT 'epoch',
  CONSTRAINT oculto_special_cycle_ticks_singleton CHECK (id = 1)
);

INSERT INTO public.oculto_special_cycle_ticks (id, last_tick_at)
VALUES (1, 'epoch') ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.oculto_special_cycle_ticks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ticks_read" ON public.oculto_special_cycle_ticks;
CREATE POLICY "ticks_read" ON public.oculto_special_cycle_ticks
  FOR SELECT TO authenticated USING (true);

-- ---------------------------------------------------------------------------
-- 1) Debounced auto-tick (chamado por RPCs de leitura)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.special_cycle_autotick_if_due(p_min_seconds int DEFAULT 20)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_last  timestamptz;
  v_now   timestamptz := now();
  v_ran   boolean := false;
BEGIN
  -- pega lock leve via UPDATE condicional
  UPDATE public.oculto_special_cycle_ticks
     SET last_tick_at = v_now
   WHERE id = 1
     AND v_now - last_tick_at > make_interval(secs => p_min_seconds)
  RETURNING last_tick_at INTO v_last;

  IF FOUND THEN
    BEGIN
      PERFORM public.special_cycle_tick();
      v_ran := true;
    EXCEPTION WHEN OTHERS THEN
      -- nunca derruba a RPC de leitura
      v_ran := false;
    END;
  END IF;

  RETURN v_ran;
END;$$;

GRANT EXECUTE ON FUNCTION public.special_cycle_autotick_if_due(int) TO authenticated, anon;

-- ---------------------------------------------------------------------------
-- 2) Recria special_room_active como VOLATILE plpgsql com auto-tick
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.special_room_active(text);

CREATE OR REPLACE FUNCTION public.special_room_active(p_cycle_key text DEFAULT NULL)
RETURNS TABLE(
  id uuid, cycle_key text, room_slug text, label text, emoji text, hue int,
  opened_at timestamptz, closes_at timestamptz, status text,
  min_aura_level int, min_social_score int, min_prestige_xp int,
  required_plan text, requires_kyc boolean
)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Dispara abertura/fechamento sob demanda (debounced 20s)
  PERFORM public.special_cycle_autotick_if_due(20);

  RETURN QUERY
  SELECT s.id, s.cycle_key, s.room_slug, d.label, d.emoji, d.hue,
         s.opened_at, s.closes_at, s.status,
         d.min_aura_level, d.min_social_score, d.min_prestige_xp,
         d.required_plan, d.requires_kyc
  FROM public.oculto_special_cycle_sessions s
  JOIN public.oculto_special_cycle_definitions d ON d.key = s.cycle_key
  WHERE s.status = 'open'
    AND (p_cycle_key IS NULL OR s.cycle_key = p_cycle_key)
  ORDER BY s.opened_at DESC
  LIMIT 1;
END;$$;

GRANT EXECUTE ON FUNCTION public.special_room_active(text) TO authenticated, anon;

-- ---------------------------------------------------------------------------
-- 3) Recria special_room_session_for_slug também com auto-tick
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.special_room_session_for_slug(text);

CREATE OR REPLACE FUNCTION public.special_room_session_for_slug(p_slug text)
RETURNS TABLE(id uuid, cycle_key text, opened_at timestamptz, closes_at timestamptz, status text)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.special_cycle_autotick_if_due(20);

  RETURN QUERY
  SELECT s.id, s.cycle_key, s.opened_at, s.closes_at, s.status
  FROM public.oculto_special_cycle_sessions s
  WHERE s.room_slug = p_slug AND s.status IN ('open','closing')
  ORDER BY s.opened_at DESC LIMIT 1;
END;$$;

GRANT EXECUTE ON FUNCTION public.special_room_session_for_slug(text) TO authenticated, anon;

-- ---------------------------------------------------------------------------
-- 4) Bootstrap imediato — abre o que precisar AGORA
-- ---------------------------------------------------------------------------
SELECT public.special_cycle_tick();

NOTIFY pgrst, 'reload schema';

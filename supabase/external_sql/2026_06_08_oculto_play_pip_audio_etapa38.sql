-- ============================================================================
-- OCULTO PLAY — Etapa 38: Picture-in-Picture + Modo Áudio em Segundo Plano
-- Execute no SQL Editor do Supabase EXTERNO (rvybbrkzmboqbhcemqar).
-- Idempotente: pode rodar mais de uma vez.
--
-- Escopo:
--   • Telemetria opcional de uso de PiP / Modo Áudio por item, sem PII.
--   • RPC `oculto_play_log_pip_event` para o cliente registrar enter/exit.
--   • Sem alterar contratos existentes.
-- ============================================================================

-- 1) Tabela de eventos PiP/Audio (anonimizável)
CREATE TABLE IF NOT EXISTS public.oculto_play_pip_sessions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  item_id       uuid NOT NULL,
  mode          text NOT NULL CHECK (mode IN ('pip','audio')),
  event         text NOT NULL CHECK (event IN ('enter','exit')),
  duration_ms   integer NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pip_sessions_item_created
  ON public.oculto_play_pip_sessions (item_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pip_sessions_user_created
  ON public.oculto_play_pip_sessions (user_id, created_at DESC);

-- 2) Grants e RLS
GRANT SELECT, INSERT ON public.oculto_play_pip_sessions TO authenticated;
GRANT ALL ON public.oculto_play_pip_sessions TO service_role;

ALTER TABLE public.oculto_play_pip_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pip_self_insert" ON public.oculto_play_pip_sessions;
CREATE POLICY "pip_self_insert"
ON public.oculto_play_pip_sessions
FOR INSERT
TO authenticated
WITH CHECK (user_id IS NULL OR user_id = auth.uid());

DROP POLICY IF EXISTS "pip_self_read" ON public.oculto_play_pip_sessions;
CREATE POLICY "pip_self_read"
ON public.oculto_play_pip_sessions
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- 3) RPC para o cliente registrar evento de PiP/Audio
CREATE OR REPLACE FUNCTION public.oculto_play_log_pip_event(
  _item_id     uuid,
  _mode        text,
  _event       text,
  _duration_ms integer DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id uuid;
BEGIN
  IF _mode NOT IN ('pip','audio') THEN
    RAISE EXCEPTION 'invalid mode: %', _mode;
  END IF;
  IF _event NOT IN ('enter','exit') THEN
    RAISE EXCEPTION 'invalid event: %', _event;
  END IF;

  INSERT INTO public.oculto_play_pip_sessions(user_id, item_id, mode, event, duration_ms)
  VALUES (auth.uid(), _item_id, _mode, _event, _duration_ms)
  RETURNING id INTO _id;

  RETURN _id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.oculto_play_log_pip_event(uuid, text, text, integer)
  TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- SINGLE SESSION ENFORCEMENT
-- Garante apenas uma sessão ativa por usuário.
-- O admin master (ocultomaster@ocultoswing.com.br) NÃO é bloqueado.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.oculto_active_sessions (
  user_id uuid PRIMARY KEY,
  current_session_id text NOT NULL,
  device_label text,
  user_agent text,
  ip_hint text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.oculto_active_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own session read" ON public.oculto_active_sessions;
CREATE POLICY "own session read"
  ON public.oculto_active_sessions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "own session upsert" ON public.oculto_active_sessions;
CREATE POLICY "own session upsert"
  ON public.oculto_active_sessions
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "own session update" ON public.oculto_active_sessions;
CREATE POLICY "own session update"
  ON public.oculto_active_sessions
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "own session delete" ON public.oculto_active_sessions;
CREATE POLICY "own session delete"
  ON public.oculto_active_sessions
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Realtime para invalidar sessões antigas instantaneamente
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'oculto_active_sessions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.oculto_active_sessions;
  END IF;
END $$;

ALTER TABLE public.oculto_active_sessions REPLICA IDENTITY FULL;

-- Função de claim atômica: sempre sobrescreve a sessão atual com a nova.
CREATE OR REPLACE FUNCTION public.claim_active_session(
  p_session_id text,
  p_device_label text DEFAULT NULL,
  p_user_agent text DEFAULT NULL,
  p_ip_hint text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  INSERT INTO public.oculto_active_sessions
    (user_id, current_session_id, device_label, user_agent, ip_hint, updated_at)
  VALUES
    (v_user, p_session_id, p_device_label, p_user_agent, p_ip_hint, now())
  ON CONFLICT (user_id) DO UPDATE
    SET current_session_id = EXCLUDED.current_session_id,
        device_label       = EXCLUDED.device_label,
        user_agent         = EXCLUDED.user_agent,
        ip_hint            = EXCLUDED.ip_hint,
        updated_at         = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_active_session(text, text, text, text) TO authenticated;

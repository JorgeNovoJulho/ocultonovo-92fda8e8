-- =====================================================================
-- Radar Pings (acenos) — tabela base do "Quem te acenou no Radar"
-- Idempotente. Cole no SQL Editor do Supabase EXTERNO.
--
-- Sincroniza:
--   - Radar (sendPing)  -> INSERT em pings
--   - Modal "Quem te acenou no Radar" -> SELECT recebidos últimas 24h
--   - Realtime: canal global `bus:pings` (subscribeTable)
--
-- RLS:
--   - Usuário autenticado vê apenas pings em que é sender ou receiver
--   - INSERT exige sender_id = auth.uid()
--   - UPDATE permitido apenas para receiver marcar como 'seen'
--   - DELETE permitido apenas para sender (re-pingar após cooldown)
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.pings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  receiver_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','seen')),
  created_at timestamptz NOT NULL DEFAULT now(),
  seen_at timestamptz NULL,
  CONSTRAINT pings_no_self CHECK (sender_id <> receiver_id)
);

-- Evita duplicidade de aceno ativo (mesmo par, status sent)
CREATE UNIQUE INDEX IF NOT EXISTS pings_active_unique
  ON public.pings (sender_id, receiver_id)
  WHERE status = 'sent';

CREATE INDEX IF NOT EXISTS pings_receiver_created_idx
  ON public.pings (receiver_id, created_at DESC);

CREATE INDEX IF NOT EXISTS pings_sender_created_idx
  ON public.pings (sender_id, created_at DESC);

-- Grants obrigatórios (PostgREST)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pings TO authenticated;
GRANT ALL ON public.pings TO service_role;

ALTER TABLE public.pings ENABLE ROW LEVEL SECURITY;

-- Policies (idempotente: drop + create)
DROP POLICY IF EXISTS "pings_select_involved" ON public.pings;
CREATE POLICY "pings_select_involved" ON public.pings
  FOR SELECT TO authenticated
  USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

DROP POLICY IF EXISTS "pings_insert_self_sender" ON public.pings;
CREATE POLICY "pings_insert_self_sender" ON public.pings
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = sender_id AND sender_id <> receiver_id);

DROP POLICY IF EXISTS "pings_update_receiver_seen" ON public.pings;
CREATE POLICY "pings_update_receiver_seen" ON public.pings
  FOR UPDATE TO authenticated
  USING (auth.uid() = receiver_id)
  WITH CHECK (auth.uid() = receiver_id);

DROP POLICY IF EXISTS "pings_delete_sender" ON public.pings;
CREATE POLICY "pings_delete_sender" ON public.pings
  FOR DELETE TO authenticated
  USING (auth.uid() = sender_id);

-- Realtime: publica a tabela no canal padrão (idempotente)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'pings'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.pings';
  END IF;
END $$;

-- Confirmação (opcional)
-- SELECT count(*) AS total_pings FROM public.pings;

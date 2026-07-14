-- ============================================================
-- Etapa 2: Ghost Mode columns + blocked_contacts table (idempotente)
-- Rodar no SQL Editor do Supabase EXTERNO (rvybbrkzmboqbhcemqar)
-- ============================================================

-- 1) Colunas Ghost Mode em profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS has_ghost_mode boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_ghost_active boolean NOT NULL DEFAULT false;

-- 2) Tabela blocked_contacts
CREATE TABLE IF NOT EXISTS public.blocked_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  blocked_user_id uuid NOT NULL,
  block_type text NOT NULL DEFAULT 'blocked' CHECK (block_type IN ('blocked','muted')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, blocked_user_id)
);

CREATE INDEX IF NOT EXISTS idx_blocked_contacts_user_id ON public.blocked_contacts(user_id);
CREATE INDEX IF NOT EXISTS idx_blocked_contacts_blocked_user_id ON public.blocked_contacts(blocked_user_id);

ALTER TABLE public.blocked_contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own blocks" ON public.blocked_contacts;
CREATE POLICY "Users view own blocks" ON public.blocked_contacts
  FOR SELECT USING (
    user_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Users insert own blocks" ON public.blocked_contacts;
CREATE POLICY "Users insert own blocks" ON public.blocked_contacts
  FOR INSERT WITH CHECK (
    user_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Users delete own blocks" ON public.blocked_contacts;
CREATE POLICY "Users delete own blocks" ON public.blocked_contacts
  FOR DELETE USING (
    user_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Users update own blocks" ON public.blocked_contacts;
CREATE POLICY "Users update own blocks" ON public.blocked_contacts
  FOR UPDATE USING (
    user_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  );

-- Forçar refresh do schema cache PostgREST
NOTIFY pgrst, 'reload schema';

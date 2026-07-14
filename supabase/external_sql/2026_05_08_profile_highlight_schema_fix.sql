-- =====================================================================
-- Corrige a infraestrutura do Destaque Dourado no Supabase EXTERNO
-- Projeto: Oculto Swing
-- Idempotente: pode ser executado mais de uma vez com segurança
-- =====================================================================

-- 1) Campos de cobrança necessários no perfil
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS cpf_cnpj text,
  ADD COLUMN IF NOT EXISTS phone_number text;

CREATE INDEX IF NOT EXISTS idx_profiles_cpf_cnpj
  ON public.profiles (cpf_cnpj)
  WHERE cpf_cnpj IS NOT NULL;

-- 2) Tabela do destaque dourado (usada pelo fallback do frontend)
CREATE TABLE IF NOT EXISTS public.oculto_profile_highlights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  amount_paid numeric(10,2) NOT NULL DEFAULT 0,
  starts_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  active boolean NOT NULL DEFAULT true,
  payment_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_oculto_profile_highlights_profile_active
  ON public.oculto_profile_highlights (profile_id, active, expires_at DESC);

CREATE INDEX IF NOT EXISTS idx_oculto_profile_highlights_user_id
  ON public.oculto_profile_highlights (user_id);

ALTER TABLE public.oculto_profile_highlights ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own profile highlights" ON public.oculto_profile_highlights;
CREATE POLICY "Users can read own profile highlights"
  ON public.oculto_profile_highlights
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = oculto_profile_highlights.profile_id
        AND p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can insert own profile highlights" ON public.oculto_profile_highlights;
CREATE POLICY "Users can insert own profile highlights"
  ON public.oculto_profile_highlights
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = oculto_profile_highlights.profile_id
        AND p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can update own profile highlights" ON public.oculto_profile_highlights;
CREATE POLICY "Users can update own profile highlights"
  ON public.oculto_profile_highlights
  FOR UPDATE
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = oculto_profile_highlights.profile_id
        AND p.user_id = auth.uid()
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = oculto_profile_highlights.profile_id
        AND p.user_id = auth.uid()
    )
  );

-- 3) Refresh do schema cache para o PostgREST enxergar a nova estrutura
NOTIFY pgrst, 'reload schema';

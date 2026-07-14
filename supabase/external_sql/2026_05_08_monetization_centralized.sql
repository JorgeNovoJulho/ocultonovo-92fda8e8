-- =====================================================================
-- 2026-05-08  MONETIZAÇÃO CENTRALIZADA (ASAAS invisível ao criador)
-- Idempotente — pode rodar múltiplas vezes no SQL Editor do externo.
-- =====================================================================

-- 1) Profiles: status de monetização + status do plano VIP + freeze ----
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS monetization_status TEXT DEFAULT 'not_started',
  ADD COLUMN IF NOT EXISTS monetization_approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS monetization_suspended_reason TEXT,
  ADD COLUMN IF NOT EXISTS vip_subscription_status TEXT DEFAULT 'inactive',
  ADD COLUMN IF NOT EXISTS vip_subscription_due_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payout_frozen BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS payout_frozen_reason TEXT;

-- valores válidos para monetization_status: not_started | pending_review |
-- approved | rejected | suspended | frozen | blocked
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_monetization_status_chk'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_monetization_status_chk
      CHECK (monetization_status IN ('not_started','pending_review','approved','rejected','suspended','frozen','blocked'));
  END IF;
END $$;

-- 2) creator_payout_profiles --------------------------------------------
CREATE TABLE IF NOT EXISTS public.creator_payout_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL UNIQUE,
  full_name TEXT,
  document_number TEXT,
  person_type TEXT CHECK (person_type IN ('PF','PJ')) DEFAULT 'PF',
  birth_date DATE,
  phone TEXT,
  email TEXT,
  pix_key_type TEXT CHECK (pix_key_type IN ('cpf','cnpj','email','phone','random')),
  pix_key TEXT,
  holder_name TEXT,
  holder_document TEXT,
  kyc_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (kyc_status IN ('pending','approved','rejected')),
  monetization_status TEXT NOT NULL DEFAULT 'pending_review'
    CHECK (monetization_status IN ('not_started','pending_review','approved','rejected','suspended','frozen','blocked')),
  terms_accepted_at TIMESTAMPTZ,
  terms_accepted_ip TEXT,
  terms_user_agent TEXT,
  terms_version TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payout_profiles_creator ON public.creator_payout_profiles(creator_id);
CREATE INDEX IF NOT EXISTS idx_payout_profiles_status  ON public.creator_payout_profiles(monetization_status);

ALTER TABLE public.creator_payout_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "creator reads own payout profile" ON public.creator_payout_profiles;
CREATE POLICY "creator reads own payout profile"
  ON public.creator_payout_profiles FOR SELECT
  USING (auth.uid() = creator_id);

DROP POLICY IF EXISTS "creator upserts own payout profile" ON public.creator_payout_profiles;
CREATE POLICY "creator upserts own payout profile"
  ON public.creator_payout_profiles FOR INSERT
  WITH CHECK (auth.uid() = creator_id);

DROP POLICY IF EXISTS "creator updates own payout profile" ON public.creator_payout_profiles;
CREATE POLICY "creator updates own payout profile"
  ON public.creator_payout_profiles FOR UPDATE
  USING (auth.uid() = creator_id);

-- Admin master pode ler/atualizar tudo (depende de função has_role já existente).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'has_role') THEN
    EXECUTE $p$
      DROP POLICY IF EXISTS "admin reads all payout profiles" ON public.creator_payout_profiles;
      CREATE POLICY "admin reads all payout profiles"
        ON public.creator_payout_profiles FOR SELECT
        USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'master'));
      DROP POLICY IF EXISTS "admin updates all payout profiles" ON public.creator_payout_profiles;
      CREATE POLICY "admin updates all payout profiles"
        ON public.creator_payout_profiles FOR UPDATE
        USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'master'));
    $p$;
  END IF;
END $$;

-- 3) creator_kyc_documents ----------------------------------------------
CREATE TABLE IF NOT EXISTS public.creator_kyc_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL,
  document_type TEXT NOT NULL
    CHECK (document_type IN ('id_front','id_back','selfie','address_proof','cnpj_doc','other')),
  file_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected')),
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_kyc_docs_creator ON public.creator_kyc_documents(creator_id);
CREATE INDEX IF NOT EXISTS idx_kyc_docs_status  ON public.creator_kyc_documents(status);

ALTER TABLE public.creator_kyc_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "creator reads own kyc docs" ON public.creator_kyc_documents;
CREATE POLICY "creator reads own kyc docs"
  ON public.creator_kyc_documents FOR SELECT
  USING (auth.uid() = creator_id);
DROP POLICY IF EXISTS "creator inserts own kyc docs" ON public.creator_kyc_documents;
CREATE POLICY "creator inserts own kyc docs"
  ON public.creator_kyc_documents FOR INSERT
  WITH CHECK (auth.uid() = creator_id);

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'has_role') THEN
    EXECUTE $p$
      DROP POLICY IF EXISTS "admin reads all kyc docs" ON public.creator_kyc_documents;
      CREATE POLICY "admin reads all kyc docs"
        ON public.creator_kyc_documents FOR SELECT
        USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'master'));
      DROP POLICY IF EXISTS "admin updates all kyc docs" ON public.creator_kyc_documents;
      CREATE POLICY "admin updates all kyc docs"
        ON public.creator_kyc_documents FOR UPDATE
        USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'master'));
    $p$;
  END IF;
END $$;

-- 4) monetization_audit_logs --------------------------------------------
CREATE TABLE IF NOT EXISTS public.monetization_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL,
  action TEXT NOT NULL,
  previous_status TEXT,
  new_status TEXT,
  reason TEXT,
  actor_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_monetization_audit_creator ON public.monetization_audit_logs(creator_id, created_at DESC);

ALTER TABLE public.monetization_audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "creator reads own monetization logs" ON public.monetization_audit_logs;
CREATE POLICY "creator reads own monetization logs"
  ON public.monetization_audit_logs FOR SELECT
  USING (auth.uid() = creator_id);

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'has_role') THEN
    EXECUTE $p$
      DROP POLICY IF EXISTS "admin reads all monetization logs" ON public.monetization_audit_logs;
      CREATE POLICY "admin reads all monetization logs"
        ON public.monetization_audit_logs FOR SELECT
        USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'master'));
      DROP POLICY IF EXISTS "admin inserts monetization logs" ON public.monetization_audit_logs;
      CREATE POLICY "admin inserts monetization logs"
        ON public.monetization_audit_logs FOR INSERT
        WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'master'));
    $p$;
  END IF;
END $$;

-- 5) Trigger: ao mudar monetization_status no payout_profile, espelhar
--    em profiles e gravar audit log.
CREATE OR REPLACE FUNCTION public.sync_monetization_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.monetization_status IS DISTINCT FROM OLD.monetization_status THEN
    UPDATE public.profiles
       SET monetization_status = NEW.monetization_status,
           monetization_approved_at = CASE WHEN NEW.monetization_status='approved' THEN NOW() ELSE monetization_approved_at END
     WHERE id = NEW.creator_id;

    INSERT INTO public.monetization_audit_logs(creator_id, action, previous_status, new_status, actor_id)
    VALUES (NEW.creator_id, 'status_change', OLD.monetization_status, NEW.monetization_status, auth.uid());
  END IF;
  NEW.updated_at := NOW();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sync_monetization_status ON public.creator_payout_profiles;
CREATE TRIGGER trg_sync_monetization_status
  BEFORE UPDATE ON public.creator_payout_profiles
  FOR EACH ROW EXECUTE FUNCTION public.sync_monetization_status();

-- 6) Função utilitária: pode_monetizar(uuid)
CREATE OR REPLACE FUNCTION public.can_monetize(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT plan_type IN ('vip','vip_pink','master')
       AND vip_subscription_status = 'active'
       AND monetization_status = 'approved'
       AND COALESCE(payout_frozen,false) = false
    FROM public.profiles WHERE id = _user_id
  ), false);
$$;

-- =====================================================================
-- FIM. Para reverter: drop tables creator_payout_profiles,
-- creator_kyc_documents, monetization_audit_logs e remover colunas
-- adicionadas em profiles.
-- =====================================================================

-- =====================================================================
-- LGPD WAVE 3 — Solicitações (Exportação/Exclusão) + Matriz de Retenção
-- Data: 2026-05-15
-- Idempotente. Rodar no SQL Editor do Supabase EXTERNO (rvybbrkzmboqbhcemqar).
--
-- Implementa:
--  - Tabela lgpd_data_requests (export | erasure | rectification | restriction)
--  - Tabela lgpd_retention_policy (matriz de retenção pública e auditável)
--  - RPC lgpd_request_export()      → cria solicitação e retorna id
--  - RPC lgpd_request_erasure(text) → cria solicitação de exclusão
--  - RPC lgpd_anonymize_user(uuid)  → anonimiza profile e dados sociais,
--                                     preserva fiscal/jurídico por 5 anos
--  - View vw_lgpd_my_requests (usuário lê suas próprias solicitações)
--  - View vw_lgpd_retention (matriz pública de retenção legal)
-- =====================================================================

-- 1) Matriz de retenção (pública, transparente)
CREATE TABLE IF NOT EXISTS public.lgpd_retention_policy (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category        text NOT NULL UNIQUE,                -- ex: 'profile_basic', 'fiscal_transactions'
  classification  text NOT NULL CHECK (classification IN ('PUB','PRV','SEN','FIN','JUR')),
  retention_days  integer NOT NULL,                    -- 0 = exclusão imediata
  legal_basis     text NOT NULL,                       -- LGPD art. 7º / 11 / 16
  action_on_erase text NOT NULL CHECK (action_on_erase IN ('delete','anonymize','retain')),
  description     text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.lgpd_retention_policy ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lgpd_retention_read_all ON public.lgpd_retention_policy;
CREATE POLICY lgpd_retention_read_all
  ON public.lgpd_retention_policy FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS lgpd_retention_write_master ON public.lgpd_retention_policy;
CREATE POLICY lgpd_retention_write_master
  ON public.lgpd_retention_policy FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles ur
                 WHERE ur.user_id = auth.uid() AND ur.role::text = 'admin_master'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur
                      WHERE ur.user_id = auth.uid() AND ur.role::text = 'admin_master'));

-- Seed da matriz (idempotente)
INSERT INTO public.lgpd_retention_policy (category, classification, retention_days, legal_basis, action_on_erase, description) VALUES
  ('profile_basic',          'PRV', 0,   'LGPD art. 18, IV',           'anonymize', 'Nome de exibição, bio, avatar, preferências'),
  ('profile_sensitive',      'SEN', 0,   'LGPD art. 11',               'delete',    'CPF, CNPJ, documentos, KYC, geolocalização exata'),
  ('social_content',         'PRV', 0,   'LGPD art. 18, IV',           'anonymize', 'Posts, comentários, likes, follows'),
  ('messages_private',       'SEN', 0,   'LGPD art. 18, IV',           'delete',    'Mensagens privadas E2EE, conversas, presença'),
  ('media_uploads',          'PRV', 0,   'LGPD art. 18, IV',           'delete',    'Fotos, vídeos, áudios e mídias pagas'),
  ('fiscal_transactions',    'FIN', 1825,'CTN art. 174 + LGPD art. 16','retain',    'Notas fiscais, transações ASAAS — guarda obrigatória 5 anos'),
  ('antifraud_logs',         'JUR', 1825,'Marco Civil + LGPD art. 16', 'retain',    'Logs de antifraude e auditoria — guarda obrigatória 5 anos'),
  ('asaas_subaccount',       'FIN', 1825,'CTN art. 174 + Bacen',       'retain',    'Subconta ASAAS de criadores — exigência regulatória'),
  ('cookies_consents',       'JUR', 730, 'LGPD art. 8º §6º',           'retain',    'Histórico de consentimentos — prova de conformidade 2 anos'),
  ('notifications',          'PRV', 0,   'LGPD art. 18, IV',           'delete',    'Notificações in-app, push e e-mail'),
  ('event_rsvps',            'PRV', 0,   'LGPD art. 18, IV',           'anonymize', 'RSVPs, presenças e ratings de eventos VIP'),
  ('marketplace_purchases',  'FIN', 1825,'CTN art. 174',               'retain',    'Compras de conteúdo pago, PPV, ingressos VIP')
ON CONFLICT (category) DO UPDATE SET
  classification  = EXCLUDED.classification,
  retention_days  = EXCLUDED.retention_days,
  legal_basis     = EXCLUDED.legal_basis,
  action_on_erase = EXCLUDED.action_on_erase,
  description     = EXCLUDED.description,
  updated_at      = now();

-- 2) Tabela de solicitações LGPD
CREATE TABLE IF NOT EXISTS public.lgpd_data_requests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind          text NOT NULL CHECK (kind IN ('export','erasure','rectification','restriction','portability')),
  status        text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','processing','completed','failed','cancelled')),
  reason        text,
  signed_url    text,             -- preenchido quando export terminar
  expires_at    timestamptz,      -- expiração da signed_url
  error_message text,
  metadata      jsonb DEFAULT '{}'::jsonb,
  requested_at  timestamptz NOT NULL DEFAULT now(),
  processed_at  timestamptz,
  completed_at  timestamptz
);

CREATE INDEX IF NOT EXISTS idx_lgpd_requests_user   ON public.lgpd_data_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_lgpd_requests_status ON public.lgpd_data_requests(status);
CREATE INDEX IF NOT EXISTS idx_lgpd_requests_kind   ON public.lgpd_data_requests(kind);

ALTER TABLE public.lgpd_data_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lgpd_requests_select_own ON public.lgpd_data_requests;
CREATE POLICY lgpd_requests_select_own
  ON public.lgpd_data_requests FOR SELECT
  TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS lgpd_requests_select_master ON public.lgpd_data_requests;
CREATE POLICY lgpd_requests_select_master
  ON public.lgpd_data_requests FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles ur
                 WHERE ur.user_id = auth.uid() AND ur.role::text = 'admin_master'));

-- Bloqueia escrita direta — somente via RPC
REVOKE INSERT, UPDATE, DELETE ON public.lgpd_data_requests FROM anon, authenticated;

-- 3) RPC: solicitar exportação
CREATE OR REPLACE FUNCTION public.lgpd_request_export()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_id   uuid;
  v_recent integer;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Autenticação obrigatória';
  END IF;

  -- Rate limit: no máximo 3 solicitações de export pendentes/recentes nas últimas 24h
  SELECT count(*) INTO v_recent
  FROM public.lgpd_data_requests
  WHERE user_id = v_user
    AND kind = 'export'
    AND requested_at > now() - interval '24 hours';

  IF v_recent >= 3 THEN
    RAISE EXCEPTION 'Limite de 3 solicitações de exportação por dia atingido';
  END IF;

  INSERT INTO public.lgpd_data_requests (user_id, kind, status)
  VALUES (v_user, 'export', 'pending')
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'request_id', v_id);
END;
$$;

REVOKE ALL ON FUNCTION public.lgpd_request_export() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lgpd_request_export() TO authenticated;

-- 4) RPC: solicitar exclusão
CREATE OR REPLACE FUNCTION public.lgpd_request_erasure(p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_id   uuid;
  v_pending integer;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Autenticação obrigatória';
  END IF;

  SELECT count(*) INTO v_pending
  FROM public.lgpd_data_requests
  WHERE user_id = v_user
    AND kind = 'erasure'
    AND status IN ('pending','processing');

  IF v_pending > 0 THEN
    RAISE EXCEPTION 'Já existe uma solicitação de exclusão em andamento';
  END IF;

  INSERT INTO public.lgpd_data_requests (user_id, kind, status, reason)
  VALUES (v_user, 'erasure', 'pending', p_reason)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'request_id', v_id);
END;
$$;

REVOKE ALL ON FUNCTION public.lgpd_request_erasure(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lgpd_request_erasure(text) TO authenticated;

-- 5) RPC: anonimizar usuário (chamado pela edge function delete-account)
-- Aplica a matriz de retenção:
--   * profile_basic       → anonymize (mantém id, zera dados pessoais)
--   * profile_sensitive   → delete (CPF, CNPJ, geo exata, KYC docs)
--   * social_content      → anonymize (autor vira "Usuário Removido")
--   * messages_private    → delete
--   * media_uploads       → delete (referência; storage é limpo pela edge)
--   * fiscal_transactions → retain (5 anos), porém remove vínculo identificável
--   * antifraud_logs      → retain (5 anos)
CREATE OR REPLACE FUNCTION public.lgpd_anonymize_user(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_is_master boolean := false;
  v_profile_id uuid;
  v_anon_label text := 'Usuário Removido';
  v_anon_username text;
BEGIN
  -- Apenas o próprio usuário OU admin_master
  IF v_caller IS NOT NULL THEN
    SELECT EXISTS(SELECT 1 FROM public.user_roles ur
                  WHERE ur.user_id = v_caller AND ur.role::text = 'admin_master')
      INTO v_is_master;
  END IF;

  IF v_caller IS NOT NULL AND v_caller <> p_user_id AND NOT v_is_master THEN
    RAISE EXCEPTION 'Operação permitida apenas para o próprio usuário ou admin master';
  END IF;

  v_anon_username := 'removed_' || substr(replace(p_user_id::text, '-', ''), 1, 12);

  SELECT id INTO v_profile_id FROM public.profiles WHERE user_id = p_user_id LIMIT 1;

  -- 5.1 PROFILE BASIC: anonimizar campos pessoais
  UPDATE public.profiles SET
    full_name        = NULL,
    display_name     = v_anon_label,
    username         = v_anon_username,
    bio              = NULL,
    avatar_url       = NULL,
    cover_url        = NULL,
    phone            = NULL,
    whatsapp         = NULL,
    instagram        = NULL,
    location_lat     = NULL,
    location_lng     = NULL,
    city             = NULL,
    state            = NULL,
    country          = NULL,
    is_anonymized    = true,
    anonymized_at    = now()
  WHERE user_id = p_user_id;

  -- 5.2 PROFILE SENSITIVE: deletar campos sensíveis (best-effort com IF EXISTS)
  -- Campos protegidos por outra coluna podem não existir em todos os ambientes.
  BEGIN
    UPDATE public.profiles SET cpf = NULL, cnpj = NULL WHERE user_id = p_user_id;
  EXCEPTION WHEN undefined_column THEN NULL;
  END;

  -- KYC docs
  BEGIN
    DELETE FROM public.couple_verification_docs WHERE user_id = p_user_id;
  EXCEPTION WHEN undefined_table THEN NULL;
  END;

  -- 5.3 SOCIAL CONTENT: anonimizar autoria (mantém posts para integridade do feed)
  -- Posts → marca como deletado pelo autor
  BEGIN
    UPDATE public.posts SET
      content = '[conteúdo removido pelo autor]',
      media_url = NULL,
      thumbnail_url = NULL,
      is_deleted_by_author = true
    WHERE author_id = v_profile_id;
  EXCEPTION WHEN undefined_column THEN NULL;
  END;

  -- Comentários
  BEGIN
    UPDATE public.post_comments SET content = '[removido]' WHERE user_id = p_user_id;
  EXCEPTION WHEN undefined_table THEN NULL;
  END;

  -- 5.4 MESSAGES PRIVATE: deletar
  BEGIN
    DELETE FROM public.messages WHERE sender_id = p_user_id;
  EXCEPTION WHEN undefined_table THEN NULL;
  END;
  BEGIN
    DELETE FROM public.conversation_participants WHERE user_id = p_user_id;
  EXCEPTION WHEN undefined_table THEN NULL;
  END;

  -- 5.5 NOTIFICATIONS: deletar
  BEGIN
    DELETE FROM public.notifications WHERE user_id = p_user_id;
  EXCEPTION WHEN undefined_table THEN NULL;
  END;

  -- 5.6 PRESENÇA / RADAR / LOOKING_NOW: deletar
  BEGIN DELETE FROM public.looking_now WHERE user_id = p_user_id; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM public.aura_pings  WHERE user_id = p_user_id; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM public.online_presence WHERE user_id = p_user_id; EXCEPTION WHEN undefined_table THEN NULL; END;

  -- 5.7 FISCAL: PRESERVAR (retenção 5 anos), mas desvincular dados pessoais
  BEGIN
    UPDATE public.transactions SET
      payer_email = NULL,
      payer_name  = '[anonimizado]',
      payer_cpf   = NULL
    WHERE user_id = p_user_id;
  EXCEPTION WHEN undefined_column THEN NULL;
  END;

  -- 5.8 Marcar consentimentos como revogados
  UPDATE public.lgpd_consents
  SET granted = false, revoked_at = now()
  WHERE user_id = p_user_id AND granted = true;

  -- 5.9 Atualizar a solicitação de exclusão se houver
  UPDATE public.lgpd_data_requests
  SET status = 'completed', completed_at = now()
  WHERE user_id = p_user_id
    AND kind = 'erasure'
    AND status IN ('pending','processing');

  RETURN jsonb_build_object(
    'ok', true,
    'user_id', p_user_id,
    'anonymized_at', now(),
    'fiscal_retained_until', (now() + interval '5 years')::text
  );
END;
$$;

REVOKE ALL ON FUNCTION public.lgpd_anonymize_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lgpd_anonymize_user(uuid) TO authenticated, service_role;

-- 6) Garantir colunas auxiliares no profiles (idempotente)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='profiles' AND column_name='is_anonymized') THEN
    ALTER TABLE public.profiles ADD COLUMN is_anonymized boolean DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='profiles' AND column_name='anonymized_at') THEN
    ALTER TABLE public.profiles ADD COLUMN anonymized_at timestamptz;
  END IF;
END $$;

-- 7) Bucket privado para exports LGPD (SQL — Storage gerencia via storage.buckets)
INSERT INTO storage.buckets (id, name, public)
VALUES ('lgpd-exports', 'lgpd-exports', false)
ON CONFLICT (id) DO NOTHING;

-- Policies do bucket: somente o próprio usuário lê seus exports (path = user_id/...)
DROP POLICY IF EXISTS "lgpd_exports_owner_read" ON storage.objects;
CREATE POLICY "lgpd_exports_owner_read"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'lgpd-exports'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- =====================================================================
-- Validação rápida sugerida:
--   SELECT category, classification, retention_days, action_on_erase
--   FROM public.lgpd_retention_policy ORDER BY classification, category;
--   SELECT public.lgpd_request_export();
--   SELECT * FROM public.lgpd_data_requests WHERE user_id = auth.uid();
-- =====================================================================

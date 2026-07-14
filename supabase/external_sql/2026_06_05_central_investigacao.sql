-- ============================================================
-- CENTRAL DE INVESTIGAÇÃO (admin master)
-- Cobre: Perfil read-only, Conversas denunciadas (janela temporal),
-- Modo Investigação por ordem judicial, Alertas por palavras-chave.
-- TODAS as leituras são auditadas. E2EE é preservado: nunca
-- expõe `encrypted_content` em claro.
-- ============================================================

-- ====== Helper: master admin ======
CREATE OR REPLACE FUNCTION public.is_master_admin(_uid uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _uid AND role::text = 'admin_master'
  );
$$;

-- ====== 1. Casos de investigação (ordem judicial) ======
CREATE TABLE IF NOT EXISTS public.oculto_investigation_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_number text NOT NULL UNIQUE,
  target_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  opened_by uuid NOT NULL REFERENCES auth.users(id),
  reason text NOT NULL,
  legal_doc_ref text NOT NULL,             -- nº do processo / ofício
  legal_doc_url text,
  status text NOT NULL DEFAULT 'active',   -- active | closed | expired
  opened_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,         -- expiração obrigatória
  closed_at timestamptz,
  closed_by uuid,
  close_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_oculto_invest_cases_target ON public.oculto_investigation_cases (target_user_id);
CREATE INDEX IF NOT EXISTS idx_oculto_invest_cases_status ON public.oculto_investigation_cases (status, expires_at);

GRANT SELECT, INSERT, UPDATE ON public.oculto_investigation_cases TO authenticated;
GRANT ALL ON public.oculto_investigation_cases TO service_role;
ALTER TABLE public.oculto_investigation_cases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS oic_master_select ON public.oculto_investigation_cases;
CREATE POLICY oic_master_select ON public.oculto_investigation_cases
  FOR SELECT TO authenticated USING (public.is_master_admin(auth.uid()));
DROP POLICY IF EXISTS oic_master_insert ON public.oculto_investigation_cases;
CREATE POLICY oic_master_insert ON public.oculto_investigation_cases
  FOR INSERT TO authenticated WITH CHECK (public.is_master_admin(auth.uid()));
DROP POLICY IF EXISTS oic_master_update ON public.oculto_investigation_cases;
CREATE POLICY oic_master_update ON public.oculto_investigation_cases
  FOR UPDATE TO authenticated USING (public.is_master_admin(auth.uid()));

-- ====== 2. Log de acessos da investigação ======
CREATE TABLE IF NOT EXISTS public.oculto_investigation_access_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid REFERENCES public.oculto_investigation_cases(id) ON DELETE CASCADE,
  report_id uuid,
  admin_id uuid NOT NULL REFERENCES auth.users(id),
  action text NOT NULL,                   -- read_profile|read_reported_thread|read_judicial_thread|export
  target_user_id uuid,
  target_resource text,
  details jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_oial_admin ON public.oculto_investigation_access_logs (admin_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_oial_case ON public.oculto_investigation_access_logs (case_id);

GRANT SELECT, INSERT ON public.oculto_investigation_access_logs TO authenticated;
GRANT ALL ON public.oculto_investigation_access_logs TO service_role;
ALTER TABLE public.oculto_investigation_access_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS oial_master_select ON public.oculto_investigation_access_logs;
CREATE POLICY oial_master_select ON public.oculto_investigation_access_logs
  FOR SELECT TO authenticated USING (public.is_master_admin(auth.uid()));
DROP POLICY IF EXISTS oial_master_insert ON public.oculto_investigation_access_logs;
CREATE POLICY oial_master_insert ON public.oculto_investigation_access_logs
  FOR INSERT TO authenticated WITH CHECK (public.is_master_admin(auth.uid()));

-- ====== 3. Palavras-chave de moderação ======
CREATE TABLE IF NOT EXISTS public.oculto_moderation_keywords (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  term text NOT NULL UNIQUE,
  severity text NOT NULL DEFAULT 'medium',  -- low|medium|high|critical
  category text NOT NULL DEFAULT 'other',   -- minor|threat|fraud|drugs|other
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.oculto_moderation_keywords TO authenticated;
GRANT ALL ON public.oculto_moderation_keywords TO service_role;
ALTER TABLE public.oculto_moderation_keywords ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS omk_master_all ON public.oculto_moderation_keywords;
CREATE POLICY omk_master_all ON public.oculto_moderation_keywords
  FOR ALL TO authenticated
  USING (public.is_master_admin(auth.uid()))
  WITH CHECK (public.is_master_admin(auth.uid()));

CREATE TABLE IF NOT EXISTS public.oculto_moderation_keyword_hits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword_id uuid REFERENCES public.oculto_moderation_keywords(id) ON DELETE SET NULL,
  term_matched text NOT NULL,
  severity text NOT NULL,
  message_id uuid,
  conversation_id uuid,
  sender_id uuid,
  snippet text,                            -- trecho redigido p/ contexto mínimo
  reviewed boolean NOT NULL DEFAULT false,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_omkh_created ON public.oculto_moderation_keyword_hits (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_omkh_reviewed ON public.oculto_moderation_keyword_hits (reviewed, severity);
GRANT SELECT, INSERT, UPDATE ON public.oculto_moderation_keyword_hits TO authenticated;
GRANT ALL ON public.oculto_moderation_keyword_hits TO service_role;
ALTER TABLE public.oculto_moderation_keyword_hits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS omkh_master_select ON public.oculto_moderation_keyword_hits;
CREATE POLICY omkh_master_select ON public.oculto_moderation_keyword_hits
  FOR SELECT TO authenticated USING (public.is_master_admin(auth.uid()));
DROP POLICY IF EXISTS omkh_master_update ON public.oculto_moderation_keyword_hits;
CREATE POLICY omkh_master_update ON public.oculto_moderation_keyword_hits
  FOR UPDATE TO authenticated USING (public.is_master_admin(auth.uid()));
-- inserts via trigger (security definer) ou pelo service_role
DROP POLICY IF EXISTS omkh_master_insert ON public.oculto_moderation_keyword_hits;
CREATE POLICY omkh_master_insert ON public.oculto_moderation_keyword_hits
  FOR INSERT TO authenticated WITH CHECK (public.is_master_admin(auth.uid()));

-- ====== 4. Trigger: scan automático em mensagens não-criptografadas ======
CREATE OR REPLACE FUNCTION public.fn_moderation_scan_message()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  k RECORD;
  body text;
  snip text;
BEGIN
  IF NEW.is_encrypted = true THEN
    RETURN NEW; -- E2EE: não escaneamos
  END IF;
  body := lower(coalesce(NEW.content, ''));
  IF body = '' THEN RETURN NEW; END IF;

  FOR k IN
    SELECT id, term, severity FROM public.oculto_moderation_keywords WHERE enabled = true
  LOOP
    IF position(lower(k.term) IN body) > 0 THEN
      snip := substr(NEW.content, GREATEST(1, position(lower(k.term) IN body) - 30), 120);
      INSERT INTO public.oculto_moderation_keyword_hits
        (keyword_id, term_matched, severity, message_id, conversation_id, sender_id, snippet)
      VALUES (k.id, k.term, k.severity, NEW.id, NEW.conversation_id, NEW.sender_id, snip);
    END IF;
  END LOOP;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_moderation_scan_message ON public.messages;
CREATE TRIGGER trg_moderation_scan_message
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.fn_moderation_scan_message();

-- ====== 5. RPCs auditadas ======

-- 5.1 Leitura read-only do perfil (sem chat / sem mídias privadas)
CREATE OR REPLACE FUNCTION public.investigation_read_profile(p_target_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_admin uuid := auth.uid();
  v_data jsonb;
BEGIN
  IF NOT public.is_master_admin(v_admin) THEN
    RAISE EXCEPTION 'Acesso negado: requer admin_master';
  END IF;

  SELECT to_jsonb(p) - 'phone' - 'document_number' - 'email'
  INTO v_data
  FROM public.profiles p
  WHERE p.user_id = p_target_user_id OR p.id = p_target_user_id
  LIMIT 1;

  INSERT INTO public.oculto_investigation_access_logs
    (admin_id, action, target_user_id, target_resource, details)
  VALUES (v_admin, 'read_profile', p_target_user_id, 'profiles', '{}'::jsonb);

  RETURN COALESCE(v_data, '{}'::jsonb);
END $$;
GRANT EXECUTE ON FUNCTION public.investigation_read_profile(uuid) TO authenticated;

-- 5.2 Leitura de thread DENUNCIADA (só se houver report aberto há ≤ 30 dias)
CREATE OR REPLACE FUNCTION public.investigation_read_reported_thread(p_report_id uuid)
RETURNS TABLE (
  id uuid, conversation_id uuid, sender_id uuid,
  content text, is_encrypted boolean, media_type text,
  created_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_admin uuid := auth.uid();
  v_conv uuid;
  v_target uuid;
  v_created timestamptz;
BEGIN
  IF NOT public.is_master_admin(v_admin) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  -- tenta achar a conversa a partir do content_reports (post/usuário denunciado)
  SELECT cr.reported_user_id, cr.created_at INTO v_target, v_created
  FROM public.content_reports cr WHERE cr.id = p_report_id;

  IF v_target IS NULL THEN
    SELECT ar.target_user_id, ar.created_at INTO v_target, v_created
    FROM public.anonymous_reports ar WHERE ar.id = p_report_id;
  END IF;

  IF v_target IS NULL THEN
    RAISE EXCEPTION 'Denúncia não encontrada';
  END IF;

  IF v_created < (now() - interval '30 days') THEN
    RAISE EXCEPTION 'Janela de 30 dias da denúncia expirada';
  END IF;

  INSERT INTO public.oculto_investigation_access_logs
    (admin_id, action, target_user_id, report_id, target_resource, details)
  VALUES (v_admin, 'read_reported_thread', v_target, p_report_id, 'messages',
          jsonb_build_object('report_id', p_report_id));

  RETURN QUERY
  SELECT m.id, m.conversation_id, m.sender_id,
         CASE WHEN m.is_encrypted THEN '[Mensagem E2EE — conteúdo não acessível]'
              ELSE m.content END AS content,
         m.is_encrypted, m.media_type, m.created_at
  FROM public.messages m
  JOIN public.conversation_participants cp ON cp.conversation_id = m.conversation_id
  WHERE cp.user_id = v_target
    AND m.created_at >= (v_created - interval '7 days')
    AND m.created_at <= (v_created + interval '7 days')
  ORDER BY m.created_at ASC
  LIMIT 500;
END $$;
GRANT EXECUTE ON FUNCTION public.investigation_read_reported_thread(uuid) TO authenticated;

-- 5.3 Leitura via CASO JUDICIAL ativo (exige case_id + conversation_id)
CREATE OR REPLACE FUNCTION public.investigation_read_judicial_thread(p_case_id uuid, p_conversation_id uuid)
RETURNS TABLE (
  id uuid, conversation_id uuid, sender_id uuid,
  content text, is_encrypted boolean, media_type text,
  created_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_admin uuid := auth.uid();
  v_case  RECORD;
BEGIN
  IF NOT public.is_master_admin(v_admin) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  SELECT * INTO v_case FROM public.oculto_investigation_cases WHERE id = p_case_id;
  IF v_case IS NULL THEN RAISE EXCEPTION 'Caso não encontrado'; END IF;
  IF v_case.status <> 'active' OR v_case.expires_at < now() THEN
    RAISE EXCEPTION 'Caso inativo ou expirado';
  END IF;

  -- conversation precisa envolver o target_user_id
  IF NOT EXISTS (
    SELECT 1 FROM public.conversation_participants
    WHERE conversation_id = p_conversation_id AND user_id = v_case.target_user_id
  ) THEN
    RAISE EXCEPTION 'Conversa não relacionada ao usuário do caso';
  END IF;

  INSERT INTO public.oculto_investigation_access_logs
    (case_id, admin_id, action, target_user_id, target_resource, details)
  VALUES (p_case_id, v_admin, 'read_judicial_thread', v_case.target_user_id, 'messages',
          jsonb_build_object('conversation_id', p_conversation_id, 'case_number', v_case.case_number));

  RETURN QUERY
  SELECT m.id, m.conversation_id, m.sender_id,
         CASE WHEN m.is_encrypted THEN '[Mensagem E2EE — conteúdo não acessível]'
              ELSE m.content END AS content,
         m.is_encrypted, m.media_type, m.created_at
  FROM public.messages m
  WHERE m.conversation_id = p_conversation_id
  ORDER BY m.created_at ASC
  LIMIT 1000;
END $$;
GRANT EXECUTE ON FUNCTION public.investigation_read_judicial_thread(uuid, uuid) TO authenticated;

-- 5.4 Listar conversas do alvo (apenas via caso ativo)
CREATE OR REPLACE FUNCTION public.investigation_list_target_conversations(p_case_id uuid)
RETURNS TABLE (conversation_id uuid, last_message_at timestamptz, message_count bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_admin uuid := auth.uid(); v_case RECORD;
BEGIN
  IF NOT public.is_master_admin(v_admin) THEN RAISE EXCEPTION 'Acesso negado'; END IF;
  SELECT * INTO v_case FROM public.oculto_investigation_cases WHERE id = p_case_id;
  IF v_case IS NULL OR v_case.status <> 'active' OR v_case.expires_at < now() THEN
    RAISE EXCEPTION 'Caso inativo/expirado';
  END IF;

  INSERT INTO public.oculto_investigation_access_logs (case_id, admin_id, action, target_user_id, target_resource)
  VALUES (p_case_id, v_admin, 'list_conversations', v_case.target_user_id, 'conversations');

  RETURN QUERY
  SELECT cp.conversation_id, MAX(m.created_at) AS last_message_at, COUNT(m.id) AS message_count
  FROM public.conversation_participants cp
  LEFT JOIN public.messages m ON m.conversation_id = cp.conversation_id
  WHERE cp.user_id = v_case.target_user_id
  GROUP BY cp.conversation_id
  ORDER BY last_message_at DESC NULLS LAST
  LIMIT 100;
END $$;
GRANT EXECUTE ON FUNCTION public.investigation_list_target_conversations(uuid) TO authenticated;

-- 5.5 Job: expirar casos vencidos (chame via pg_cron ou manualmente)
CREATE OR REPLACE FUNCTION public.investigation_expire_cases()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  UPDATE public.oculto_investigation_cases
  SET status = 'expired', updated_at = now()
  WHERE status = 'active' AND expires_at < now();
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
GRANT EXECUTE ON FUNCTION public.investigation_expire_cases() TO authenticated;

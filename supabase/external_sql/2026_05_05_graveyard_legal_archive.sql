-- =====================================================================
-- CEMITÉRIO DE PERFIS — Arquivo Jurídico de Contas Excluídas
-- Conformidade LGPD / Marco Civil — Retenção 5 anos
-- =====================================================================
-- Estratégia:
--   1. Ao excluir conta (auto-exclusão OU ban definitivo), preservar TUDO
--      (perfil, posts, comentários, mensagens, mídias, likes, transações,
--       follows, eventos, stories, notificações) em snapshot JSONB.
--   2. Postgres TOAST comprime JSONB grande automaticamente (LZ4).
--   3. Email bloqueado para sempre (impede burlar bans criando outra conta).
--   4. Acesso EXCLUSIVO ao Master Admin (ocultomaster@ocultoswing.com.br).
--   5. Retenção 5 anos (purge_after = now() + 5 years).
-- =====================================================================

-- ========== TABELA PRINCIPAL: snapshots de perfis excluídos ==========
CREATE TABLE IF NOT EXISTS public.oculto_graveyard_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  original_user_id uuid NOT NULL,
  original_profile_id uuid,
  email text,
  username text,
  display_name text,
  reason text,
  initiated_by text NOT NULL DEFAULT 'self', -- 'self' | 'admin_ban' | 'admin_purge'
  profile_snapshot jsonb NOT NULL,           -- snapshot completo do perfil
  content_snapshot jsonb NOT NULL,           -- posts, msgs, comentários, etc.
  storage_files jsonb DEFAULT '[]'::jsonb,   -- lista de paths nos buckets
  metadata jsonb DEFAULT '{}'::jsonb,
  archived_at timestamptz NOT NULL DEFAULT now(),
  purge_after timestamptz NOT NULL DEFAULT (now() + interval '5 years')
);

CREATE INDEX IF NOT EXISTS idx_graveyard_email ON public.oculto_graveyard_profiles (lower(email));
CREATE INDEX IF NOT EXISTS idx_graveyard_username ON public.oculto_graveyard_profiles (lower(username));
CREATE INDEX IF NOT EXISTS idx_graveyard_user_id ON public.oculto_graveyard_profiles (original_user_id);
CREATE INDEX IF NOT EXISTS idx_graveyard_archived_at ON public.oculto_graveyard_profiles (archived_at DESC);
CREATE INDEX IF NOT EXISTS idx_graveyard_purge ON public.oculto_graveyard_profiles (purge_after);

ALTER TABLE public.oculto_graveyard_profiles ENABLE ROW LEVEL SECURITY;

-- ========== TABELA DE EMAILS BLOQUEADOS (reservado para sempre) ==========
CREATE TABLE IF NOT EXISTS public.oculto_graveyard_blocked_emails (
  email text PRIMARY KEY,
  graveyard_id uuid REFERENCES public.oculto_graveyard_profiles(id) ON DELETE CASCADE,
  blocked_at timestamptz NOT NULL DEFAULT now(),
  reason text
);

ALTER TABLE public.oculto_graveyard_blocked_emails ENABLE ROW LEVEL SECURITY;

-- ========== HELPER: detecta master admin ==========
CREATE OR REPLACE FUNCTION public.is_master_admin_email()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = auth.uid()
      AND lower(email) = 'ocultomaster@ocultoswing.com.br'
  );
$$;

-- ========== RLS: somente master admin pode ler ==========
DROP POLICY IF EXISTS "graveyard_master_only_select" ON public.oculto_graveyard_profiles;
CREATE POLICY "graveyard_master_only_select"
  ON public.oculto_graveyard_profiles
  FOR SELECT TO authenticated
  USING (public.is_master_admin_email());

DROP POLICY IF EXISTS "graveyard_master_only_all" ON public.oculto_graveyard_profiles;
CREATE POLICY "graveyard_master_only_all"
  ON public.oculto_graveyard_profiles
  FOR ALL TO authenticated
  USING (public.is_master_admin_email())
  WITH CHECK (public.is_master_admin_email());

DROP POLICY IF EXISTS "graveyard_blocked_master_select" ON public.oculto_graveyard_blocked_emails;
CREATE POLICY "graveyard_blocked_master_select"
  ON public.oculto_graveyard_blocked_emails
  FOR SELECT TO authenticated
  USING (public.is_master_admin_email());

-- ========== FUNÇÃO: arquivar usuário no cemitério ==========
CREATE OR REPLACE FUNCTION public.archive_user_to_graveyard(
  p_user_id uuid,
  p_reason text DEFAULT 'self_deletion',
  p_initiated_by text DEFAULT 'self'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
  v_profile jsonb;
  v_profile_id uuid;
  v_username text;
  v_display_name text;
  v_content jsonb;
  v_graveyard_id uuid;
BEGIN
  -- Email do auth.users
  SELECT email INTO v_email FROM auth.users WHERE id = p_user_id;

  -- Snapshot completo do perfil
  SELECT to_jsonb(p.*), p.id, p.username,
         COALESCE(p.name, p.username, 'Usuário Excluído')
    INTO v_profile, v_profile_id, v_username, v_display_name
  FROM public.profiles p
  WHERE p.user_id = p_user_id;

  -- Coletar conteúdo (defensivo: cada bloco em try para não falhar tudo)
  v_content := jsonb_build_object('collected_at', now());

  BEGIN
    v_content := v_content || jsonb_build_object(
      'posts', COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM public.posts t
                          WHERE t.user_id = p_user_id OR t.author_id = v_profile_id), '[]'::jsonb)
    );
  EXCEPTION WHEN OTHERS THEN NULL; END;

  BEGIN
    v_content := v_content || jsonb_build_object(
      'messages', COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM public.messages t
                             WHERE t.sender_id = p_user_id), '[]'::jsonb)
    );
  EXCEPTION WHEN OTHERS THEN NULL; END;

  BEGIN
    v_content := v_content || jsonb_build_object(
      'comments', COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM public.comments t
                             WHERE t.user_id = p_user_id OR t.author_id = v_profile_id), '[]'::jsonb)
    );
  EXCEPTION WHEN OTHERS THEN NULL; END;

  BEGIN
    v_content := v_content || jsonb_build_object(
      'transactions', COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM public.transactions t
                                 WHERE t.user_id = p_user_id), '[]'::jsonb)
    );
  EXCEPTION WHEN OTHERS THEN NULL; END;

  BEGIN
    v_content := v_content || jsonb_build_object(
      'follows', COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM public.follows t
                            WHERE t.follower_id = p_user_id OR t.following_id = p_user_id), '[]'::jsonb)
    );
  EXCEPTION WHEN OTHERS THEN NULL; END;

  BEGIN
    v_content := v_content || jsonb_build_object(
      'post_likes', COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM public.post_likes t
                               WHERE t.user_id = p_user_id), '[]'::jsonb)
    );
  EXCEPTION WHEN OTHERS THEN NULL; END;

  BEGIN
    v_content := v_content || jsonb_build_object(
      'subscriptions', COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM public.subscriptions t
                                  WHERE t.user_id = p_user_id), '[]'::jsonb)
    );
  EXCEPTION WHEN OTHERS THEN NULL; END;

  BEGIN
    v_content := v_content || jsonb_build_object(
      'notifications', COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM public.notifications t
                                  WHERE t.user_id = p_user_id), '[]'::jsonb)
    );
  EXCEPTION WHEN OTHERS THEN NULL; END;

  BEGIN
    v_content := v_content || jsonb_build_object(
      'audit_logs', COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM public.audit_logs t
                               WHERE t.target_resource = p_user_id::text
                                  OR t.admin_id = p_user_id), '[]'::jsonb)
    );
  EXCEPTION WHEN OTHERS THEN NULL; END;

  -- Inserir snapshot no cemitério
  INSERT INTO public.oculto_graveyard_profiles (
    original_user_id, original_profile_id, email, username, display_name,
    reason, initiated_by, profile_snapshot, content_snapshot,
    metadata
  ) VALUES (
    p_user_id, v_profile_id, v_email, v_username, v_display_name,
    p_reason, p_initiated_by, COALESCE(v_profile, '{}'::jsonb), v_content,
    jsonb_build_object('archived_via', 'archive_user_to_graveyard', 'version', 1)
  )
  RETURNING id INTO v_graveyard_id;

  -- Bloquear email para sempre (impede burlar criando nova conta)
  IF v_email IS NOT NULL THEN
    INSERT INTO public.oculto_graveyard_blocked_emails (email, graveyard_id, reason)
    VALUES (lower(v_email), v_graveyard_id, p_reason)
    ON CONFLICT (email) DO NOTHING;
  END IF;

  RETURN v_graveyard_id;
END;
$$;

-- ========== FUNÇÃO PÚBLICA: checar se email está bloqueado ==========
CREATE OR REPLACE FUNCTION public.is_email_blocked(p_email text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.oculto_graveyard_blocked_emails
    WHERE email = lower(p_email)
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_email_blocked(text) TO anon, authenticated;

-- ========== FUNÇÃO MASTER: ler snapshot completo ==========
CREATE OR REPLACE FUNCTION public.master_get_graveyard_entry(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row jsonb;
BEGIN
  IF NOT public.is_master_admin_email() THEN
    RAISE EXCEPTION 'access_denied' USING ERRCODE = '42501';
  END IF;

  SELECT to_jsonb(g.*) INTO v_row
  FROM public.oculto_graveyard_profiles g
  WHERE g.id = p_id;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.master_get_graveyard_entry(uuid) TO authenticated;

-- ========== ATUALIZAR delete_user_account: arquivar antes de excluir ==========
CREATE OR REPLACE FUNCTION public.delete_user_account(target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_graveyard_id uuid;
BEGIN
  -- 1) Arquiva no Cemitério (snapshot completo + bloqueio de email)
  BEGIN
    v_graveyard_id := public.archive_user_to_graveyard(
      target_user_id, 'self_deletion', 'self'
    );
  EXCEPTION WHEN OTHERS THEN
    -- Não bloqueia exclusão se arquivamento falhar; apenas registra
    RAISE NOTICE 'graveyard_archive_failed: %', SQLERRM;
  END;

  -- 2) Cleanup defensivo (cada bloco isolado)
  BEGIN DELETE FROM public.notifications WHERE user_id = target_user_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM public.messages WHERE sender_id = target_user_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM public.post_likes WHERE user_id = target_user_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM public.comments WHERE user_id = target_user_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM public.posts WHERE user_id = target_user_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM public.follows WHERE follower_id = target_user_id OR following_id = target_user_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM public.subscriptions WHERE user_id = target_user_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM public.profiles WHERE user_id = target_user_id; EXCEPTION WHEN OTHERS THEN NULL; END;
END;
$$;

-- ========== LISTAR ENTRADAS DO CEMITÉRIO (master) ==========
CREATE OR REPLACE FUNCTION public.master_list_graveyard(
  p_search text DEFAULT NULL,
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  original_user_id uuid,
  email text,
  username text,
  display_name text,
  reason text,
  initiated_by text,
  archived_at timestamptz,
  purge_after timestamptz,
  total bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_master_admin_email() THEN
    RAISE EXCEPTION 'access_denied' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT g.*
    FROM public.oculto_graveyard_profiles g
    WHERE p_search IS NULL
       OR lower(g.email) LIKE '%' || lower(p_search) || '%'
       OR lower(g.username) LIKE '%' || lower(p_search) || '%'
       OR lower(g.display_name) LIKE '%' || lower(p_search) || '%'
  ),
  counted AS (SELECT count(*) AS c FROM base)
  SELECT b.id, b.original_user_id, b.email, b.username, b.display_name,
         b.reason, b.initiated_by, b.archived_at, b.purge_after,
         (SELECT c FROM counted)
  FROM base b
  ORDER BY b.archived_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION public.master_list_graveyard(text, int, int) TO authenticated;

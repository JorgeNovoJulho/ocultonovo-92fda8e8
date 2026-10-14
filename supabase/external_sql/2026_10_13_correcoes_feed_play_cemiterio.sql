-- ============================================================
-- Correções de banco que acompanham a revisão de 13/10/2026.
-- Idempotente · Rodar no SQL Editor do Supabase EXTERNO.
--
-- 1) Libera o novo modo de feed 'oculto_only' na constraint de profiles.
--    Sem isso o UPDATE do app era recusado pelo CHECK e a escolha
--    "Apenas universo OCULTO" nunca era salva no banco (só no aparelho).
-- 2) Página pública do Oculto Play: o admin master não conseguia salvar
--    (faltava GRANT de INSERT/UPDATE e WITH CHECK na política).
-- 3) restore_account: define UMA versão oficial (retorna jsonb, que é o
--    que a tela do Cemitério lê). Os arquivos soltos na raiz recriavam a
--    função retornando void, e valia a última que tivesse rodado.
-- ============================================================

-- 1) Modo de experiência do feed -----------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS feed_experience_mode text;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_feed_experience_mode_chk;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_feed_experience_mode_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_feed_experience_mode_check
  CHECK (feed_experience_mode IS NULL
         OR feed_experience_mode IN ('adult_only', 'complete', 'oculto_only'));

-- 2) Configurações da página pública do Oculto Play -----------------------
CREATE TABLE IF NOT EXISTS public.oculto_play_share_settings (
  id               bigint PRIMARY KEY DEFAULT 1,
  show_logo        boolean DEFAULT true,
  show_author_card boolean DEFAULT true,
  show_player      boolean DEFAULT true,
  show_stats       boolean DEFAULT true,
  show_signup_cta  boolean DEFAULT true,
  cta_title        text DEFAULT 'OCULTO é uma rede social adulta +18',
  cta_text         text DEFAULT 'Crie sua conta gratuita para curtir, comentar, salvar em coleções, mandar mensagens e explorar todo o universo do OCULTO PLAY.',
  cta_button_text  text DEFAULT 'Criar minha conta grátis',
  bg_color         text DEFAULT '#0a0a0a',
  accent_color     text DEFAULT '#ec4899',
  footer_text      text DEFAULT '© OCULTO PLAY - Todos os direitos reservados',
  updated_at       timestamptz DEFAULT now()
);

ALTER TABLE public.oculto_play_share_settings
  ADD COLUMN IF NOT EXISTS cta_title text DEFAULT 'OCULTO é uma rede social adulta +18';

ALTER TABLE public.oculto_play_share_settings ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.oculto_play_share_settings TO anon, authenticated;
GRANT INSERT, UPDATE ON public.oculto_play_share_settings TO authenticated;
GRANT ALL ON public.oculto_play_share_settings TO service_role;

DROP POLICY IF EXISTS "Permitir leitura pública" ON public.oculto_play_share_settings;
CREATE POLICY "Permitir leitura pública" ON public.oculto_play_share_settings
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins gerenciam settings" ON public.oculto_play_share_settings;
CREATE POLICY "Admins gerenciam settings" ON public.oculto_play_share_settings
  FOR ALL TO authenticated
  USING (public.is_admin_master(auth.uid()))
  WITH CHECK (public.is_admin_master(auth.uid()));

INSERT INTO public.oculto_play_share_settings (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- 3) restore_account — versão oficial ------------------------------------
DROP FUNCTION IF EXISTS public.restore_account(uuid);

CREATE OR REPLACE FUNCTION public.restore_account(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_master boolean := false;
  v_profile_id uuid;
BEGIN
  BEGIN
    SELECT public.has_role(auth.uid(), 'admin_master'::app_role) INTO v_is_master;
  EXCEPTION WHEN OTHERS THEN
    v_is_master := false;
  END;

  IF NOT COALESCE(v_is_master, false) THEN
    RAISE EXCEPTION 'Apenas o administrador master pode restaurar contas excluídas';
  END IF;

  UPDATE public.profiles
     SET is_deleted     = false,
         deleted_at     = NULL,
         deleted_reason = NULL,
         deleted_by     = NULL,
         is_invisible   = false
   WHERE user_id = p_user_id
   RETURNING id INTO v_profile_id;

  IF v_profile_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Perfil não encontrado');
  END IF;

  BEGIN
    UPDATE auth.users
       SET banned_until = NULL,
           updated_at   = now()
     WHERE id = p_user_id;
  EXCEPTION WHEN OTHERS THEN NULL; END;

  RETURN jsonb_build_object(
    'ok', true,
    'profile_id', v_profile_id,
    'is_deleted', false,
    'access_restored', true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.restore_account(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restore_account(uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

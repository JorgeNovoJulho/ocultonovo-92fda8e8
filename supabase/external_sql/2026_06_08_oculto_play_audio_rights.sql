-- ============================================================
-- OCULTO PLAY — Etapa 7 (Áudio MP3 autoral, jurídico, copyright)
-- Idempotente. Rodar no SQL Editor do Supabase EXTERNO.
-- ============================================================

-- 1) Settings de áudio no oculto_play_config
ALTER TABLE public.oculto_play_config
  ADD COLUMN IF NOT EXISTS allow_audio_mp3                  boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS require_audio_rights_confirmation boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS audio_authoral_only              boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS audio_legal_text                 text    NOT NULL DEFAULT
    'Ao publicar este áudio, você declara possuir os direitos de uso, reprodução e distribuição deste conteúdo, ou autorização expressa para publicá-lo no Oculto.',
  ADD COLUMN IF NOT EXISTS max_audio_size_mb                integer NOT NULL DEFAULT 25,
  ADD COLUMN IF NOT EXISTS max_audio_duration_seconds       integer NOT NULL DEFAULT 600;

-- 2) Campos jurídicos no item
ALTER TABLE public.oculto_play_items
  ADD COLUMN IF NOT EXISTS rights_confirmed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS copyright_flag   boolean NOT NULL DEFAULT false;

-- 3) Atualiza o RPC get_oculto_play_config para expor os novos campos
--    (mantém a mesma assinatura; basta retornar o row completo)
CREATE OR REPLACE FUNCTION public.get_oculto_play_config()
RETURNS public.oculto_play_config
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.oculto_play_config ORDER BY updated_at DESC NULLS LAST LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_oculto_play_config() TO anon, authenticated, service_role;

-- 4) Trigger: ao inserir áudio, exigir rights_confirmed quando settings exigirem
CREATE OR REPLACE FUNCTION public.oculto_play_enforce_audio_rights()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_require boolean;
  v_allow   boolean;
BEGIN
  IF NEW.kind <> 'audio' THEN
    RETURN NEW;
  END IF;

  SELECT allow_audio_mp3, require_audio_rights_confirmation
    INTO v_allow, v_require
  FROM public.oculto_play_config
  ORDER BY updated_at DESC NULLS LAST
  LIMIT 1;

  IF v_allow IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Áudio desativado pelo admin.' USING ERRCODE = '22023';
  END IF;

  IF COALESCE(v_require, true) AND COALESCE(NEW.rights_confirmed, false) = false THEN
    RAISE EXCEPTION 'É necessário confirmar direitos autorais para publicar áudio.'
      USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_oculto_play_enforce_audio_rights ON public.oculto_play_items;
CREATE TRIGGER trg_oculto_play_enforce_audio_rights
  BEFORE INSERT ON public.oculto_play_items
  FOR EACH ROW
  EXECUTE FUNCTION public.oculto_play_enforce_audio_rights();

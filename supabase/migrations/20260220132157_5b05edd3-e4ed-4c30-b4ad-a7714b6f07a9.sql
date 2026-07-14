
-- ═══════════════════════════════════════════════════════════════
--  SISTEMA ANTI-SPAM PARA COMENTÁRIOS
-- ═══════════════════════════════════════════════════════════════

-- 1. Adiciona coluna is_hidden + spam_reason em post_comments (se não existir)
ALTER TABLE public.post_comments
  ADD COLUMN IF NOT EXISTS is_hidden      BOOLEAN   NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS spam_reason    TEXT      DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS spam_score     SMALLINT  NOT NULL DEFAULT 0;

-- 2. Índice composto para filtragem rápida por post + visibilidade
CREATE INDEX IF NOT EXISTS idx_post_comments_feed
  ON public.post_comments (post_id, is_hidden, created_at DESC);

-- 3. Índice para busca anti-spam de comentários recentes por usuário
CREATE INDEX IF NOT EXISTS idx_post_comments_user_recent
  ON public.post_comments (user_id, created_at DESC)
  WHERE is_hidden = FALSE;

-- ───────────────────────────────────────────────────────────────
-- 4. FUNÇÃO: verifica anti-spam antes do INSERT de comentário
-- ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_antispam_comment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile           RECORD;
  v_last_comment_at   TIMESTAMPTZ;
  v_recent_content    TEXT;
  v_similarity        FLOAT;
  v_recent_count      INT;
BEGIN
  -- Buscar dados do perfil autor
  SELECT is_verified, plan_type, is_seed, is_test_account
    INTO v_profile
    FROM public.profiles
   WHERE id = NEW.user_id;

  -- ── Bots/seeds: ocultar automaticamente ──────────────────────
  IF v_profile.is_seed = TRUE OR v_profile.is_test_account = TRUE THEN
    NEW.is_hidden   := TRUE;
    NEW.spam_reason := 'bot_account';
    NEW.spam_score  := 100;
    RETURN NEW;
  END IF;

  -- ── Rate limiting: 30s entre comentários (não verificados) ───
  IF v_profile.is_verified IS DISTINCT FROM TRUE
     AND v_profile.plan_type NOT IN ('vip', 'premium') THEN

    SELECT MAX(created_at)
      INTO v_last_comment_at
      FROM public.post_comments
     WHERE user_id = NEW.user_id
       AND is_hidden = FALSE;

    IF v_last_comment_at IS NOT NULL
       AND (EXTRACT(EPOCH FROM (NOW() - v_last_comment_at))) < 30 THEN
      -- Marcar como hidden + spam para que o frontend mostre aviso
      NEW.is_hidden   := TRUE;
      NEW.spam_reason := 'rate_limit';
      NEW.spam_score  := 80;
      RETURN NEW;
    END IF;
  END IF;

  -- ── Detecção de repetição (90% similar nos últimos 60 min) ───
  -- Limita a perfis não verificados para não penalizar usuários reais
  IF v_profile.is_verified IS DISTINCT FROM TRUE THEN
    SELECT content
      INTO v_recent_content
      FROM public.post_comments
     WHERE user_id = NEW.user_id
       AND created_at > NOW() - INTERVAL '60 minutes'
       AND is_hidden = FALSE
     ORDER BY created_at DESC
     LIMIT 1;

    IF v_recent_content IS NOT NULL THEN
      -- Similaridade simples: comprimento do prefixo comum / max comprimento
      v_similarity := similarity(NEW.content, v_recent_content);
      IF v_similarity >= 0.90 THEN
        NEW.is_hidden   := TRUE;
        NEW.spam_reason := 'repetitive_content';
        NEW.spam_score  := ROUND(v_similarity * 100)::SMALLINT;
        RETURN NEW;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Habilitar extensão pg_trgm se não estiver habilitada (necessária para similarity())
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 5. Trigger dispara BEFORE INSERT
DROP TRIGGER IF EXISTS trg_antispam_comment ON public.post_comments;
CREATE TRIGGER trg_antispam_comment
  BEFORE INSERT ON public.post_comments
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_antispam_comment();

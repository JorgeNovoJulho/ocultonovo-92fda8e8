
-- ═══════════════════════════════════════════════════════════════
-- 1. PLAN CHANGE AUDIT LOGS (table already created by failed migration partial)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.plan_change_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  old_plan TEXT,
  new_plan TEXT NOT NULL,
  change_type TEXT NOT NULL DEFAULT 'upgrade',
  source TEXT DEFAULT 'system',
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.plan_change_logs ENABLE ROW LEVEL SECURITY;

-- Drop policies if they exist from partial run
DROP POLICY IF EXISTS "Users read own plan changes" ON public.plan_change_logs;
DROP POLICY IF EXISTS "Admins read all plan changes" ON public.plan_change_logs;
DROP POLICY IF EXISTS "System insert plan changes" ON public.plan_change_logs;

-- Users can read their own logs
CREATE POLICY "Users read own plan changes"
  ON public.plan_change_logs FOR SELECT
  USING (user_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

-- Admins can read all (using existing is_admin RPC)
CREATE POLICY "Admins read all plan changes"
  ON public.plan_change_logs FOR SELECT
  USING (public.is_admin(auth.uid()));

-- System/triggers insert only
CREATE POLICY "System insert plan changes"
  ON public.plan_change_logs FOR INSERT
  WITH CHECK (true);

-- Indexes (IF NOT EXISTS for idempotency)
CREATE INDEX IF NOT EXISTS idx_plan_change_logs_user ON public.plan_change_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_plan_change_logs_created ON public.plan_change_logs(created_at DESC);

-- ═══════════════════════════════════════════════════════════════
-- 2. TRIGGER: Auto-log plan changes on profiles.plan_type update
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.fn_log_plan_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.plan_type IS DISTINCT FROM NEW.plan_type THEN
    INSERT INTO public.plan_change_logs (user_id, old_plan, new_plan, change_type, source)
    VALUES (
      NEW.id,
      COALESCE(OLD.plan_type, 'free'),
      COALESCE(NEW.plan_type, 'free'),
      CASE
        WHEN NEW.plan_type = 'vip' THEN 'upgrade'
        WHEN NEW.plan_type = 'premium' AND COALESCE(OLD.plan_type, 'free') = 'free' THEN 'upgrade'
        WHEN NEW.plan_type = 'premium' AND OLD.plan_type = 'vip' THEN 'downgrade'
        WHEN COALESCE(NEW.plan_type, 'free') = 'free' THEN 'cancellation'
        ELSE 'change'
      END,
      'system'
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_plan_change ON public.profiles;
CREATE TRIGGER trg_log_plan_change
  AFTER UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_log_plan_change();

-- ═══════════════════════════════════════════════════════════════
-- 3. ENHANCE ANTI-BOT: Add flood detection (>5 comments in 5 min)
-- ═══════════════════════════════════════════════════════════════
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
  SELECT is_verified, plan_type, is_seed, is_test_account
    INTO v_profile
    FROM public.profiles
   WHERE id = NEW.user_id;

  -- Bots/seeds: ocultar automaticamente
  IF v_profile.is_seed = TRUE OR v_profile.is_test_account = TRUE THEN
    NEW.is_hidden   := TRUE;
    NEW.spam_reason := 'bot_account';
    NEW.spam_score  := 100;
    RETURN NEW;
  END IF;

  -- Rate limiting: 30s entre comentários (não verificados/pagos)
  IF v_profile.is_verified IS DISTINCT FROM TRUE
     AND v_profile.plan_type NOT IN ('vip', 'premium') THEN
    SELECT MAX(created_at)
      INTO v_last_comment_at
      FROM public.post_comments
     WHERE user_id = NEW.user_id AND is_hidden = FALSE;

    IF v_last_comment_at IS NOT NULL
       AND (EXTRACT(EPOCH FROM (NOW() - v_last_comment_at))) < 30 THEN
      NEW.is_hidden   := TRUE;
      NEW.spam_reason := 'rate_limit';
      NEW.spam_score  := 80;
      RETURN NEW;
    END IF;
  END IF;

  -- NOVO: Flood detection (>5 comentários em 5 min para não-pagos)
  IF v_profile.plan_type NOT IN ('vip', 'premium') THEN
    SELECT COUNT(*)
      INTO v_recent_count
      FROM public.post_comments
     WHERE user_id = NEW.user_id
       AND created_at > NOW() - INTERVAL '5 minutes'
       AND is_hidden = FALSE;

    IF v_recent_count >= 5 THEN
      NEW.is_hidden   := TRUE;
      NEW.spam_reason := 'flood_detected';
      NEW.spam_score  := 90;
      RETURN NEW;
    END IF;
  END IF;

  -- Detecção de repetição (90% similar nos últimos 60 min)
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

-- E2EE Chat: add encrypted_content column to messages
-- This stores AES-GCM encrypted ciphertext (base64). The original content field
-- is kept for backward compat with legacy messages (null means unencrypted).
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS encrypted_content TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS encryption_iv TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS is_encrypted BOOLEAN NOT NULL DEFAULT FALSE;

-- Index to quickly find encrypted messages
CREATE INDEX IF NOT EXISTS idx_messages_is_encrypted ON public.messages (is_encrypted);

-- Bot-cleanup helper: function to bulk-delete seed posts older than cutoff
CREATE OR REPLACE FUNCTION public.admin_bulk_delete_seed_posts(days_back INTEGER DEFAULT 5)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.posts
  WHERE created_at >= NOW() - (days_back || ' days')::INTERVAL
    AND user_id IN (
      SELECT user_id FROM public.profiles WHERE is_seed = TRUE
    );
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- Moderation: function to count pending reports
CREATE OR REPLACE FUNCTION public.get_moderation_summary()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'pending_reports', (
      SELECT COUNT(*) FROM public.content_reports WHERE status = 'pending'
    ),
    'seed_posts_5d', (
      SELECT COUNT(*) FROM public.posts
      WHERE created_at >= NOW() - INTERVAL '5 days'
        AND user_id IN (SELECT user_id FROM public.profiles WHERE is_seed = TRUE)
    ),
    'banned_users', (
      SELECT COUNT(*) FROM public.profiles WHERE account_status = 'banned'
    ),
    'shadowbanned_users', (
      SELECT COUNT(*) FROM public.profiles WHERE is_shadowbanned = TRUE
    )
  ) INTO result;
  RETURN result;
END;
$$;
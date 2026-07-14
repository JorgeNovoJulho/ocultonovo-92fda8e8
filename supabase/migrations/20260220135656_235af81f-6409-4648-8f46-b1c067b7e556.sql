-- Extend notification_preferences default to include new push event keys
-- (kyc_push, match_push, validation_push)
ALTER TABLE public.profiles
  ALTER COLUMN notification_preferences
  SET DEFAULT '{
    "likes": true,
    "follows": true,
    "messages": true,
    "subscriptions": true,
    "visits": true,
    "story_replies": true,
    "unlocks": true,
    "push_enabled": true,
    "looking_now": true,
    "match_sound": true,
    "match_vibration": true,
    "kyc_push": true,
    "match_push": true,
    "validation_push": true
  }'::jsonb;

-- Back-fill existing rows that don't have the new keys yet
UPDATE public.profiles
SET notification_preferences = notification_preferences ||
  '{"kyc_push": true, "match_push": true, "validation_push": true}'::jsonb
WHERE notification_preferences IS NOT NULL
  AND (
    NOT (notification_preferences ? 'kyc_push')
    OR NOT (notification_preferences ? 'match_push')
    OR NOT (notification_preferences ? 'validation_push')
  );

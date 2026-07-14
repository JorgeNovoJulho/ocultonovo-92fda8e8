-- Add notification_preferences column to profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS notification_preferences jsonb 
DEFAULT '{
  "likes": true,
  "follows": true,
  "messages": true,
  "subscriptions": true,
  "visits": true,
  "story_replies": true,
  "unlocks": true,
  "push_enabled": true
}'::jsonb;
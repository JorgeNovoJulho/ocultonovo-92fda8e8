
-- =============================================
-- notification_preferences: user notification control
-- =============================================
CREATE TABLE IF NOT EXISTS public.notification_preferences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  -- Push notification types
  push_new_message BOOLEAN NOT NULL DEFAULT true,
  push_new_match BOOLEAN NOT NULL DEFAULT true,
  push_kyc_status BOOLEAN NOT NULL DEFAULT true,
  push_validation_warning BOOLEAN NOT NULL DEFAULT true,
  push_gifts BOOLEAN NOT NULL DEFAULT true,
  push_stories BOOLEAN NOT NULL DEFAULT false,
  -- In-app notification types
  inapp_new_message BOOLEAN NOT NULL DEFAULT true,
  inapp_new_match BOOLEAN NOT NULL DEFAULT true,
  inapp_likes BOOLEAN NOT NULL DEFAULT true,
  inapp_profile_visits BOOLEAN NOT NULL DEFAULT true,
  inapp_comments BOOLEAN NOT NULL DEFAULT true,
  inapp_broadcasts BOOLEAN NOT NULL DEFAULT true,
  -- Privacy settings
  show_message_preview BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view their own notification preferences"
  ON public.notification_preferences FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own notification preferences"
  ON public.notification_preferences FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own notification preferences"
  ON public.notification_preferences FOR UPDATE
  USING (auth.uid() = user_id);

-- Auto-create preferences when user subscribes to push
CREATE OR REPLACE FUNCTION public.ensure_notification_preferences()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  INSERT INTO public.notification_preferences (user_id)
  VALUES (NEW.user_id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_push_token_upsert
  AFTER INSERT ON public.push_tokens
  FOR EACH ROW EXECUTE FUNCTION public.ensure_notification_preferences();

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION public.update_notification_preferences_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_notif_prefs_updated_at
  BEFORE UPDATE ON public.notification_preferences
  FOR EACH ROW EXECUTE FUNCTION public.update_notification_preferences_updated_at();

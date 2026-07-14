ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_last_seen_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS onboarding_hide_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_profiles_onboarding_hide_until
  ON public.profiles (onboarding_hide_until)
  WHERE onboarding_hide_until IS NOT NULL;
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_dismissed_forever BOOLEAN NOT NULL DEFAULT FALSE;
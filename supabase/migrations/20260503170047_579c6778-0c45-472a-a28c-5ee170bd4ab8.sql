ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_current_step INTEGER NOT NULL DEFAULT 0;
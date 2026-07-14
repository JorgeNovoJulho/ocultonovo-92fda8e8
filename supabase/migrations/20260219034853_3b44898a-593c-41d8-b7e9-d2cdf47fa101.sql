
-- Fix safety_checkins: change user_id FK to reference auth.users instead of profiles
-- This way auth.uid() = user_id works correctly in RLS

-- Drop the existing constraint and recreate pointing to auth.users
ALTER TABLE public.safety_checkins DROP CONSTRAINT IF EXISTS safety_checkins_user_id_fkey;
ALTER TABLE public.safety_checkins ADD CONSTRAINT safety_checkins_user_id_fkey 
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Fix safety_alerts user_id FK as well
ALTER TABLE public.safety_alerts DROP CONSTRAINT IF EXISTS safety_alerts_user_id_fkey;
ALTER TABLE public.safety_alerts ADD CONSTRAINT safety_alerts_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Add is_looking_now column to profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS is_looking_now boolean DEFAULT false;

-- Add looking_now_since to track when status was activated
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS looking_now_since timestamp with time zone DEFAULT NULL;
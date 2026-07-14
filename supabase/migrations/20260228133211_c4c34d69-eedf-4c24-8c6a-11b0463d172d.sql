-- Add missing partner1_birth_date column
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS partner1_birth_date date;
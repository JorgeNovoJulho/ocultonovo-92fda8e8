
-- Add device_settings JSONB column to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS device_settings jsonb DEFAULT '{}'::jsonb;

-- Add comment for documentation
COMMENT ON COLUMN public.profiles.device_settings IS 'Stores per-device hardware detection results and user performance preferences';

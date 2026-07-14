-- Add discord_webhook_url to pix_gateway_config for admin-editable Discord notifications
ALTER TABLE public.pix_gateway_config
  ADD COLUMN IF NOT EXISTS discord_webhook_url TEXT;

-- Pre-populate with the known webhook URL
UPDATE public.pix_gateway_config
SET discord_webhook_url = 'https://discord.com/api/webhooks/1473777602220265613/ZBpkGH4Kc6qG3dupdB0z-c_IXOkA30WgfvKsX62xeQak0Flqa2owhCIL1eYJIxX6ip69'
WHERE discord_webhook_url IS NULL;
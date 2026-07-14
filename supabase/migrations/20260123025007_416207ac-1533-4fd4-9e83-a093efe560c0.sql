-- Add Free Plan Limits settings to system_settings
INSERT INTO system_settings (key, value, description) VALUES
  ('free_max_messages_per_day', '10', 'Máximo de mensagens por dia para usuários gratuitos'),
  ('free_max_radar_searches_per_day', '5', 'Máximo de buscas no radar por dia para usuários gratuitos'),
  ('free_block_comments', 'false', 'Bloquear comentários para usuários gratuitos'),
  ('free_block_vip_content', 'true', 'Bloquear criação de conteúdo VIP para usuários gratuitos'),
  ('free_block_affiliate', 'true', 'Bloquear programa de afiliados para usuários gratuitos'),
  ('free_blur_likes', 'true', 'Aplicar blur na lista de quem curtiu para usuários gratuitos'),
  ('free_blur_followers', 'true', 'Aplicar blur na lista de seguidores para usuários gratuitos')
ON CONFLICT (key) DO NOTHING;

-- Create table to track daily usage limits per user
CREATE TABLE IF NOT EXISTS public.user_daily_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  limit_type text NOT NULL,
  current_count integer DEFAULT 0,
  reset_date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  UNIQUE(user_id, limit_type, reset_date)
);

-- Enable RLS
ALTER TABLE public.user_daily_limits ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own limits"
ON public.user_daily_limits FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own limits"
ON public.user_daily_limits FOR INSERT
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own limits"
ON public.user_daily_limits FOR UPDATE
USING (user_id = auth.uid());

-- Admins can view all limits
CREATE POLICY "Admins can view all limits"
ON public.user_daily_limits FOR SELECT
USING (is_admin(auth.uid()));

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_user_daily_limits_user_date 
ON public.user_daily_limits(user_id, reset_date);

CREATE INDEX IF NOT EXISTS idx_user_daily_limits_type_date 
ON public.user_daily_limits(limit_type, reset_date);
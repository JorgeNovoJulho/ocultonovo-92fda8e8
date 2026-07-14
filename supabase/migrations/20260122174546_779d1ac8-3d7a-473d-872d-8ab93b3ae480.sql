
-- =====================================================
-- PHASE 1: COUPONS UPGRADE (Marketing Analytics)
-- =====================================================

-- Add platform_source enum
DO $$ BEGIN
  CREATE TYPE platform_source AS ENUM ('instagram', 'tiktok', 'twitter', 'other');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Add new columns to coupons table
ALTER TABLE public.coupons 
ADD COLUMN IF NOT EXISTS platform_source text DEFAULT 'other',
ADD COLUMN IF NOT EXISTS clicks_count integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS conversions_count integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_revenue_generated numeric DEFAULT 0;

-- =====================================================
-- PHASE 2: SUPPORT TICKET SYSTEM
-- =====================================================

-- Create support_tickets table
CREATE TABLE IF NOT EXISTS public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject text NOT NULL,
  description text,
  status text DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  priority text DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  admin_response text,
  resolved_by uuid REFERENCES auth.users(id),
  resolved_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

-- Users can view their own tickets
CREATE POLICY "Users can view their own tickets"
ON public.support_tickets FOR SELECT
USING (user_id = auth.uid());

-- Users can create their own tickets
CREATE POLICY "Users can create tickets"
ON public.support_tickets FOR INSERT
WITH CHECK (user_id = auth.uid());

-- Users can update their own open tickets
CREATE POLICY "Users can update their open tickets"
ON public.support_tickets FOR UPDATE
USING (user_id = auth.uid() AND status = 'open');

-- =====================================================
-- PHASE 3: ADMIN SECURITY & AUDIT
-- =====================================================

-- Create app_role enum
DO $$ BEGIN
  CREATE TYPE app_role AS ENUM ('admin_master', 'admin_regional', 'moderator');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Create user_roles table
CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role text NOT NULL CHECK (role IN ('admin_master', 'admin_regional', 'moderator')),
  granted_by uuid REFERENCES auth.users(id),
  granted_at timestamp with time zone DEFAULT now(),
  UNIQUE (user_id, role)
);

-- Enable RLS
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Create audit_logs table
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL REFERENCES auth.users(id),
  action_type text NOT NULL,
  target_resource text,
  target_id uuid,
  details jsonb,
  ip_address text,
  user_agent text,
  created_at timestamp with time zone DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Create system_settings table
CREATE TABLE IF NOT EXISTS public.system_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  value jsonb NOT NULL,
  description text,
  updated_by uuid REFERENCES auth.users(id),
  updated_at timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- SECURITY DEFINER FUNCTIONS (Avoid recursive RLS)
-- =====================================================

-- Function to check if user has a specific role
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Function to check if user is any type of admin
CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('admin_master', 'admin_regional', 'moderator')
  )
$$;

-- =====================================================
-- RLS POLICIES FOR ADMIN TABLES
-- =====================================================

-- user_roles: Only admins can view roles
CREATE POLICY "Admins can view all roles"
ON public.user_roles FOR SELECT
USING (public.is_admin(auth.uid()));

-- user_roles: Users can see their own roles
CREATE POLICY "Users can view own roles"
ON public.user_roles FOR SELECT
USING (user_id = auth.uid());

-- user_roles: Only master admins can manage roles
CREATE POLICY "Master admins can manage roles"
ON public.user_roles FOR ALL
USING (public.has_role(auth.uid(), 'admin_master'));

-- audit_logs: Only admins can view
CREATE POLICY "Admins can view audit logs"
ON public.audit_logs FOR SELECT
USING (public.is_admin(auth.uid()));

-- audit_logs: Only admins can insert (via useAudit hook)
CREATE POLICY "Admins can insert audit logs"
ON public.audit_logs FOR INSERT
WITH CHECK (public.is_admin(auth.uid()));

-- system_settings: Anyone can read
CREATE POLICY "Anyone can read settings"
ON public.system_settings FOR SELECT
USING (true);

-- system_settings: Only admins can modify
CREATE POLICY "Admins can manage settings"
ON public.system_settings FOR ALL
USING (public.is_admin(auth.uid()));

-- support_tickets: Admins can view all tickets
CREATE POLICY "Admins can view all tickets"
ON public.support_tickets FOR SELECT
USING (public.is_admin(auth.uid()));

-- support_tickets: Admins can update all tickets
CREATE POLICY "Admins can update all tickets"
ON public.support_tickets FOR UPDATE
USING (public.is_admin(auth.uid()));

-- =====================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_support_tickets_user_id ON public.support_tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON public.support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_audit_logs_admin_id ON public.audit_logs(admin_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON public.user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_coupons_platform_source ON public.coupons(platform_source);

-- =====================================================
-- INSERT DEFAULT SYSTEM SETTINGS
-- =====================================================

INSERT INTO public.system_settings (key, value, description) VALUES
  ('platform_fee_percentage', '20', 'Taxa da plataforma em porcentagem'),
  ('affiliate_commission_percentage', '5', 'Comissão de afiliados em porcentagem'),
  ('affiliate_commission_days', '90', 'Dias de duração da comissão de afiliados'),
  ('min_withdrawal_amount', '50', 'Valor mínimo para saque em reais'),
  ('max_coupon_discount', '50', 'Desconto máximo permitido em cupons'),
  ('enable_radar', 'true', 'Habilitar funcionalidade Radar'),
  ('enable_stories', 'true', 'Habilitar funcionalidade Stories'),
  ('maintenance_mode', 'false', 'Modo de manutenção do sistema')
ON CONFLICT (key) DO NOTHING;

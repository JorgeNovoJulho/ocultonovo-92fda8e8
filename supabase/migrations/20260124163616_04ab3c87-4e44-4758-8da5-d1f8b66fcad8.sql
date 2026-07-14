-- Criar função de updated_at primeiro
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 1. VAULT DE MÍDIA
CREATE TABLE IF NOT EXISTS public.media_vault (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  file_size_bytes BIGINT,
  is_encrypted BOOLEAN DEFAULT true,
  encryption_key_hash TEXT,
  access_pin_hash TEXT,
  is_locked BOOLEAN DEFAULT true,
  last_accessed_at TIMESTAMPTZ,
  access_count INTEGER DEFAULT 0,
  notes TEXT,
  tags TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_media_vault_user ON public.media_vault(user_id);

ALTER TABLE public.media_vault ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own vault items"
  ON public.media_vault FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Log de acesso ao vault
CREATE TABLE IF NOT EXISTS public.vault_access_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vault_item_id UUID NOT NULL REFERENCES public.media_vault(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  success BOOLEAN DEFAULT true,
  failure_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.vault_access_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own vault access logs"
  ON public.vault_access_logs FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 2. DENÚNCIAS ANÔNIMAS
CREATE TABLE IF NOT EXISTS public.anonymous_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  reporter_hash TEXT,
  reporter_session_id TEXT,
  target_type TEXT NOT NULL,
  target_id UUID,
  target_user_id UUID REFERENCES public.profiles(id),
  category TEXT NOT NULL,
  severity TEXT DEFAULT 'medium',
  description TEXT,
  evidence_urls TEXT[],
  status TEXT DEFAULT 'pending',
  reviewed_by UUID REFERENCES public.profiles(id),
  reviewed_at TIMESTAMPTZ,
  resolution_notes TEXT,
  action_taken TEXT,
  is_urgent BOOLEAN DEFAULT false,
  auto_flagged BOOLEAN DEFAULT false,
  priority_score INTEGER DEFAULT 50,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_anonymous_reports_status ON public.anonymous_reports(status);

ALTER TABLE public.anonymous_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can create anonymous reports"
  ON public.anonymous_reports FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Admins can view all reports"
  ON public.anonymous_reports FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.admin_staff WHERE user_id = auth.uid() AND is_active = true)
  );

CREATE POLICY "Admins can update reports"
  ON public.anonymous_reports FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM public.admin_staff WHERE user_id = auth.uid() AND is_active = true)
  );

-- 3. SAFETY CHECK-IN
CREATE TABLE IF NOT EXISTS public.safety_checkins (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  checkin_type TEXT NOT NULL,
  related_event_id UUID REFERENCES public.events(id),
  related_user_id UUID REFERENCES public.profiles(id),
  location_description TEXT,
  location_lat DECIMAL(10, 8),
  location_lng DECIMAL(11, 8),
  scheduled_at TIMESTAMPTZ NOT NULL,
  grace_period_minutes INTEGER DEFAULT 30,
  emergency_contacts JSONB,
  emergency_message TEXT,
  status TEXT DEFAULT 'scheduled',
  checked_in_at TIMESTAMPTZ,
  alert_sent_at TIMESTAMPTZ,
  notes TEXT,
  share_location_with_contacts BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_safety_checkins_user ON public.safety_checkins(user_id);
CREATE INDEX IF NOT EXISTS idx_safety_checkins_status ON public.safety_checkins(status);

ALTER TABLE public.safety_checkins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own checkins"
  ON public.safety_checkins FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Alertas de segurança
CREATE TABLE IF NOT EXISTS public.safety_alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  checkin_id UUID NOT NULL REFERENCES public.safety_checkins(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL,
  contacts_notified JSONB,
  responded_at TIMESTAMPTZ,
  response_type TEXT,
  response_notes TEXT,
  authorities_notified BOOLEAN DEFAULT false,
  authorities_notified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.safety_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own alerts"
  ON public.safety_alerts FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Triggers
CREATE TRIGGER update_media_vault_updated_at
  BEFORE UPDATE ON public.media_vault
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_anonymous_reports_updated_at
  BEFORE UPDATE ON public.anonymous_reports
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_safety_checkins_updated_at
  BEFORE UPDATE ON public.safety_checkins
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Storage bucket para vault
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('media-vault', 'media-vault', false, 52428800, ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/webm', 'application/pdf'])
ON CONFLICT (id) DO NOTHING;
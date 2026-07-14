-- =============================================
-- FASE 5.13: Sistema de Backup e Recuperação
-- =============================================

-- Tabela de agendamentos de backup
CREATE TABLE IF NOT EXISTS public.backup_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  frequency TEXT NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly')),
  time_of_day TIME NOT NULL DEFAULT '03:00',
  day_of_week INTEGER CHECK (day_of_week >= 0 AND day_of_week <= 6),
  day_of_month INTEGER CHECK (day_of_month >= 1 AND day_of_month <= 28),
  include_media BOOLEAN DEFAULT false,
  include_messages BOOLEAN DEFAULT true,
  retention_days INTEGER DEFAULT 30,
  is_active BOOLEAN DEFAULT true,
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Histórico de backups executados
CREATE TABLE IF NOT EXISTS public.backup_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id UUID REFERENCES public.backup_schedules(id) ON DELETE SET NULL,
  backup_type TEXT NOT NULL CHECK (backup_type IN ('scheduled', 'manual', 'pre_migration')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'failed')),
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  file_size_bytes BIGINT,
  storage_path TEXT,
  tables_included JSONB,
  media_included BOOLEAN DEFAULT false,
  media_count INTEGER DEFAULT 0,
  error_message TEXT,
  metadata JSONB DEFAULT '{}',
  created_by UUID REFERENCES auth.users(id)
);

-- Tabela de restaurações
CREATE TABLE IF NOT EXISTS public.backup_restorations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  backup_id UUID REFERENCES public.backup_history(id) ON DELETE CASCADE NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'failed', 'cancelled')),
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  tables_restored JSONB,
  records_restored INTEGER DEFAULT 0,
  error_message TEXT,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id)
);

-- Configurações de backup
CREATE TABLE IF NOT EXISTS public.backup_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key TEXT UNIQUE NOT NULL,
  setting_value JSONB NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);

-- Inserir configurações padrão
INSERT INTO public.backup_settings (setting_key, setting_value, description) VALUES
  ('auto_backup_enabled', 'true', 'Habilitar backups automáticos'),
  ('max_backup_size_gb', '10', 'Tamanho máximo de backup em GB'),
  ('compression_enabled', 'true', 'Habilitar compressão de backups'),
  ('encryption_enabled', 'true', 'Habilitar criptografia de backups'),
  ('notification_emails', '[]', 'Emails para notificação de backup')
ON CONFLICT (setting_key) DO NOTHING;

-- Enable RLS
ALTER TABLE public.backup_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backup_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backup_restorations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backup_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies (apenas admins)
CREATE POLICY "Admins can manage backup schedules" ON public.backup_schedules
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can view backup history" ON public.backup_history
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage restorations" ON public.backup_restorations
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage backup settings" ON public.backup_settings
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Função para obter estatísticas de backup
CREATE OR REPLACE FUNCTION public.get_backup_stats()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'total_backups', (SELECT COUNT(*) FROM backup_history),
    'completed_backups', (SELECT COUNT(*) FROM backup_history WHERE status = 'completed'),
    'failed_backups', (SELECT COUNT(*) FROM backup_history WHERE status = 'failed'),
    'total_size_bytes', (SELECT COALESCE(SUM(file_size_bytes), 0) FROM backup_history WHERE status = 'completed'),
    'last_backup_at', (SELECT MAX(completed_at) FROM backup_history WHERE status = 'completed'),
    'active_schedules', (SELECT COUNT(*) FROM backup_schedules WHERE is_active = true),
    'pending_restorations', (SELECT COUNT(*) FROM backup_restorations WHERE status = 'pending'),
    'last_7_days', (
      SELECT COUNT(*) FROM backup_history 
      WHERE started_at >= NOW() - INTERVAL '7 days'
    )
  ) INTO result;
  
  RETURN result;
END;
$$;

-- Função para calcular próxima execução
CREATE OR REPLACE FUNCTION public.calculate_next_backup_run(
  p_frequency TEXT,
  p_time_of_day TIME,
  p_day_of_week INTEGER DEFAULT NULL,
  p_day_of_month INTEGER DEFAULT NULL
)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
AS $$
DECLARE
  next_run TIMESTAMPTZ;
  current_date DATE := CURRENT_DATE;
BEGIN
  CASE p_frequency
    WHEN 'daily' THEN
      next_run := current_date + p_time_of_day;
      IF next_run <= NOW() THEN
        next_run := next_run + INTERVAL '1 day';
      END IF;
    WHEN 'weekly' THEN
      next_run := current_date + ((p_day_of_week - EXTRACT(DOW FROM current_date))::INTEGER % 7) * INTERVAL '1 day' + p_time_of_day;
      IF next_run <= NOW() THEN
        next_run := next_run + INTERVAL '7 days';
      END IF;
    WHEN 'monthly' THEN
      next_run := DATE_TRUNC('month', current_date) + (p_day_of_month - 1) * INTERVAL '1 day' + p_time_of_day;
      IF next_run <= NOW() THEN
        next_run := next_run + INTERVAL '1 month';
      END IF;
    ELSE
      next_run := NOW() + INTERVAL '1 day';
  END CASE;
  
  RETURN next_run;
END;
$$;

-- Trigger para atualizar next_run_at
CREATE OR REPLACE FUNCTION public.update_backup_schedule_next_run()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.next_run_at := public.calculate_next_backup_run(
    NEW.frequency,
    NEW.time_of_day,
    NEW.day_of_week,
    NEW.day_of_month
  );
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_update_backup_next_run
  BEFORE INSERT OR UPDATE ON public.backup_schedules
  FOR EACH ROW
  EXECUTE FUNCTION public.update_backup_schedule_next_run();

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_backup_history_status ON public.backup_history(status);
CREATE INDEX IF NOT EXISTS idx_backup_history_started_at ON public.backup_history(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_backup_schedules_next_run ON public.backup_schedules(next_run_at) WHERE is_active = true;
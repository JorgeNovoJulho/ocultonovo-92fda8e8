-- =====================================================
-- SISTEMA DE BACKUP COMPLETO PARA ADMINISTRADORES
-- =====================================================

-- 1. Tabela de agendamentos de backup
CREATE TABLE IF NOT EXISTS public.backup_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  frequency TEXT NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly', 'custom')),
  day_of_week INTEGER CHECK (day_of_week >= 0 AND day_of_week <= 6), -- 0=domingo
  day_of_month INTEGER CHECK (day_of_month >= 1 AND day_of_month <= 31),
  time_of_day TIME NOT NULL DEFAULT '03:00:00',
  include_media BOOLEAN DEFAULT true,
  include_messages BOOLEAN DEFAULT true,
  retention_days INTEGER DEFAULT 30 CHECK (retention_days >= 7 AND retention_days <= 365),
  is_active BOOLEAN DEFAULT true,
  last_run_at TIMESTAMP WITH TIME ZONE,
  next_run_at TIMESTAMP WITH TIME ZONE,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 2. Tabela de histórico de backups
CREATE TABLE IF NOT EXISTS public.backup_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id UUID REFERENCES public.backup_schedules(id) ON DELETE SET NULL,
  backup_type TEXT NOT NULL CHECK (backup_type IN ('full', 'incremental', 'manual', 'pre_restore')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  storage_path TEXT,
  file_size_bytes BIGINT,
  tables_included JSONB,
  media_included BOOLEAN DEFAULT false,
  media_count INTEGER DEFAULT 0,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  created_by UUID REFERENCES auth.users(id),
  metadata JSONB DEFAULT '{}'::jsonb
);

-- 3. Habilitar RLS
ALTER TABLE public.backup_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backup_history ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies - Apenas admin_master pode gerenciar backups
CREATE POLICY "Master admins can manage backup schedules"
ON public.backup_schedules FOR ALL
USING (has_role(auth.uid(), 'admin_master'));

CREATE POLICY "Master admins can manage backup history"
ON public.backup_history FOR ALL
USING (has_role(auth.uid(), 'admin_master'));

-- 5. Índices para performance
CREATE INDEX IF NOT EXISTS idx_backup_schedules_active ON public.backup_schedules(is_active, next_run_at);
CREATE INDEX IF NOT EXISTS idx_backup_history_status ON public.backup_history(status, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_backup_history_schedule ON public.backup_history(schedule_id);

-- 6. Trigger para updated_at
CREATE TRIGGER update_backup_schedules_timestamp
BEFORE UPDATE ON public.backup_schedules
FOR EACH ROW
EXECUTE FUNCTION public.update_profile_timestamp();

-- 7. Criar bucket privado para backups
INSERT INTO storage.buckets (id, name, public)
VALUES ('platform-backups', 'platform-backups', false)
ON CONFLICT (id) DO NOTHING;

-- 8. RLS para bucket de backups
CREATE POLICY "Master admins can access platform backups"
ON storage.objects FOR ALL
USING (bucket_id = 'platform-backups' AND has_role(auth.uid(), 'admin_master'))
WITH CHECK (bucket_id = 'platform-backups' AND has_role(auth.uid(), 'admin_master'));

-- 9. Função para calcular próximo run
CREATE OR REPLACE FUNCTION public.calculate_next_backup_run(
  p_frequency TEXT,
  p_day_of_week INTEGER,
  p_day_of_month INTEGER,
  p_time_of_day TIME
)
RETURNS TIMESTAMP WITH TIME ZONE
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_next_run TIMESTAMP WITH TIME ZONE;
  v_today DATE := CURRENT_DATE;
  v_now TIMESTAMP WITH TIME ZONE := now();
  v_time TIME := p_time_of_day;
BEGIN
  CASE p_frequency
    WHEN 'daily' THEN
      -- Próximo dia no horário especificado
      v_next_run := (v_today + v_time)::TIMESTAMP WITH TIME ZONE;
      IF v_next_run <= v_now THEN
        v_next_run := v_next_run + INTERVAL '1 day';
      END IF;
      
    WHEN 'weekly' THEN
      -- Próxima ocorrência do dia da semana
      v_next_run := (v_today + ((7 + p_day_of_week - EXTRACT(DOW FROM v_today)::INTEGER) % 7) * INTERVAL '1 day' + v_time)::TIMESTAMP WITH TIME ZONE;
      IF v_next_run <= v_now THEN
        v_next_run := v_next_run + INTERVAL '7 days';
      END IF;
      
    WHEN 'monthly' THEN
      -- Próxima ocorrência do dia do mês
      v_next_run := (DATE_TRUNC('month', v_today) + (p_day_of_month - 1) * INTERVAL '1 day' + v_time)::TIMESTAMP WITH TIME ZONE;
      IF v_next_run <= v_now THEN
        v_next_run := (DATE_TRUNC('month', v_today) + INTERVAL '1 month' + (p_day_of_month - 1) * INTERVAL '1 day' + v_time)::TIMESTAMP WITH TIME ZONE;
      END IF;
      
    ELSE
      -- Custom: padrão para amanhã
      v_next_run := (v_today + INTERVAL '1 day' + v_time)::TIMESTAMP WITH TIME ZONE;
  END CASE;
  
  RETURN v_next_run;
END;
$$;

-- 10. Adicionar novos tipos de ação ao audit_logs se necessário
-- (Apenas para documentação, os tipos são dinâmicos)
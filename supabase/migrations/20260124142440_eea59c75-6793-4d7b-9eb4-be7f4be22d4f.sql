-- =====================================================
-- TABELA: conversion_events (Rastreamento de Funil)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.conversion_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL CHECK (event_type IN ('signup_start', 'plan_view', 'checkout_start', 'payment_attempt', 'payment_success', 'payment_failed')),
  plan_type text CHECK (plan_type IN ('free', 'premium', 'vip')),
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  session_id text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- Índices para consultas rápidas de funil
CREATE INDEX IF NOT EXISTS idx_conversion_events_type_date ON public.conversion_events(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversion_events_plan ON public.conversion_events(plan_type, created_at DESC);

-- RLS: Admins podem ler, sistema pode inserir
ALTER TABLE public.conversion_events ENABLE ROW LEVEL SECURITY;

-- Drop policies existentes se houver (para evitar conflito)
DROP POLICY IF EXISTS "Admins podem ler eventos de conversão" ON public.conversion_events;
DROP POLICY IF EXISTS "Sistema pode inserir eventos de conversão" ON public.conversion_events;

CREATE POLICY "Admins podem ler eventos de conversão"
ON public.conversion_events FOR SELECT
USING (is_admin(auth.uid()));

CREATE POLICY "Sistema pode inserir eventos de conversão"
ON public.conversion_events FOR INSERT
WITH CHECK (true);

-- =====================================================
-- SETTINGS: Adicionar configurações de Telegram (JSONB format)
-- =====================================================
INSERT INTO system_settings (key, value, description)
VALUES 
  ('telegram_bot_token', '""'::jsonb, 'Token do bot Telegram para alertas de capacidade'),
  ('telegram_chat_id', '""'::jsonb, 'ID do chat/grupo Telegram para receber alertas'),
  ('last_capacity_alert_90', '""'::jsonb, 'Timestamp do último alerta de 90%'),
  ('last_capacity_alert_95', '""'::jsonb, 'Timestamp do último alerta de 95%'),
  ('last_capacity_alert_100', '""'::jsonb, 'Timestamp do último alerta de 100%')
ON CONFLICT (key) DO NOTHING;

-- =====================================================
-- TRIGGER: Monitorar capacidade ao inserir profiles
-- =====================================================
CREATE OR REPLACE FUNCTION public.check_capacity_threshold()
RETURNS TRIGGER AS $$
DECLARE
  v_current_users BIGINT;
  v_max_limit INTEGER;
  v_percentage NUMERIC;
BEGIN
  -- Contar usuários atuais (excluindo seeds)
  SELECT COUNT(*) INTO v_current_users
  FROM profiles WHERE is_seed = false OR is_seed IS NULL;
  
  -- Buscar limite máximo
  SELECT COALESCE((value::text)::INTEGER, 1000) INTO v_max_limit
  FROM system_settings WHERE key = 'max_users_limit';
  
  -- Se não encontrou o limite, usar padrão
  IF v_max_limit IS NULL OR v_max_limit = 0 THEN
    v_max_limit := 1000;
  END IF;
  
  -- Calcular percentual
  v_percentage := (v_current_users::NUMERIC / v_max_limit) * 100;
  
  -- Notificar via pg_notify baseado nos thresholds
  IF v_percentage >= 100 THEN
    PERFORM pg_notify('capacity_alert', json_build_object(
      'threshold', 100,
      'current_users', v_current_users,
      'max_limit', v_max_limit,
      'percentage', v_percentage
    )::text);
  ELSIF v_percentage >= 95 THEN
    PERFORM pg_notify('capacity_alert', json_build_object(
      'threshold', 95,
      'current_users', v_current_users,
      'max_limit', v_max_limit,
      'percentage', v_percentage
    )::text);
  ELSIF v_percentage >= 90 THEN
    PERFORM pg_notify('capacity_alert', json_build_object(
      'threshold', 90,
      'current_users', v_current_users,
      'max_limit', v_max_limit,
      'percentage', v_percentage
    )::text);
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Remover trigger existente se houver
DROP TRIGGER IF EXISTS trigger_check_capacity ON profiles;

-- Criar trigger para verificar capacidade após inserção
CREATE TRIGGER trigger_check_capacity
AFTER INSERT ON profiles
FOR EACH ROW
EXECUTE FUNCTION check_capacity_threshold();

-- =====================================================
-- FUNÇÃO RPC: Buscar dados do funil de conversão
-- =====================================================
CREATE OR REPLACE FUNCTION public.get_conversion_funnel(hours_ago INTEGER DEFAULT 24)
RETURNS TABLE (
  event_type TEXT,
  plan_type TEXT,
  event_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ce.event_type,
    ce.plan_type,
    COUNT(*)::BIGINT as event_count
  FROM conversion_events ce
  WHERE ce.created_at >= NOW() - (hours_ago || ' hours')::INTERVAL
  GROUP BY ce.event_type, ce.plan_type
  ORDER BY 
    CASE ce.event_type
      WHEN 'signup_start' THEN 1
      WHEN 'plan_view' THEN 2
      WHEN 'checkout_start' THEN 3
      WHEN 'payment_attempt' THEN 4
      WHEN 'payment_success' THEN 5
      WHEN 'payment_failed' THEN 6
    END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
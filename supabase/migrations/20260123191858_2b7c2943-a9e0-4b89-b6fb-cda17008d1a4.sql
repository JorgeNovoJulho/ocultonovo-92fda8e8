-- Função de trigger para notificar acessos críticos durante impersonificação
CREATE OR REPLACE FUNCTION public.notify_critical_impersonation_access()
RETURNS TRIGGER AS $$
BEGIN
  -- Só notifica para acessos críticos ou high
  IF NEW.sensitivity_level IN ('critical', 'high') THEN
    INSERT INTO public.admin_notifications (type, title, body, data, is_read)
    VALUES (
      'critical_impersonation',
      CASE 
        WHEN NEW.sensitivity_level = 'critical' THEN '🚨 ALERTA CRÍTICO: Acesso durante Impersonificação'
        ELSE '⚠️ Acesso Sensível durante Impersonificação'
      END,
      'Admin acessou ' || COALESCE(NEW.route_category, 'rota desconhecida') || ' de usuário impersonificado',
      jsonb_build_object(
        'admin_id', NEW.admin_id,
        'target_user_id', NEW.target_user_id,
        'route_accessed', NEW.route_accessed,
        'route_category', NEW.route_category,
        'sensitivity_level', NEW.sensitivity_level,
        'session_id', NEW.session_id
      ),
      false
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Criar trigger na tabela de logs
DROP TRIGGER IF EXISTS on_critical_impersonation_access ON public.impersonation_access_logs;
CREATE TRIGGER on_critical_impersonation_access
AFTER INSERT ON public.impersonation_access_logs
FOR EACH ROW
EXECUTE FUNCTION public.notify_critical_impersonation_access();

-- Habilitar realtime para a tabela de logs
ALTER PUBLICATION supabase_realtime ADD TABLE public.impersonation_access_logs;
import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '@/lib/supabaseExternal';
import { useImpersonationStore } from '@/store/useImpersonationStore';
import { logger } from '@/lib/logger';

// Mapeamento de rotas sensíveis com níveis de sensibilidade
const SENSITIVE_ROUTES: Record<string, {
  category: 'messages' | 'financial' | 'hidden_content' | 'profile' | 'other';
  sensitivity: 'low' | 'medium' | 'high' | 'critical';
  label: string;
}> = {
  '/messages': { category: 'messages', sensitivity: 'critical', label: 'acessou mensagens privadas' },
  '/wallet': { category: 'financial', sensitivity: 'high', label: 'visualizou carteira' },
  '/bank-info': { category: 'financial', sensitivity: 'critical', label: 'visualizou dados bancários' },
  '/earnings': { category: 'financial', sensitivity: 'high', label: 'visualizou ganhos' },
  '/transactions': { category: 'financial', sensitivity: 'high', label: 'visualizou transações' },
  '/settings': { category: 'profile', sensitivity: 'medium', label: 'acessou configurações' },
  '/my-media': { category: 'hidden_content', sensitivity: 'high', label: 'visualizou mídia privada' },
  '/subscriptions': { category: 'financial', sensitivity: 'medium', label: 'visualizou assinaturas' },
  '/gifts-history': { category: 'financial', sensitivity: 'medium', label: 'visualizou histórico de presentes' },
  '/creator-dashboard': { category: 'financial', sensitivity: 'high', label: 'acessou dashboard de criador' },
};

// Função para verificar se a rota atual é sensível
function matchSensitiveRoute(pathname: string): {
  route: string;
  category: 'messages' | 'financial' | 'hidden_content' | 'profile' | 'other';
  sensitivity: 'low' | 'medium' | 'high' | 'critical';
  label: string;
} | null {
  // Primeiro verifica correspondência exata
  if (SENSITIVE_ROUTES[pathname]) {
    return { route: pathname, ...SENSITIVE_ROUTES[pathname] };
  }

  // Depois verifica prefixos (ex: /messages/abc123)
  for (const [route, config] of Object.entries(SENSITIVE_ROUTES)) {
    if (pathname.startsWith(route + '/') || pathname === route) {
      return { route, ...config };
    }
  }

  return null;
}

// Hook principal de monitoramento
export function useImpersonationLogger() {
  const location = useLocation();
  // Selectors atomizados — o logger reage apenas quando os campos relevantes mudam.
  const isImpersonating = useImpersonationStore((s) => s.isImpersonating);
  const targetUser = useImpersonationStore((s) => s.targetUser);
  const originalAdminId = useImpersonationStore((s) => s.originalAdminId);
  const sessionId = useImpersonationStore((s) => s.sessionId);
  const lastLoggedRoute = useRef<string | null>(null);

  useEffect(() => {
    // Só loga se estiver impersonificando
    if (!isImpersonating || !originalAdminId || !targetUser?.id) {
      return;
    }

    const pathname = location.pathname;
    const sensitiveMatch = matchSensitiveRoute(pathname);

    // Se não é rota sensível ou já foi logada, ignora
    if (!sensitiveMatch || pathname === lastLoggedRoute.current) {
      return;
    }

    // Atualiza referência para evitar logs duplicados
    lastLoggedRoute.current = pathname;

    // Extrai detalhes adicionais da URL
    const pathParts = pathname.split('/').filter(Boolean);
    const details: Record<string, string> = {
      full_path: pathname,
      label: sensitiveMatch.label,
    };

    // Adiciona ID específico se for uma sub-rota (ex: /messages/abc123)
    if (pathParts.length > 1) {
      if (sensitiveMatch.category === 'messages') {
        details.conversation_id = pathParts[1];
      } else {
        details.resource_id = pathParts[1];
      }
    }

    // Insere log de acesso
    const logAccess = async () => {
      try {
        await supabase
          .from('impersonation_access_logs')
          .insert([{
            admin_id: originalAdminId,
            target_user_id: targetUser.id,
            route_accessed: pathname,
            route_category: sensitiveMatch.category,
            sensitivity_level: sensitiveMatch.sensitivity,
            details: details as unknown as Record<string, never>,
            user_agent: navigator.userAgent,
            session_id: sessionId || undefined,
          }]);

        logger.log(`[ImpersonationLogger] Logged access to ${pathname} (${sensitiveMatch.sensitivity})`);
      } catch (error) {
        console.error('[ImpersonationLogger] Failed to log access:', error);
      }
    };

    logAccess();
  }, [location.pathname, isImpersonating, originalAdminId, targetUser?.id, sessionId]);

  // Reset quando sair da impersonificação
  useEffect(() => {
    if (!isImpersonating) {
      lastLoggedRoute.current = null;
    }
  }, [isImpersonating]);
}

// Hook para obter logs (apenas Super Admin)
export function useImpersonationAccessLogs(filters?: {
  adminId?: string;
  category?: string;
  sensitivity?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
}) {
  const fetchLogs = async () => {
    let query = supabase
      .from('impersonation_access_logs')
      .select('*')
      .order('created_at', { ascending: false });

    if (filters?.adminId) {
      query = query.eq('admin_id', filters.adminId);
    }

    if (filters?.category) {
      query = query.eq('route_category', filters.category);
    }

    if (filters?.sensitivity) {
      query = query.eq('sensitivity_level', filters.sensitivity);
    }

    if (filters?.startDate) {
      query = query.gte('created_at', filters.startDate.toISOString());
    }

    if (filters?.endDate) {
      query = query.lte('created_at', filters.endDate.toISOString());
    }

    query = query.limit(filters?.limit || 100);

    const { data, error } = await query;
    if (error) throw error;

    const list = (data || []) as any[];
    if (list.length === 0) return [];

    const adminIds = [...new Set(list.map((l: any) => l.admin_id).filter(Boolean))];
    const targetIds = [...new Set(list.map((l: any) => l.target_user_id).filter(Boolean))];

    const [adminsRes, targetsRes] = await Promise.all([
      adminIds.length
        ? (supabase as any).from('profiles').select('id, name, avatar_url').in('id', adminIds)
        : Promise.resolve({ data: [] }),
      targetIds.length
        ? (supabase as any).from('profiles').select('id, name, username, avatar_url').in('id', targetIds)
        : Promise.resolve({ data: [] }),
    ]);

    const adminMap = new Map<string, any>((adminsRes.data || []).map((a: any) => [a.id, a]));
    const targetMap = new Map<string, any>((targetsRes.data || []).map((t: any) => [t.id, t]));

    return list.map((l: any) => ({
      ...l,
      admin_profile: adminMap.get(l.admin_id) || null,
      target_profile: targetMap.get(l.target_user_id) || null,
    }));
  };

  return { fetchLogs };
}

// Estatísticas resumidas
export function useImpersonationLogStats() {
  const fetchStats = async () => {
    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Total nas últimas 24h
    const { count: total24h } = await supabase
      .from('impersonation_access_logs')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', last24h.toISOString());

    // Acessos críticos nas últimas 24h
    const { count: critical24h } = await supabase
      .from('impersonation_access_logs')
      .select('*', { count: 'exact', head: true })
      .eq('sensitivity_level', 'critical')
      .gte('created_at', last24h.toISOString());

    // Por categoria
    const { data: byCategory } = await supabase
      .from('impersonation_access_logs')
      .select('route_category')
      .gte('created_at', last24h.toISOString());

    const categoryCounts = (byCategory || []).reduce((acc, log) => {
      acc[log.route_category] = (acc[log.route_category] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      total24h: total24h || 0,
      critical24h: critical24h || 0,
      byCategory: categoryCounts,
    };
  };

  return { fetchStats };
}

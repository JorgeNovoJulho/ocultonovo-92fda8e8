/**
 * Hook para Denúncias Anônimas
 * Sistema de reporte seguro e anônimo de conteúdo/usuários
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { toast } from '@/hooks/use-toast';

export type ReportCategory = 
  | 'harassment' 
  | 'spam' 
  | 'illegal_content' 
  | 'underage' 
  | 'threats' 
  | 'fraud' 
  | 'impersonation'
  | 'other';

export type ReportTargetType = 'user' | 'post' | 'message' | 'event' | 'story';

export type ReportSeverity = 'low' | 'medium' | 'high' | 'critical';

export type ReportStatus = 'pending' | 'reviewing' | 'action_taken' | 'dismissed' | 'escalated';

export interface AnonymousReport {
  id: string;
  reporter_hash: string | null;
  reporter_session_id: string | null;
  target_type: ReportTargetType;
  target_id: string | null;
  target_user_id: string | null;
  category: ReportCategory;
  severity: ReportSeverity;
  description: string | null;
  evidence_urls: string[] | null;
  status: ReportStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  resolution_notes: string | null;
  action_taken: string | null;
  is_urgent: boolean;
  auto_flagged: boolean;
  priority_score: number;
  created_at: string;
  updated_at: string;
}

// Gerar hash anônimo do reporter (não identificável)
function generateReporterHash(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 15);
  return btoa(`${timestamp}-${random}`).substring(0, 32);
}

// Obter ou criar session ID para rate limiting
function getSessionId(): string {
  let sessionId = sessionStorage.getItem('report_session_id');
  if (!sessionId) {
    sessionId = `session_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    sessionStorage.setItem('report_session_id', sessionId);
  }
  return sessionId;
}

// Hook para criar denúncia anônima
export function useCreateAnonymousReport() {
  return useMutation({
    mutationFn: async (params: {
      targetType: ReportTargetType;
      targetId?: string;
      targetUserId?: string;
      category: ReportCategory;
      description?: string;
      evidenceUrls?: string[];
      isUrgent?: boolean;
    }) => {
      const { targetType, targetId, targetUserId, category, description, evidenceUrls, isUrgent } = params;

      // Calcular severidade baseada na categoria
      const severityMap: Record<ReportCategory, ReportSeverity> = {
        underage: 'critical',
        illegal_content: 'critical',
        threats: 'high',
        harassment: 'high',
        fraud: 'medium',
        impersonation: 'medium',
        spam: 'low',
        other: 'medium',
      };

      // Calcular priority score
      const priorityBase: Record<ReportCategory, number> = {
        underage: 100,
        illegal_content: 95,
        threats: 80,
        harassment: 70,
        fraud: 60,
        impersonation: 50,
        spam: 20,
        other: 40,
      };

      const priority = isUrgent 
        ? Math.min(priorityBase[category] + 20, 100)
        : priorityBase[category];

      const { data, error } = await supabase
        .from('anonymous_reports')
        .insert({
          reporter_hash: generateReporterHash(),
          reporter_session_id: getSessionId(),
          target_type: targetType,
          target_id: targetId,
          target_user_id: targetUserId,
          category,
          severity: severityMap[category],
          description,
          evidence_urls: evidenceUrls,
          is_urgent: isUrgent || category === 'underage' || category === 'illegal_content',
          priority_score: priority,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast({
        title: '✅ Denúncia Enviada',
        description: 'Sua denúncia foi recebida de forma anônima e será analisada pela nossa equipe.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro ao enviar denúncia',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

// Hook para admin listar denúncias
export function useAdminReports(filters?: {
  status?: ReportStatus;
  category?: ReportCategory;
  severity?: ReportSeverity;
}) {
  return useQuery({
    queryKey: ['admin-reports', filters],
    queryFn: async (): Promise<AnonymousReport[]> => {
      let query = supabase
        .from('anonymous_reports')
        .select('*')
        .order('priority_score', { ascending: false })
        .order('created_at', { ascending: false });

      if (filters?.status) {
        query = query.eq('status', filters.status);
      }
      if (filters?.category) {
        query = query.eq('category', filters.category);
      }
      if (filters?.severity) {
        query = query.eq('severity', filters.severity);
      }

      const { data, error } = await query.limit(100);
      if (error) throw error;
      return (data || []) as AnonymousReport[];
    },
  });
}

// Hook para admin atualizar denúncia
export function useUpdateReport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      reportId: string;
      status?: ReportStatus;
      resolutionNotes?: string;
      actionTaken?: string;
      reviewedBy: string;
    }) => {
      const { reportId, status, resolutionNotes, actionTaken, reviewedBy } = params;

      const { data, error } = await supabase
        .from('anonymous_reports')
        .update({
          status,
          resolution_notes: resolutionNotes,
          action_taken: actionTaken,
          reviewed_by: reviewedBy,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', reportId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-reports'] });
      toast({
        title: 'Denúncia Atualizada',
        description: 'O status da denúncia foi atualizado.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro ao atualizar',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

// Hook para estatísticas de denúncias (admin)
export function useReportStats() {
  return useQuery({
    queryKey: ['report-stats'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('anonymous_reports')
        .select('status, severity, category');

      if (error) throw error;

      const reports = data || [];
      return {
        total: reports.length,
        pending: reports.filter(r => r.status === 'pending').length,
        reviewing: reports.filter(r => r.status === 'reviewing').length,
        resolved: reports.filter(r => r.status === 'action_taken' || r.status === 'dismissed').length,
        critical: reports.filter(r => r.severity === 'critical').length,
        high: reports.filter(r => r.severity === 'high').length,
        byCategory: reports.reduce((acc, r) => {
          acc[r.category] = (acc[r.category] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
      };
    },
  });
}

// Categorias com labels em português
export const reportCategoryLabels: Record<ReportCategory, string> = {
  harassment: 'Assédio',
  spam: 'Spam',
  illegal_content: 'Conteúdo Ilegal',
  underage: 'Menor de Idade',
  threats: 'Ameaças',
  fraud: 'Fraude',
  impersonation: 'Falsidade Ideológica',
  other: 'Outro',
};

export const reportSeverityLabels: Record<ReportSeverity, string> = {
  low: 'Baixa',
  medium: 'Média',
  high: 'Alta',
  critical: 'Crítica',
};

export const reportStatusLabels: Record<ReportStatus, string> = {
  pending: 'Pendente',
  reviewing: 'Em Análise',
  action_taken: 'Ação Tomada',
  dismissed: 'Arquivada',
  escalated: 'Escalada',
};

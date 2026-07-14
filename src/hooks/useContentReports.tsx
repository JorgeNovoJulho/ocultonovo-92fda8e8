/**
 * Hook para gerenciamento de denúncias de conteúdo
 * Inclui criação, listagem e ações administrativas
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseExternal";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

// Tipos
export type ReportCategory = 'revenge_porn' | 'minor' | 'spam' | 'harassment' | 'fake_profile' | 'other';
export type ReportPriority = 'critical' | 'high' | 'normal' | 'low';
export type ReportStatus = 'pending' | 'under_review' | 'action_taken' | 'dismissed' | 'escalated';

export interface ContentReport {
  id: string;
  post_id: string | null;
  reported_user_id: string | null;
  reporter_id: string;
  category: ReportCategory;
  priority_level: ReportPriority;
  description: string | null;
  evidence_urls: string[] | null;
  status: ReportStatus;
  sla_deadline: string | null;
  content_hidden: boolean;
  hidden_at: string | null;
  hidden_by: string | null;
  resolution_notes: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  created_at: string;
  updated_at: string;
  // Joins
  post?: {
    id: string;
    content_text: string | null;
    media_url: string | null;
    user_id: string;
    is_hidden: boolean;
  };
  reported_user?: {
    id: string;
    name: string;
    username: string | null;
    avatar_url: string | null;
  };
  reporter?: {
    id: string;
    name: string;
    username: string | null;
  };
}

export interface CreateReportData {
  post_id?: string;
  story_id?: string;
  reported_user_id?: string;
  category: ReportCategory;
  description?: string;
  evidence_urls?: string[];
}

// Configuração de categorias
export const REPORT_CATEGORIES = {
  revenge_porn: {
    label: 'Conteúdo Não Autorizado / Revenge Porn',
    description: 'Imagem ou vídeo íntimo divulgado sem consentimento',
    priority: 'critical' as ReportPriority,
    icon: 'ShieldAlert',
    color: 'destructive',
    requiresEvidence: true,
  },
  minor: {
    label: 'Menor de Idade',
    description: 'Conteúdo envolvendo pessoa menor de 18 anos',
    priority: 'critical' as ReportPriority,
    icon: 'AlertTriangle',
    color: 'destructive',
    requiresEvidence: true,
  },
  harassment: {
    label: 'Assédio ou Ameaças',
    description: 'Comportamento abusivo, ameaçador ou intimidador',
    priority: 'high' as ReportPriority,
    icon: 'UserX',
    color: 'orange',
    requiresEvidence: false,
  },
  spam: {
    label: 'Spam ou Golpe',
    description: 'Conteúdo repetitivo, propaganda ou tentativa de fraude',
    priority: 'normal' as ReportPriority,
    icon: 'Ban',
    color: 'yellow',
    requiresEvidence: false,
  },
  fake_profile: {
    label: 'Perfil Falso',
    description: 'Identidade falsa ou uso indevido de imagens de terceiros',
    priority: 'normal' as ReportPriority,
    icon: 'UserX',
    color: 'yellow',
    requiresEvidence: false,
  },
  other: {
    label: 'Outros',
    description: 'Outro tipo de violação não listada acima',
    priority: 'low' as ReportPriority,
    icon: 'Flag',
    color: 'muted',
    requiresEvidence: false,
  },
};

function mapAnonymousReportToContentReport(report: any): ContentReport {
  const categoryMap: Record<string, ReportCategory> = {
    illegal_content: 'revenge_porn',
    underage: 'minor',
    harassment: 'harassment',
    spam: 'spam',
    impersonation: 'fake_profile',
    fraud: 'other',
    threats: 'harassment',
    other: 'other',
  };
  const priorityMap: Record<string, ReportPriority> = {
    critical: 'critical',
    high: 'high',
    medium: 'normal',
    low: 'low',
  };
  const statusMap: Record<string, ReportStatus> = {
    pending: 'pending',
    reviewing: 'under_review',
    action_taken: 'action_taken',
    dismissed: 'dismissed',
    escalated: 'escalated',
  };

  return {
    id: report.id,
    post_id: report.target_type === 'post' ? report.target_id : null,
    reported_user_id: report.target_user_id || null,
    reporter_id: report.reporter_hash || 'anonymous',
    category: categoryMap[report.category] || 'other',
    priority_level: priorityMap[report.severity] || 'normal',
    description: report.description || null,
    evidence_urls: report.evidence_urls || null,
    status: statusMap[report.status] || 'pending',
    sla_deadline: report.severity === 'critical' ? new Date(new Date(report.created_at).getTime() + 2 * 60 * 60 * 1000).toISOString() : null,
    content_hidden: false,
    hidden_at: null,
    hidden_by: null,
    resolution_notes: report.resolution_notes || null,
    resolved_at: report.reviewed_at || null,
    resolved_by: report.reviewed_by || null,
    created_at: report.created_at,
    updated_at: report.updated_at,
  };
}

function mapContentCategoryToAnonymous(category: ReportCategory) {
  const categoryMap: Record<ReportCategory, string> = {
    revenge_porn: 'illegal_content',
    minor: 'underage',
    harassment: 'harassment',
    spam: 'spam',
    fake_profile: 'impersonation',
    other: 'other',
  };
  return categoryMap[category] || 'other';
}

// Hook para criar denúncia
export function useCreateReport() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (data: CreateReportData) => {
      if (!user) throw new Error('Usuário não autenticado');

      const { data: report, error } = await supabase
        .from('anonymous_reports')
        .insert({
          reporter_hash: user.id,
          reporter_session_id: user.id,
          target_type: data.post_id ? 'post' : data.story_id ? 'story' : 'user',
          target_id: data.post_id || data.story_id || data.reported_user_id || null,
          target_user_id: data.reported_user_id || null,
          category: mapContentCategoryToAnonymous(data.category),
          severity: REPORT_CATEGORIES[data.category].priority === 'critical' ? 'critical' : REPORT_CATEGORIES[data.category].priority === 'high' ? 'high' : 'medium',
          description: data.description,
          evidence_urls: data.evidence_urls,
          is_urgent: REPORT_CATEGORIES[data.category].priority === 'critical',
          priority_score: REPORT_CATEGORIES[data.category].priority === 'critical' ? 100 : REPORT_CATEGORIES[data.category].priority === 'high' ? 70 : 40,
        })
        .select()
        .maybeSingle();

      if (error) throw error;
      return mapAnonymousReportToContentReport(report || { ...data, id: '', created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['content-reports'] });
      queryClient.invalidateQueries({ queryKey: ['my-reports'] });
    },
  });
}

// Hook para listar denúncias do usuário
export function useMyReports() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['my-reports', user?.id],
    queryFn: async () => {
      if (!user) return [];

      const { data, error } = await supabase
        .from('anonymous_reports')
        .select('*')
        .eq('reporter_hash', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return ((data || []) as any[]).map(mapAnonymousReportToContentReport);
    },
    enabled: !!user,
  });
}

// Hook para listar todas as denúncias (admin)
export function useAllReports(filters?: { status?: ReportStatus; priority?: ReportPriority }, enabled: boolean = true) {
  return useQuery<ContentReport[]>({
    queryKey: ['content-reports', filters],
    enabled,
    queryFn: async () => {
      let query = supabase
        .from('anonymous_reports')
        .select('*')
        .order('priority_score', { ascending: false })
        .order('created_at', { ascending: false });

      if (filters?.status) {
        const status = filters.status === 'under_review' ? 'reviewing' : filters.status;
        query = query.eq('status', status);
      }
      if (filters?.priority) {
        const severity = filters.priority === 'normal' ? 'medium' : filters.priority;
        query = query.eq('severity', severity);
      }

      const { data, error } = await query;
      if (error) throw error;
      return ((data || []) as any[]).map(mapAnonymousReportToContentReport);
    },
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}

// Hook para denúncias críticas pendentes (para dashboard admin)
export function useCriticalReports() {
  return useQuery<ContentReport[]>({
    queryKey: ['critical-reports'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('anonymous_reports')
        .select('*')
        .eq('severity', 'critical')
        .in('status', ['pending', 'reviewing'])
        .order('created_at', { ascending: true });

      if (error) throw error;
      const reports = ((data || []) as any[]).map(mapAnonymousReportToContentReport);
      const userIds = [...new Set(reports.map((r) => r.reported_user_id).filter(Boolean))] as string[];
      if (!userIds.length) return reports;
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, name, username, avatar_url')
        .in('id', userIds);
      const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));
      return reports.map((report) => ({ ...report, reported_user: report.reported_user_id ? profileMap.get(report.reported_user_id) : undefined }));
    },
    refetchInterval: 3 * 60_000, // 3 min — antes era 30s, polling excessivo
    refetchOnWindowFocus: false,
    staleTime: 60_000,
    gcTime: 10 * 60_000,
  });
}

// Hook para ocultar conteúdo cautelarmente
export function useHideContent() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ postId, reportId, reason }: { postId: string; reportId: string; reason: string }) => {
      if (!user) throw new Error('Usuário não autenticado');

      // Ocultar o post
      const { error: postError } = await supabase
        .from('posts')
        .update({
          is_hidden: true,
          hidden_reason: reason,
          hidden_at: new Date().toISOString(),
          hidden_by: user.id,
        })
        .eq('id', postId);

      if (postError) throw postError;

      const { error: reportError } = await supabase
        .from('anonymous_reports')
        .update({
          status: 'reviewing',
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
          action_taken: reason,
        })
        .eq('id', reportId);

      if (reportError) throw reportError;

      return { success: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['content-reports'] });
      queryClient.invalidateQueries({ queryKey: ['critical-reports'] });
      queryClient.invalidateQueries({ queryKey: ['posts'] });
      toast.success('Conteúdo ocultado com sucesso');
    },
    onError: (error) => {
      toast.error(`Erro ao ocultar conteúdo: ${error.message}`);
    },
  });
}

// Hook para restaurar conteúdo oculto
export function useRestoreContent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ postId, reportId }: { postId: string; reportId: string }) => {
      // Restaurar o post
      const { error: postError } = await supabase
        .from('posts')
        .update({
          is_hidden: false,
          hidden_reason: null,
          hidden_at: null,
          hidden_by: null,
        })
        .eq('id', postId);

      if (postError) throw postError;

      const { error: reportError } = await supabase
        .from('anonymous_reports')
        .update({
          status: 'dismissed',
          action_taken: 'Conteúdo restaurado',
        })
        .eq('id', reportId);

      if (reportError) throw reportError;

      return { success: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['content-reports'] });
      queryClient.invalidateQueries({ queryKey: ['critical-reports'] });
      queryClient.invalidateQueries({ queryKey: ['posts'] });
      toast.success('Conteúdo restaurado');
    },
  });
}

// Hook para resolver denúncia
export function useResolveReport() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ 
      reportId, 
      status, 
      notes 
    }: { 
      reportId: string; 
      status: 'action_taken' | 'dismissed'; 
      notes?: string 
    }) => {
      if (!user) throw new Error('Usuário não autenticado');

      const { error } = await supabase
        .from('anonymous_reports')
        .update({
          status,
          resolution_notes: notes,
          reviewed_at: new Date().toISOString(),
          reviewed_by: user.id,
          action_taken: status === 'action_taken' ? (notes || 'Ação tomada') : 'Dispensada',
        })
        .eq('id', reportId);

      if (error) throw error;
      return { success: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['content-reports'] });
      queryClient.invalidateQueries({ queryKey: ['critical-reports'] });
      toast.success('Denúncia resolvida');
    },
  });
}

// Hook para upload de evidência
export function useUploadEvidence() {
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (file: File) => {
      if (!user) throw new Error('Usuário não autenticado');

      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}/${Date.now()}.${fileExt}`;

      const { data, error } = await supabase.storage
        .from('report-evidence')
        .upload(fileName, file);

      if (error) throw error;

      // Retornar o path para salvar na denúncia
      return data.path;
    },
  });
}

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { EXTERNAL_SUPABASE_URL, EXTERNAL_SUPABASE_ANON_KEY } from '@/lib/appConfig';
import { supabase } from '@/lib/supabaseExternal';
import { EXTERNAL_ANON_KEY, EXTERNAL_URL } from '@/lib/supabaseExternal';
import { useAuth } from './useAuth';
import { toast } from '@/hooks/use-toast';
import { useAudit } from './useAudit';

const isMissingBackupInfra = (error: any) =>
  error?.code === 'PGRST205' || /backup_(history|schedules)|platform-backups/i.test(error?.message || '');

const emptyBackupStats: BackupStats = {
  total_backups: 0,
  successful_backups: 0,
  total_size_bytes: 0,
  last_backup_at: null,
  active_schedules: 0,
};

async function invokeExternalFunction<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Não autenticado');

  const url = `${EXTERNAL_SUPABASE_URL}/functions/v1/${name}`;

  // Pré-checagem rápida (HEAD/OPTIONS) para detectar 404 explícito da gateway
  // antes de gastar recursos com o POST real.
  const notFoundMessage =
    `A Edge Function "${name}" ainda não foi publicada no Supabase externo (rvybbrkzmboqbhcemqar). ` +
    `Faça o deploy via terminal:\n\n` +
    `supabase functions deploy ${name} --project-ref rvybbrkzmboqbhcemqar\n\n` +
    `Depois confirme que os secrets (SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL, SUPABASE_ANON_KEY) estão configurados no projeto externo.`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        apikey: EXTERNAL_SUPABASE_ANON_KEY,
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error(
      `Não foi possível alcançar a função "${name}" no Supabase externo. ` +
      `Verifique conexão e CORS. Se a função nunca foi publicada, rode:\n\n` +
      `supabase functions deploy ${name} --project-ref rvybbrkzmboqbhcemqar`,
    );
  }

  const rawText = await response.text();
  let payload: any = null;
  try { payload = rawText ? JSON.parse(rawText) : null; } catch { /* keep raw */ }

  // Detecta NOT_FOUND tanto via HTTP 404 quanto via corpo (gateway às vezes responde 200/4xx com code)
  const bodyCode = payload?.code || payload?.error_code;
  if (response.status === 404 || bodyCode === 'NOT_FOUND') {
    throw new Error(notFoundMessage);
  }

  if (!response.ok) {
    throw new Error(payload?.error || payload?.message || rawText || `Falha na função ${name}`);
  }
  return payload as T;
}

export interface BackupSchedule {
  id: string;
  name: string;
  frequency: 'daily' | 'weekly' | 'monthly' | 'custom';
  day_of_week: number | null;
  day_of_month: number | null;
  time_of_day: string;
  include_media: boolean;
  include_messages: boolean;
  retention_days: number;
  is_active: boolean;
  last_run_at: string | null;
  next_run_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface BackupHistory {
  id: string;
  schedule_id: string | null;
  backup_type: 'full' | 'incremental' | 'manual' | 'pre_restore';
  status: 'pending' | 'running' | 'completed' | 'failed';
  storage_path: string | null;
  file_size_bytes: number | null;
  tables_included: Record<string, number> | null;
  media_included: boolean;
  media_count: number;
  started_at: string;
  completed_at: string | null;
  error_message: string | null;
  created_by: string | null;
  metadata: Record<string, any>;
}

export interface BackupStats {
  total_backups: number;
  successful_backups: number;
  total_size_bytes: number;
  last_backup_at: string | null;
  active_schedules: number;
}

interface RestoreBackupResponse {
  total_records?: number;
  tables_available?: string[];
  total_records_inserted?: number;
  tables_restored?: number;
}

// Buscar estatísticas de backup
export function useBackupStats() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['backup-stats'],
    queryFn: async (): Promise<BackupStats> => {
      // Buscar histórico
      const { data: history, error: historyError } = await (supabase as any)
        .from('backup_history')
        .select('status, file_size_bytes, completed_at')
        .order('completed_at', { ascending: false });

      if (historyError) {
        if (isMissingBackupInfra(historyError)) return emptyBackupStats;
        throw historyError;
      }

      const successful = (history || []).filter((h: any) => h.status === 'completed');
      const totalSize = successful.reduce((acc: number, h: any) => acc + (h.file_size_bytes || 0), 0);
      const lastBackup = successful[0]?.completed_at || null;

      // Buscar schedules ativos
      const { data: schedules, error: schedulesError } = await (supabase as any)
        .from('backup_schedules')
        .select('id')
        .eq('is_active', true);

      if (schedulesError) {
        if (isMissingBackupInfra(schedulesError)) return { ...emptyBackupStats, total_backups: (history || []).length, successful_backups: successful.length, total_size_bytes: totalSize, last_backup_at: lastBackup };
        throw schedulesError;
      }

      return {
        total_backups: (history || []).length,
        successful_backups: successful.length,
        total_size_bytes: totalSize,
        last_backup_at: lastBackup,
        active_schedules: (schedules || []).length,
      };
    },
    enabled: !!user,
  });
}

// Buscar agendamentos
export function useBackupSchedules() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['backup-schedules'],
    queryFn: async (): Promise<BackupSchedule[]> => {
      const { data, error } = await (supabase as any)
        .from('backup_schedules')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        if (isMissingBackupInfra(error)) return [];
        throw error;
      }
      return data || [];
    },
    enabled: !!user,
  });
}

// Buscar histórico
export function useBackupHistory(limit = 20) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['backup-history', limit],
    queryFn: async (): Promise<BackupHistory[]> => {
      const { data, error } = await (supabase as any)
        .from('backup_history')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(limit);

      if (error) {
        if (isMissingBackupInfra(error)) return [];
        throw error;
      }
      return data || [];
    },
    enabled: !!user,
  });
}

// Criar backup manual
export function useCreateBackup() {
  const queryClient = useQueryClient();
  const { logAction } = useAudit();

  return useMutation({
    mutationFn: async (options: {
      include_media?: boolean;
      include_messages?: boolean;
    }) => {
      // Proteção anti-duplicata: verificar se existe backup nos últimos 10 minutos
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const { data: recentBackups, error: recentError } = await (supabase as any)
        .from('backup_history')
        .select('id, started_at')
        .gte('started_at', tenMinutesAgo)
        .in('status', ['completed', 'running'])
        .limit(1);

      if (recentError && !isMissingBackupInfra(recentError)) throw recentError;

      if (recentBackups && recentBackups.length > 0) {
        const diff = Math.round((Date.now() - new Date(recentBackups[0].started_at).getTime()) / 60000);
        throw new Error(`Já existe um backup criado há ${diff} minuto(s). Aguarde pelo menos 10 minutos entre backups.`);
      }

      return invokeExternalFunction<{ backup_id: string; total_records: number; file_size_bytes: number }>('create-full-backup', {
        backup_type: 'manual',
        include_media: options.include_media ?? true,
        include_messages: options.include_messages ?? true,
      });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['backup-history'] });
      queryClient.invalidateQueries({ queryKey: ['backup-stats'] });
      
      logAction('setting_changed', {
        targetResource: 'backup_history',
        targetId: data.backup_id,
        details: { action: 'backup_created', manual: true },
      });

      toast({
        title: 'Backup criado com sucesso!',
        description: `${data.total_records} registros salvos (${(data.file_size_bytes / 1024 / 1024).toFixed(2)} MB)`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro ao criar backup',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

// Restaurar backup
export function useRestoreBackup() {
  const queryClient = useQueryClient();
  const { logAction } = useAudit();

  return useMutation({
    mutationFn: async (options: {
      backup_id: string;
      confirmation_code: string;
      dry_run?: boolean;
      tables_to_restore?: string[];
    }) => {
      return invokeExternalFunction<RestoreBackupResponse>('restore-backup', options as unknown as Record<string, unknown>);
    },
    onSuccess: (data, variables) => {
      if (variables.dry_run) {
        toast({
          title: 'Simulação concluída',
          description: `${data.total_records} registros seriam restaurados de ${data.tables_available?.length || 0} tabelas.`,
        });
      } else {
        queryClient.invalidateQueries();
        
        logAction('setting_changed', {
          targetResource: 'backup_history',
          targetId: variables.backup_id,
          details: { action: 'backup_restored' },
        });

        toast({
          title: 'Backup restaurado!',
          description: `${data.total_records_inserted} registros restaurados de ${data.tables_restored} tabelas.`,
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro ao restaurar backup',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

// Criar agendamento
export function useCreateSchedule() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { logAction } = useAudit();

  return useMutation({
    mutationFn: async (schedule: Omit<BackupSchedule, 'id' | 'created_at' | 'updated_at' | 'last_run_at'>) => {
      if (!user) throw new Error('Não autenticado');

      // Calcular próximo run
      const { data: nextRun } = await (supabase as any)
        .rpc('calculate_next_backup_run', {
          p_frequency: schedule.frequency,
          p_day_of_week: schedule.day_of_week,
          p_day_of_month: schedule.day_of_month,
          p_time_of_day: schedule.time_of_day,
        });

      const { data, error } = await (supabase as any)
        .from('backup_schedules')
        .insert({
          ...schedule,
          next_run_at: nextRun,
          created_by: user.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['backup-schedules'] });
      queryClient.invalidateQueries({ queryKey: ['backup-stats'] });

      logAction('setting_changed', {
        targetResource: 'backup_schedules',
        targetId: data.id,
        details: { action: 'schedule_created', name: data.name, frequency: data.frequency },
      });

      toast({
        title: 'Agendamento criado!',
        description: `"${data.name}" configurado com sucesso.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro ao criar agendamento',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

// Atualizar agendamento
export function useUpdateSchedule() {
  const queryClient = useQueryClient();
  const { logAction } = useAudit();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<BackupSchedule> & { id: string }) => {
      // Se mudou frequência/dia/hora, recalcular próximo run
      if (updates.frequency || updates.day_of_week !== undefined || updates.day_of_month !== undefined || updates.time_of_day) {
        const { data: schedule } = await (supabase as any)
          .from('backup_schedules')
          .select('*')
          .eq('id', id)
          .single();

        const { data: nextRun } = await (supabase as any)
          .rpc('calculate_next_backup_run', {
            p_frequency: updates.frequency || schedule.frequency,
            p_day_of_week: updates.day_of_week ?? schedule.day_of_week,
            p_day_of_month: updates.day_of_month ?? schedule.day_of_month,
            p_time_of_day: updates.time_of_day || schedule.time_of_day,
          });

        updates.next_run_at = nextRun;
      }

      const { data, error } = await (supabase as any)
        .from('backup_schedules')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['backup-schedules'] });
      
      logAction('setting_changed', {
        targetResource: 'backup_schedules',
        targetId: data.id,
      });

      toast({
        title: 'Agendamento atualizado!',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro ao atualizar agendamento',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

// Deletar agendamento
export function useDeleteSchedule() {
  const queryClient = useQueryClient();
  const { logAction } = useAudit();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from('backup_schedules')
        .delete()
        .eq('id', id);

      if (error) throw error;
      return id;
    },
    onSuccess: (id) => {
      queryClient.invalidateQueries({ queryKey: ['backup-schedules'] });
      queryClient.invalidateQueries({ queryKey: ['backup-stats'] });

      logAction('setting_changed', {
        targetResource: 'backup_schedules',
        targetId: id,
      });

      toast({
        title: 'Agendamento removido!',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro ao remover agendamento',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

// Deletar backup do histórico
export function useDeleteBackup() {
  const queryClient = useQueryClient();
  const { logAction } = useAudit();

  return useMutation({
    mutationFn: async (backup: BackupHistory) => {
      // Deletar arquivo do storage
      if (backup.storage_path) {
        await supabase
          .storage
          .from('platform-backups')
          .remove([backup.storage_path]);
      }

      // Deletar registro
      const { error } = await (supabase as any)
        .from('backup_history')
        .delete()
        .eq('id', backup.id);

      if (error) throw error;
      return backup.id;
    },
    onSuccess: (id) => {
      queryClient.invalidateQueries({ queryKey: ['backup-history'] });
      queryClient.invalidateQueries({ queryKey: ['backup-stats'] });

      logAction('setting_changed', {
        targetResource: 'backup_history',
        targetId: id,
      });

      toast({
        title: 'Backup removido!',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro ao remover backup',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

// Obter URL de download
export function useBackupDownloadUrl() {
  return useMutation({
    mutationFn: async (storagePath: string) => {
      const { data, error } = await supabase
        .storage
        .from('platform-backups')
        .createSignedUrl(storagePath, 3600); // 1 hora

      if (error) throw error;
      return data.signedUrl;
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro ao gerar link de download',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

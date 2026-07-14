import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';

export interface OcultoCronJob {
  jobid: number;
  jobname: string;
  schedule: string;
  command: string;
  active: boolean;
  last_run_start: string | null;
  last_run_end: string | null;
  last_status: string | null;
  last_return_msg: string | null;
}

export function useOcultoCronJobs() {
  return useQuery({
    queryKey: ['oculto-cron-jobs'],
    queryFn: async (): Promise<OcultoCronJob[]> => {
      const { data, error } = await (supabase as any).rpc('list_oculto_cron_jobs');
      if (error) throw error;
      return (data || []) as OcultoCronJob[];
    },
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    refetchInterval: 60_000,
  });
}

export function useRunCronNow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (jobname: string) => {
      const { data, error } = await (supabase as any).rpc('run_oculto_cron_now', { p_jobname: jobname });
      if (error) throw error;
      return data as { jobname: string; ok: boolean; error?: string; duration_ms?: number };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['oculto-cron-jobs'] });
    },
  });
}

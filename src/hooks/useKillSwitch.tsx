/**
 * Hook para Kill Switch - Desconexão forçada de todos os usuários
 * Usa Supabase Realtime para broadcast de comandos de emergência
 */
import { useEffect, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { subscribeTable } from '@/lib/realtimeBus';
import { useAuth } from './useAuth';
import { useAudit } from './useAudit';
import { toast } from '@/hooks/use-toast';

export type SystemCommand = 'kill_all_sessions' | 'maintenance_mode' | 'force_refresh';

interface SystemBroadcast {
  id: string;
  command: SystemCommand;
  issued_by: string;
  issued_at: string;
  metadata: Record<string, unknown>;
}

// Hook para ouvir broadcasts e reagir
export function useSystemBroadcastListener() {
  useEffect(() => {
    const unsub = subscribeTable('system_broadcasts', async (payload: any) => {
      if (payload?.eventType !== 'INSERT') return;
      const broadcast = payload.new as SystemBroadcast;

      switch (broadcast.command) {
        case 'kill_all_sessions':
          console.warn('[KILL SWITCH] Desconexão forçada recebida');
          toast({
            title: '⚠️ Sessão Encerrada',
            description: 'Sua sessão foi encerrada pelo administrador.',
            variant: 'destructive',
          });
          setTimeout(async () => {
            await supabase.auth.signOut();
            window.location.href = '/login?reason=kill_switch';
          }, 2000);
          break;

        case 'force_refresh':
          console.warn('[FORCE REFRESH] Atualização forçada');
          toast({
            title: 'Atualização necessária',
            description: 'A página será recarregada em 3 segundos...',
          });
          setTimeout(() => { window.location.reload(); }, 3000);
          break;

        case 'maintenance_mode':
          console.warn('[MAINTENANCE] Modo manutenção ativado');
          toast({
            title: '🔧 Manutenção',
            description: 'A plataforma entrou em modo de manutenção.',
          });
          break;
      }
    }, { events: ['INSERT'] });

    return () => { unsub(); };
  }, []);
}

// Hook para disparar kill switch (apenas admins)
export function useKillSwitch() {
  const { user } = useAuth();
  const { logAction } = useAudit();
  const queryClient = useQueryClient();

  const issueCommand = useMutation({
    mutationFn: async (command: SystemCommand) => {
      if (!user) throw new Error('Usuário não autenticado');

      const { error } = await (supabase as any)
        .from('system_broadcasts')
        .insert({
          command,
          issued_by: user.id,
          metadata: {
            timestamp: new Date().toISOString(),
            user_agent: navigator.userAgent,
          },
        });

      if (error) throw error;

      // Registrar ação no log de auditoria
      await logAction('system_broadcast', {
        targetResource: 'system_broadcasts',
        details: { command },
      });
    },
    onSuccess: (_, command) => {
      queryClient.invalidateQueries({ queryKey: ['system-broadcasts'] });
      
      const messages: Record<SystemCommand, string> = {
        kill_all_sessions: 'Kill Switch ativado! Todos os usuários serão desconectados.',
        force_refresh: 'Comando de atualização enviado a todos os clientes.',
        maintenance_mode: 'Modo manutenção broadcast enviado.',
      };
      
      toast({
        title: '🚨 Comando Executado',
        description: messages[command],
        variant: 'destructive',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro ao executar comando',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const killAllSessions = useCallback(() => {
    issueCommand.mutate('kill_all_sessions');
  }, [issueCommand]);

  const forceRefresh = useCallback(() => {
    issueCommand.mutate('force_refresh');
  }, [issueCommand]);

  return {
    killAllSessions,
    forceRefresh,
    isExecuting: issueCommand.isPending,
  };
}

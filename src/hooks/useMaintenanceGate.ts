/**
 * useMaintenanceGate — estado global de Modo Manutenção.
 * Fonte: RPC public.get_maintenance_state() + realtime em platform_runtime_settings.
 * Supabase EXTERNO somente.
 */
import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { subscribeTable } from '@/lib/realtimeBus';
import { useIsMasterAdmin } from './useUserRoles';
import { useAuth } from './useAuth';

/** Normaliza para comparar usernames tolerando _, -, ., espaços e zero-width. */
function normHandle(v: unknown): string {
  return String(v ?? '')
    .normalize('NFKD')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/^@+/, '')
    .replace(/[\s_\-.]+/g, '')
    .toLowerCase();
}

export interface MaintenanceState {
  enabled: boolean;
  message: string;
  force_logout_version: number;
  started_at: string | null;
  finished_at: string | null;
  allowed_admin_username: string;
}

const DEFAULT_STATE: MaintenanceState = {
  enabled: false,
  message: 'O Oculto está em manutenção rápida para melhorias. Voltaremos em instantes.',
  force_logout_version: 0,
  started_at: null,
  finished_at: null,
  allowed_admin_username: 'ocultomaster',
};

const QK = ['maintenance-state'];

export function useMaintenanceState() {
  const qc = useQueryClient();

  const { data } = useQuery<MaintenanceState>({
    queryKey: QK,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('get_maintenance_state');
      if (!error && data) return { ...DEFAULT_STATE, ...(data as MaintenanceState) };

      // Fail-open: se o hardening retirar EXECUTE da RPC, o app não pode ficar
      // preso no boot/login. Lê a tabela pública de runtime como fallback.
      const tableResult = await (supabase as any)
        .from('platform_runtime_settings')
        .select('*')
        .limit(1)
        .maybeSingle();
      const row = tableResult.data as any;
      if (!tableResult.error && row) {
        return {
          ...DEFAULT_STATE,
          enabled: row.platform_mode === 'maintenance',
          message: row.maintenance_message || DEFAULT_STATE.message,
          force_logout_version: row.force_logout_version ?? DEFAULT_STATE.force_logout_version,
          started_at: row.maintenance_started_at ?? null,
          finished_at: row.maintenance_finished_at ?? null,
          allowed_admin_username: row.allowed_admin_username || DEFAULT_STATE.allowed_admin_username,
        };
      }
      return DEFAULT_STATE;
    },
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  // Só assina o realtime de manutenção quando há sessão. Para anônimos basta
  // o cache + staleTime (refetch acontece em navegação/login). Isso elimina
  // um canal websocket aberto no boot da landing/login.
  const { user } = useAuth();
  useEffect(() => {
    if (!user?.id) return;
    const unsub = subscribeTable(
      'platform_runtime_settings',
      () => qc.invalidateQueries({ queryKey: QK }),
    );
    return () => unsub();
  }, [qc, user?.id]);

  const state = data ?? DEFAULT_STATE;
  return {
    state,
    maintenanceOn: state.enabled,
    forceLogoutVersion: state.force_logout_version,
  };
}

export function useMaintenanceGate() {
  const { state, maintenanceOn, forceLogoutVersion } = useMaintenanceState();
  const { data: isMaster, isLoading: masterLoading, isFetched: masterFetched } = useIsMasterAdmin();
  const { user, loading: authLoading } = useAuth();

  // Fallback: respeita allowed_admin_username do RPC com normalização tolerante
  // (aceita "ocultomaster" == "oculto_master" == "@ocultomaster").
  const meta = (user?.user_metadata || {}) as any;
  const allowedNorm = normHandle(state.allowed_admin_username);
  const candidates = [
    meta?.username, meta?.user_name, meta?.preferred_username,
    meta?.name, meta?.full_name,
    user?.email?.split('@')[0],
  ];
  const matchesAllowed = !!allowedNorm && candidates.some(c => normHandle(c) === allowedNorm);

  // `ready` = autenticação resolvida E (sem usuário OU verificação de master concluída).
  // Sem isso, o gate trata `isMaster=undefined` como "não-master" e desloga
  // qualquer usuário enquanto a query de papéis ainda está em voo — causando
  // o flash "manutenção → login → manutenção" no login normal.
  const ready = !authLoading && (!user || masterFetched || !masterLoading);

  return {
    state,
    maintenanceOn,
    forceLogoutVersion,
    ready,
    allowed: isMaster === true || matchesAllowed,
  };
}

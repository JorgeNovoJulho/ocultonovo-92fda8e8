import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { subscribeTable } from '@/lib/realtimeBus';
import { useAuth } from './useAuth';
import { useMyPlanPersistStore } from '@/store/useMyPlanPersistStore';

export type PlanStatusKind = 'active' | 'expiring' | 'expired' | 'none';

export interface MyPlanStatus {
  plan: string;
  expiresAt: string | null;
  status: PlanStatusKind;
  msLeft: number;   // -1 = vitalício
  daysLeft: number; // -1 = vitalício
  /** true quando o dado vem do cache local (offline / cold reload) */
  fromCache?: boolean;
}

/**
 * Status do MEU plano + persistência local + ticks por segundo.
 * Emite eventos `oculto-plan:expired` e `oculto-plan:renewed` no `window`
 * para que componentes (AuraRoomLive) animem/toastem a mudança.
 */
export function useMyPlanStatus(): MyPlanStatus | null {
  const { user, authReady } = useAuth();
  const qc = useQueryClient();
  const setPersisted = useMyPlanPersistStore((s) => s.setPlan);
  const persistedEffective = useMyPlanPersistStore((s) => s.effective());

  const query = useQuery({
    queryKey: ['my-plan-status', user?.id],
    queryFn: async (): Promise<MyPlanStatus | null> => {
      if (!user?.id) return null;
      const { data } = await (supabase as any)
        .from('profiles')
        .select('plan_type')
        .eq('user_id', user.id)
        .maybeSingle();
      const plan = (data?.plan_type ?? 'free') as string;
      // plan_expires_at não existe no banco externo — planos pagos são tratados como vitalícios.
      const expiresAt = null as string | null;
      // Persiste para fallback offline
      try { setPersisted({ userId: user.id, plan, expiresAt }); } catch {}
      return computeStatus(plan, expiresAt);
    },
    enabled: authReady && !!user?.id,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  // Realtime
  useEffect(() => {
    if (!authReady || !user?.id) return;
    return subscribeTable('profiles', (payload: any) => {
      if (payload?.new?.user_id !== user.id) return;
      qc.invalidateQueries({ queryKey: ['my-plan-status', user.id] });
    }, { events: ['UPDATE'] });
  }, [authReady, user?.id, qc]);

  // Tick local 1x/seg para countdown preciso
  const [, setNow] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setNow((n) => (n + 1) % 1_000_000), 1_000);
    return () => window.clearInterval(id);
  }, []);

  // Status efetivo: prefere a query; se ainda não veio, usa o cache persistido.
  const live = query.data ?? null;
  const fallback: MyPlanStatus | null = persistedEffective
    ? computeStatus(persistedEffective.plan, persistedEffective.expiresAt)
    : null;
  const data = live ?? (fallback ? { ...fallback, fromCache: true } : null);

  // Detecta transição de status (expired/renewed) para emitir eventos globais.
  const prevRef = useRef<{ status: PlanStatusKind; plan: string } | null>(null);
  useEffect(() => {
    if (!data) return;
    const prev = prevRef.current;
    if (prev) {
      const wasActive = prev.status === 'active' || prev.status === 'expiring';
      const nowExpired = data.status === 'expired' || (prev.plan !== 'free' && data.plan === 'free');
      const wasExpiredOrFree = prev.status === 'expired' || prev.plan === 'free';
      const nowActive = data.status === 'active' || data.status === 'expiring';
      if (wasActive && nowExpired) {
        try { window.dispatchEvent(new CustomEvent('oculto-plan:expired', { detail: data })); } catch {}
      } else if (wasExpiredOrFree && nowActive) {
        try { window.dispatchEvent(new CustomEvent('oculto-plan:renewed', { detail: data })); } catch {}
      }
    }
    prevRef.current = { status: data.status, plan: data.plan };
  }, [data?.status, data?.plan]);

  return data;
}

function computeStatus(plan: string, expiresAt: string | null): MyPlanStatus {
  if (plan === 'free') return { plan, expiresAt: null, status: 'none', msLeft: -1, daysLeft: -1 };
  if (!expiresAt) return { plan, expiresAt: null, status: 'active', msLeft: -1, daysLeft: -1 };
  const ms = new Date(expiresAt).getTime() - Date.now();
  const days = Math.ceil(ms / 86_400_000);
  const status: PlanStatusKind = ms <= 0 ? 'expired' : days <= 7 ? 'expiring' : 'active';
  return { plan, expiresAt, status, msLeft: ms, daysLeft: Math.max(0, days) };
}

/**
 * Formata countdown com precisão de segundos quando faltar < 1 hora.
 * Ex.: "12d 4h", "2h 31m", "47m 12s", "23s".
 */
export function formatPlanCountdown(msLeft: number): string {
  if (msLeft < 0) return '∞';
  if (msLeft <= 0) return 'expirado';
  const totalSec = Math.floor(msLeft / 1000);
  const days = Math.floor(totalSec / 86_400);
  const hours = Math.floor((totalSec % 86_400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  if (days >= 1) return `${days}d ${hours}h`;
  if (hours >= 1) return `${hours}h ${mins}m`;
  if (mins >= 1) return `${mins}m ${String(secs).padStart(2, '0')}s`;
  return `${secs}s`;
}

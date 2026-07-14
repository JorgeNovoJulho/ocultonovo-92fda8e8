import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from './useAuth';
import { loadCache, saveCache } from '@/lib/persistentQueryCache';

export interface AdminMetrics {
  totalRevenue: number;
  activeUsers: number;
  newSignupsToday: number;
  pendingReports: number;
  totalCreators: number;
  totalSubscriptions: number;
  monthlyGrowth: number;
  seedUsers: number;
  realUsers: number;
  deletedAccounts: number;
  inactive15: number;
  inactive30: number;
  inactive90: number;
}

function startOfTodayISO() {
  // CRÍTICO: usar dia BRT (America/Sao_Paulo, UTC-03:00), não dia UTC.
  // Senão "Novos Hoje" zera entre 21:00–23:59 BRT (que já é dia seguinte UTC).
  // Importa estaticamente do helper canônico.
  const key = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
  return new Date(`${key}T00:00:00-03:00`).toISOString();
}

function isoDaysAgo(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

const METRICS_CACHE_KEY = 'admin-metrics-v1';
const LOCATIONS_CACHE_KEY = 'admin-active-locations-v1';
const NEW_USERS_CACHE_KEY = 'admin-new-users-ts';
const REVENUE_CACHE_KEY = 'admin-revenue-ts';

const EMPTY_METRICS: AdminMetrics = {
  totalRevenue: 0,
  activeUsers: 0,
  newSignupsToday: 0,
  pendingReports: 0,
  totalCreators: 0,
  totalSubscriptions: 0,
  monthlyGrowth: 0,
  seedUsers: 0,
  realUsers: 0,
  deletedAccounts: 0,
  inactive15: 0,
  inactive30: 0,
  inactive90: 0,
};

export function useAdminMetrics() {
  const { user } = useAuth();
  const cached = loadCache<AdminMetrics>(METRICS_CACHE_KEY, 30 * 60 * 1000);

  return useQuery({
    queryKey: ['admin-metrics'],
    queryFn: async (): Promise<AdminMetrics> => {
      const sb = supabase as any;

      // Caminho rápido: RPC agregada (1 round-trip).
      // Métricas auxiliares (deletedAccounts/inactive*/todayLocal) são pesadas
      // — só rodam depois que a RPC volta, em segundo plano, e retornamos
      // imediatamente com a base disponível.
      try {
        // Rodamos em paralelo: RPC agregada + contagem BRT-aware de "Novos Hoje".
        // A RPC pode usar `current_date` no servidor (UTC), o que zera o card
        // entre 21:00–23:59 BRT. A contagem client-side com cutoff em
        // 00:00 BRT é a fonte canônica e SEMPRE sobrepõe o valor da RPC.
        const todayISO = startOfTodayISO();
        const [rpcResult, todayCountResult] = await Promise.all([
          sb.rpc('get_admin_dashboard_metrics'),
          sb.from('profiles')
            .select('id', { count: 'exact', head: true })
            .or('is_seed.eq.false,is_seed.is.null')
            .or('is_deleted.is.null,is_deleted.eq.false')
            .gte('created_at', todayISO),
        ]);
        const { data: rpcData, error: rpcErr } = rpcResult;
        const todayCountBrt = todayCountResult?.count ?? null;
        if (!rpcErr && rpcData) {
          const base: AdminMetrics = {
            totalRevenue:       Number(rpcData.totalRevenue) || 0,
            activeUsers:        Number(rpcData.activeUsers) || 0,
            // Prefer client-side BRT count; fallback para RPC se a query falhou.
            newSignupsToday:    todayCountBrt ?? (Number(rpcData.newSignupsToday) || 0),
            pendingReports:     Number(rpcData.pendingReports) || 0,
            totalCreators:      Number(rpcData.totalCreators) || 0,
            totalSubscriptions: Number(rpcData.totalSubscriptions) || 0,
            monthlyGrowth:      Number(rpcData.monthlyGrowth) || 0,
            seedUsers:          Number(rpcData.seedUsers) || 0,
            realUsers:          Number(rpcData.realUsers) || 0,
            deletedAccounts:    cached?.data?.deletedAccounts ?? 0,
            inactive15:         cached?.data?.inactive15 ?? 0,
            inactive30:         cached?.data?.inactive30 ?? 0,
            inactive90:         cached?.data?.inactive90 ?? 0,
          };
          saveCache(METRICS_CACHE_KEY, base);
          // Aux fire-and-forget — atualiza cache para o próximo render
          void runAuxMetrics(sb, base);
          return base;
        }
      } catch {
        /* fallback */
      }

      // Fallback legado (RPC ausente) — versão enxuta.
      try {
        const [
          profilesResult,
          creatorsResult,
          revenueResult,
        ] = await Promise.all([
          sb.from('profiles').select('id', { count: 'exact', head: true })
            .or('is_seed.eq.false,is_seed.is.null'),
          sb.from('profiles').select('id', { count: 'exact', head: true })
            .eq('is_creator', true)
            .or('is_seed.eq.false,is_seed.is.null'),
          sb.from('transactions').select('amount').eq('status', 'completed').limit(5000),
        ]);

        const realUsers = profilesResult.count || 0;
        const allTransactions = revenueResult.data || [];
        const totalRevenue = allTransactions.reduce(
          (sum: number, t: any) => sum + Number(t.amount || 0), 0
        );

        const result: AdminMetrics = {
          ...EMPTY_METRICS,
          totalRevenue,
          activeUsers: realUsers,
          realUsers,
          totalCreators: creatorsResult.count || 0,
        };
        saveCache(METRICS_CACHE_KEY, result);
        return result;
      } catch (err) {
        console.warn('[AdminMetrics] fallback failed:', err);
        return cached?.data ?? EMPTY_METRICS;
      }
    },
    enabled: !!user,
    retry: false,
    refetchInterval: 5 * 60_000,       // 5 min (era 1 min)
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    staleTime: 2 * 60_000,             // 2 min (era 30s)
    gcTime: 30 * 60_000,
    initialData: cached?.data,
    initialDataUpdatedAt: cached?.updatedAt,
  });
}

// Aux roda em background. Atualiza o cache localStorage; o próximo render
// (após refetch ou navegação) pega os números completos sem bloquear o painel.
async function runAuxMetrics(sb: any, base: AdminMetrics) {
  try {
    const todayISO = startOfTodayISO();
    const t15 = isoDaysAgo(15);
    const t30 = isoDaysAgo(30);
    const t90 = isoDaysAgo(90);

    const baseFilter = (q: any) =>
      q.or('is_deleted.is.null,is_deleted.eq.false')
       .or('is_seed.eq.false,is_seed.is.null');

    const [del, i15, i30, i90, today] = await Promise.all([
      sb.from('vw_account_cemetery').select('id', { count: 'exact', head: true }),
      baseFilter(sb.from('profiles').select('id', { count: 'exact', head: true })).lt('last_seen', t15),
      baseFilter(sb.from('profiles').select('id', { count: 'exact', head: true })).lt('last_seen', t30),
      baseFilter(sb.from('profiles').select('id', { count: 'exact', head: true })).lt('last_seen', t90),
      baseFilter(sb.from('profiles').select('id', { count: 'exact', head: true })).gte('created_at', todayISO),
    ]);

    const enriched: AdminMetrics = {
      ...base,
      deletedAccounts: del.count || 0,
      inactive15: i15.count || 0,
      inactive30: i30.count || 0,
      inactive90: i90.count || 0,
      newSignupsToday: today.count ?? base.newSignupsToday,
    };
    saveCache(METRICS_CACHE_KEY, enriched);
  } catch {
    /* aux silencioso */
  }
}

export function useNewUsersTimeSeries(days: number = 7) {
  const { user } = useAuth();
  const cached = loadCache<Record<string, number>>(`${NEW_USERS_CACHE_KEY}:${days}`);

  return useQuery({
    queryKey: ['new-users-timeseries', days],
    queryFn: async (): Promise<Record<string, number>> => {
      const { brtStartDaysAgo, brtDayKey } = await import('@/lib/brtDay');
      const startDate = brtStartDaysAgo(days - 1);

      const { data, error } = await (supabase as any)
        .from('profiles')
        .select('created_at')
        .gte('created_at', startDate.toISOString())
        .or('is_seed.eq.false,is_seed.is.null')
        .limit(10000);

      if (error) {
        console.warn('[AdminMetrics] timeseries query failed:', error.message);
        return cached?.data ?? {};
      }

      const grouped: Record<string, number> = {};
      (data || []).forEach((p: any) => {
        if (!p?.created_at) return;
        const day = brtDayKey(p.created_at);
        grouped[day] = (grouped[day] || 0) + 1;
      });

      saveCache(`${NEW_USERS_CACHE_KEY}:${days}`, grouped);
      return grouped;
    },
    enabled: !!user,
    retry: false,
    refetchInterval: 10 * 60_000,
    refetchOnWindowFocus: false,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    initialData: cached?.data,
    initialDataUpdatedAt: cached?.updatedAt,
  });
}

export function useRevenueTimeSeries(days: number = 30) {
  const { user } = useAuth();
  const cached = loadCache<Record<string, number>>(`${REVENUE_CACHE_KEY}:${days}`);

  return useQuery({
    queryKey: ['revenue-timeseries', days],
    queryFn: async (): Promise<Record<string, number>> => {
      const { brtStartDaysAgo, brtDayKey } = await import('@/lib/brtDay');
      const startDate = brtStartDaysAgo(days - 1);

      const { data: seedProfiles } = await (supabase as any)
        .from('profiles')
        .select('user_id')
        .eq('is_seed', true)
        .not('user_id', 'is', null)
        .limit(5000);
      const seedIds = new Set((seedProfiles || []).map((p: any) => p.user_id));

      const { data, error } = await (supabase as any)
        .from('transactions')
        .select('amount, created_at, user_id')
        .eq('status', 'completed')
        .gte('created_at', startDate.toISOString())
        .limit(10000);

      if (error) {
        console.warn('[AdminMetrics] revenue query failed:', error.message);
        return cached?.data ?? {};
      }

      const grouped: Record<string, number> = {};
      (data || [])
        .filter((t: any) => !seedIds.has(t.user_id))
        .forEach((t: any) => {
          if (!t?.created_at) return;
          const day = brtDayKey(t.created_at);
          grouped[day] = (grouped[day] || 0) + Number(t.amount || 0);
        });

      saveCache(`${REVENUE_CACHE_KEY}:${days}`, grouped);
      return grouped;
    },
    enabled: !!user,
    retry: false,
    refetchInterval: 10 * 60_000,
    refetchOnWindowFocus: false,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    initialData: cached?.data,
    initialDataUpdatedAt: cached?.updatedAt,
  });
}


export interface ActiveLocation {
  id: string;
  lat: number;
  lng: number;
  city: string;
  activeUsers: number;
}

export function useActiveLocations(enabled: boolean = true) {
  const { user } = useAuth();
  const cached = loadCache<ActiveLocation[]>(LOCATIONS_CACHE_KEY);

  return useQuery({
    queryKey: ['active-locations'],
    queryFn: async (): Promise<ActiveLocation[]> => {
      const { data, error } = await (supabase as any)
        .from('profiles')
        .select('id, address_city, address_state, location_lat, location_lng')
        .not('address_city', 'is', null)
        .or('is_seed.eq.false,is_seed.is.null')
        .limit(5000);

      if (error) {
        console.warn('[AdminMetrics] locations query failed:', error.message);
        return cached?.data ?? [];
      }

      const cityMap: Record<string, { count: number; lat: number; lng: number; state: string }> = {};

      for (const profile of data || []) {
        const city = (profile as any).address_city || 'Desconhecida';
        const state = (profile as any).address_state || '';
        const key = `${city}-${state}`;

        if (!cityMap[key]) {
          cityMap[key] = {
            count: 0,
            lat: (profile as any).location_lat || 0,
            lng: (profile as any).location_lng || 0,
            state,
          };
        }
        cityMap[key].count += 1;
      }

      const locations: ActiveLocation[] = Object.entries(cityMap)
        .map(([key, info]) => ({
          id: key,
          lat: info.lat,
          lng: info.lng,
          city: key.split('-')[0] + (info.state ? `, ${info.state}` : ''),
          activeUsers: info.count,
        }))
        .sort((a, b) => b.activeUsers - a.activeUsers);

      saveCache(LOCATIONS_CACHE_KEY, locations);
      return locations;
    },
    enabled: !!user && enabled,
    retry: false,
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    initialData: cached?.data,
    initialDataUpdatedAt: cached?.updatedAt,
  });
}

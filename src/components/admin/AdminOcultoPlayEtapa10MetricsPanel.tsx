/**
 * AdminOcultoPlayEtapa10MetricsPanel — métricas finais (PROMPT 3 — Etapa 10).
 * Consome a RPC `oculto_play_admin_metrics(p_days)`.
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Activity, Users, Repeat, ArrowUpRight, Crown, Sparkles } from 'lucide-react';
import { supabase } from '@/lib/supabaseExternal';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

type TopCreator = {
  author_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  items: number;
  likes: number;
  saves: number;
};

type Metrics = {
  range_days?: number;
  window_days?: number;
  dau?: number;
  wau?: number;
  retention_d7?: number;
  retention_d30?: number;
  outbound?: { vip?: number; community?: number; profile?: number; total?: number };
  conversion_rate?: number;
  totals?: { active_users?: number; total_views?: number; likes?: number; saves?: number; items_published?: number };
  daily_active_users?: Array<{ day: string; users: number }>;
  outbound_by_kind?: Record<string, number>;
  top_creators?: TopCreator[];
};

const RANGES = [7, 14, 30] as const;

export function AdminOcultoPlayEtapa10MetricsPanel() {
  const [days, setDays] = useState<(typeof RANGES)[number]>(7);

  const { data, isLoading, refetch, isFetching } = useQuery<Metrics | null>({
    queryKey: ['oculto-play', 'admin-metrics', days],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('oculto_play_admin_metrics', { p_days: days });
      if (error) {
        console.warn('[oculto_play_admin_metrics]', error.message);
        return null;
      }
      return (data ?? null) as Metrics | null;
    },
  });

  const cards = useMemo(() => {
    if (!data) return [];
    const outbound = data.outbound ?? {
      vip: (data.outbound_by_kind?.vip_channel ?? 0) + (data.outbound_by_kind?.vip_subscription ?? 0),
      community: (data.outbound_by_kind?.community ?? 0) + (data.outbound_by_kind?.community_topic ?? 0),
      profile: data.outbound_by_kind?.profile ?? 0,
      total: Object.values(data.outbound_by_kind ?? {}).reduce((a, b) => a + Number(b || 0), 0),
    };
    const dau = data.dau ?? data.daily_active_users?.at(-1)?.users ?? 0;
    const wau = data.wau ?? data.totals?.active_users ?? 0;
    const totalViews = data.totals?.total_views ?? 0;
    const conversion = data.conversion_rate ?? (totalViews > 0 ? (outbound.total ?? 0) / totalViews : 0);
    return [
      { icon: <Activity className="h-4 w-4" />, label: 'DAU', value: dau },
      { icon: <Users className="h-4 w-4" />, label: 'Usuários ativos', value: wau },
      { icon: <Repeat className="h-4 w-4" />, label: 'Retenção D7', value: `${((data.retention_d7 ?? 0) * 100).toFixed(1)}%` },
      { icon: <Repeat className="h-4 w-4" />, label: 'Retenção D30', value: `${((data.retention_d30 ?? 0) * 100).toFixed(1)}%` },
      { icon: <ArrowUpRight className="h-4 w-4" />, label: 'Cliques → VIP', value: outbound.vip ?? 0 },
      { icon: <ArrowUpRight className="h-4 w-4" />, label: 'Cliques → Comunidade', value: outbound.community ?? 0 },
      { icon: <ArrowUpRight className="h-4 w-4" />, label: 'Cliques → Perfil', value: outbound.profile ?? 0 },
      { icon: <Sparkles className="h-4 w-4" />, label: 'Conversão', value: `${(conversion * 100).toFixed(2)}%` },
    ];
  }, [data]);

  const topCreators = data?.top_creators ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-1">
          {RANGES.map((r) => (
            <Button
              key={r}
              size="sm"
              variant={r === days ? 'default' : 'outline'}
              onClick={() => setDays(r)}
            >
              {r}d
            </Button>
          ))}
        </div>
        <Button size="sm" variant="ghost" onClick={() => refetch()} disabled={isFetching}>
          {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Atualizar'}
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : !data ? (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="pt-5 text-sm text-muted-foreground">
            Nenhum dado disponível ainda. Execute o SQL da Etapa 10 e aguarde tráfego real para popular as métricas.
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {cards.map((c) => (
              <Card key={c.label}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {c.icon}<span>{c.label}</span>
                  </div>
                  <p className="text-2xl font-bold mt-1">
                    {typeof c.value === 'number' ? c.value.toLocaleString('pt-BR') : c.value}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Crown className="h-4 w-4 text-amber-500" />
                Top criadores ({days}d)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {topCreators.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sem dados no período.</p>
              ) : (
                <ul className="divide-y divide-border/50">
                  {topCreators.map((c, i) => (
                    <li key={c.author_id} className="flex items-center gap-3 py-2.5">
                      <Badge variant="outline" className="w-6 justify-center">{i + 1}</Badge>
                      <div className="h-8 w-8 rounded-full bg-muted overflow-hidden shrink-0">
                        {c.avatar_url && (
                          <img src={c.avatar_url} alt="" className="h-full w-full object-cover" loading="lazy" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {c.display_name ?? c.username ?? '—'}
                        </p>
                        <p className="text-[11px] text-muted-foreground">@{c.username ?? '—'}</p>
                      </div>
                      <div className="text-right text-xs text-muted-foreground">
                        <p><strong className="text-foreground">{c.items ?? 0}</strong> itens</p>
                        <p>{c.likes ?? 0} ❤ · {c.saves ?? 0} ★</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

export default AdminOcultoPlayEtapa10MetricsPanel;

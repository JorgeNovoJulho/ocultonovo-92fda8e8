/**
 * CommunityInsightsPanel — analytics para owner/moderator.
 * Sparkline pura CSS (SVG inline) — sem libs de chart pra manter <4GB.
 */
import { useCommunityInsights } from '@/hooks/useCommunities';
import { Users, MessageSquare, Reply, Activity, TrendingUp, Crown, Loader2 } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Link } from 'react-router-dom';

function Sparkline({ data, color = '#a855f7' }: { data: Array<{ d: string; c: number }>; color?: string }) {
  if (!data || data.length === 0) return <div className="h-12 text-[10px] text-muted-foreground flex items-center justify-center">Sem dados</div>;
  const max = Math.max(1, ...data.map((p) => p.c));
  const w = 100, h = 40;
  const step = data.length > 1 ? w / (data.length - 1) : 0;
  const points = data.map((p, i) => `${i * step},${h - (p.c / max) * h}`).join(' ');
  const area = `0,${h} ${points} ${w},${h}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full h-12">
      <polygon points={area} fill={color} fillOpacity="0.15" />
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function StatCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: number; color: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground uppercase tracking-wide">
        <Icon className={`h-3 w-3 ${color}`} /> {label}
      </div>
      <p className="mt-1 text-xl font-bold">{value.toLocaleString('pt-BR')}</p>
    </div>
  );
}

interface Props { communityId: string; accentColor?: string }

export function CommunityInsightsPanel({ communityId, accentColor }: Props) {
  const { data, isLoading, error } = useCommunityInsights(communityId, 30);
  const accent = accentColor || '#a855f7';

  if (isLoading) {
    return <div className="flex items-center justify-center py-10 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  }
  if (error || !data) {
    return <p className="text-xs text-muted-foreground text-center py-6">Não foi possível carregar insights.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <TrendingUp className="h-3.5 w-3.5" /> Últimos {data.period_days} dias
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <StatCard icon={Users} label="Novos membros" value={data.new_members} color="text-emerald-400" />
        <StatCard icon={MessageSquare} label="Novos tópicos" value={data.new_topics} color="text-sky-400" />
        <StatCard icon={Reply} label="Novas respostas" value={data.new_replies} color="text-fuchsia-400" />
        <StatCard icon={Activity} label="Usuários ativos" value={data.active_users} color="text-amber-400" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div className="rounded-xl border border-border bg-card p-3">
          <p className="text-xs font-semibold mb-1">Membros · diário</p>
          <Sparkline data={data.members_series} color="#10b981" />
        </div>
        <div className="rounded-xl border border-border bg-card p-3">
          <p className="text-xs font-semibold mb-1">Tópicos · diário</p>
          <Sparkline data={data.topics_series} color={accent} />
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-3">
        <p className="text-xs font-semibold mb-2 flex items-center gap-1.5">
          <TrendingUp className="h-3.5 w-3.5 text-fuchsia-400" /> Top tópicos
        </p>
        {data.top_topics.length === 0 ? (
          <p className="text-[11px] text-muted-foreground text-center py-3">Sem atividade no período.</p>
        ) : (
          <div className="space-y-1.5">
            {data.top_topics.map((t, i) => (
              <div key={t.id} className="flex items-center gap-2 text-xs">
                <span className="w-4 text-center font-bold text-muted-foreground">{i + 1}</span>
                <p className="flex-1 truncate">{t.title}</p>
                <span className="text-[10px] text-muted-foreground shrink-0">{t.replies}r · {t.reactions}♥</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card p-3">
        <p className="text-xs font-semibold mb-2 flex items-center gap-1.5">
          <Crown className="h-3.5 w-3.5 text-amber-400" /> Top membros
        </p>
        {data.top_members.length === 0 ? (
          <p className="text-[11px] text-muted-foreground text-center py-3">Ninguém ativo ainda.</p>
        ) : (
          <div className="space-y-1.5">
            {data.top_members.map((m, i) => {
              const name = m.username ? `@${m.username}` : 'Usuário';
              return (
                <Link
                  key={m.user_id}
                  to={m.username ? `/${m.username}` : '#'}
                  className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-accent/40 transition-colors"
                >
                  <span className="w-4 text-center text-xs font-bold text-muted-foreground">{i + 1}</span>
                  <Avatar className="h-7 w-7">
                    <AvatarImage src={m.avatar_url || undefined} />
                    <AvatarFallback>{name.slice(0, 1).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <p className="flex-1 truncate text-xs font-medium">{name}</p>
                  <span className="text-[10px] text-muted-foreground shrink-0">{m.topics}t · {m.replies}r</span>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

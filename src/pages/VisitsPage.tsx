import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Eye, Clock, Crown, Medal, Award, Flame } from "lucide-react";
import { cn } from "@/lib/utils";
import { useProfile } from "@/hooks/useProfile";
import { useShowDebugPanels } from "@/hooks/useShowDebugPanels";
import { useMyProfileVisits, useVisitCount, type ProfileVisit } from "@/hooks/useProfileVisits";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

const TOP_STYLES = [
  {
    icon: Crown,
    label: "1º maior fã",
    ring: "ring-amber-200",
    badge: "bg-gradient-to-r from-yellow-200 via-amber-400 to-yellow-600 text-amber-950 border-amber-200 shadow-[0_2px_8px_-2px_rgba(245,158,11,0.6)]",
    card: "bg-gradient-to-br from-yellow-300 via-amber-500 to-yellow-700 border-amber-200 text-amber-950 shadow-[0_4px_16px_-4px_rgba(245,158,11,0.55)]",
    sub: "text-amber-950/80",
  },
  {
    icon: Medal,
    label: "2º maior fã",
    ring: "ring-slate-100",
    badge: "bg-gradient-to-r from-slate-100 via-slate-300 to-slate-500 text-slate-900 border-slate-200 shadow-[0_2px_8px_-2px_rgba(148,163,184,0.6)]",
    card: "bg-gradient-to-br from-slate-200 via-slate-400 to-slate-600 border-slate-200 text-slate-900 shadow-[0_4px_16px_-4px_rgba(148,163,184,0.55)]",
    sub: "text-slate-900/75",
  },
  {
    icon: Award,
    label: "3º maior fã",
    ring: "ring-orange-200",
    badge: "bg-gradient-to-r from-orange-300 via-amber-700 to-orange-900 text-orange-50 border-orange-300 shadow-[0_2px_8px_-2px_rgba(194,65,12,0.6)]",
    card: "bg-gradient-to-br from-orange-400 via-amber-700 to-orange-900 border-orange-300 text-orange-50 shadow-[0_4px_16px_-4px_rgba(194,65,12,0.55)]",
    sub: "text-orange-50/85",
  },
] as const;

export default function VisitsPage() {
  // Durante o Beta, "Quem espiou seu perfil" está liberado para TODOS os planos.
  return <VisitsContent />;
}

function VisitsContent() {
  const { profile } = useProfile();
  const showDebug = useShowDebugPanels();
  const { data: visits = [], isLoading, error } = useMyProfileVisits(200);
  const { data: totalCount = 0 } = useVisitCount();

  // Top 3 visitantes (por visit_count, depois mais recentes em empate).
  const topIds = useMemo(() => {
    const ranked = [...visits].sort((a, b) => {
      if (b.visit_count !== a.visit_count) return b.visit_count - a.visit_count;
      return new Date(b.visited_at).getTime() - new Date(a.visited_at).getTime();
    });
    return new Map<string, number>(
      ranked.slice(0, 3).filter((v) => v.visit_count >= 2).map((v, i) => [v.visitor_id, i])
    );
  }, [visits]);

  const formatTime = (dateStr: string) => {
    try {
      return formatDistanceToNow(new Date(dateStr), { addSuffix: true, locale: ptBR });
    } catch {
      return "recentemente";
    }
  };

  const formatNumber = (num: number) => (num >= 1000 ? `${(num / 1000).toFixed(0)} mil` : num.toString());

  // visits já vem ordenado desc por `visited_at` (visita mais recente primeiro).
  const sortedVisits = visits;

  return (
    <div className="p-4 md:p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-lg bg-primary/10">
            <Eye className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Quem espiou seu perfil</h1>
            <p className="text-muted-foreground">Veja quem visitou seu perfil recentemente</p>
          </div>
          <Badge className="ml-auto bg-primary/10 text-primary text-sm font-bold">
            {formatNumber(totalCount)}
          </Badge>
        </div>

        <p className="text-[11px] text-emerald-300/80">
          🔓 Liberado para todos os usuários durante o Beta.
        </p>

        {/* Debug card — Master Admin only */}
        {showDebug && (
          <div className="mt-3 rounded-lg border border-border/50 bg-muted/30 p-3 text-xs font-mono space-y-1">
            <div><span className="text-muted-foreground">profile.id:</span> {profile?.id || "—"}</div>
            <div><span className="text-muted-foreground">visit_count (DB total):</span> {totalCount}</div>
            <div><span className="text-muted-foreground">rows fetched:</span> {visits.length}</div>
            {error ? <div className="text-destructive">error: {String((error as any)?.message || error)}</div> : null}
          </div>
        )}
      </div>

      {/* Top 3 destacados */}
      {topIds.size > 0 && (
        <div className="mb-4">
          <p className="mb-2 text-[11px] uppercase tracking-wider text-amber-300/80">
            <Flame className="inline h-3 w-3 mr-1" />
            Quem mais espia você
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {[...topIds.entries()]
              .sort((a, b) => a[1] - b[1])
              .map(([id, rank]) => {
                const v = sortedVisits.find((x) => x.visitor_id === id);
                if (!v) return null;
                const s = TOP_STYLES[rank];
                const Icon = s.icon;
                return (
                  <Link
                    key={id}
                    to={`/creator/${v.visitor_id}`}
                    className={cn(
                      "flex items-center gap-3 rounded-xl border p-3 transition-transform hover:scale-[1.02]",
                      s.card,
                    )}
                  >
                    <Avatar className={cn("h-11 w-11 ring-2", s.ring)}>
                      <AvatarImage src={v.visitor_avatar || undefined} alt={v.visitor_name} loading="lazy" />
                      <AvatarFallback>{v.visitor_name[0]?.toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="font-bold truncate text-sm">{v.visitor_name}</p>
                      <p className={cn("text-[11px]", s.sub)}>
                        {v.visit_count} visitas · última {formatTime(v.visited_at)}
                      </p>
                    </div>
                    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider", s.badge)}>
                      <Icon className="h-3 w-3" />
                      {s.label}
                    </span>
                  </Link>
                );
              })}
          </div>
        </div>
      )}

      {/* Lista completa */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 p-4 rounded-xl bg-card/50 border border-border/30">
              <Skeleton className="h-12 w-12 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-20" />
              </div>
            </div>
          ))}
        </div>
      ) : sortedVisits.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mb-4">
            <Eye className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-1">Sua jornada está começando!</h3>
          <p className="text-muted-foreground text-sm max-w-xs">
            Interaja mais para receber visitas. Complete seu perfil e curta outros conteúdos.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {sortedVisits.map((visit: ProfileVisit) => {
            const topRank = topIds.get(visit.visitor_id);
            const topStyle = topRank != null ? TOP_STYLES[topRank] : null;

            return (
              <div
                key={visit.id}
                className={cn(
                  "flex items-center gap-4 p-4 rounded-xl bg-card/50 border border-border/30 transition-all hover:bg-card cursor-pointer",
                  topStyle && "border-amber-400/30",
                )}
              >
                <Avatar className={cn("h-12 w-12", topStyle && "ring-2", topStyle?.ring)}>
                  <AvatarImage src={visit.visitor_avatar || undefined} alt={visit.visitor_name} loading="lazy" />
                  <AvatarFallback>{visit.visitor_name[0]?.toUpperCase()}</AvatarFallback>
                </Avatar>

                <div className="flex-1 min-w-0">
                  <Link to={`/creator/${visit.visitor_id}`} className="inline-flex items-center gap-2">
                    <p className="font-medium text-foreground hover:text-primary transition-colors truncate">
                      {visit.visitor_name}
                    </p>
                    {topStyle && (
                      <span className={cn("inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider", topStyle.badge)}>
                        <topStyle.icon className="h-2.5 w-2.5" />
                        Top {(topRank ?? 0) + 1}
                      </span>
                    )}
                  </Link>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
                    <Clock className="h-3 w-3" />
                    {visit.visit_count > 1 ? (
                      <span>
                        {visit.visit_count}x · primeira: {formatTime(visit.first_visited_at)} · última: {formatTime(visit.visited_at)}
                      </span>
                    ) : (
                      <span>{formatTime(visit.visited_at)}</span>
                    )}
                  </div>
                </div>

                <Link to={`/creator/${visit.visitor_id}`}>
                  <Button variant="outline" size="sm" className="border-primary/50 text-primary">
                    Ver Perfil
                  </Button>
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

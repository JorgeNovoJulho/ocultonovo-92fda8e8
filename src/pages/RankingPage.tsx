import { useEffect, useMemo, useState } from "react";
import { Trophy, Heart, Users, MessageCircle, Star, Crown, Sparkles, Zap, ArrowUp, ArrowDown, Minus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useEngagementRanking } from "@/hooks/useEngagementRanking";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/lib/supabaseExternal";
import { useQuery } from "@tanstack/react-query";

const RANK_HISTORY_KEY = "ranking_engagement_positions_v1";

function PlanBadge({ plan }: { plan: string }) {
  if (plan === "vip") {
    return (
      <Badge className="bg-gradient-to-r from-[hsl(45,93%,47%)] to-[hsl(35,93%,47%)] text-black border-0 text-[10px] px-1.5 py-0 h-5 leading-none">
        <Crown className="h-3 w-3 mr-0.5" />VIP
      </Badge>
    );
  }
  if (plan === "monthly" || plan === "premium" || plan === "annual") {
    return (
      <Badge className="bg-gradient-to-r from-primary to-secondary text-primary-foreground border-0 text-[10px] px-1.5 py-0 h-5 leading-none">
        <Sparkles className="h-3 w-3 mr-0.5" />Premium
      </Badge>
    );
  }
  return null;
}

const RANK_STYLES = [
  // #1 Gold
  {
    border: "border-amber-400/60",
    bg: "bg-gradient-to-br from-amber-500/25 via-yellow-500/10 to-transparent",
    badge: "bg-gradient-to-br from-yellow-300 via-amber-400 to-yellow-600 text-black shadow-md shadow-amber-500/30",
  },
  // #2 Silver
  {
    border: "border-slate-300/50",
    bg: "bg-gradient-to-br from-slate-300/20 via-slate-400/10 to-transparent",
    badge: "bg-gradient-to-br from-slate-200 via-slate-300 to-slate-500 text-black shadow-md shadow-slate-300/30",
  },
  // #3 Bronze
  {
    border: "border-orange-700/50",
    bg: "bg-gradient-to-br from-orange-700/25 via-amber-800/10 to-transparent",
    badge: "bg-gradient-to-br from-amber-600 via-orange-700 to-amber-900 text-amber-50 shadow-md shadow-orange-800/30",
  },
];

function TrendArrow({ delta }: { delta: number | null }) {
  if (delta === null) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-white/5 text-muted-foreground">
            <Sparkles className="h-3 w-3" />
          </span>
        </TooltipTrigger>
        <TooltipContent side="left">Novo no ranking</TooltipContent>
      </Tooltip>
    );
  }
  if (delta === 0) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-white/5 text-muted-foreground">
            <Minus className="h-3 w-3" />
          </span>
        </TooltipTrigger>
        <TooltipContent side="left">Sem mudança</TooltipContent>
      </Tooltip>
    );
  }
  if (delta > 0) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center gap-0.5 h-5 px-1.5 rounded-full bg-emerald-500/15 text-emerald-300 text-[10px] font-bold leading-none">
            <ArrowUp className="h-3 w-3" />{delta}
          </span>
        </TooltipTrigger>
        <TooltipContent side="left">Subiu {delta} {delta === 1 ? "posição" : "posições"}</TooltipContent>
      </Tooltip>
    );
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex items-center gap-0.5 h-5 px-1.5 rounded-full bg-rose-500/15 text-rose-300 text-[10px] font-bold leading-none">
          <ArrowDown className="h-3 w-3" />{Math.abs(delta)}
        </span>
      </TooltipTrigger>
      <TooltipContent side="left">Caiu {Math.abs(delta)} {Math.abs(delta) === 1 ? "posição" : "posições"}</TooltipContent>
    </Tooltip>
  );
}

function loadPrevPositions(): Record<string, number> {
  try {
    const raw = localStorage.getItem(RANK_HISTORY_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

export default function RankingPage() {
  const navigate = useNavigate();
  const { data: ranking, isLoading } = useEngagementRanking(100);
  const [prevPositions] = useState<Record<string, number>>(() => loadPrevPositions());

  // Captura posições atuais para próxima visita (não bloqueia render)
  useEffect(() => {
    if (!ranking?.length) return;
    const next: Record<string, number> = {};
    ranking.forEach((u, i) => { if (u.profile_id) next[u.profile_id] = i + 1; });
    try { localStorage.setItem(RANK_HISTORY_KEY, JSON.stringify(next)); } catch {}
  }, [ranking]);

  // Busca aura_xp para todos os usuários do ranking (batch)
  const userIds = useMemo(() => (ranking || []).map((u) => u.user_id).filter(Boolean) as string[], [ranking]);
  const { data: xpMap } = useQuery({
    queryKey: ["ranking-aura-xp", userIds.join(",")],
    enabled: userIds.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("profiles")
        .select("user_id, aura_xp")
        .in("user_id", userIds);
      const m: Record<string, number> = {};
      for (const row of (data as any[]) || []) {
        if (row?.user_id) m[row.user_id] = Number(row.aura_xp || 0);
      }
      return m;
    },
  });

  return (
    <TooltipProvider delayDuration={150}>
      <div className="container max-w-3xl mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-4">
        <header className="space-y-2">
          <div className="flex items-center gap-2">
            <Trophy className="h-6 w-6 text-amber-400" />
            <h1 className="text-xl sm:text-2xl font-bold text-foreground">Ranking de Engajamento</h1>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Posição calculada por curtidas, seguidores, depoimentos, recomendações, avaliações e contribuição de Aura XP.
          </p>
        </header>

        <div className="space-y-2">
          {isLoading && Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}

          {!isLoading && (ranking?.length ?? 0) === 0 && (
            <div className="text-center text-sm text-muted-foreground py-8">
              Nenhum dado de ranking disponível ainda.
            </div>
          )}

          {ranking?.map((u, idx) => {
            const handle = u.username || u.name || "anônimo";
            const position = idx + 1;
            const styles = idx < 3 ? RANK_STYLES[idx] : null;
            const prev = prevPositions[u.profile_id];
            const delta = prev ? prev - position : null; // positivo = subiu
            const xp = (xpMap && u.user_id ? xpMap[u.user_id] : 0) || 0;

            return (
              <button
                key={u.profile_id}
                onClick={() => u.username && navigate(`/u/${encodeURIComponent(u.username)}`)}
                className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-colors text-left ${
                  styles
                    ? `${styles.border} ${styles.bg} hover:brightness-110`
                    : "bg-card border-border hover:border-primary/40"
                }`}
              >
                <span
                  className={`font-extrabold w-9 h-9 shrink-0 rounded-full flex items-center justify-center text-[13px] ${
                    styles ? styles.badge : "text-muted-foreground bg-white/5"
                  }`}
                >
                  #{position}
                </span>
                <Avatar className="h-11 w-11 ring-1 ring-border shrink-0">
                  <AvatarImage src={u.avatar_url || undefined} alt={handle} />
                  <AvatarFallback>{handle[0]?.toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-semibold text-foreground truncate">@{handle}</span>
                    <PlanBadge plan={u.plan_type} />
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="inline-flex items-center gap-0.5 h-5 px-1.5 rounded-full bg-gradient-to-r from-fuchsia-500/90 to-amber-400/90 text-[10px] font-black text-black leading-none">
                          <Zap className="h-2.5 w-2.5" /> {xp.toLocaleString("pt-BR")}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>Saldo de Aura XP</TooltipContent>
                    </Tooltip>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="flex items-center gap-0.5"><Heart className="h-3 w-3" />{u.total_likes}</span>
                      </TooltipTrigger>
                      <TooltipContent>Curtidas recebidas</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="flex items-center gap-0.5"><Users className="h-3 w-3" />{u.total_followers}</span>
                      </TooltipTrigger>
                      <TooltipContent>Seguidores</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="flex items-center gap-0.5"><MessageCircle className="h-3 w-3" />{u.total_testimonials}</span>
                      </TooltipTrigger>
                      <TooltipContent>Depoimentos</TooltipContent>
                    </Tooltip>
                    {u.rating_count > 0 && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="flex items-center gap-0.5">
                            <Star className="h-3 w-3 text-amber-400" />
                            {u.rating_avg.toFixed(1)} ({u.rating_count})
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>Avaliação média ({u.rating_count} {u.rating_count === 1 ? "voto" : "votos"})</TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <p className="font-bold text-primary text-sm leading-none">{Math.round(u.engagement_score)}</p>
                  <p className="text-[9px] uppercase tracking-wide text-muted-foreground">pontos</p>
                  <TrendArrow delta={delta} />
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </TooltipProvider>
  );
}

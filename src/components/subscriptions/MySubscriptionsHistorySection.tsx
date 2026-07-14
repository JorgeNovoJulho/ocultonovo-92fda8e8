import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Crown,
  Clock,
  CheckCircle2,
  XCircle,
  ChevronRight,
  History,
  Infinity as InfinityIcon,
} from "lucide-react";
import { useMySubscriptions, type MySubscription } from "@/hooks/useMySubscriptions";
import { cn } from "@/lib/utils";

function formatDate(iso?: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

interface SubStatus {
  active: boolean;
  lifetime: boolean;
  daysRemaining: number;
  pctElapsed: number;
}

function getStatus(sub: MySubscription): SubStatus {
  const lifetime = !sub.expires_at;
  if (lifetime) {
    return { active: sub.status === "active" || sub.status === "trialing", lifetime: true, daysRemaining: Infinity as unknown as number, pctElapsed: 0 };
  }
  const end = new Date(sub.expires_at!).getTime();
  const now = Date.now();
  const start = new Date(sub.created_at).getTime();
  const active = end > now && (sub.status === "active" || sub.status === "trialing");
  const daysRemaining = Math.max(0, Math.ceil((end - now) / (1000 * 60 * 60 * 24)));
  const total = Math.max(1, end - start);
  const elapsed = Math.max(0, Math.min(total, now - start));
  const pctElapsed = Math.round((elapsed / total) * 100);
  return { active, lifetime: false, daysRemaining, pctElapsed };
}

interface Props {
  /** Limitar quantidade exibida (para preview no perfil). */
  limit?: number;
  /** Mostrar header com "Ver todas". */
  showHeader?: boolean;
  /** Compact mode (cards menores). */
  compact?: boolean;
}

export function MySubscriptionsHistorySection({
  limit,
  showHeader = true,
  compact = false,
}: Props) {
  const { data, isLoading } = useMySubscriptions();
  const all = (data || []) as MySubscription[];
  const items = limit ? all.slice(0, limit) : all;
  const activeCount = all.filter((s) => getStatus(s).active).length;

  if (isLoading) {
    return (
      <div className="grid gap-2 grid-cols-1 md:grid-cols-2">
        {Array.from({ length: limit ?? 2 }).map((_, i) => (
          <Skeleton key={i} className="h-32 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (all.length === 0) {
    return (
      <Card className="p-6 text-center border-dashed">
        <div className="mx-auto h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mb-3">
          <Crown className="h-6 w-6 text-primary" />
        </div>
        <h3 className="text-sm font-semibold mb-1">Nenhuma assinatura ainda</h3>
        <p className="text-xs text-muted-foreground mb-4">
          Quando você assinar um canal VIP, ele aparecerá aqui com plano, status e validade.
        </p>
        <Button asChild size="sm" variant="outline">
          <Link to="/vitrine-vip">Explorar canais VIP</Link>
        </Button>
      </Card>
    );
  }

  return (
    <section className="space-y-3">
      {showHeader && (
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-bold">Minhas assinaturas</h2>
            <Badge variant="secondary" className="text-[10px]">
              {activeCount} ativa{activeCount === 1 ? "" : "s"} · {all.length} total
            </Badge>
          </div>
          {limit && all.length > limit && (
            <Button asChild size="sm" variant="ghost" className="h-7 text-xs gap-1">
              <Link to="/minhas-assinaturas">
                Ver todas <ChevronRight className="h-3 w-3" />
              </Link>
            </Button>
          )}
        </div>
      )}

      <div className={cn("grid gap-2", compact ? "grid-cols-1" : "grid-cols-1 md:grid-cols-2")}>
        {items.map((sub) => {
          const st = getStatus(sub);
          const username = sub.creator?.username;
          const channelHref = username ? `/${username}` : "#";
          const channelName = sub.channel?.title || sub.creator?.name || "Canal VIP";
          const channelAvatar = sub.creator?.avatar_url || null;

          return (
            <Card
              key={sub.id}
              className={cn(
                "p-3 border-2 transition-colors",
                st.active
                  ? "border-amber-400/40 bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-transparent"
                  : "border-border/40 opacity-80",
              )}
            >
              <div className="flex items-start gap-3">
                <Link to={channelHref} className="flex-shrink-0">
                  <Avatar className="h-12 w-12 ring-2 ring-amber-400/40">
                    <AvatarImage src={channelAvatar ?? undefined} />
                    <AvatarFallback className="bg-amber-500/20 text-amber-400 font-bold">
                      {channelName.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                </Link>

                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link to={channelHref} className="block">
                        <p className="text-sm font-bold truncate hover:text-primary transition-colors">
                          {channelName}
                        </p>
                        {username && (
                          <p className="text-[11px] text-muted-foreground truncate">
                            @{username}
                          </p>
                        )}
                      </Link>
                    </div>
                    {st.active ? (
                      <Badge className="bg-green-500/20 text-green-700 dark:text-green-300 border-green-500/40 gap-1 text-[10px] flex-shrink-0">
                        <CheckCircle2 className="h-3 w-3" /> Ativa
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="gap-1 text-[10px] flex-shrink-0 text-muted-foreground">
                        <XCircle className="h-3 w-3" /> Expirada
                      </Badge>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                    <div>
                      <span className="text-muted-foreground">Valor: </span>
                      <span className="font-semibold">
                        R$ {Number(sub.price || 0).toFixed(2).replace(".", ",")}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-muted-foreground">Início: </span>
                      <span className="font-medium">{formatDate(sub.created_at)}</span>
                    </div>
                    <div className="col-span-2 text-right">
                      <span className="text-muted-foreground">Validade: </span>
                      <span className={cn("font-medium", st.active ? "text-emerald-600 dark:text-green-300" : "text-orange-500")}>
                        {sub.expires_at ? formatDate(sub.expires_at) : (
                          <span className="inline-flex items-center gap-0.5 text-yellow-600 dark:text-yellow-300">
                            <InfinityIcon className="h-3 w-3" /> Vitalício
                          </span>
                        )}
                      </span>
                    </div>
                  </div>

                  {st.active && !st.lifetime && Number.isFinite(st.daysRemaining) && (
                    <div className="space-y-1 pt-1">
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="inline-flex items-center gap-1 text-muted-foreground">
                          <Clock className="h-3 w-3" /> Tempo restante
                        </span>
                        <span className={cn(
                          "font-bold",
                          st.daysRemaining <= 7 ? "text-orange-500" : "text-emerald-600 dark:text-green-300",
                        )}>
                          {st.daysRemaining} {st.daysRemaining === 1 ? "dia" : "dias"}
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted/40 overflow-hidden">
                        <div
                          className={cn(
                            "h-full transition-all",
                            st.daysRemaining <= 7
                              ? "bg-gradient-to-r from-orange-500 to-red-500"
                              : "bg-gradient-to-r from-amber-400 to-amber-500",
                          )}
                          style={{ width: `${st.pctElapsed}%` }}
                        />
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-1">
                    <Button asChild size="sm" variant="ghost" className="h-7 px-2 text-[11px]">
                      <Link to={channelHref}>Ver canal</Link>
                    </Button>
                    {sub.access_source === 'beta' && (
                      <Badge variant="outline" className="text-[9px] uppercase tracking-wider">
                        Beta
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </section>
  );
}

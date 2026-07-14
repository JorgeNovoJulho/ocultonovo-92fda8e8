import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  MousePointerClick, UserPlus, TrendingUp, Users, Percent, Trophy,
} from "lucide-react";
import { useAdminReferralNetwork, useAdminConversionStats } from "@/hooks/useReferralTree";

export function AdminReferralNetworkTab() {
  const { data: network, isLoading: loadingNetwork } = useAdminReferralNetwork(20);
  const { data: stats, isLoading: loadingStats } = useAdminConversionStats();

  return (
    <div className="space-y-6">
      {/* Conversion Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {loadingStats ? (
          Array(4).fill(0).map((_, i) => (
            <Card key={i}><CardContent className="p-4"><Skeleton className="h-12 w-full" /></CardContent></Card>
          ))
        ) : (
          <>
            <Card className="bg-gradient-to-br from-primary/10 to-transparent">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <MousePointerClick className="h-3 w-3" /> Cliques (+18)
                </p>
                <p className="text-2xl font-bold text-foreground">{stats?.totalClicks || 0}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <UserPlus className="h-3 w-3" /> Conversões
                </p>
                <p className="text-2xl font-bold text-foreground">{stats?.totalConversions || 0}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Users className="h-3 w-3" /> Árvore Total
                </p>
                <p className="text-2xl font-bold text-foreground">{stats?.totalReferrals || 0}</p>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-green-500/10 to-transparent">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Percent className="h-3 w-3" /> Taxa Conversão
                </p>
                <p className="text-2xl font-bold text-foreground">{stats?.conversionRate || "0.0"}%</p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Top Referrers Ranking */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Trophy className="h-4 w-4 text-primary" />
            Ranking de Indicadores (Árvore de Indicações)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadingNetwork ? (
            <div className="space-y-3">
              {Array(5).fill(0).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
            </div>
          ) : !network?.length ? (
            <div className="text-center py-8">
              <Users className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">Nenhuma indicação registrada ainda.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {network.map((r, i) => (
                <div
                  key={r.parent_id}
                  className="flex items-center gap-3 p-3 rounded-xl border border-border/30 bg-muted/20"
                >
                  <span className="text-xs font-bold text-muted-foreground w-6 text-center">
                    {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`}
                  </span>
                  <Avatar className="h-9 w-9">
                    <AvatarImage src={r.parent_avatar || ""} />
                    <AvatarFallback className="text-xs bg-primary/10 text-primary">
                      {(r.parent_name || "?")[0]}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{r.parent_name}</p>
                    <p className="text-xs text-muted-foreground">@{r.parent_username || "user"}</p>
                  </div>
                  <div className="text-right">
                    <Badge variant="secondary" className="bg-primary/10 text-primary text-xs">
                      <UserPlus className="h-3 w-3 mr-1" />
                      {r.total_children}
                    </Badge>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {r.active_children} ativos
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

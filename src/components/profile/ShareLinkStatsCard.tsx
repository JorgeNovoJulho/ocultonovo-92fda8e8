import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { MousePointerClick, UserPlus, TrendingUp } from "lucide-react";
import { useMyShareStats } from "@/hooks/useReferralTree";
import { useEffect } from "react";
import { supabase } from "@/lib/supabaseExternal";
import { subscribeTable } from "@/lib/realtimeBus";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";

export function ShareLinkStatsCard() {
  const { data: stats, isLoading } = useMyShareStats();
  const { user } = useAuth();
  const qc = useQueryClient();

  // Realtime: refresh stats when a new referral is inserted
  useEffect(() => {
    if (!user) return;
    const unsub = subscribeTable('referral_tree', () => {
      qc.invalidateQueries({ queryKey: ['my-share-stats', user.id] });
      qc.invalidateQueries({ queryKey: ['my-referral-children', user.id] });
    }, { events: ['INSERT'] });
    return () => { unsub(); };
  }, [user, qc]);


  if (isLoading) {
    return <Skeleton className="h-24 w-full rounded-xl" />;
  }

  if (!stats || (stats.clicks === 0 && stats.conversions === 0)) return null;

  return (
    <Card className="border-border/30 bg-card/50">
      <CardContent className="p-4">
        <p className="text-xs font-semibold text-muted-foreground mb-3 flex items-center gap-1.5">
          <TrendingUp className="h-3.5 w-3.5 text-primary" />
          Desempenho dos Seus Links
        </p>
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center p-2 rounded-lg bg-primary/5 border border-primary/20">
            <p className="text-lg font-bold text-primary">{stats.clicks}</p>
            <p className="text-[10px] text-muted-foreground flex items-center justify-center gap-1">
              <MousePointerClick className="h-2.5 w-2.5" /> Cliques
            </p>
          </div>
          <div className="text-center p-2 rounded-lg bg-accent/5 border border-accent/20">
            <p className="text-lg font-bold text-foreground">{stats.conversions}</p>
            <p className="text-[10px] text-muted-foreground flex items-center justify-center gap-1">
              <UserPlus className="h-2.5 w-2.5" /> Membros
            </p>
          </div>
          <div className="text-center p-2 rounded-lg bg-muted/30 border border-border/30">
            <p className="text-lg font-bold text-foreground">{stats.rate}%</p>
            <p className="text-[10px] text-muted-foreground">Conversão</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

import { usePromotionAnalytics, useTopPromotions, PromotionAnalytics } from "@/hooks/usePromotionAnalytics";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Loader2, BarChart3, TrendingUp, Eye, MousePointer, XCircle, CheckCircle2, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";

function MetricCard({ label, value, icon: Icon, color }: { label: string; value: string | number; icon: typeof Eye; color: string }) {
  return (
    <div className="p-3 rounded-lg bg-muted/30 border border-border/30 space-y-1">
      <div className="flex items-center gap-1.5">
        <Icon className={cn("h-3.5 w-3.5", color)} />
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">{label}</span>
      </div>
      <p className="text-lg font-bold text-foreground">{value}</p>
    </div>
  );
}

function PromoRow({ promo, rank }: { promo: PromotionAnalytics; rank?: number }) {
  return (
    <div className="p-4 rounded-xl border border-border/50 bg-card/50 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        {rank !== undefined && (
          <div className={cn(
            "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold",
            rank === 0 ? "bg-[hsl(45,93%,47%)]/20 text-[hsl(45,93%,47%)]" :
            rank === 1 ? "bg-muted text-muted-foreground" :
            "bg-muted/50 text-muted-foreground/70"
          )}>
            {rank + 1}
          </div>
        )}
        <h3 className="font-semibold text-sm text-foreground">{promo.promotion_title}</h3>
        <Badge variant="outline" className="text-[10px]">{promo.promotion_type}</Badge>
        <Badge className={cn("text-[10px]", promo.is_active ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" : "bg-muted text-muted-foreground")}>
          {promo.is_active ? "Ativa" : "Inativa"}
        </Badge>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <MetricCard label="Impressões" value={promo.impressions} icon={Eye} color="text-blue-400" />
        <MetricCard label="Cliques" value={promo.clicks} icon={MousePointer} color="text-primary" />
        <MetricCard label="Rejeições" value={promo.closes} icon={XCircle} color="text-destructive" />
        <MetricCard label="Conversões" value={promo.conversions} icon={CheckCircle2} color="text-emerald-400" />
      </div>

      {/* CTR & Rejection Rate bars */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground">CTR</span>
            <span className="text-xs font-semibold text-primary">{promo.ctr}%</span>
          </div>
          <Progress value={Math.min(promo.ctr, 100)} className="h-1.5" />
        </div>
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground">Rejeição</span>
            <span className="text-xs font-semibold text-destructive">{promo.rejection_rate}%</span>
          </div>
          <Progress value={Math.min(promo.rejection_rate, 100)} className="h-1.5 [&>div]:bg-destructive" />
        </div>
      </div>
    </div>
  );
}

export function PromotionAnalyticsDashboard() {
  const { data: analytics, isLoading } = usePromotionAnalytics();
  const { data: topPromos } = useTopPromotions();

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const totalImpressions = (analytics || []).reduce((s, a) => s + a.impressions, 0);
  const totalClicks = (analytics || []).reduce((s, a) => s + a.clicks, 0);
  const totalConversions = (analytics || []).reduce((s, a) => s + a.conversions, 0);
  const avgCtr = totalImpressions > 0 ? ((totalClicks / totalImpressions) * 100).toFixed(1) : "0";

  return (
    <div className="space-y-6">
      {/* Global Summary */}
      <div className="flex items-center gap-2 mb-2">
        <BarChart3 className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-bold text-foreground">Analytics de Promoções</h2>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricCard label="Total Impressões" value={totalImpressions.toLocaleString()} icon={Eye} color="text-blue-400" />
        <MetricCard label="Total Cliques" value={totalClicks.toLocaleString()} icon={MousePointer} color="text-primary" />
        <MetricCard label="CTR Médio" value={`${avgCtr}%`} icon={TrendingUp} color="text-[hsl(45,93%,47%)]" />
        <MetricCard label="Conversões" value={totalConversions.toLocaleString()} icon={CheckCircle2} color="text-emerald-400" />
      </div>

      {/* Top 3 Promotions (last 3 days) */}
      {topPromos && topPromos.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-[hsl(45,93%,47%)]" />
            <h3 className="text-sm font-semibold text-foreground">Top 3 — Últimos 3 dias</h3>
          </div>
          <div className="grid gap-2">
            {topPromos.map((tp, i) => {
              const fullData = analytics?.find(a => a.promotion_id === tp.promotion_id);
              if (!fullData) return null;
              return <PromoRow key={tp.promotion_id} promo={fullData} rank={i} />;
            })}
          </div>
        </div>
      )}

      {/* All Promotions Performance */}
      {analytics && analytics.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Performance Individual</h3>
          <div className="grid gap-3">
            {analytics.map((a) => (
              <PromoRow key={a.promotion_id} promo={a} />
            ))}
          </div>
        </div>
      )}

      {(!analytics || analytics.length === 0) && (
        <div className="text-center py-8 text-muted-foreground text-sm">
          Nenhum dado de analytics disponível ainda. Os dados aparecerão conforme os usuários interagirem com os banners.
        </div>
      )}
    </div>
  );
}

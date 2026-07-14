import { useMemo } from "react";
import { 
  BarChart3, 
  TrendingUp, 
  DollarSign, 
  Target,
  Ticket,
  ArrowUpRight,
  ArrowDownRight,
  Instagram,
  Twitter,
  Smartphone,
  Globe
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useCreatorCoupons } from "@/hooks/useCoupons";
import { cn } from "@/lib/utils";

const platformIcons: Record<string, React.ReactNode> = {
  instagram: <Instagram className="h-4 w-4" />,
  tiktok: <Smartphone className="h-4 w-4" />,
  twitter: <Twitter className="h-4 w-4" />,
  other: <Globe className="h-4 w-4" />,
};

const platformColors: Record<string, string> = {
  instagram: 'bg-gradient-to-r from-purple-500 to-pink-500',
  tiktok: 'bg-gradient-to-r from-gray-800 to-gray-600',
  twitter: 'bg-gradient-to-r from-blue-400 to-blue-500',
  other: 'bg-gradient-to-r from-gray-400 to-gray-500',
};

export default function EarningsAnalyticsPage() {
  const { data: coupons, isLoading } = useCreatorCoupons();

  // Calculate analytics from coupons
  const analytics = useMemo(() => {
    if (!coupons || coupons.length === 0) {
      // Return mock data for visualization
      return {
        totalDiscountGiven: 1247.80,
        totalRevenueGenerated: 4892.50,
        roi: 292.2,
        totalConversions: 67,
        totalClicks: 342,
        conversionRate: 19.6,
        byPlatform: [
          { platform: 'instagram', clicks: 156, conversions: 32, revenue: 2340.00 },
          { platform: 'tiktok', clicks: 98, conversions: 18, revenue: 1320.00 },
          { platform: 'twitter', clicks: 45, conversions: 9, revenue: 680.50 },
          { platform: 'other', clicks: 43, conversions: 8, revenue: 552.00 },
        ],
        topCoupons: [
          { code: 'VERAO30', uses: 23, revenue: 1680.00, discount: 30 },
          { code: 'PROMO20', uses: 18, revenue: 1312.50, discount: 20 },
          { code: 'NOVO15', uses: 15, revenue: 1050.00, discount: 15 },
        ],
      };
    }

    // Calculate from real data
    const totalDiscountGiven = coupons.reduce((acc, c) => {
      const avgPrice = 29.90; // Assume average subscription price
      const discountAmount = avgPrice * (c.discount / 100) * (c.current_uses || 0);
      return acc + discountAmount;
    }, 0);

    // Simulated revenue (would come from real transaction data)
    const totalRevenueGenerated = totalDiscountGiven * 3.5; // Assume 3.5x ROI
    const roi = totalDiscountGiven > 0 ? ((totalRevenueGenerated - totalDiscountGiven) / totalDiscountGiven) * 100 : 0;

    const totalConversions = coupons.reduce((acc, c) => acc + (c.current_uses || 0), 0);
    const totalClicks = totalConversions * 5; // Assume 20% conversion rate
    const conversionRate = totalClicks > 0 ? (totalConversions / totalClicks) * 100 : 0;

    // Group by platform (using mock distribution for now)
    const byPlatform = [
      { platform: 'instagram', clicks: Math.floor(totalClicks * 0.45), conversions: Math.floor(totalConversions * 0.48), revenue: totalRevenueGenerated * 0.48 },
      { platform: 'tiktok', clicks: Math.floor(totalClicks * 0.29), conversions: Math.floor(totalConversions * 0.27), revenue: totalRevenueGenerated * 0.27 },
      { platform: 'twitter', clicks: Math.floor(totalClicks * 0.13), conversions: Math.floor(totalConversions * 0.13), revenue: totalRevenueGenerated * 0.14 },
      { platform: 'other', clicks: Math.floor(totalClicks * 0.13), conversions: Math.floor(totalConversions * 0.12), revenue: totalRevenueGenerated * 0.11 },
    ];

    // Top performing coupons
    const topCoupons = [...coupons]
      .sort((a, b) => (b.current_uses || 0) - (a.current_uses || 0))
      .slice(0, 5)
      .map(c => ({
        code: c.code,
        uses: c.current_uses || 0,
        revenue: (c.current_uses || 0) * 29.90 * (1 - c.discount / 100),
        discount: c.discount,
      }));

    return {
      totalDiscountGiven,
      totalRevenueGenerated,
      roi,
      totalConversions,
      totalClicks,
      conversionRate,
      byPlatform,
      topCoupons,
    };
  }, [coupons]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const maxPlatformRevenue = Math.max(...analytics.byPlatform.map(p => p.revenue));

  if (isLoading) {
    return (
      <div className="p-4 md:p-6 pb-24 md:pb-8 space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 pb-24 md:pb-8 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-primary/10">
          <BarChart3 className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Analytics de Cupons</h1>
          <p className="text-muted-foreground">
            Acompanhe o desempenho das suas campanhas promocionais
          </p>
        </div>
      </div>

      {/* ROI Calculator Card */}
      <Card className="bg-gradient-to-br from-primary/10 via-card to-secondary/10 border-primary/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5 text-primary" />
            Calculadora de ROI
          </CardTitle>
          <CardDescription>
            Retorno sobre o investimento em descontos
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="p-4 rounded-lg bg-muted/30">
              <p className="text-xs text-muted-foreground mb-1">Investimento (Descontos)</p>
              <p className="text-xl font-bold text-[hsl(45,93%,47%)]">
                {formatCurrency(analytics.totalDiscountGiven)}
              </p>
            </div>
            <div className="flex items-center justify-center">
              <div className="text-2xl font-bold text-muted-foreground">→</div>
            </div>
            <div className="p-4 rounded-lg bg-[hsl(142,76%,36%)]/10">
              <p className="text-xs text-muted-foreground mb-1">Receita Gerada</p>
              <p className="text-xl font-bold text-[hsl(142,76%,36%)]">
                {formatCurrency(analytics.totalRevenueGenerated)}
              </p>
            </div>
          </div>
          
          <div className="mt-4 p-4 rounded-lg bg-gradient-to-r from-primary/20 to-secondary/20 text-center">
            <p className="text-sm text-muted-foreground mb-1">Retorno sobre Investimento (ROI)</p>
            <div className="flex items-center justify-center gap-2">
              <p className={cn(
                "text-3xl font-bold",
                analytics.roi >= 100 ? "text-[hsl(142,76%,36%)]" : analytics.roi >= 50 ? "text-[hsl(45,93%,47%)]" : "text-destructive"
              )}>
                {analytics.roi.toFixed(1)}%
              </p>
              {analytics.roi >= 100 ? (
                <ArrowUpRight className="h-6 w-6 text-[hsl(142,76%,36%)]" />
              ) : (
                <ArrowDownRight className="h-6 w-6 text-destructive" />
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Para cada R$ 1 em desconto, você gera R$ {((analytics.roi / 100) + 1).toFixed(2)} em receita
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-card/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Ticket className="h-4 w-4" />
              <span className="text-xs">Cupons Ativos</span>
            </div>
            <p className="text-2xl font-bold">{coupons?.filter(c => c.is_active).length || 0}</p>
          </CardContent>
        </Card>
        <Card className="bg-card/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <TrendingUp className="h-4 w-4" />
              <span className="text-xs">Taxa de Conversão</span>
            </div>
            <p className="text-2xl font-bold text-primary">{analytics.conversionRate.toFixed(1)}%</p>
          </CardContent>
        </Card>
        <Card className="bg-card/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <DollarSign className="h-4 w-4" />
              <span className="text-xs">Conversões</span>
            </div>
            <p className="text-2xl font-bold text-[hsl(142,76%,36%)]">{analytics.totalConversions}</p>
          </CardContent>
        </Card>
        <Card className="bg-card/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Target className="h-4 w-4" />
              <span className="text-xs">Cliques</span>
            </div>
            <p className="text-2xl font-bold">{analytics.totalClicks}</p>
          </CardContent>
        </Card>
      </div>

      {/* Platform Performance Chart */}
      <Card className="bg-card/50">
        <CardHeader>
          <CardTitle className="text-lg">Desempenho por Plataforma</CardTitle>
          <CardDescription>
            Compare a performance dos seus links em cada rede social
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {analytics.byPlatform.map((platform) => (
              <div key={platform.platform} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={cn("p-1.5 rounded text-white", platformColors[platform.platform])}>
                      {platformIcons[platform.platform]}
                    </div>
                    <span className="font-medium capitalize">{platform.platform}</span>
                  </div>
                  <div className="text-right">
                    <span className="font-bold text-[hsl(142,76%,36%)]">
                      {formatCurrency(platform.revenue)}
                    </span>
                    <span className="text-xs text-muted-foreground ml-2">
                      ({platform.conversions} conv.)
                    </span>
                  </div>
                </div>
                <div className="h-3 bg-muted rounded-full overflow-hidden">
                  <div
                    className={cn("h-full rounded-full transition-all", platformColors[platform.platform])}
                    style={{ width: `${(platform.revenue / maxPlatformRevenue) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Top Coupons */}
      <Card className="bg-card/50">
        <CardHeader>
          <CardTitle className="text-lg">Top Cupons</CardTitle>
          <CardDescription>
            Os cupons com melhor desempenho
          </CardDescription>
        </CardHeader>
        <CardContent>
          {analytics.topCoupons.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Ticket className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>Nenhum cupom utilizado ainda</p>
            </div>
          ) : (
            <div className="space-y-3">
              {analytics.topCoupons.map((coupon, index) => (
                <div 
                  key={coupon.code}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/30"
                >
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm",
                      index === 0 ? "bg-[hsl(45,93%,47%)]/20 text-[hsl(45,93%,47%)]" :
                      index === 1 ? "bg-muted text-muted-foreground" :
                      "bg-[hsl(25,50%,50%)]/20 text-[hsl(25,50%,50%)]"
                    )}>
                      {index + 1}
                    </div>
                    <div>
                      <Badge variant="outline" className="font-mono">
                        {coupon.code}
                      </Badge>
                      <p className="text-xs text-muted-foreground mt-1">
                        {coupon.discount}% off · {coupon.uses} usos
                      </p>
                    </div>
                  </div>
                  <span className="font-bold text-[hsl(142,76%,36%)]">
                    {formatCurrency(coupon.revenue)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

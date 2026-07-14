import { memo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { ShoppingCart, TrendingUp, Users, DollarSign } from 'lucide-react';
import { useContentSales, useContentSalesStats } from '@/hooks/useContentSales';

const formatCurrency = (value: number) =>
  value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const formatDate = (dateStr: string) =>
  new Date(dateStr).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

export const ContentSalesHistory = memo(function ContentSalesHistory() {
  const { data: sales, isLoading } = useContentSales();
  const { data: stats } = useContentSalesStats();

  if (isLoading) {
    return (
      <Card className="bg-card/50 border-border/30">
        <CardHeader><Skeleton className="h-6 w-48" /></CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card/50 border-border/30">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <ShoppingCart className="h-5 w-5 text-[hsl(45,93%,47%)]" />
          Histórico de Vendas
        </CardTitle>

        {/* Stats summary */}
        {stats && stats.totalSales > 0 && (
          <div className="grid grid-cols-3 gap-2 mt-3">
            <div className="p-2 rounded-lg bg-muted/30 text-center">
              <DollarSign className="h-4 w-4 mx-auto text-green-500 mb-1" />
              <p className="text-xs text-muted-foreground">Faturado</p>
              <p className="text-sm font-bold text-foreground">{formatCurrency(stats.totalRevenue)}</p>
            </div>
            <div className="p-2 rounded-lg bg-muted/30 text-center">
              <TrendingUp className="h-4 w-4 mx-auto text-primary mb-1" />
              <p className="text-xs text-muted-foreground">Vendas</p>
              <p className="text-sm font-bold text-foreground">{stats.totalSales}</p>
            </div>
            <div className="p-2 rounded-lg bg-muted/30 text-center">
              <Users className="h-4 w-4 mx-auto text-secondary mb-1" />
              <p className="text-xs text-muted-foreground">Compradores</p>
              <p className="text-sm font-bold text-foreground">{stats.uniqueBuyers}</p>
            </div>
          </div>
        )}
      </CardHeader>

      <CardContent className="space-y-2">
        {!sales || sales.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <ShoppingCart className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Nenhuma venda ainda</p>
            <p className="text-xs mt-1">Crie posts com paywall para começar a vender!</p>
          </div>
        ) : (
          sales.map((sale) => (
            <div
              key={sale.id}
              className="flex items-center gap-3 p-3 rounded-lg bg-muted/20 border border-border/30"
            >
              <Avatar className="h-9 w-9 shrink-0">
                <AvatarImage src={sale.buyer_avatar || ''} />
                <AvatarFallback className="text-xs bg-primary/10 text-primary">
                  {(sale.buyer_name || '?')[0]}
                </AvatarFallback>
              </Avatar>

              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {sale.buyer_name || 'Usuário'}
                  {sale.buyer_username && (
                    <span className="text-muted-foreground font-normal ml-1">
                      @{sale.buyer_username}
                    </span>
                  )}
                </p>
                {sale.post_preview && (
                  <p className="text-xs text-muted-foreground truncate">{sale.post_preview}</p>
                )}
                <p className="text-xs text-muted-foreground">{formatDate(sale.purchased_at)}</p>
              </div>

              <Badge
                variant="outline"
                className="shrink-0 border-green-500/30 text-green-500 bg-green-500/10 font-semibold"
              >
                +{formatCurrency(sale.amount_paid * 0.94 * 0.80)}
              </Badge>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
});

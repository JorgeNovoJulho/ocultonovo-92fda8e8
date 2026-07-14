import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useMyBroadcasts, useBroadcastStats, Broadcast } from '@/hooks/useBroadcasts';
import { 
  Megaphone, 
  Send, 
  Eye, 
  Unlock, 
  DollarSign, 
  Clock, 
  CheckCircle2, 
  XCircle,
  Loader2,
  Users,
  TrendingUp,
  BarChart3
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';

export function BroadcastAnalytics() {
  const { data: broadcasts, isLoading } = useMyBroadcasts();
  const [selectedBroadcast, setSelectedBroadcast] = useState<string | null>(null);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const getStatusBadge = (status: Broadcast['status']) => {
    switch (status) {
      case 'pending':
        return <Badge variant="outline" className="gap-1"><Clock className="h-3 w-3" /> Pendente</Badge>;
      case 'processing':
        return <Badge className="gap-1 bg-blue-500"><Loader2 className="h-3 w-3 animate-spin" /> Processando</Badge>;
      case 'completed':
        return <Badge className="gap-1 bg-green-500"><CheckCircle2 className="h-3 w-3" /> Concluído</Badge>;
      case 'failed':
        return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" /> Falhou</Badge>;
    }
  };

  // Calculate totals
  const totals = broadcasts?.reduce((acc, b) => ({
    sent: acc.sent + b.total_recipients,
    delivered: acc.delivered + b.delivered_count,
    read: acc.read + b.read_count,
    unlocked: acc.unlocked + b.unlock_count,
    revenue: acc.revenue + b.total_revenue,
  }), { sent: 0, delivered: 0, read: 0, unlocked: 0, revenue: 0 });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Send className="h-4 w-4" />
              <span className="text-xs">Enviados</span>
            </div>
            <p className="text-2xl font-bold">{totals?.sent || 0}</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Users className="h-4 w-4" />
              <span className="text-xs">Entregues</span>
            </div>
            <p className="text-2xl font-bold">{totals?.delivered || 0}</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Eye className="h-4 w-4" />
              <span className="text-xs">Lidos</span>
            </div>
            <p className="text-2xl font-bold">{totals?.read || 0}</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Unlock className="h-4 w-4" />
              <span className="text-xs">Desbloqueios</span>
            </div>
            <p className="text-2xl font-bold">{totals?.unlocked || 0}</p>
          </CardContent>
        </Card>
        
        <Card className="bg-primary/10 border-primary/30">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-primary mb-1">
              <DollarSign className="h-4 w-4" />
              <span className="text-xs">Receita Total</span>
            </div>
            <p className="text-2xl font-bold text-primary">{formatCurrency(totals?.revenue || 0)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Broadcasts List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Histórico de Broadcasts
          </CardTitle>
        </CardHeader>
        <CardContent>
          {broadcasts && broadcasts.length > 0 ? (
            <div className="space-y-4">
              {broadcasts.map((broadcast) => (
                <BroadcastCard 
                  key={broadcast.id} 
                  broadcast={broadcast}
                  onClick={() => setSelectedBroadcast(broadcast.id)}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <Megaphone className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Nenhum broadcast enviado ainda</p>
              <p className="text-sm">Crie sua primeira mensagem em massa!</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detail Modal */}
      <BroadcastDetailModal 
        broadcastId={selectedBroadcast}
        onClose={() => setSelectedBroadcast(null)}
      />
    </div>
  );
}

function BroadcastCard({ broadcast, onClick }: { broadcast: Broadcast; onClick: () => void }) {
  const deliveryRate = broadcast.total_recipients > 0 
    ? (broadcast.delivered_count / broadcast.total_recipients) * 100 
    : 0;
  const openRate = broadcast.delivered_count > 0 
    ? (broadcast.read_count / broadcast.delivered_count) * 100 
    : 0;
  const conversionRate = broadcast.delivered_count > 0 
    ? (broadcast.unlock_count / broadcast.delivered_count) * 100 
    : 0;

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const getStatusBadge = (status: Broadcast['status']) => {
    switch (status) {
      case 'pending':
        return <Badge variant="outline" className="gap-1"><Clock className="h-3 w-3" /> Pendente</Badge>;
      case 'processing':
        return <Badge className="gap-1 bg-blue-500"><Loader2 className="h-3 w-3 animate-spin" /> Processando</Badge>;
      case 'completed':
        return <Badge className="gap-1 bg-green-500"><CheckCircle2 className="h-3 w-3" /> Concluído</Badge>;
      case 'failed':
        return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" /> Falhou</Badge>;
    }
  };

  const audienceLabels = {
    all_followers: 'Todos Seguidores',
    active_subscribers: 'Assinantes Ativos',
    expired_subscribers: 'Assinantes Expirados',
  };

  return (
    <div 
      className="p-4 rounded-lg border bg-card hover:border-primary/50 transition-colors cursor-pointer"
      onClick={onClick}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            {getStatusBadge(broadcast.status)}
            {broadcast.is_ppv && (
              <Badge variant="secondary" className="gap-1">
                <DollarSign className="h-3 w-3" />
                PPV {formatCurrency(broadcast.ppv_price)}
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground line-clamp-1">
            {broadcast.content || 'Mídia exclusiva'}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(broadcast.created_at), { addSuffix: true, locale: ptBR })}
          </p>
          <p className="text-xs text-muted-foreground">
            {audienceLabels[broadcast.audience_type]}
          </p>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-4 gap-4 text-center">
        <div>
          <p className="text-lg font-semibold">{broadcast.delivered_count}/{broadcast.total_recipients}</p>
          <p className="text-xs text-muted-foreground">Entregues</p>
          <Progress value={deliveryRate} className="h-1 mt-1" />
        </div>
        <div>
          <p className="text-lg font-semibold">{openRate.toFixed(0)}%</p>
          <p className="text-xs text-muted-foreground">Abertura</p>
          <Progress value={openRate} className="h-1 mt-1" />
        </div>
        <div>
          <p className="text-lg font-semibold">{conversionRate.toFixed(1)}%</p>
          <p className="text-xs text-muted-foreground">Conversão</p>
          <Progress value={conversionRate} className="h-1 mt-1" />
        </div>
        <div>
          <p className="text-lg font-semibold text-primary">{formatCurrency(broadcast.total_revenue)}</p>
          <p className="text-xs text-muted-foreground">Receita</p>
        </div>
      </div>
    </div>
  );
}

function BroadcastDetailModal({ broadcastId, onClose }: { broadcastId: string | null; onClose: () => void }) {
  const { broadcast } = useBroadcastStats(broadcastId);

  if (!broadcastId || !broadcast) return null;

  const deliveryRate = broadcast.total_recipients > 0 
    ? (broadcast.delivered_count / broadcast.total_recipients) * 100 
    : 0;
  const openRate = broadcast.delivered_count > 0 
    ? (broadcast.read_count / broadcast.delivered_count) * 100 
    : 0;
  const conversionRate = broadcast.delivered_count > 0 
    ? (broadcast.unlock_count / broadcast.delivered_count) * 100 
    : 0;

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  return (
    <Dialog open={!!broadcastId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            Detalhes do Broadcast
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Message Preview */}
          <div className="p-4 rounded-lg bg-muted/50">
            <p className="text-sm">{broadcast.content || 'Mídia exclusiva'}</p>
            {broadcast.media_url && (
              <div className="mt-2 rounded overflow-hidden">
                {broadcast.media_type === 'image' ? (
                  <img loading="lazy" decoding="async" src={broadcast.media_url} alt="" className="w-full max-h-32 object-cover" />
                ) : (
                  <video preload="none" src={broadcast.media_url} className="w-full max-h-32 object-cover" controls />
                )}
              </div>
            )}
          </div>

          {/* Funnel Chart */}
          <div className="space-y-3">
            <h4 className="font-medium">Funil de Conversão</h4>
            
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm">Enviados</span>
                <span className="font-medium">{broadcast.total_recipients}</span>
              </div>
              <Progress value={100} className="h-3" />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm">Entregues</span>
                <span className="font-medium">{broadcast.delivered_count} ({deliveryRate.toFixed(0)}%)</span>
              </div>
              <Progress value={deliveryRate} className="h-3" />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm">Lidos</span>
                <span className="font-medium">{broadcast.read_count} ({openRate.toFixed(0)}%)</span>
              </div>
              <Progress value={openRate} className="h-3" />
            </div>

            {broadcast.is_ppv && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm">Desbloqueados</span>
                  <span className="font-medium">{broadcast.unlock_count} ({conversionRate.toFixed(1)}%)</span>
                </div>
                <Progress value={conversionRate} className="h-3" />
              </div>
            )}
          </div>

          {/* Revenue Card */}
          {broadcast.is_ppv && (
            <Card className="bg-primary/10 border-primary/30">
              <CardContent className="pt-6">
                <div className="text-center">
                  <DollarSign className="h-8 w-8 mx-auto text-primary mb-2" />
                  <p className="text-3xl font-bold text-primary">
                    {formatCurrency(broadcast.total_revenue)}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Receita total deste broadcast
                  </p>
                  <p className="text-xs text-muted-foreground mt-2">
                    Preço: {formatCurrency(broadcast.ppv_price)} × {broadcast.unlock_count} vendas
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

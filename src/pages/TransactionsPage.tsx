import { useState, useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useFilteredTransactions } from '@/hooks/useTransactions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  DollarSign, 
  ArrowDownLeft, 
  ArrowUpRight, 
  Crown, 
  Receipt,
  Calendar,
  Filter,
  RefreshCcw,
  CreditCard,
  QrCode,
  Gift,
  Wallet
} from 'lucide-react';
import { format, subDays, startOfMonth, endOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { PremiumAccessGuard } from '@/components/PremiumAccessGuard';

const typeIcons: Record<string, React.ReactNode> = {
  deposit: <ArrowDownLeft className="h-4 w-4 text-green-500" />,
  withdrawal: <ArrowUpRight className="h-4 w-4 text-red-500" />,
  subscription: <Crown className="h-4 w-4 text-primary" />,
  tip: <Gift className="h-4 w-4 text-pink-500" />,
  payout: <Wallet className="h-4 w-4 text-blue-500" />,
};

const typeLabels: Record<string, string> = {
  deposit: 'Depósito',
  withdrawal: 'Saque',
  subscription: 'Assinatura',
  tip: 'Presente',
  payout: 'Pagamento',
};

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  pending: { label: 'Pendente', variant: 'secondary' },
  completed: { label: 'Concluído', variant: 'default' },
  failed: { label: 'Falhou', variant: 'destructive' },
};

const providerIcons: Record<string, React.ReactNode> = {
  pix: <QrCode className="h-3 w-3" />,
  stripe: <CreditCard className="h-3 w-3" />,
};

function StatCard({ 
  title, 
  value, 
  icon: Icon, 
  trend 
}: { 
  title: string; 
  value: number; 
  icon: React.ElementType;
  trend?: 'up' | 'down' | 'neutral';
}) {
  const trendColors = {
    up: 'text-green-500',
    down: 'text-red-500',
    neutral: 'text-muted-foreground',
  };

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">{title}</p>
            <p className={`text-xl font-bold ${trend ? trendColors[trend] : ''}`}>
              R$ {value.toFixed(2).replace('.', ',')}
            </p>
          </div>
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
            <Icon className="h-5 w-5 text-primary" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function TransactionsPage() {
  return (
    <PremiumAccessGuard featureName="Histórico de Transações">
      <TransactionsPageContent />
    </PremiumAccessGuard>
  );
}

function TransactionsPageContent() {
  const { user } = useAuth();
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [startDate, setStartDate] = useState<string>(
    format(subDays(new Date(), 30), 'yyyy-MM-dd')
  );
  const [endDate, setEndDate] = useState<string>(
    format(new Date(), 'yyyy-MM-dd')
  );

  const { data: transactions, isLoading, refetch } = useFilteredTransactions({
    startDate: startDate ? new Date(startDate) : undefined,
    endDate: endDate ? new Date(endDate + 'T23:59:59') : undefined,
    type: typeFilter !== 'all' ? typeFilter : undefined,
    status: statusFilter !== 'all' ? statusFilter : undefined,
  });

  const stats = useMemo(() => {
    if (!transactions) return { total: 0, deposits: 0, withdrawals: 0, subscriptions: 0 };
    
    return transactions.reduce((acc, tx) => {
      if (tx.status === 'completed') {
        acc.total += Math.abs(tx.amount);
        if (tx.type === 'deposit') acc.deposits += tx.amount;
        if (tx.type === 'withdrawal') acc.withdrawals += tx.amount;
        if (tx.type === 'subscription') acc.subscriptions += tx.amount;
      }
      return acc;
    }, { total: 0, deposits: 0, withdrawals: 0, subscriptions: 0 });
  }, [transactions]);

  const setQuickFilter = (period: 'today' | 'week' | 'month') => {
    const today = new Date();
    switch (period) {
      case 'today':
        setStartDate(format(today, 'yyyy-MM-dd'));
        setEndDate(format(today, 'yyyy-MM-dd'));
        break;
      case 'week':
        setStartDate(format(subDays(today, 7), 'yyyy-MM-dd'));
        setEndDate(format(today, 'yyyy-MM-dd'));
        break;
      case 'month':
        setStartDate(format(startOfMonth(today), 'yyyy-MM-dd'));
        setEndDate(format(endOfMonth(today), 'yyyy-MM-dd'));
        break;
    }
  };

  return (
    <div className="container max-w-6xl mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Receipt className="h-6 w-6 text-primary" />
            Histórico de Transações
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Acompanhe todos os seus movimentos financeiros
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCcw className="h-4 w-4 mr-2" />
          Atualizar
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Total Movimentado" value={stats.total} icon={DollarSign} />
        <StatCard title="Depósitos" value={stats.deposits} icon={ArrowDownLeft} trend="up" />
        <StatCard title="Saques" value={stats.withdrawals} icon={ArrowUpRight} trend="down" />
        <StatCard title="Assinaturas" value={stats.subscriptions} icon={Crown} />
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Filter className="h-4 w-4" />
            Filtros
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-4">
            {/* Quick filters */}
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setQuickFilter('today')}>
                Hoje
              </Button>
              <Button variant="outline" size="sm" onClick={() => setQuickFilter('week')}>
                7 dias
              </Button>
              <Button variant="outline" size="sm" onClick={() => setQuickFilter('month')}>
                Este mês
              </Button>
            </div>

            <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="text-sm"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">até</span>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="text-sm"
                />
              </div>

              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os tipos</SelectItem>
                  <SelectItem value="deposit">Depósitos</SelectItem>
                  <SelectItem value="withdrawal">Saques</SelectItem>
                  <SelectItem value="subscription">Assinaturas</SelectItem>
                  <SelectItem value="tip">Presentes</SelectItem>
                  <SelectItem value="payout">Pagamentos</SelectItem>
                </SelectContent>
              </Select>

              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os status</SelectItem>
                  <SelectItem value="pending">Pendente</SelectItem>
                  <SelectItem value="completed">Concluído</SelectItem>
                  <SelectItem value="failed">Falhou</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Transactions Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Provedor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  </TableRow>
                ))
              ) : transactions && transactions.length > 0 ? (
                transactions.map((tx) => (
                  <TableRow key={tx.id}>
                    <TableCell className="text-sm">
                      {format(new Date(tx.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {typeIcons[tx.type] || <Receipt className="h-4 w-4" />}
                        <span className="text-sm">{typeLabels[tx.type] || tx.type}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                      {tx.description || '-'}
                    </TableCell>
                    <TableCell>
                      <span className={`font-medium ${
                        tx.type === 'withdrawal' || tx.type === 'payout' 
                          ? 'text-red-500' 
                          : 'text-green-500'
                      }`}>
                        {tx.type === 'withdrawal' || tx.type === 'payout' ? '-' : '+'}
                        R$ {Math.abs(tx.amount).toFixed(2).replace('.', ',')}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusConfig[tx.status]?.variant || 'outline'}>
                        {statusConfig[tx.status]?.label || tx.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-muted-foreground">
                        {providerIcons[tx.provider || ''] || null}
                        <span className="text-xs capitalize">{tx.provider || '-'}</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    Nenhuma transação encontrada para os filtros selecionados.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

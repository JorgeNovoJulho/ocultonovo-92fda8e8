import { useState } from 'react';
import { AlertTriangle, CreditCard, Users, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useOverdueMetrics, type AdminFinancialUser } from '@/hooks/useOverdueMetrics';

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleDateString('pt-BR') : '—';
}

function formatMoney(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function UsersTable({ users }: { users: AdminFinancialUser[] }) {
  return (
    <div className="max-h-[60vh] overflow-auto rounded-md border border-border/50">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Usuário</TableHead>
            <TableHead>Último vencimento</TableHead>
            <TableHead>Plano</TableHead>
            <TableHead>Entrada</TableHead>
            <TableHead>Investido</TableHead>
            <TableHead>Postagens</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((user) => (
            <TableRow key={user.id}>
              <TableCell>
                <div className="font-medium">{user.name || user.username || 'Usuário'}</div>
                <div className="text-xs text-muted-foreground">{user.username ? `@${user.username}` : user.id}</div>
              </TableCell>
              <TableCell>{formatDate(user.payment_due_date)}</TableCell>
              <TableCell className="capitalize">{user.plan_type || 'free'}</TableCell>
              <TableCell>{formatDate(user.created_at)}</TableCell>
              <TableCell>{formatMoney(user.totalInvested)}</TableCell>
              <TableCell>{user.postsCount}</TableCell>
              <TableCell>
                <Badge variant={user.payment_status === 'active' ? 'outline' : 'destructive'}>
                  {user.payment_status === 'active' ? 'ativo' : user.payment_status === 'suspended' ? 'suspenso' : 'vencido'}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
          {users.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                Nenhum usuário encontrado
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

export function OverdueMetricsCard() {
  const { data: metrics, isLoading } = useOverdueMetrics();
  const [open, setOpen] = useState(false);

  if (isLoading) {
    return (
      <Card className="bg-card border-border/50">
        <CardContent className="p-6 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const totalInadimplentes = (metrics?.totalOverdueUsers || 0) + (metrics?.totalSuspendedUsers || 0);
  const hasCritical = (metrics?.overdueByDays.day7Plus || 0) > 0;

  return (
    <>
      <Card className={`bg-card border-border/50 ${hasCritical ? 'border-destructive/50' : ''}`}>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <AlertTriangle className={`h-5 w-5 ${hasCritical ? 'text-destructive animate-pulse' : 'text-amber-500'}`} />
            Inadimplência em Tempo Real
            {hasCritical && <Badge variant="destructive" className="ml-auto">Atenção</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <button type="button" onClick={() => setOpen(true)} className="p-3 bg-muted/30 rounded-lg text-left hover:bg-muted/50 transition-colors">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Users className="h-4 w-4" />
                <span className="text-xs">Total Inadimplentes</span>
              </div>
              <p className={`text-2xl font-bold ${totalInadimplentes > 0 ? 'text-amber-500' : 'text-foreground'}`}>{totalInadimplentes}</p>
              <div className="flex gap-2 mt-2 flex-wrap">
                <Badge variant="outline" className="text-xs">{metrics?.totalOverdueUsers || 0} atrasados</Badge>
                <Badge variant="destructive" className="text-xs">{metrics?.totalSuspendedUsers || 0} suspensos</Badge>
              </div>
            </button>
            <div className="p-3 bg-muted/30 rounded-lg">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <CreditCard className="h-4 w-4" />
                <span className="text-xs">Valor Pendente</span>
              </div>
              <p className={`text-2xl font-bold ${(metrics?.totalPendingAmount || 0) > 0 ? 'text-destructive' : 'text-foreground'}`}>
                {formatMoney(metrics?.totalPendingAmount || 0)}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <button type="button" onClick={() => setOpen(true)} className="p-2 bg-amber-500/10 rounded text-center hover:bg-amber-500/20 transition-colors">
              <p className="text-lg font-bold text-amber-500">{metrics?.overdueByDays.day1 || 0}</p>
              <p className="text-xs text-muted-foreground">1 dia</p>
            </button>
            <button type="button" onClick={() => setOpen(true)} className="p-2 bg-orange-500/10 rounded text-center hover:bg-orange-500/20 transition-colors">
              <p className="text-lg font-bold text-orange-500">{metrics?.overdueByDays.day3 || 0}</p>
              <p className="text-xs text-muted-foreground">3 dias</p>
            </button>
            <button type="button" onClick={() => setOpen(true)} className="p-2 bg-destructive/10 rounded text-center hover:bg-destructive/20 transition-colors">
              <p className="text-lg font-bold text-destructive">{metrics?.overdueByDays.day7Plus || 0}</p>
              <p className="text-xs text-muted-foreground">7+ dias</p>
            </button>
          </div>

          <Button variant="outline" size="sm" className="w-full" onClick={() => setOpen(true)}>
            Ver usuários inadimplentes
          </Button>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-6xl">
          <DialogHeader>
            <DialogTitle>Usuários inadimplentes</DialogTitle>
          </DialogHeader>
          <UsersTable users={metrics?.users || []} />
        </DialogContent>
      </Dialog>
    </>
  );
}
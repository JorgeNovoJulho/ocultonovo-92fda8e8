import { useMemo, useState } from 'react';
import { Clock, Loader2, UserX } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useInactiveUserCounts, useInactiveUsers, type AdminFinancialUser } from '@/hooks/useOverdueMetrics';

type Period = 30 | 90 | 180;

const periodLabel: Record<Period, string> = {
  30: 'últimos 30 dias',
  90: 'últimos 90 dias',
  180: 'últimos 6 meses',
};

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleDateString('pt-BR') : 'Nunca';
}

function InactiveList({ users }: { users: AdminFinancialUser[] }) {
  return (
    <div className="max-h-[60vh] overflow-auto rounded-md border border-border/50">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Usuário</TableHead>
            <TableHead>Último acesso</TableHead>
            <TableHead>Plano</TableHead>
            <TableHead>Status assinatura</TableHead>
            <TableHead>Entrada</TableHead>
            <TableHead>Investido</TableHead>
            <TableHead>Postagens</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((user) => {
            const expired = user.payment_status !== 'active' || (user.payment_due_date ? new Date(user.payment_due_date) < new Date() : false);
            return (
              <TableRow key={user.id}>
                <TableCell>
                  <div className="font-medium">{user.name || user.username || 'Usuário'}</div>
                  <div className="text-xs text-muted-foreground">{user.username ? `@${user.username}` : user.id}</div>
                </TableCell>
                <TableCell>{formatDate(user.last_seen)}</TableCell>
                <TableCell className="capitalize">{user.plan_type || 'free'}</TableCell>
                <TableCell>
                  <Badge variant={expired ? 'destructive' : 'outline'}>{expired ? 'vencido' : 'ativo'}</Badge>
                </TableCell>
                <TableCell>{formatDate(user.created_at)}</TableCell>
                <TableCell>{user.totalInvested.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</TableCell>
                <TableCell>{user.postsCount}</TableCell>
              </TableRow>
            );
          })}
          {users.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">Nenhum usuário inativo nesse período</TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

export function InactiveUsersCard() {
  const [period, setPeriod] = useState<Period | null>(null);
  const counts = useInactiveUserCounts();
  const selectedPeriod = period || 30;
  const { data: users = [], isLoading } = useInactiveUsers(selectedPeriod);

  const cards = useMemo(() => [
    { period: 30 as Period, value: counts.data.days30, label: '30 dias' },
    { period: 90 as Period, value: counts.data.days90, label: '90 dias' },
    { period: 180 as Period, value: counts.data.days180, label: '6 meses' },
  ], [counts.data.days30, counts.data.days90, counts.data.days180]);

  return (
    <>
      <Card className="bg-card border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <UserX className="h-5 w-5 text-muted-foreground" />
            Usuários Inativos por Período
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {cards.map((card) => (
              <button
                key={card.period}
                type="button"
                onClick={() => setPeriod(card.period)}
                className="p-4 rounded-lg bg-muted/30 text-left hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center justify-between text-muted-foreground mb-2">
                  <span className="text-sm">{card.label}</span>
                  <Clock className="h-4 w-4" />
                </div>
                <p className="text-2xl font-bold">{counts.isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : card.value}</p>
                <p className="text-xs text-muted-foreground mt-1">Clique para ver a lista</p>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Dialog open={period !== null} onOpenChange={(open) => !open && setPeriod(null)}>
        <DialogContent className="max-w-6xl">
          <DialogHeader>
            <DialogTitle>Usuários inativos nos {period ? periodLabel[period] : ''}</DialogTitle>
          </DialogHeader>
          {isLoading ? <div className="py-8 flex justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div> : <InactiveList users={users} />}
        </DialogContent>
      </Dialog>
    </>
  );
}
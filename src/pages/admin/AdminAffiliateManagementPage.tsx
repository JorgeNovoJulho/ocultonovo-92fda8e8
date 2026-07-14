import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, ShieldOff, Snowflake, CheckCircle2, Trash2, Gift, Users } from 'lucide-react';
import {
  useAffiliateRanking,
  useSetAffiliateStatus,
  useAwardAffiliateReward,
  usePlatformAffiliateLimitSetting,
  type AffiliateStatus,
  type AffiliateRankingRow,
} from '@/hooks/useAffiliateManagement';

const STATUS_LABEL: Record<AffiliateStatus, string> = {
  active: 'Ativo',
  frozen: 'Congelado',
  blocked: 'Bloqueado',
  removed: 'Removido',
};

const STATUS_VARIANT: Record<AffiliateStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  active: 'default',
  frozen: 'secondary',
  blocked: 'destructive',
  removed: 'outline',
};

function StatusActions({ row }: { row: AffiliateRankingRow }) {
  const setStatus = useSetAffiliateStatus();
  const award = useAwardAffiliateReward();
  const [reason, setReason] = useState('');
  const [days, setDays] = useState(7);
  const [reward, setReward] = useState({ amount: 50, reason: '', milestone: '' });

  return (
    <div className="flex gap-1 flex-wrap justify-end">
      <Button
        size="sm" variant="ghost"
        disabled={row.status === 'active' || setStatus.isPending}
        onClick={() => setStatus.mutate({ referralId: row.referral_id, status: 'active' })}
        title="Reativar"
      >
        <CheckCircle2 className="h-4 w-4" />
      </Button>

      <Dialog>
        <DialogTrigger asChild>
          <Button size="sm" variant="ghost" title="Congelar">
            <Snowflake className="h-4 w-4" />
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader><DialogTitle>Congelar afiliado</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Dias de congelamento</Label>
              <Input type="number" min={1} value={days} onChange={(e) => setDays(Number(e.target.value))} />
            </div>
            <div>
              <Label>Notas (opcional)</Label>
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => setStatus.mutate({
                referralId: row.referral_id, status: 'frozen', frozenDays: days, notes: reason || undefined,
              })}
              disabled={setStatus.isPending}
            >
              {setStatus.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Congelar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog>
        <DialogTrigger asChild>
          <Button size="sm" variant="ghost" title="Bloquear">
            <ShieldOff className="h-4 w-4" />
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader><DialogTitle>Bloquear afiliado</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Label>Motivo</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex.: fraude detectada" />
          </div>
          <DialogFooter>
            <Button
              variant="destructive"
              onClick={() => setStatus.mutate({ referralId: row.referral_id, status: 'blocked', reason })}
              disabled={setStatus.isPending}
            >
              Bloquear
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Button
        size="sm" variant="ghost"
        title="Remover" disabled={setStatus.isPending}
        onClick={() => {
          if (confirm('Remover este vínculo?')) {
            setStatus.mutate({ referralId: row.referral_id, status: 'removed' });
          }
        }}
      >
        <Trash2 className="h-4 w-4" />
      </Button>

      <Dialog>
        <DialogTrigger asChild>
          <Button size="sm" variant="ghost" title="Recompensar criador">
            <Gift className="h-4 w-4" />
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader><DialogTitle>Conceder recompensa</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Valor (R$)</Label>
              <Input type="number" step="0.01" value={reward.amount}
                     onChange={(e) => setReward(s => ({ ...s, amount: Number(e.target.value) }))} />
            </div>
            <div>
              <Label>Motivo</Label>
              <Input value={reward.reason} onChange={(e) => setReward(s => ({ ...s, reason: e.target.value }))} />
            </div>
            <div>
              <Label>Marco (opcional)</Label>
              <Input value={reward.milestone}
                     onChange={(e) => setReward(s => ({ ...s, milestone: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button
              disabled={award.isPending || !reward.reason || reward.amount <= 0}
              onClick={() => award.mutate({
                madrinhaId: row.madrinha_id,
                amount: reward.amount,
                reason: reward.reason,
                milestone: reward.milestone || undefined,
              })}
            >
              Conceder
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function AdminAffiliateManagementPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<AffiliateStatus | 'all'>('all');

  const ranking = useAffiliateRanking(null, 200);
  const limit = usePlatformAffiliateLimitSetting();
  const [draftLimit, setDraftLimit] = useState<number>(50);

  const rows = useMemo(() => {
    let data = ranking.data ?? [];
    if (statusFilter !== 'all') data = data.filter(r => r.status === statusFilter);
    if (search.trim()) {
      const s = search.toLowerCase();
      data = data.filter(r =>
        (r.afilhada_name ?? '').toLowerCase().includes(s) ||
        (r.afilhada_username ?? '').toLowerCase().includes(s) ||
        r.afilhada_id.toLowerCase().includes(s) ||
        r.madrinha_id.toLowerCase().includes(s),
      );
    }
    return data;
  }, [ranking.data, statusFilter, search]);

  const totals = useMemo(() => {
    const data = ranking.data ?? [];
    return {
      total: data.length,
      active: data.filter(r => r.status === 'active').length,
      frozen: data.filter(r => r.status === 'frozen').length,
      blocked: data.filter(r => r.status === 'blocked').length,
      revenue: data.reduce((s, r) => s + Number(r.total_commission_earned ?? 0), 0),
    };
  }, [ranking.data]);

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Users className="h-6 w-6" /> Gestão Avançada de Afiliados
        </h1>
        <p className="text-muted-foreground">
          Gerencie vínculos criador↔afiliado, status, limites e recompensas.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Total</p><p className="text-2xl font-bold">{totals.total}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Ativos</p><p className="text-2xl font-bold">{totals.active}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Congelados</p><p className="text-2xl font-bold">{totals.frozen}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Bloqueados</p><p className="text-2xl font-bold">{totals.blocked}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Comissão acumulada</p><p className="text-2xl font-bold">R$ {totals.revenue.toFixed(2)}</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Limite global por criador</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div>
            <Label>Atual</Label>
            <p className="text-2xl font-bold">{limit.data ?? '—'}</p>
          </div>
          <div>
            <Label>Novo limite</Label>
            <Input type="number" min={1} className="w-32"
                   value={draftLimit}
                   onChange={(e) => setDraftLimit(Number(e.target.value))} />
          </div>
          <Button onClick={() => limit.update.mutate(draftLimit)} disabled={limit.update.isPending}>
            {limit.update.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            Salvar
          </Button>
          <p className="text-xs text-muted-foreground basis-full">
            Aplica-se a todos os criadores. Quando atingido, novos vínculos são bloqueados.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Vínculos</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3 mb-4">
            <Input placeholder="Buscar por nome, @ ou UUID" value={search}
                   onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="active">Ativos</SelectItem>
                <SelectItem value="frozen">Congelados</SelectItem>
                <SelectItem value="blocked">Bloqueados</SelectItem>
                <SelectItem value="removed">Removidos</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {ranking.isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
            </div>
          ) : rows.length === 0 ? (
            <p className="text-muted-foreground">Nenhum vínculo encontrado.</p>
          ) : (
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Afiliada</TableHead>
                    <TableHead>Criadora (Madrinha)</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Comissão</TableHead>
                    <TableHead>Início</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.referral_id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Avatar className="h-8 w-8">
                            <AvatarImage src={r.afilhada_avatar ?? undefined} />
                            <AvatarFallback>{(r.afilhada_name ?? '?')[0]}</AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="text-sm font-medium">{r.afilhada_name ?? '—'}</p>
                            <p className="text-xs text-muted-foreground">@{r.afilhada_username ?? r.afilhada_id.slice(0, 8)}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs font-mono">{r.madrinha_id.slice(0, 8)}…</TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANT[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                      </TableCell>
                      <TableCell>R$ {Number(r.total_commission_earned ?? 0).toFixed(2)}</TableCell>
                      <TableCell className="text-xs">
                        {new Date(r.started_at).toLocaleDateString('pt-BR')}
                      </TableCell>
                      <TableCell className="text-right">
                        <StatusActions row={r} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

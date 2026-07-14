/**
 * Admin Master > Financeiro > Logs ASAAS
 * Logs brutos + idempotência do webhook ASAAS.
 */
import { useEffect, useMemo, useState } from 'react';
import { Webhook, RefreshCw, CheckCircle, XCircle, AlertTriangle, Copy, Filter } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { supabase } from '@/lib/supabaseExternal';
import { useIsMasterAdmin } from '@/hooks/useUserRoles';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';

interface AsaasLog {
  id: string;
  asaas_event_id: string | null;
  event_type: string | null;
  payment_id: string | null;
  payload: any;
  status: string;
  error_message: string | null;
  processing_ms: number | null;
  received_at: string;
  processed_at: string | null;
}

const STATUS_BADGE: Record<string, string> = {
  processed:   'bg-green-500/20 text-green-500 border-green-500/30',
  received:    'bg-blue-500/20 text-blue-500 border-blue-500/30',
  duplicated:  'bg-yellow-500/20 text-yellow-500 border-yellow-500/30',
  ignored:     'bg-muted text-muted-foreground',
  failed:      'bg-destructive/20 text-destructive border-destructive/30',
};

function StatusIcon({ status }: { status: string }) {
  if (status === 'processed') return <CheckCircle className="h-4 w-4 text-green-500" />;
  if (status === 'failed')    return <XCircle className="h-4 w-4 text-destructive" />;
  return <AlertTriangle className="h-4 w-4 text-[hsl(45,93%,47%)]" />;
}

export default function AdminAsaasWebhookLogsPage() {
  const { data: isMaster, isLoading: roleLoading } = useIsMasterAdmin();

  const [logs, setLogs] = useState<AsaasLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [eventFilter, setEventFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<AsaasLog | null>(null);

  const load = async () => {
    setLoading(true);
    let q = supabase
      .from('oculto_asaas_webhook_logs')
      .select('*')
      .order('received_at', { ascending: false })
      .limit(300);

    if (statusFilter !== 'all') q = q.eq('status', statusFilter);
    if (eventFilter !== 'all') q = q.eq('event_type', eventFilter);

    const { data, error } = await q;
    if (error) {
      toast.error('Erro ao carregar logs', { description: error.message });
      setLogs([]);
    } else {
      setLogs((data || []) as AsaasLog[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (isMaster) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMaster, statusFilter, eventFilter]);

  const filtered = useMemo(() => {
    if (!search.trim()) return logs;
    const s = search.toLowerCase();
    return logs.filter(l =>
      (l.payment_id || '').toLowerCase().includes(s) ||
      (l.asaas_event_id || '').toLowerCase().includes(s) ||
      (l.event_type || '').toLowerCase().includes(s)
    );
  }, [logs, search]);

  const eventTypes = useMemo(() => {
    const set = new Set<string>();
    logs.forEach(l => l.event_type && set.add(l.event_type));
    return Array.from(set).sort();
  }, [logs]);

  const stats = useMemo(() => ({
    total: logs.length,
    processed: logs.filter(l => l.status === 'processed').length,
    duplicated: logs.filter(l => l.status === 'duplicated').length,
    failed: logs.filter(l => l.status === 'failed').length,
  }), [logs]);

  if (roleLoading) {
    return <div className="p-6"><Skeleton className="h-32 w-full" /></div>;
  }

  if (!isMaster) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            Acesso restrito ao Admin Master.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-3">
            <Webhook className="h-6 w-6 text-primary" />
            Logs ASAAS
          </h1>
          <p className="text-muted-foreground text-sm">
            Eventos brutos do webhook + idempotência. Eventos duplicados retornam 200 sem reprocessar.
          </p>
        </div>
        <Button variant="outline" onClick={load} className="gap-2">
          <RefreshCw className="h-4 w-4" /> Atualizar
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="p-4">
          <p className="text-2xl font-bold">{stats.total}</p>
          <p className="text-xs text-muted-foreground">Total carregado</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-2xl font-bold text-green-500">{stats.processed}</p>
          <p className="text-xs text-muted-foreground">Processados</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-2xl font-bold text-yellow-500">{stats.duplicated}</p>
          <p className="text-xs text-muted-foreground">Duplicados (idempotência)</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-2xl font-bold text-destructive">{stats.failed}</p>
          <p className="text-xs text-muted-foreground">Falharam</p>
        </CardContent></Card>
      </div>

      {/* Filtros */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Filter className="h-4 w-4" /> Filtros
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos status</SelectItem>
              <SelectItem value="processed">Processados</SelectItem>
              <SelectItem value="duplicated">Duplicados</SelectItem>
              <SelectItem value="failed">Falharam</SelectItem>
              <SelectItem value="ignored">Ignorados</SelectItem>
              <SelectItem value="received">Recebidos (em curso)</SelectItem>
            </SelectContent>
          </Select>
          <Select value={eventFilter} onValueChange={setEventFilter}>
            <SelectTrigger><SelectValue placeholder="Evento" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos eventos</SelectItem>
              {eventTypes.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input
            placeholder="Buscar por payment_id ou event_id…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </CardContent>
      </Card>

      {/* Tabela */}
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {loading ? (
            <div className="p-6 space-y-2">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">
              Nenhum log encontrado.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>Evento</TableHead>
                  <TableHead>Payment ID</TableHead>
                  <TableHead>Recebido</TableHead>
                  <TableHead className="text-right">Tempo</TableHead>
                  <TableHead>Erro</TableHead>
                  <TableHead className="text-right">Payload</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(l => (
                  <TableRow key={l.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <StatusIcon status={l.status} />
                        <Badge variant="outline" className={STATUS_BADGE[l.status] || ''}>
                          {l.status}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{l.event_type || '—'}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {l.payment_id ? (
                        <button
                          className="hover:underline"
                          onClick={() => { navigator.clipboard.writeText(l.payment_id!); toast.success('Copiado'); }}
                          title="Copiar"
                        >
                          {l.payment_id.slice(0, 16)}…
                        </button>
                      ) : '—'}
                    </TableCell>
                    <TableCell className="text-xs">
                      {format(new Date(l.received_at), "dd/MM HH:mm:ss", { locale: ptBR })}
                    </TableCell>
                    <TableCell className="text-right text-xs">
                      {l.processing_ms != null ? `${l.processing_ms}ms` : '—'}
                    </TableCell>
                    <TableCell className="text-xs text-destructive max-w-[260px] truncate">
                      {l.error_message || ''}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => setSelected(l)}>
                        Ver
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Modal payload */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Webhook className="h-5 w-5" /> {selected?.event_type || 'Evento ASAAS'}
            </DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground">Status</p>
                  <Badge variant="outline" className={STATUS_BADGE[selected.status] || ''}>{selected.status}</Badge>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Tempo de processamento</p>
                  <p className="font-mono">{selected.processing_ms != null ? `${selected.processing_ms}ms` : '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Recebido em</p>
                  <p className="font-mono text-xs">{format(new Date(selected.received_at), "dd/MM/yyyy HH:mm:ss", { locale: ptBR })}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Processado em</p>
                  <p className="font-mono text-xs">{selected.processed_at ? format(new Date(selected.processed_at), "dd/MM/yyyy HH:mm:ss", { locale: ptBR }) : '—'}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-xs text-muted-foreground">Event ID (idempotência)</p>
                  <p className="font-mono text-xs break-all">{selected.asaas_event_id || '—'}</p>
                </div>
                {selected.error_message && (
                  <div className="col-span-2">
                    <p className="text-xs text-muted-foreground">Erro</p>
                    <p className="font-mono text-xs text-destructive whitespace-pre-wrap">{selected.error_message}</p>
                  </div>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs text-muted-foreground">Payload</p>
                  <Button
                    size="sm" variant="ghost"
                    onClick={() => { navigator.clipboard.writeText(JSON.stringify(selected.payload, null, 2)); toast.success('Copiado'); }}
                  >
                    <Copy className="h-3 w-3 mr-1" /> Copiar
                  </Button>
                </div>
                <pre className="text-xs bg-muted p-3 rounded-md overflow-x-auto max-h-[40vh]">
{JSON.stringify(selected.payload, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

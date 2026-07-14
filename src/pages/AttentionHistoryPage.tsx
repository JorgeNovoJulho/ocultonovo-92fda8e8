/**
 * Histórico de Atenção — Pulsos de Aura
 * Rota: /settings/pulses/history
 *
 * Consome RPC aura_attention_history(p_direction, p_limit, p_before) com
 * paginação por cursor (created_at), e aura_attention_history_clear() p/ apagar.
 * Respeita hide_my_history (do outro lado), bloqueios e retenção global.
 */
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, History, Sparkles, Crown, Zap, Trash2, Loader2, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { clearAuraAttentionHistory, fetchAuraAttentionHistory, type AuraAttentionHistoryRow } from '@/lib/auraAttentionHistoryApi';

type Direction = 'all' | 'received' | 'sent' | 'responded' | 'expired';

type HistoryRow = AuraAttentionHistoryRow;

const FILTERS: { value: Direction; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'received', label: 'Recebidos' },
  { value: 'sent', label: 'Enviados' },
  { value: 'responded', label: 'Respondidos' },
  { value: 'expired', label: 'Expirados' },
];

const PAGE = 30;

export default function AttentionHistoryPage() {
  const [direction, setDirection] = useState<Direction>('all');
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [clearing, setClearing] = useState(false);

  const fetchPage = useCallback(async (dir: Direction, before: string | null) => {
    try {
      return await fetchAuraAttentionHistory({ direction: dir, limit: PAGE, before });
    } catch (error: any) {
      toast.error('Não foi possível carregar o histórico', { description: error.message });
      return [] as HistoryRow[];
    }
  }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchPage(direction, null).then((d) => {
      if (!alive) return;
      setRows(d);
      setHasMore(d.length === PAGE);
      setLoading(false);
    });
    return () => { alive = false; };
  }, [direction, fetchPage]);

  async function loadMore() {
    if (!rows.length) return;
    setLoadingMore(true);
    const before = rows[rows.length - 1].created_at;
    const next = await fetchPage(direction, before);
    setRows((prev) => [...prev, ...next]);
    setHasMore(next.length === PAGE);
    setLoadingMore(false);
  }

  async function clearAll() {
    if (!confirm('Apagar todo o histórico de Pulsos de Aura? Esta ação não pode ser desfeita.')) return;
    setClearing(true);
    const { data, error } = await clearAuraAttentionHistory(null);
    setClearing(false);
    const r = Array.isArray(data) ? data[0] : data;
    if (error || r?.ok === false) {
      toast.error('Não foi possível apagar', { description: error?.message || r?.error });
      return;
    }
    toast.success(`Histórico apagado (${r?.deleted ?? 0} registros)`);
    setRows([]);
    setHasMore(false);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-3 p-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm" className="h-8 px-2">
          <Link to="/settings/pulses"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <h1 className="flex items-center gap-2 text-xl font-bold">
          <History className="h-5 w-5 text-fuchsia-400" />
          Histórico de Atenção
        </h1>
        <Button
          variant="outline"
          size="sm"
          className="ml-auto h-8 gap-1 text-destructive"
          onClick={clearAll}
          disabled={clearing || !rows.length}
        >
          {clearing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
          Apagar tudo
        </Button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setDirection(f.value)}
            className={`rounded-full border px-3 py-1 text-xs transition ${
              direction === f.value
                ? 'border-fuchsia-400/60 bg-fuchsia-500/15 text-fuchsia-200'
                : 'border-border/40 bg-background/30 text-muted-foreground hover:text-foreground'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">Carregando…</CardContent></Card>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="space-y-1 p-6 text-center">
            <Sparkles className="mx-auto h-6 w-6 text-fuchsia-300/60" />
            <p className="text-sm font-semibold">Nada por aqui ainda</p>
            <p className="text-xs text-muted-foreground">
              Quando você enviar ou receber um Pulso de Aura, ele aparecerá aqui.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-1.5">
          {rows.map((r) => <HistoryItem key={r.id} row={r} />)}
          {hasMore && (
            <Button variant="ghost" className="w-full" onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
              Carregar mais
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function HistoryItem({ row }: { row: HistoryRow }) {
  const isSent = row.direction === 'sent';
  const typeColor =
    row.pulse_type === 'rare' ? '#FF3DE0' :
    row.pulse_type === 'premium' ? '#B57BFF' : '#D946EF';
  const typeIcon =
    row.pulse_type === 'rare' ? <Zap className="h-3 w-3" /> :
    row.pulse_type === 'premium' ? <Crown className="h-3 w-3" /> :
    <Sparkles className="h-3 w-3" />;
  const expired = !!(row.expires_at && new Date(row.expires_at) < new Date() && row.status === 'sent');
  const statusLabel =
    row.status === 'responded' ? 'respondido' :
    expired ? 'expirado' :
    row.status === 'blocked' ? 'bloqueado' :
    row.status === 'ignored' ? 'ignorado' : 'enviado';

  return (
    <Card className="border-border/40">
      <CardContent className="flex items-center gap-3 p-2.5">
        <div
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
          style={{ backgroundColor: `${typeColor}22`, color: typeColor }}
          title={isSent ? 'Você enviou' : 'Você recebeu'}
        >
          {isSent ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownLeft className="h-3.5 w-3.5" />}
        </div>
        <Avatar className="h-9 w-9">
          <AvatarImage src={row.other_avatar || undefined} alt="" />
          <AvatarFallback>{(row.other_name || row.other_username || '?').slice(0, 1)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            {row.other_username ? `@${row.other_username}` : (row.other_name || 'alguém')}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {new Date(row.created_at).toLocaleString('pt-BR', {
              day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
            })}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Badge variant="outline" className="gap-1 text-[10px]" style={{ borderColor: `${typeColor}55`, color: typeColor }}>
            {typeIcon}
            {row.pulse_type === 'default' ? 'pulso' : row.pulse_type}
          </Badge>
          <span className={`text-[10px] ${
            row.status === 'responded' ? 'text-emerald-300' :
            expired ? 'text-muted-foreground' :
            row.status === 'blocked' ? 'text-destructive' : 'text-foreground/70'
          }`}>
            {statusLabel}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

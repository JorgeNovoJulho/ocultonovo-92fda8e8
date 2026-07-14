/**
 * AdminWelcomeLogPage — Verificação de entrega da mensagem de boas-vindas.
 * Mostra quem recebeu, fonte (trigger/rpc/ensure/idempotent), data,
 * pendentes (humanos sem log) e ações rápidas. Realtime + refresh manual.
 * Acesso restrito ao Admin Master via RPC.
 */
import { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabaseExternal';
import { subscribeTable } from '@/lib/realtimeBus';
import { useAdminBypass } from '@/hooks/useAdminBypass';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { toast } from 'sonner';
import {
  RefreshCw, Loader2, MailCheck, AlertCircle, Send, Search, Database, Zap, Shield,
  UserCircle2, Ban, Unlock, Lock, MoreHorizontal, Copy, Check, RotateCcw, XCircle, Clock,
} from 'lucide-react';
import { cn } from '@/lib/utils';


/** Célula de ID compacto com expansão + copiar. */
function UserIdCell({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);
  const short = `${id.slice(0, 6)}…${id.slice(-4)}`;
  async function copy(e?: { stopPropagation?: () => void }) {
    e?.stopPropagation();
    try {
      await navigator.clipboard.writeText(id);
      setCopied(true);
      toast.success('ID copiado');
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('Não foi possível copiar.');
    }
  }
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors border border-border/40"
          title="Ver / copiar ID completo"
        >
          {short}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto max-w-[92vw] p-2 space-y-2">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">User ID</div>
        <div className="font-mono text-xs break-all select-all bg-muted/40 p-2 rounded border border-border/40">
          {id}
        </div>
        <Button size="sm" variant="secondary" onClick={copy} className="w-full gap-1.5 h-8">
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? 'Copiado' : 'Copiar ID'}
        </Button>
      </PopoverContent>
    </Popover>
  );
}

type LogRow = {
  user_id: string;
  username: string | null;
  name: string | null;
  avatar_url: string | null;
  is_seed: boolean | null;
  profile_created_at: string | null;
  source: string;
  sent_at: string;
  conversation_id: string | null;
  message_id: string | null;
  temp_blocked?: boolean | null;
};
type PendingRow = {
  user_id: string;
  username: string | null;
  name: string | null;
  avatar_url: string | null;
  profile_created_at: string | null;
};
type Stats = {
  total: number; trigger: number; rpc: number; ensure: number;
  idempotent: number; humans_total: number; pending: number; coverage_pct: number;
};

const SOURCE_LABEL: Record<string, { label: string; tone: string }> = {
  trigger:    { label: 'Trigger (cadastro)', tone: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
  rpc:        { label: 'RPC (manual)',       tone: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
  ensure:     { label: 'Ensure (feed)',      tone: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
  idempotent: { label: 'Idempotente',        tone: 'bg-muted text-muted-foreground border-border' },
};

function fmt(d: string | null) {
  if (!d) return '—';
  try { return new Date(d).toLocaleString('pt-BR'); } catch { return d; }
}

function StatusBadge({ status, title }: { status: 'sent' | 'pending' | 'error'; title?: string }) {
  if (status === 'sent') {
    return (
      <Badge variant="outline" className="border bg-emerald-500/15 text-emerald-400 border-emerald-500/30 gap-1">
        <MailCheck className="h-3 w-3" /> Enviado
      </Badge>
    );
  }
  if (status === 'error') {
    return (
      <Badge variant="outline" className="border bg-destructive/15 text-destructive border-destructive/30 gap-1" title={title}>
        <XCircle className="h-3 w-3" /> Erro
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="border bg-amber-500/15 text-amber-400 border-amber-500/30 gap-1">
      <Clock className="h-3 w-3" /> Pendente
    </Badge>
  );
}


export default function AdminWelcomeLogPage() {
  const { isMasterAdmin, isLoading: bypassLoading } = useAdminBypass();
  const navigate = useNavigate();
  const [stats, setStats] = useState<Stats | null>(null);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [pending, setPending] = useState<PendingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [source, setSource] = useState<string>('all');
  const [sendingFor, setSendingFor] = useState<string | null>(null);
  const [togglingBlockFor, setTogglingBlockFor] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});


  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [statsRes, logsRes, pendingRes] = await Promise.all([
        (supabase as any).rpc('admin_welcome_log_stats'),
        (supabase as any).rpc('admin_list_welcome_logs', {
          p_search: search || null,
          p_source: source === 'all' ? null : source,
          p_limit: 200,
          p_offset: 0,
        }),
        (supabase as any).rpc('admin_list_welcome_pending', { p_limit: 200 }),
      ]);
      if (statsRes.error) throw statsRes.error;
      if (logsRes.error) throw logsRes.error;
      if (pendingRes.error) throw pendingRes.error;
      setStats(statsRes.data as Stats);
      setLogs((logsRes.data ?? []) as LogRow[]);
      setPending((pendingRes.data ?? []) as PendingRow[]);
    } catch (e: any) {
      toast.error(`Erro ao carregar dados: ${e?.message || e}`);
    } finally {
      setLoading(false);
    }
  }, [search, source]);

  useEffect(() => {
    if (!isMasterAdmin) return;
    loadAll();
    const unsub = subscribeTable('oculto_welcome_message_log', () => loadAll());
    return () => { unsub(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMasterAdmin]);

  // Auto-recarrega quando o filtro de fonte muda
  useEffect(() => {
    if (!isMasterAdmin) return;
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);

  async function sendNow(username: string | null, user_id: string) {
    const uname = (username || '').trim().replace(/^@/, '');
    if (!uname) {
      const msg = 'Usuário sem username — não é possível enviar.';
      setErrors((p) => ({ ...p, [user_id]: msg }));
      toast.error(msg);
      return;
    }
    setSendingFor(user_id);
    // Limpa erro anterior ao iniciar nova tentativa
    setErrors((p) => { const n = { ...p }; delete n[user_id]; return n; });
    let error: any = null;
    // Tenta primeiro via user_id (mais robusto), faz fallback para username
    const byId = await (supabase as any).rpc('admin_send_welcome_to_user_id', { p_user_id: user_id });
    if (byId.error) {
      const byName = await (supabase as any).rpc('admin_send_welcome_to_username', { p_username: uname });
      error = byName.error;
    }
    setSendingFor(null);
    if (error) {
      const msg = error.message || String(error);
      setErrors((p) => ({ ...p, [user_id]: msg }));
      toast.error(`Falha: ${msg}`);
      return;
    }
    toast.success(`Mensagem enviada para @${uname}.`);
    loadAll();
  }


  function openProfile(user_id: string, username: string | null) {
    // /u/:creatorId resolve por user_id, profile.id ou username
    const slug = (username || '').trim().replace(/^@/, '');
    navigate(`/u/${encodeURIComponent(slug || user_id)}`);
  }

  async function toggleBlock(user_id: string, currentlyBlocked: boolean) {
    const action = currentlyBlocked ? 'desbloquear' : 'bloquear';
    if (!window.confirm(`Tem certeza que deseja ${action} este perfil?`)) return;
    setTogglingBlockFor(user_id);
    const { error } = await (supabase as any).rpc('admin_set_profile_temp_block', {
      p_user_id: user_id,
      p_blocked: !currentlyBlocked,
    });
    setTogglingBlockFor(null);
    if (error) { toast.error(`Falha ao ${action}: ${error.message}`); return; }
    // Atualiza localmente sem precisar refazer o fetch inteiro
    setLogs((prev) => prev.map((r) =>
      r.user_id === user_id ? { ...r, temp_blocked: !currentlyBlocked } : r,
    ));
    toast.success(currentlyBlocked
      ? 'Perfil desbloqueado.'
      : 'Perfil bloqueado temporariamente.');
  }


  const kpis = useMemo(() => ([
    { label: 'Total entregues', value: stats?.total ?? 0, icon: MailCheck, tone: 'text-emerald-400' },
    { label: 'Via Trigger',     value: stats?.trigger ?? 0, icon: Database, tone: 'text-emerald-400' },
    { label: 'Via RPC manual',  value: stats?.rpc ?? 0, icon: Zap, tone: 'text-blue-400' },
    { label: 'Via Ensure (feed)', value: stats?.ensure ?? 0, icon: Shield, tone: 'text-amber-400' },
    { label: 'Pendentes',       value: pending.length, icon: AlertCircle, tone: 'text-destructive' },
    { label: 'Cobertura',       value: (() => {
        const total = (stats?.total ?? 0) + pending.length;
        if (!total) return '0%';
        return `${Math.round(((stats?.total ?? 0) / total) * 100)}%`;
      })(), icon: MailCheck, tone: 'text-primary' },
  ]), [stats, pending.length]);

  if (bypassLoading) {
    return <div className="p-8 flex items-center gap-2 text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" /> Verificando permissões…
    </div>;
  }
  if (!isMasterAdmin) {
    return <div className="p-8 text-center text-destructive">
      Acesso restrito ao Admin Master.
    </div>;
  }

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-7xl mx-auto">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-semibold">Boas-vindas — Entregas</h1>
          <p className="text-xs md:text-sm text-muted-foreground">
            Quem recebeu, por qual caminho (trigger automático, RPC manual ou ensure do feed) e quem ainda está pendente.
          </p>
        </div>
        <Button onClick={loadAll} disabled={loading} className="gap-2">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Atualizar
        </Button>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpis.map(k => (
          <Card key={k.label} className="p-3 flex flex-col gap-1 bg-card/60">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <k.icon className={cn('h-3.5 w-3.5', k.tone)} /> {k.label}
            </div>
            <div className={cn('text-xl font-bold', k.tone)}>{k.value}</div>
          </Card>
        ))}
      </div>

      <Card className="p-3 md:p-4 space-y-3">
        <div className="flex flex-col md:flex-row gap-2 md:items-center md:justify-between">
          <div className="flex items-center gap-2 flex-wrap">
            <MailCheck className="h-4 w-4 text-emerald-400" />
            <h2 className="font-semibold text-sm md:text-base">Entregas registradas</h2>
            <Badge variant="outline">{logs.length}</Badge>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
            <div className="relative flex-1 sm:w-64">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && loadAll()}
                placeholder="Buscar @username ou nome…"
                className="pl-8 w-full"
              />
            </div>
            <Select value={source} onValueChange={(v) => setSource(v)}>
              <SelectTrigger className="w-full sm:w-44"><SelectValue placeholder="Fonte" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as fontes</SelectItem>
                <SelectItem value="trigger">Trigger (cadastro)</SelectItem>
                <SelectItem value="rpc">RPC manual</SelectItem>
                <SelectItem value="ensure">Ensure (feed)</SelectItem>
                <SelectItem value="idempotent">Idempotente</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="secondary" onClick={loadAll} className="w-full sm:w-auto">Filtrar</Button>
          </div>
        </div>

        {/* Loading / empty states */}
        {loading && logs.length === 0 && (
          <div className="text-center py-6 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin inline mr-2" />Carregando…
          </div>
        )}
        {!loading && logs.length === 0 && (
          <div className="text-center py-6 text-muted-foreground text-sm">
            Nenhuma entrega encontrada com os filtros atuais.
          </div>
        )}

        {/* Desktop: tabela */}
        {logs.length > 0 && (
          <div className="hidden md:block overflow-x-auto rounded-md border border-border/60">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Usuário</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>ID</TableHead>
                  <TableHead>Fonte</TableHead>
                  <TableHead>Enviado em</TableHead>
                  <TableHead>Cadastro</TableHead>
                  <TableHead className="text-right">Ação</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {logs.map((row) => {
                  const s = SOURCE_LABEL[row.source] || { label: row.source, tone: 'bg-muted' };
                  const blocked = !!row.temp_blocked;
                  const busy = togglingBlockFor === row.user_id;
                  return (
                    <TableRow key={`${row.user_id}-${row.message_id}`}>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              className="flex items-center gap-2 min-w-0 w-full text-left hover:bg-muted/40 rounded-md p-1 -m-1 transition-colors"
                            >
                              <Avatar className="h-8 w-8 shrink-0">
                                <AvatarImage src={row.avatar_url || undefined} />
                                <AvatarFallback>{(row.username || row.name || '?').slice(0, 2).toUpperCase()}</AvatarFallback>
                              </Avatar>
                              <div className="min-w-0 flex-1">
                                <div className="text-sm font-medium truncate flex items-center gap-1.5">
                                  @{row.username || '—'}
                                  {blocked && <Lock className="h-3 w-3 text-destructive shrink-0" aria-label="Bloqueado" />}
                                </div>
                                <div className="text-xs text-muted-foreground truncate">{row.name || '—'}</div>
                              </div>
                              <MoreHorizontal className="h-4 w-4 text-muted-foreground shrink-0" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start" className="w-56">
                            <DropdownMenuLabel className="truncate">
                              @{row.username || row.name || row.user_id.slice(0, 8)}
                            </DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => openProfile(row.user_id, row.username)}>
                              <UserCircle2 className="h-4 w-4 mr-2" />Entrar no perfil
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => sendNow(row.username, row.user_id)}
                              disabled={sendingFor === row.user_id}
                            >
                              {sendingFor === row.user_id
                                ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                : <RotateCcw className="h-4 w-4 mr-2" />}
                              Reenviar boas-vindas
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => toggleBlock(row.user_id, blocked)}
                              disabled={busy}
                              className={blocked ? '' : 'text-destructive focus:text-destructive'}
                            >
                              {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                : blocked ? <Unlock className="h-4 w-4 mr-2" /> : <Ban className="h-4 w-4 mr-2" />}
                              {blocked ? 'Desbloquear perfil' : 'Bloquear perfil'}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                      <TableCell>
                        <StatusBadge
                          status={errors[row.user_id] ? 'error' : 'sent'}
                          title={errors[row.user_id]}
                        />
                      </TableCell>
                      <TableCell><UserIdCell id={row.user_id} /></TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn('border', s.tone)}>{s.label}</Badge>
                      </TableCell>
                      <TableCell className="text-sm whitespace-nowrap">{fmt(row.sent_at)}</TableCell>
                      <TableCell className="text-sm whitespace-nowrap text-muted-foreground">{fmt(row.profile_created_at)}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={sendingFor === row.user_id}
                          onClick={() => sendNow(row.username, row.user_id)}
                          className="gap-1"
                          title="Reenviar boas-vindas"
                        >
                          {sendingFor === row.user_id
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <RotateCcw className="h-3.5 w-3.5" />}
                          Reenviar
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}


        {/* Mobile: cards */}
        {logs.length > 0 && (
          <div className="md:hidden flex flex-col gap-2">
            {logs.map((row) => {
              const s = SOURCE_LABEL[row.source] || { label: row.source, tone: 'bg-muted' };
              const blocked = !!row.temp_blocked;
              const busy = togglingBlockFor === row.user_id;
              return (
                <Card key={`m-${row.user_id}-${row.message_id}`} className="p-3 bg-card/60 space-y-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button type="button" className="flex items-center gap-2 w-full text-left">
                        <Avatar className="h-9 w-9 shrink-0">
                          <AvatarImage src={row.avatar_url || undefined} />
                          <AvatarFallback>{(row.username || row.name || '?').slice(0, 2).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium truncate flex items-center gap-1.5">
                            @{row.username || '—'}
                            {blocked && <Lock className="h-3 w-3 text-destructive shrink-0" />}
                          </div>
                          <div className="text-xs text-muted-foreground truncate">{row.name || '—'}</div>
                        </div>
                        <MoreHorizontal className="h-4 w-4 text-muted-foreground shrink-0" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      <DropdownMenuLabel className="truncate">
                        @{row.username || row.name || row.user_id.slice(0, 8)}
                      </DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => openProfile(row.user_id, row.username)}>
                        <UserCircle2 className="h-4 w-4 mr-2" />Entrar no perfil
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => sendNow(row.username, row.user_id)}
                        disabled={sendingFor === row.user_id}
                      >
                        {sendingFor === row.user_id
                          ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          : <RotateCcw className="h-4 w-4 mr-2" />}
                        Reenviar boas-vindas
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => toggleBlock(row.user_id, blocked)}
                        disabled={busy}
                        className={blocked ? '' : 'text-destructive focus:text-destructive'}
                      >
                        {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          : blocked ? <Unlock className="h-4 w-4 mr-2" /> : <Ban className="h-4 w-4 mr-2" />}
                        {blocked ? 'Desbloquear perfil' : 'Bloquear perfil'}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                    <StatusBadge
                      status={errors[row.user_id] ? 'error' : 'sent'}
                      title={errors[row.user_id]}
                    />
                    <Badge variant="outline" className={cn('border', s.tone)}>{s.label}</Badge>
                    <span className="text-muted-foreground">
                      <span className="font-medium text-foreground">Enviado:</span> {fmt(row.sent_at)}
                    </span>
                    <span className="text-muted-foreground">
                      <span className="font-medium text-foreground">Cadastro:</span> {fmt(row.profile_created_at)}
                    </span>
                  </div>
                  {errors[row.user_id] && (
                    <div className="text-xs text-destructive break-words">{errors[row.user_id]}</div>
                  )}
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground">ID:</span>
                    <UserIdCell id={row.user_id} />
                  </div>
                </Card>

              );
            })}
          </div>
        )}
      </Card>

      <Card className="p-3 md:p-4 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <AlertCircle className="h-4 w-4 text-destructive" />
          <h2 className="font-semibold text-sm md:text-base">Pendentes (humanos sem mensagem)</h2>
          <Badge variant="outline">{pending.length}</Badge>
        </div>

        {pending.length === 0 && (
          <div className="text-center py-6 text-muted-foreground text-sm">
            ✅ Sem pendências — todos os usuários humanos receberam a mensagem.
          </div>
        )}

        {/* Desktop: tabela */}
        {pending.length > 0 && (
          <div className="hidden md:block overflow-x-auto rounded-md border border-border/60">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Usuário</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Cadastrado em</TableHead>
                  <TableHead className="text-right">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pending.map((row) => {
                  const hasError = !!errors[row.user_id];
                  return (
                    <TableRow key={row.user_id}>
                      <TableCell>
                        <div className="flex items-center gap-2 min-w-0">
                          <Avatar className="h-8 w-8 shrink-0">
                            <AvatarImage src={row.avatar_url || undefined} />
                            <AvatarFallback>{(row.username || row.name || '?').slice(0, 2).toUpperCase()}</AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <div className="text-sm font-medium truncate">@{row.username || '—'}</div>
                            <div className="text-xs text-muted-foreground truncate">{row.name || '—'}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <StatusBadge
                          status={hasError ? 'error' : 'pending'}
                          title={errors[row.user_id]}
                        />
                        {hasError && (
                          <div className="text-[11px] text-destructive mt-1 max-w-[240px] truncate" title={errors[row.user_id]}>
                            {errors[row.user_id]}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-sm whitespace-nowrap text-muted-foreground">{fmt(row.profile_created_at)}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant={hasError ? 'destructive' : 'secondary'}
                          disabled={sendingFor === row.user_id}
                          onClick={() => sendNow(row.username, row.user_id)}
                          className="gap-1"
                        >
                          {sendingFor === row.user_id
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : hasError ? <RotateCcw className="h-3.5 w-3.5" /> : <Send className="h-3.5 w-3.5" />}
                          {hasError ? 'Tentar novamente' : 'Enviar agora'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}


        {/* Mobile: cards */}
        {pending.length > 0 && (
          <div className="md:hidden flex flex-col gap-2">
            {pending.map((row) => {
              const hasError = !!errors[row.user_id];
              return (
                <Card key={`mp-${row.user_id}`} className="p-3 bg-card/60 space-y-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Avatar className="h-9 w-9 shrink-0">
                      <AvatarImage src={row.avatar_url || undefined} />
                      <AvatarFallback>{(row.username || row.name || '?').slice(0, 2).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">@{row.username || '—'}</div>
                      <div className="text-xs text-muted-foreground truncate">{row.name || '—'}</div>
                    </div>
                    <StatusBadge status={hasError ? 'error' : 'pending'} title={errors[row.user_id]} />
                  </div>
                  <div className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">Cadastro:</span> {fmt(row.profile_created_at)}
                  </div>
                  {hasError && (
                    <div className="text-xs text-destructive break-words">{errors[row.user_id]}</div>
                  )}
                  <Button
                    size="sm"
                    variant={hasError ? 'destructive' : 'secondary'}
                    disabled={sendingFor === row.user_id}
                    onClick={() => sendNow(row.username, row.user_id)}
                    className="gap-1 w-full"
                  >
                    {sendingFor === row.user_id
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : hasError ? <RotateCcw className="h-3.5 w-3.5" /> : <Send className="h-3.5 w-3.5" />}
                    {hasError ? 'Tentar novamente' : 'Enviar agora'}
                  </Button>
                </Card>
              );
            })}

          </div>
        )}
      </Card>
    </div>
  );
}

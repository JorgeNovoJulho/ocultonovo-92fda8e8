import { useState, useMemo } from 'react';
import { useGraveyardList, useGraveyardEntry } from '@/hooks/useGraveyard';
import { useDebounce } from '@/hooks/useDebounce';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { format, formatDistanceToNow, differenceInDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Search, Eye, Download, Archive, AlertTriangle, FileJson, Loader2,
  ChevronLeft, ChevronRight, Clock, X,
} from 'lucide-react';

export function GraveyardTab() {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 400);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(0); // 0-indexed

  // Reset page when search/pageSize changes
  useMemo(() => { setPage(0); }, [debouncedSearch, pageSize]);

  const offset = page * pageSize;
  const { data: entries, isLoading, isFetching } = useGraveyardList(debouncedSearch, pageSize, offset);
  const { data: snapshot, isLoading: loadingSnap } = useGraveyardEntry(selectedId);

  const downloadDossie = () => {
    if (!snapshot) return;
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dossie-${snapshot.username || snapshot.original_user_id}-${snapshot.id.slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const total = entries?.[0]?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const showingFrom = total === 0 ? 0 : offset + 1;
  const showingTo = Math.min(offset + pageSize, total);

  const getRetentionMeta = (purgeAfter: string) => {
    const days = differenceInDays(new Date(purgeAfter), new Date());
    if (days <= 0) return { label: 'Expirado', tone: 'destructive' as const, days };
    if (days <= 30) return { label: `${days}d restantes`, tone: 'destructive' as const, days };
    if (days <= 180) return { label: `${days}d restantes`, tone: 'warning' as const, days };
    const years = (days / 365).toFixed(1);
    return { label: `~${years} anos restantes`, tone: 'muted' as const, days };
  };

  return (
    <div className="space-y-4">
      <Card className="border-destructive/30 bg-destructive/5">
        <CardContent className="p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-destructive">Acesso restrito ao Master Admin</p>
            <p className="text-muted-foreground">
              Snapshots completos de perfis excluídos. Conteúdo, mensagens, transações e logs preservados
              por 5 anos. Compressão automática via Postgres TOAST/LZ4.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por e-mail, username ou nome..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 pr-9"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-muted"
              aria-label="Limpar busca"
            >
              <X className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          )}
          {isFetching && (
            <Loader2 className="absolute right-9 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-muted-foreground" />
          )}
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Por página:</span>
          <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
            <SelectTrigger className="h-8 w-20"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[10, 25, 50, 100].map((n) => (
                <SelectItem key={n} value={String(n)}>{n}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Archive className="h-5 w-5" />
            Cemitério Jurídico
            <Badge variant="outline" className="ml-2">{total} registros</Badge>
          </CardTitle>
          <CardDescription>
            Clique em "Abrir Dossiê" para visualizar o snapshot completo (perfil + conteúdo).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !entries || entries.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Archive className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>{debouncedSearch ? 'Nenhum resultado para esta busca.' : 'Nenhum perfil arquivado no Cemitério.'}</p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Identificação</TableHead>
                    <TableHead>E-mail (bloqueado)</TableHead>
                    <TableHead>Origem</TableHead>
                    <TableHead>Arquivado</TableHead>
                    <TableHead>Retenção</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((e) => {
                    const ret = getRetentionMeta(e.purge_after);
                    return (
                      <TableRow key={e.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{e.display_name || '—'}</p>
                            <p className="text-xs text-muted-foreground">@{e.username || '—'}</p>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs font-mono">{e.email || '—'}</TableCell>
                        <TableCell>
                          <Badge variant={e.initiated_by === 'self' ? 'secondary' : 'destructive'}>
                            {e.initiated_by === 'self' ? 'Auto-exclusão' : e.initiated_by}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {format(new Date(e.archived_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-0.5">
                            <Badge
                              variant={ret.tone === 'destructive' ? 'destructive' : ret.tone === 'warning' ? 'default' : 'outline'}
                              className={`text-[10px] gap-1 w-fit ${ret.tone === 'warning' ? 'bg-amber-500/15 text-amber-600 hover:bg-amber-500/20 border-amber-500/30' : ''}`}
                            >
                              <Clock className="h-3 w-3" />
                              {ret.label}
                            </Badge>
                            <span className="text-[10px] text-muted-foreground">
                              Purga: {format(new Date(e.purge_after), 'dd/MM/yyyy', { locale: ptBR })}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="outline" onClick={() => setSelectedId(e.id)}>
                            <Eye className="h-4 w-4 mr-1" /> Abrir Dossiê
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              <div className="flex items-center justify-between gap-3 mt-4 pt-3 border-t">
                <p className="text-xs text-muted-foreground">
                  Mostrando <span className="font-medium">{showingFrom}–{showingTo}</span> de{' '}
                  <span className="font-medium">{total}</span>
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={page === 0 || isFetching}
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" /> Anterior
                  </Button>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {page + 1} / {totalPages}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={page >= totalPages - 1 || isFetching}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Próximo <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selectedId} onOpenChange={(o) => !o && setSelectedId(null)}>
        <DialogContent className="max-w-5xl max-h-[85vh]">
          <DialogHeader>
            <div className="flex items-center justify-between gap-3">
              <div>
                <DialogTitle className="flex items-center gap-2">
                  <FileJson className="h-5 w-5 text-destructive" />
                  Dossiê Jurídico — {snapshot?.display_name || snapshot?.username || '...'}
                </DialogTitle>
                <DialogDescription>
                  Visualização somente-leitura · Auditoria preservada por 5 anos
                </DialogDescription>
              </div>
              <Button size="sm" onClick={downloadDossie} disabled={!snapshot}>
                <Download className="h-4 w-4 mr-1" /> Exportar JSON
              </Button>
            </div>
          </DialogHeader>

          <div className="bg-destructive/10 border border-destructive/30 rounded-md p-3 text-sm flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            <span className="font-medium text-destructive">⚠️ PERFIL EXCLUÍDO</span>
            <span className="text-muted-foreground">
              · Visível apenas para o Master Admin · Para usuários e demais admins, este perfil aparece como inexistente.
            </span>
          </div>

          <ScrollArea className="h-[60vh] pr-4">
            {loadingSnap || !snapshot ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="space-y-4 text-sm">
                <SnapshotSection title="Identificação">
                  <KV k="user_id" v={snapshot.original_user_id} />
                  <KV k="profile_id" v={snapshot.original_profile_id} />
                  <KV k="email" v={snapshot.email} />
                  <KV k="username" v={snapshot.username} />
                  <KV k="motivo" v={snapshot.reason} />
                  <KV k="iniciado por" v={snapshot.initiated_by} />
                  <KV k="arquivado em" v={format(new Date(snapshot.archived_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })} />
                  <KV k="purga programada" v={`${format(new Date(snapshot.purge_after), 'dd/MM/yyyy', { locale: ptBR })} (${formatDistanceToNow(new Date(snapshot.purge_after), { locale: ptBR, addSuffix: true })})`} />
                </SnapshotSection>

                <SnapshotSection title="Snapshot do Perfil">
                  <pre className="text-xs bg-muted/50 rounded p-3 overflow-auto max-h-72">
                    {JSON.stringify(snapshot.profile_snapshot, null, 2)}
                  </pre>
                </SnapshotSection>

                {Object.entries(snapshot.content_snapshot || {}).map(([k, v]) => (
                  <SnapshotSection key={k} title={`Conteúdo · ${k} ${Array.isArray(v) ? `(${v.length})` : ''}`}>
                    <pre className="text-xs bg-muted/50 rounded p-3 overflow-auto max-h-72">
                      {JSON.stringify(v, null, 2)}
                    </pre>
                  </SnapshotSection>
                ))}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SnapshotSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="font-semibold mb-2 text-sm">{title}</h3>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function KV({ k, v }: { k: string; v: any }) {
  return (
    <div className="flex gap-2 text-xs">
      <span className="text-muted-foreground w-32 shrink-0">{k}:</span>
      <span className="font-mono break-all">{v ?? '—'}</span>
    </div>
  );
}

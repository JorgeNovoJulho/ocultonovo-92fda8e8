/**
 * AdminRoomChatLogsPage — Histórico e arquivos de chat das salas (Master Admin).
 *
 * - Mensagens vivas ficam disponíveis por 30 dias em oculto_aura_room_messages
 *   (limpeza automática diária via cron + RPC archive_aura_room_chats_30d).
 * - Conversas com >30 dias são compactadas para um arquivo TXT por sala,
 *   armazenado em oculto_aura_room_chat_archives (period_start/period_end).
 * - Esta página permite filtrar por sala, visualizar e exportar como .txt.
 */
import { useEffect, useMemo, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabaseExternal';
import { useIsMasterAdmin } from '@/hooks/useUserRoles';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Archive, Download, RefreshCw, MessagesSquare, Eye, Shield, Clock } from 'lucide-react';
import { toast } from 'sonner';

interface ArchiveRow {
  id: string;
  room_slug: string;
  period_start: string;
  period_end: string;
  message_count: number;
  byte_size: number;
  content: string;
  created_at: string;
}

interface LiveStat {
  room_slug: string;
  message_count: number;
  oldest: string | null;
  newest: string | null;
}

function fmtDate(iso: string) {
  try { return new Date(iso).toLocaleString('pt-BR'); } catch { return iso; }
}
function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function downloadTxt(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function AdminRoomChatLogsPage() {
  const { data: isMaster = false, isLoading: roleLoading } = useIsMasterAdmin();
  const [archives, setArchives] = useState<ArchiveRow[]>([]);
  const [liveStats, setLiveStats] = useState<LiveStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState<ArchiveRow | null>(null);
  const [running, setRunning] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [archRes, liveRes] = await Promise.all([
      supabase
        .from('oculto_aura_room_chat_archives')
        .select('id, room_slug, period_start, period_end, message_count, byte_size, content, created_at')
        .order('period_end', { ascending: false })
        .limit(500),
      (supabase as any).rpc('aura_room_chat_live_stats'),
    ]);
    if (archRes.error) {
      toast.error('Erro ao carregar arquivos: ' + archRes.error.message);
    } else {
      setArchives((archRes.data || []) as ArchiveRow[]);
    }
    if (!liveRes.error && Array.isArray(liveRes.data)) {
      setLiveStats(liveRes.data as LiveStat[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (isMaster) void fetchAll();
  }, [isMaster, fetchAll]);

  const runArchiveNow = async () => {
    setRunning(true);
    try {
      const { data, error } = await (supabase as any).rpc('archive_aura_room_chats_30d');
      if (error) throw error;
      toast.success(`Arquivamento executado. Arquivos gerados: ${data?.archives_created ?? 0}. Mensagens removidas: ${data?.messages_purged ?? 0}.`);
      await fetchAll();
    } catch (err: any) {
      toast.error('Falha ao arquivar: ' + (err?.message ?? String(err)));
    } finally {
      setRunning(false);
    }
  };

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return archives;
    return archives.filter((a) => a.room_slug.toLowerCase().includes(q));
  }, [archives, filter]);

  if (roleLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Verificando permissões…</div>;
  }
  if (!isMaster) {
    return (
      <div className="p-6">
        <Card className="p-6 text-center">
          <Shield className="mx-auto mb-2 h-8 w-8 text-rose-400" />
          <div className="font-bold">Acesso restrito</div>
          <div className="mt-1 text-sm text-muted-foreground">Apenas Master Admin pode acessar o histórico de salas.</div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-black">
            <Archive className="h-6 w-6 text-fuchsia-400" />
            Histórico de Salas — Logs do Oculto
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            As conversas das salas ficam vivas por <b>30 dias</b>. Após esse período, são
            empacotadas automaticamente num arquivo <b>.txt</b> por sala/período, removidas
            do chat e ficam permanentemente disponíveis aqui para consulta e auditoria.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchAll} disabled={loading}>
            <RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Atualizar
          </Button>
          <Button size="sm" onClick={runArchiveNow} disabled={running}>
            <Clock className={`mr-1.5 h-4 w-4 ${running ? 'animate-spin' : ''}`} />
            {running ? 'Arquivando…' : 'Forçar arquivamento agora'}
          </Button>
        </div>
      </header>

      {/* Estatísticas vivas (mensagens ainda dentro da janela de 30 dias) */}
      <Card className="p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-bold">
          <MessagesSquare className="h-4 w-4 text-emerald-400" />
          Mensagens vivas (≤ 30 dias) — {liveStats.reduce((a, s) => a + s.message_count, 0).toLocaleString('pt-BR')} mensagens em {liveStats.length} salas
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {liveStats.map((s) => (
            <div key={s.room_slug} className="rounded-lg border border-border bg-card/50 p-2.5 text-xs">
              <div className="font-bold">{s.room_slug}</div>
              <div className="mt-0.5 text-muted-foreground">
                {s.message_count.toLocaleString('pt-BR')} mensagens
              </div>
              {s.oldest && (
                <div className="mt-0.5 text-[10px] text-muted-foreground/70">
                  {fmtDate(s.oldest)} → {s.newest ? fmtDate(s.newest) : '—'}
                </div>
              )}
            </div>
          ))}
          {liveStats.length === 0 && (
            <div className="col-span-full text-center text-xs text-muted-foreground">
              Nenhuma mensagem viva no momento.
            </div>
          )}
        </div>
      </Card>

      {/* Arquivos */}
      <div className="flex items-center gap-2">
        <Input
          placeholder="Filtrar por nome da sala…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="max-w-sm"
        />
        <span className="text-xs text-muted-foreground">{filtered.length} arquivo(s)</span>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1fr_1.3fr]">
        <Card className="p-0">
          <ScrollArea className="h-[60vh]">
            <ul className="divide-y divide-border">
              {loading && (
                <li className="p-4 text-sm text-muted-foreground">Carregando…</li>
              )}
              {!loading && filtered.length === 0 && (
                <li className="p-6 text-center text-sm text-muted-foreground">
                  Nenhum arquivo de chat ainda. O primeiro arquivo será gerado quando
                  houver mensagens com mais de 30 dias.
                </li>
              )}
              {filtered.map((a) => (
                <li
                  key={a.id}
                  className={`flex cursor-pointer items-center justify-between gap-2 p-3 transition-colors hover:bg-accent/40 ${
                    selected?.id === a.id ? 'bg-accent/60' : ''
                  }`}
                  onClick={() => setSelected(a)}
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-bold">{a.room_slug}</div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">
                      {fmtDate(a.period_start)} → {fmtDate(a.period_end)}
                    </div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground/80">
                      {a.message_count.toLocaleString('pt-BR')} msgs · {fmtBytes(a.byte_size)}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={(e) => { e.stopPropagation(); setSelected(a); }}
                      title="Visualizar"
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        const fn = `chat_${a.room_slug}_${a.period_start.slice(0,10)}_${a.period_end.slice(0,10)}.txt`;
                        downloadTxt(fn, a.content);
                      }}
                      title="Baixar .txt"
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </ScrollArea>
        </Card>

        <Card className="flex flex-col p-0">
          {selected ? (
            <>
              <div className="flex items-center justify-between gap-2 border-b border-border p-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-bold">{selected.room_slug}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {fmtDate(selected.period_start)} → {fmtDate(selected.period_end)} · {selected.message_count} msgs · {fmtBytes(selected.byte_size)}
                  </div>
                </div>
                <Button
                  size="sm"
                  onClick={() => {
                    const fn = `chat_${selected.room_slug}_${selected.period_start.slice(0,10)}_${selected.period_end.slice(0,10)}.txt`;
                    downloadTxt(fn, selected.content);
                  }}
                >
                  <Download className="mr-1.5 h-4 w-4" /> Baixar .txt
                </Button>
              </div>
              <ScrollArea className="h-[55vh]">
                <pre className="whitespace-pre-wrap break-words p-4 font-mono text-[11.5px] leading-relaxed text-foreground/90">
                  {selected.content}
                </pre>
              </ScrollArea>
            </>
          ) : (
            <div className="grid h-full min-h-[40vh] place-items-center p-8 text-center text-sm text-muted-foreground">
              Selecione um arquivo à esquerda para visualizar o conteúdo.
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

/**
 * ProductionLaunchLogCard — exibe o histórico de aprovações, reversões e
 * tentativas de transição para produção (mock e real). Lê da tabela
 * production_launch_log via Supabase externo. Realtime.
 */
import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { History, Loader2, ShieldAlert, RotateCcw, CheckCheck, Square, CheckSquare } from 'lucide-react';
import { supabase } from '@/lib/supabaseExternal';
import { subscribeTable } from '@/lib/realtimeBus';
import { cn } from '@/lib/utils';

interface LogRow {
  id: string;
  event_type: string;
  actor: string | null;
  target_key: string | null;
  prev_value: any;
  new_value: any;
  reason: string | null;
  created_at: string;
}

const EVENT_META: Record<string, { label: string; icon: any; tone: string }> = {
  attempt_blocked:           { label: 'Tentativa bloqueada',     icon: ShieldAlert, tone: 'border-rose-500/40 bg-rose-500/10 text-rose-300' },
  transition_to_production:  { label: 'Entrou em PRODUÇÃO',      icon: CheckCheck,  tone: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' },
  revert_to_beta:            { label: 'Reverteu de produção',    icon: RotateCcw,   tone: 'border-amber-500/40 bg-amber-500/10 text-amber-300' },
  item_completed:            { label: 'Item concluído',          icon: CheckSquare, tone: 'border-emerald-500/30 bg-emerald-500/5 text-emerald-300' },
  item_uncompleted:          { label: 'Item reaberto',           icon: Square,      tone: 'border-muted-foreground/30 bg-muted/30 text-muted-foreground' },
};

function fmt(iso: string) {
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  } catch { return iso; }
}

export function ProductionLaunchLogCard() {
  const [rows, setRows] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const { data, error } = await supabase
      .from('production_launch_log')
      .select('id,event_type,actor,target_key,prev_value,new_value,reason,created_at')
      .order('created_at', { ascending: false })
      .limit(100);
    if (!error && data) setRows(data as LogRow[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const unsub = subscribeTable('production_launch_log', () => load());
    return () => { unsub(); };
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="h-5 w-5 text-primary" />
          Log de produção
        </CardTitle>
        <CardDescription>
          Aprovações, reversões e tentativas bloqueadas. Auditável: <code>production_launch_log</code> com RLS admin.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
          </div>
        ) : rows.length === 0 ? (
          <p className="text-xs text-muted-foreground py-4 text-center">
            Nenhum evento registrado ainda.
          </p>
        ) : (
          <ScrollArea className="h-72 rounded-md border border-border/40">
            <ul className="divide-y divide-border/40">
              {rows.map((r) => {
                const meta = EVENT_META[r.event_type] ?? { label: r.event_type, icon: History, tone: '' };
                const Icon = meta.icon;
                return (
                  <li key={r.id} className="px-3 py-2 text-xs">
                    <div className="flex items-start gap-2">
                      <Badge variant="outline" className={cn('shrink-0 gap-1 text-[10px]', meta.tone)}>
                        <Icon className="h-3 w-3" />
                        {meta.label}
                      </Badge>
                      <div className="flex-1 min-w-0">
                        {r.target_key && (
                          <p className="font-mono text-foreground truncate">{r.target_key}</p>
                        )}
                        {r.reason && (
                          <p className="text-muted-foreground leading-snug mt-0.5 line-clamp-2">
                            {r.reason}
                          </p>
                        )}
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {fmt(r.created_at)}
                          {r.actor && (
                            <> · <span className="font-mono">{r.actor.slice(0, 8)}…</span></>
                          )}
                        </p>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}

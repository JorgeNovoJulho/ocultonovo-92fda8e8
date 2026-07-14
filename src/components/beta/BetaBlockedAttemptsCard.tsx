/**
 * BetaBlockedAttemptsCard — histórico (mock, localStorage) de tentativas
 * de CTAs bloqueados pelo Beta. Permite ao admin auditar quando e qual
 * CTA foi impedido. Nunca contém dados de cobrança — apenas o intent.
 */
import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { History, Trash2, Inbox } from 'lucide-react';
import { useBetaLockLog } from '@/hooks/useBetaLockLog';
import { toast } from 'sonner';

const FEATURE_COLOR: Record<string, string> = {
  monetization:    'bg-rose-500/15 text-rose-300 border-rose-500/40',
  subscriptions:   'bg-purple-500/15 text-purple-300 border-purple-500/40',
  paid_content:    'bg-amber-500/15 text-amber-300 border-amber-500/40',
  vip_channels:    'bg-yellow-500/15 text-yellow-300 border-yellow-500/40',
  payouts:         'bg-blue-500/15 text-blue-300 border-blue-500/40',
  safe_meetings:   'bg-emerald-500/15 text-emerald-300 border-emerald-500/40',
  whatsapp:        'bg-green-500/15 text-green-300 border-green-500/40',
  real_experiences:'bg-cyan-500/15 text-cyan-300 border-cyan-500/40',
};

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  } catch { return iso; }
}

export function BetaBlockedAttemptsCard() {
  const { entries, clear } = useBetaLockLog();

  const grouped = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of entries) map.set(e.feature, (map.get(e.feature) ?? 0) + 1);
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [entries]);

  const handleClear = () => {
    clear();
    toast.success('Histórico de tentativas bloqueadas limpo.');
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="h-5 w-5 text-primary" />
          Histórico de CTAs bloqueados (mock)
        </CardTitle>
        <CardDescription>
          Registro local das tentativas de acionar CTAs travados durante o Beta. Útil para auditar
          quando e qual CTA foi impedido. Armazenado apenas no navegador deste admin.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Resumo por feature */}
        {grouped.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {grouped.map(([feature, count]) => (
              <Badge
                key={feature}
                variant="outline"
                className={FEATURE_COLOR[feature] ?? 'bg-muted text-muted-foreground'}
              >
                {feature} · {count}
              </Badge>
            ))}
          </div>
        )}

        {entries.length === 0 ? (
          <div className="rounded-md border border-dashed border-border/60 py-6 flex flex-col items-center gap-2 text-center">
            <Inbox className="h-6 w-6 text-muted-foreground" />
            <p className="text-xs text-muted-foreground max-w-[28ch]">
              Nenhuma tentativa bloqueada registrada ainda. Quando um CTA travado for clicado, ele aparece aqui.
            </p>
          </div>
        ) : (
          <ScrollArea className="h-64 rounded-md border border-border/40">
            <ul className="divide-y divide-border/40">
              {entries.map((e) => (
                <li key={e.id} className="px-3 py-2 flex items-start gap-3 text-xs">
                  <Badge
                    variant="outline"
                    className={`shrink-0 text-[10px] ${FEATURE_COLOR[e.feature] ?? ''}`}
                  >
                    {e.feature}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground truncate">{e.label}</p>
                    <p className="text-muted-foreground truncate">
                      <span className="font-mono">{e.source}</span> · {e.route}
                    </p>
                  </div>
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap pt-0.5">
                    {formatTime(e.at)}
                  </span>
                </li>
              ))}
            </ul>
          </ScrollArea>
        )}

        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] text-muted-foreground">
            Total: <strong className="text-foreground">{entries.length}</strong> (máx. 200)
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={handleClear}
            disabled={entries.length === 0}
            className="gap-1.5"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Limpar histórico
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

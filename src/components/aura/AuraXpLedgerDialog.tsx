/**
 * AuraXpLedgerDialog — Painel com o histórico do ledger de XP de interação.
 * Mostra créditos/débitos do usuário, com nome do outro lado e tipo da ação.
 */
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { useAuraXpLedger, labelForAction } from '@/hooks/useAuraXpLedger';
import { ArrowDownLeft, ArrowUpRight, History } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

function formatRelative(iso: string): string {
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'agora';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h`;
  const d = Math.floor(h / 24);
  return `${d} d`;
}

export function AuraXpLedgerDialog({ open, onOpenChange }: Props) {
  const { data: entries = [], isLoading } = useAuraXpLedger(80);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="gap-0 p-0 w-[calc(100vw-1rem)] sm:max-w-lg grid grid-rows-[auto_minmax(0,1fr)]"
        style={{ maxHeight: 'calc(100svh - env(safe-area-inset-top) - env(safe-area-inset-bottom) - 1rem)' }}
      >
        <DialogHeader className="px-5 pt-5 pb-3 pr-10">
          <DialogTitle className="flex items-center gap-2 text-base">
            <History className="h-5 w-5 text-amber-400" />
            Histórico de XP de Aura
          </DialogTitle>
          <DialogDescription className="text-xs">
            Quem interagiu com você e quanto XP entrou ou saiu da sua aura.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="px-3 pb-4">
          {isLoading && (
            <div className="px-2 py-8 text-center text-sm text-muted-foreground">Carregando…</div>
          )}
          {!isLoading && entries.length === 0 && (
            <div className="px-2 py-8 text-center text-sm text-muted-foreground">
              Nenhuma movimentação ainda. Interaja no feed para ver o histórico aqui.
            </div>
          )}
          <ul className="space-y-1.5">
            {entries.map((e) => {
              const isIn = e.direction === 'in';
              const isOut = e.direction === 'out';
              const positive = e.delta > 0;
              const otherUser = isIn ? e.actor_username : e.receiver_username;
              return (
                <li
                  key={e.id}
                  className="flex items-center gap-3 rounded-lg border border-border/40 bg-card/40 px-3 py-2"
                >
                  <div
                    className={cn(
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                      positive ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400',
                    )}
                  >
                    {positive ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-medium truncate">{labelForAction(e.action_key)}</span>
                      <Badge variant="outline" className="text-[10px] py-0 px-1.5">
                        {isIn ? 'recebido' : isOut ? 'enviado' : 'próprio'}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {otherUser ? `@${otherUser}` : '—'} · {formatRelative(e.created_at)}
                    </div>
                  </div>
                  <div
                    className={cn(
                      'shrink-0 text-sm font-bold tabular-nums',
                      positive ? 'text-emerald-400' : 'text-rose-400',
                    )}
                  >
                    {positive ? '+' : ''}{e.delta} XP
                  </div>
                </li>
              );
            })}
          </ul>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

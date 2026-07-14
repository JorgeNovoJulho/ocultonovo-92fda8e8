import { useAuraAttentionsHistory } from '@/hooks/useAuraAttention';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Megaphone, ArrowUpRight, ArrowDownLeft, Zap, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

function timeAgo(iso: string): string {
  const d = new Date(iso).getTime();
  const diff = Math.max(0, Date.now() - d) / 1000;
  if (diff < 60) return 'agora';
  if (diff < 3600) return `${Math.floor(diff / 60)} min atrás`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h atrás`;
  return `${Math.floor(diff / 86400)} d atrás`;
}

/** Histórico de atenções (enviadas e recebidas). Flat UI, lista compacta. */
export function AuraAttentionsHistory() {
  const { items, loading } = useAuraAttentionsHistory(30);
  const navigate = useNavigate();

  return (
    <section className="rounded-xl border border-amber-400/30 bg-gradient-to-br from-amber-500/12 via-yellow-500/6 to-orange-600/5 p-3 space-y-2 shadow-[0_0_24px_-12px_hsl(45_95%_55%/0.45)]">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          <Megaphone className="h-3.5 w-3.5 text-amber-400" />
          Histórico de atenções
        </div>
        {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
      </div>

      {items.length === 0 && !loading ? (
        <p className="text-[11px] text-muted-foreground">
          Você ainda não enviou nem recebeu chamadas de atenção. Toque em uma aura e use{' '}
          <strong className="text-amber-200">Chamar atenção</strong> para destacar seu interesse.
        </p>
      ) : (
        <ul className="space-y-1.5 max-h-[320px] overflow-y-auto scrollbar-hide">
          {items.map((it) => {
            const sent = it.direction === 'sent';
            return (
              <li
                key={it.id}
                className="flex items-center gap-2 rounded-lg bg-background/40 p-1.5 cursor-pointer hover:bg-background/70 transition-colors"
                onClick={() => {
                  if (it.other_username) navigate(`/u/${it.other_username}`);
                }}
              >
                <Avatar className="h-8 w-8 shrink-0">
                  <AvatarImage src={it.other_avatar || undefined} alt={it.other_name || ''} loading="lazy" />
                  <AvatarFallback className="text-[10px]">
                    {(it.other_name || it.other_username || '?').slice(0, 1).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    {sent ? (
                      <ArrowUpRight className="h-3 w-3 text-amber-300 shrink-0" />
                    ) : (
                      <ArrowDownLeft className="h-3 w-3 text-fuchsia-300 shrink-0" />
                    )}
                    <p className="text-xs font-medium truncate">
                      {sent ? 'Para' : 'De'}{' '}
                      <span className="text-foreground">
                        {it.other_name || it.other_username || 'usuário'}
                      </span>
                    </p>
                  </div>
                  <p className="text-[10px] text-muted-foreground">{timeAgo(it.created_at)}</p>
                </div>
                <Badge
                  variant="outline"
                  className={`gap-0.5 text-[10px] ${sent ? 'border-amber-400/40 text-amber-200' : 'border-fuchsia-400/40 text-fuchsia-200'}`}
                >
                  <Zap className="h-2.5 w-2.5" />
                  {sent ? '−' : '+'}{it.cost_xp} XP
                </Badge>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

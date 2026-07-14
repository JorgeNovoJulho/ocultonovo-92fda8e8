import { useRareConnections } from '@/hooks/useRareConnections';
import { Sparkles, Crown, RefreshCw, Star } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

/**
 * Lista de "Conexões Raras" no layout premium (cards).
 * Inclui botão "Atualizar conexões" para recarregar manualmente o ranking.
 */
export function RareConnectionsRow() {
  const { items, loading, refresh } = useRareConnections(8);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-2 min-w-0">
          <Sparkles className="h-4 w-4 text-fuchsia-400 shrink-0" />
          <h3 className="text-sm font-semibold truncate">Conexões raras</h3>
          <span className="text-[11px] text-muted-foreground hidden sm:inline">
            ranking premium ativo agora
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-[11px] gap-1"
          onClick={() => refresh()}
          disabled={loading}
          aria-label="Atualizar conexões"
        >
          <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      </div>

      {!loading && items.length === 0 ? (
        <div className="text-xs text-muted-foreground px-1 py-2">
          Nenhuma conexão rara ativa no momento.
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          {items.map((p) => {
            const name = p.username ? `@${p.username}` : 'Aura';
            const isVip = p.plan_type === 'vip';
            const target = p.username ? `/perfil/${p.username}` : `/perfil/${p.user_id}`;
            const ringClass = isVip ? 'ring-amber-400/80' : 'ring-fuchsia-400/70';
            return (
              <Link
                key={p.user_id}
                to={target}
                className={`group relative flex items-center gap-2 rounded-xl border border-border/60 bg-card/60 p-2 transition-colors hover:bg-card`}
              >
                <div className={`relative h-12 w-12 shrink-0 rounded-full overflow-hidden ring-2 ${ringClass}`}>
                  {p.avatar_url ? (
                    <img
                      src={p.avatar_url}
                      alt={name}
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="h-full w-full bg-muted flex items-center justify-center text-base font-bold">
                      {name[0]?.toUpperCase()}
                    </div>
                  )}
                  {isVip && (
                    <Crown className="absolute -top-1 -right-1 h-4 w-4 text-amber-400 fill-amber-400" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold truncate">{name}</p>
                  <p className="text-[10px] text-muted-foreground flex items-center gap-1 truncate">
                    <Star className="h-2.5 w-2.5 text-amber-400 fill-amber-400" />
                    nível {p.aura_level} · {isVip ? 'VIP' : 'Premium'}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

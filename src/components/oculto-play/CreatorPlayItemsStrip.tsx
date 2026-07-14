/**
 * CreatorPlayItemsStrip — Etapa 58
 * Grade dos itens publicados por um criador no Oculto Play.
 * Aparece no perfil do criador (Canal VIP) como aba/seção dedicada.
 */
import { Play, Lock, Crown } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useOcultoPlayItemsByCreator } from '@/hooks/useOcultoPlayExtras';
import { cn } from '@/lib/utils';

interface Props { creatorId: string; className?: string; limit?: number; }

export function CreatorPlayItemsStrip({ creatorId, className, limit = 24 }: Props) {
  const { data = [], isLoading } = useOcultoPlayItemsByCreator(creatorId, limit);

  if (isLoading) {
    return (
      <div className="grid grid-cols-3 gap-1 sm:gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="aspect-[3/4] rounded-lg bg-muted/30 animate-pulse" />
        ))}
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="rounded-xl border border-border/40 p-6 text-center">
        <Play className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">
          Este criador ainda não publicou nada no Oculto Play.
        </p>
      </div>
    );
  }

  return (
    <div className={cn('grid grid-cols-3 gap-1 sm:gap-2', className)}>
      {data.map((it) => (
        <Link
          key={it.id}
          to={`/play/p/${it.id}`}
          className="relative aspect-[3/4] rounded-lg overflow-hidden bg-muted/30 border border-border/30 hover:border-fuchsia-400/60 transition-colors group"
        >
          {it.thumb_url ? (
            <img
              src={it.thumb_url}
              alt={it.title ?? ''}
              loading="lazy"
              className="absolute inset-0 w-full h-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 grid place-items-center text-muted-foreground">
              <Play className="h-6 w-6" />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" />
          {it.visibility === 'vip' && (
            <div className="absolute top-1 right-1 grid place-items-center h-5 w-5 rounded-full bg-amber-400/95 text-black">
              <Crown className="h-3 w-3" />
            </div>
          )}
          {it.visibility === 'premium' && (
            <div className="absolute top-1 right-1 grid place-items-center h-5 w-5 rounded-full bg-fuchsia-500/90 text-white">
              <Lock className="h-3 w-3" />
            </div>
          )}
          <div className="absolute bottom-1 left-1 right-1 text-[10px] text-white">
            <div className="truncate font-medium">{it.title || 'Sem título'}</div>
            <div className="truncate opacity-75">
              {it.view_count} views · {it.like_count} curtidas
            </div>
          </div>
          <div className="absolute inset-0 grid place-items-center opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="grid place-items-center h-10 w-10 rounded-full bg-fuchsia-500/80 text-white">
              <Play className="h-5 w-5 fill-current" />
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}

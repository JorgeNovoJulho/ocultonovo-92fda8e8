/**
 * VolteParaVerPanel — "Volte para Ver"
 *
 * Lista ganchos personalizados de retorno (oculto_return_hooks).
 * Usuário pode dispensar individualmente. Marca como vista ao clicar.
 * Só renderiza se OCULTO PLAY estiver ativo e houver hooks pendentes.
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  History, X, MessageCircle, Heart, Bookmark, UserPlus, Headphones, Play,
  Trophy, Flame, ChevronRight,
} from 'lucide-react';
import { useOcultoPlayEnabled } from '@/hooks/useOcultoPlayEnabled';
import {
  useOcultoReturnHooks,
  useOcultoReturnHookActions,
  type OcultoReturnHook,
} from '@/hooks/useOcultoReturnHooks';

const HOOK_META: Record<string, { Icon: any; tint: string }> = {
  comment_reply:        { Icon: MessageCircle, tint: 'text-sky-300' },
  content_liked:        { Icon: Heart,         tint: 'text-rose-300' },
  content_saved:        { Icon: Bookmark,      tint: 'text-amber-300' },
  new_from_following:   { Icon: UserPlus,      tint: 'text-fuchsia-300' },
  continue_listening:   { Icon: Headphones,    tint: 'text-emerald-300' },
  continue_watching:    { Icon: Play,          tint: 'text-violet-300' },
  topic_hot:            { Icon: Flame,         tint: 'text-orange-300' },
  challenge_pending:    { Icon: Trophy,        tint: 'text-yellow-300' },
};

function fallbackLinkFor(h: OcultoReturnHook): string {
  if (h.link) return h.link;
  if (h.item_id) return `/play/p/${h.item_id}`;
  return '/oculto-play';
}

export interface VolteParaVerPanelProps {
  maxItems?: number;
  className?: string;
}

export function VolteParaVerPanel({ maxItems = 6, className }: VolteParaVerPanelProps) {
  const navigate = useNavigate();
  const { isEnabledForCurrentUser } = useOcultoPlayEnabled();
  const { data, isLoading } = useOcultoReturnHooks(maxItems);
  const { dismiss, markSeen } = useOcultoReturnHookActions();

  // Lista local com remoção otimista — clique/X tira o item imediatamente,
  // sem depender do retorno da RPC.
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => new Set());
  useEffect(() => { setHiddenIds(new Set()); }, [data]);

  const items = useMemo<OcultoReturnHook[]>(
    () => (data ?? []).filter((h) => !hiddenIds.has(h.id)),
    [data, hiddenIds],
  );

  if (!isEnabledForCurrentUser) return null;
  if (isLoading) return null;
  if (items.length === 0) return null;

  const hideLocal = (id: string) => setHiddenIds((s) => {
    const next = new Set(s); next.add(id); return next;
  });

  const onOpen = (h: OcultoReturnHook) => {
    if (h.status === 'pending') {
      try { markSeen.mutate(h.id); } catch { /* noop */ }
    }
    hideLocal(h.id);
    navigate(fallbackLinkFor(h));
  };

  const onDismiss = (h: OcultoReturnHook) => {
    hideLocal(h.id);
    try { dismiss.mutate(h.id); } catch { /* noop */ }
  };

  return (
    <section
      aria-label="Volte para Ver"
      className={['rounded-xl border border-violet-500/20 bg-violet-500/[0.04] p-3', className ?? ''].join(' ')}
    >
      <header className="flex items-center gap-2 mb-2">
        <History className="h-4 w-4 text-violet-300" />
        <h3 className="text-xs font-semibold uppercase tracking-wide text-violet-200">
          Volte para ver
        </h3>
        <span className="text-[10px] text-muted-foreground hidden sm:inline">
          — coisas esperando você
        </span>
      </header>

      <ul className="space-y-1.5">
        {items.map((h) => {
          const meta = HOOK_META[h.hook_type] ?? { Icon: ChevronRight, tint: 'text-muted-foreground' };
          const { Icon, tint } = meta;
          return (
            <li
              key={h.id}
              className="group flex items-center gap-2 rounded-lg border border-border/40 bg-card/60 px-2.5 py-2 hover:bg-card transition-colors"
            >
              <div className={`grid place-items-center h-7 w-7 rounded-md bg-black/30 ${tint} shrink-0`}>
                <Icon className="h-3.5 w-3.5" />
              </div>
              <button
                type="button"
                onClick={() => onOpen(h)}
                className="min-w-0 flex-1 text-left"
              >
                <p className="text-xs font-medium truncate">{h.title}</p>
                {h.description && (
                  <p className="text-[11px] text-muted-foreground line-clamp-1">{h.description}</p>
                )}
              </button>
              {h.priority > 0 && h.status === 'pending' && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-500/20 text-violet-200 shrink-0">
                  novo
                </span>
              )}
              <button
                type="button"
                onClick={() => onDismiss(h)}
                aria-label="Dispensar"
                className="grid place-items-center h-6 w-6 rounded-full text-muted-foreground hover:text-foreground hover:bg-white/5 shrink-0"
              >
                <X className="h-3 w-3" />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default VolteParaVerPanel;

/**
 * PlayReactionsBar — Etapa 34
 *
 * Barra compacta de reações rápidas (emoji) usada no card do feed Oculto Play.
 * - Mostra apenas os emojis com contagem > 0 + um botão "+" para abrir o picker
 *   com todas as 5 opções.
 * - Toggle otimista via `useItemReactions`.
 */
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useItemReactions,
  PLAY_EMOJI_META,
  PLAY_EMOJI_ORDER,
  type PlayEmoji,
} from '@/hooks/useOcultoPlayReactions';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface Props {
  itemId: string;
  /** Mostra também os botões 0-count? Default false. */
  showAll?: boolean;
  className?: string;
}

export function PlayReactionsBar({ itemId, showAll = false, className }: Props) {
  const { reactions, toggle } = useItemReactions(itemId);
  const [pickerOpen, setPickerOpen] = useState(false);

  const map = new Map<PlayEmoji, { count: number; mine: boolean }>();
  for (const r of reactions) map.set(r.emoji, { count: r.count, mine: r.mine });

  const visible = showAll
    ? PLAY_EMOJI_ORDER
    : PLAY_EMOJI_ORDER.filter(e => (map.get(e)?.count ?? 0) > 0);

  const handleToggle = (emoji: PlayEmoji) => {
    toggle.mutate(emoji);
  };

  return (
    <div className={cn('flex flex-wrap items-center gap-1', className)}>
      {visible.map(emoji => {
        const meta = PLAY_EMOJI_META[emoji];
        const info = map.get(emoji);
        const count = info?.count ?? 0;
        const mine = !!info?.mine;
        return (
          <button
            key={emoji}
            type="button"
            onClick={(e) => { e.stopPropagation(); handleToggle(emoji); }}
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] leading-none',
              'bg-black/55 text-white backdrop-blur-sm transition-colors',
              mine && 'bg-fuchsia-500/70 ring-1 ring-fuchsia-200/60',
            )}
            title={`${meta.label}${count ? ` · ${count}` : ''}`}
            aria-pressed={mine}
          >
            <span className="text-[12px] leading-none">{meta.glyph}</span>
            {count > 0 && <span className="font-semibold">{count}</span>}
          </button>
        );
      })}

      {/* Picker para adicionar uma nova reação */}
      <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            onClick={(e) => e.stopPropagation()}
            className="grid place-items-center h-5 w-5 rounded-full bg-black/55 text-white hover:bg-fuchsia-500/70"
            title="Reagir"
          >
            <Plus className="h-3 w-3" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          side="top"
          align="end"
          className="w-auto p-1.5 flex gap-1"
          onClick={(e) => e.stopPropagation()}
        >
          {PLAY_EMOJI_ORDER.map(emoji => {
            const meta = PLAY_EMOJI_META[emoji];
            const mine = !!map.get(emoji)?.mine;
            return (
              <button
                key={emoji}
                type="button"
                onClick={() => { handleToggle(emoji); setPickerOpen(false); }}
                className={cn(
                  'h-9 w-9 grid place-items-center rounded-md text-xl hover:bg-muted transition-colors',
                  mine && 'bg-fuchsia-500/20 ring-1 ring-fuchsia-500/40',
                )}
                title={meta.label}
                aria-pressed={mine}
              >
                {meta.glyph}
              </button>
            );
          })}
        </PopoverContent>
      </Popover>
    </div>
  );
}

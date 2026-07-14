/**
 * CommunityReactionsBar — barra de reações estilo WhatsApp para tópicos/respostas.
 *
 * - Chips mostram apenas reações já usadas (com contador). Highlight em "minha".
 * - Botão "+" abre Popover com TODAS as categorias de emoji do WhatsApp,
 *   navegação por abas + scroll invisível dentro de cada categoria.
 * - Reação é o próprio emoji (string). Backend aceita qualquer TEXT.
 */
import { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { SmilePlus } from 'lucide-react';
import { useToggleReaction, type ReactionSummary } from '@/hooks/useCommunities';
import {
  WHATSAPP_EMOJI_CATEGORIES,
  QUICK_REACTION_EMOJIS,
} from '@/lib/whatsappEmojis';
import { cn } from '@/lib/utils';

interface Props {
  communityId: string;
  topicId?: string;
  replyId?: string;
  summary?: ReactionSummary;
  disabled?: boolean;
  size?: 'sm' | 'xs';
}

export function CommunityReactionsBar({
  communityId,
  topicId,
  replyId,
  summary,
  disabled,
  size = 'sm',
}: Props) {
  const toggle = useToggleReaction();
  const counts = summary?.counts ?? {};
  const mine = summary?.mine ?? new Set<string>();

  // Chips visíveis: união de (com contagem > 0) ∪ (minhas).
  const visibleEmojis = Array.from(
    new Set<string>([
      ...Object.keys(counts).filter((k) => (counts[k] ?? 0) > 0),
      ...Array.from(mine),
    ]),
  );

  const handle = (emoji: string) => {
    if (disabled) return;
    toggle.mutate({
      community_id: communityId,
      topic_id: topicId ?? null,
      reply_id: replyId ?? null,
      reaction: emoji,
    });
  };

  const chipBase =
    size === 'xs'
      ? 'h-6 px-1.5 text-[10px] gap-0.5'
      : 'h-7 px-2 text-xs gap-1';

  const [activeCat, setActiveCat] = useState(WHATSAPP_EMOJI_CATEGORIES[0].id);
  const cat =
    WHATSAPP_EMOJI_CATEGORIES.find((c) => c.id === activeCat) ??
    WHATSAPP_EMOJI_CATEGORIES[0];

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {visibleEmojis.map((emoji) => {
        const isMine = mine.has(emoji);
        return (
          <button
            key={emoji}
            type="button"
            onClick={() => handle(emoji)}
            disabled={disabled}
            title={emoji}
            className={cn(
              'inline-flex items-center rounded-full border transition-colors',
              chipBase,
              isMine
                ? 'border-fuchsia-500/60 bg-fuchsia-500/10 text-fuchsia-200'
                : 'border-border bg-card/60 text-muted-foreground hover:bg-accent',
              disabled && 'opacity-50 cursor-not-allowed',
            )}
          >
            <span className="leading-none">{emoji}</span>
            <span className="leading-none">{counts[emoji] ?? 0}</span>
          </button>
        );
      })}

      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            className={cn(
              'inline-flex items-center justify-center rounded-full border border-border bg-card/60 text-muted-foreground hover:bg-accent transition-colors',
              size === 'xs' ? 'h-6 w-6' : 'h-7 w-7',
              disabled && 'opacity-50 cursor-not-allowed',
            )}
            title="Reagir"
            aria-label="Reagir"
          >
            <SmilePlus className={size === 'xs' ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
          </button>
        </PopoverTrigger>
        <PopoverContent
          side="top"
          align="start"
          className="w-[320px] max-w-[92vw] p-0 overflow-hidden"
        >
          {/* Linha de acesso rápido */}
          <div className="flex items-center gap-1 px-2 py-2 border-b border-border/60">
            {QUICK_REACTION_EMOJIS.map((emoji) => {
              const isMine = mine.has(emoji);
              return (
                <button
                  key={`q-${emoji}`}
                  type="button"
                  onClick={() => handle(emoji)}
                  className={cn(
                    'h-9 w-9 flex items-center justify-center text-xl rounded-md transition-transform hover:scale-110',
                    isMine && 'bg-fuchsia-500/10 ring-1 ring-fuchsia-500/40',
                  )}
                >
                  {emoji}
                </button>
              );
            })}
          </div>

          {/* Grid da categoria ativa */}
          <div
            className="max-h-[260px] overflow-y-auto p-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
          >
            <div className="grid grid-cols-8 gap-1">
              {cat.emojis.map((emoji, i) => {
                const isMine = mine.has(emoji);
                return (
                  <button
                    key={`${cat.id}-${i}-${emoji}`}
                    type="button"
                    onClick={() => handle(emoji)}
                    className={cn(
                      'h-9 w-9 flex items-center justify-center text-xl rounded-md transition-transform hover:scale-110',
                      isMine && 'bg-fuchsia-500/10 ring-1 ring-fuchsia-500/40',
                    )}
                    title={emoji}
                  >
                    {emoji}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Tabs de categoria */}
          <div className="flex items-center gap-0.5 border-t border-border/60 bg-card/60 px-1 py-1 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            {WHATSAPP_EMOJI_CATEGORIES.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setActiveCat(c.id)}
                title={c.label}
                aria-label={c.label}
                className={cn(
                  'h-8 w-8 shrink-0 flex items-center justify-center text-base rounded-md transition-colors',
                  activeCat === c.id
                    ? 'bg-fuchsia-500/15 ring-1 ring-fuchsia-500/40'
                    : 'hover:bg-accent text-muted-foreground',
                )}
              >
                {c.icon}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

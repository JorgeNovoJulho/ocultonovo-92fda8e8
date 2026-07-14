/**
 * InterestIconPicker — popover com biblioteca grande de emojis/ícones
 * agrupados por categoria, usada nas linhas e no formulário de adição
 * de Tags de Interesse no admin.
 */
import { useMemo, useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface Props {
  value: string;
  onChange: (icon: string) => void;
  kind?: 'social' | 'adult';
  className?: string;
}

const ICONS: Record<string, string[]> = {
  Populares: ['🏷️','✨','🔥','💖','⭐','🎉','🌟','💫','🎯','🆕','💎','👑','🎭','🪄'],
  'Música & Arte': ['🎸','🎹','🥁','🎤','🎧','🎶','🎵','🎻','🎺','🎷','🪗','🪕','🎨','🖌️','🖼️','📸','📷','🎬','🎥','🎞️','📽️','🎭','💃','🕺','🩰','🎙️'],
  Esportes: ['⚽','🏀','🏈','⚾','🥎','🎾','🏐','🏉','🥏','🎱','🪀','🏓','🏸','🥊','🥋','🎽','⛳','🥌','🛹','🛼','🛷','⛸️','🛼','🚴','🏊','🤸','🤾','🏋️','💪','🏆','🥇','🏅','🎖️'],
  Natureza: ['🌳','🌲','🌴','🌵','🌿','🍀','🍃','🌺','🌸','🌼','🌻','🌷','💐','🌹','🌾','🪴','🌍','🌎','🌏','🌙','☀️','⭐','🌟','⛅','🌈','❄️','🔥','💧','🌊','🏞️','🏔️','⛰️','🗻','🌋','🏜️','🏖️','⛺','🥾','🧗'],
  'Comida & Bebida': ['🍕','🍔','🍟','🌭','🥪','🌮','🌯','🥙','🥗','🍣','🍜','🍝','🍱','🍤','🍩','🍪','🎂','🍰','🧁','🍦','🍨','🍫','🍿','🥨','🥯','🥐','🥖','🧀','🥩','🍗','🥚','🍳','☕','🍵','🧃','🥤','🧋','🍺','🍻','🍷','🍸','🍹','🍾','🥂','🥃','🍶'],
  'Viagem & Lugares': ['✈️','🚗','🚕','🚙','🚌','🚎','🏎️','🚓','🚑','🚒','🚐','🛻','🚚','🚛','🚲','🛵','🏍️','🛺','🚂','🚆','🚇','🚊','🚉','⛵','🚤','🛳️','⛴️','🛥️','🚢','🛸','🚀','🗺️','🗽','🗼','🏰','🏯','🏟️','🎡','🎢','🎠','🏖️','🏝️','🏜️','🏔️','🗻','🏛️'],
  Tecnologia: ['💻','🖥️','⌨️','🖱️','🖨️','📱','📲','📞','☎️','📟','📠','📺','📻','⏱️','⏲️','⏰','🕰️','⌚','📡','🔋','🔌','💾','💿','📀','🎮','🕹️','🤖','👾','🛰️','🔭','🔬'],
  Trabalho: ['💼','📊','📈','📉','📋','📌','📎','✂️','📐','📏','🖇️','🗂️','🗃️','🗄️','📁','📂','🗞️','📰','📚','📖','📓','📔','📕','📗','📘','📙','📒','🖊️','🖋️','✒️','📝','✏️','📅','📆','🗓️','💡','🧠','🎓','🏫'],
  'Animais & Pets': ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🐔','🦄','🐴','🦓','🦒','🐘','🦛','🐪','🐫','🐎','🐑','🐐','🐕','🐈','🦮','🐦','🦜','🦢','🦩','🐠','🐬','🐳','🐢','🐍','🦖','🐾'],
  'Pessoas & Corpos': ['👶','🧒','👦','👧','🧑','👨','👩','🧓','👴','👵','💪','🦵','🦶','👀','👁️','👄','👅','👂','👃','🧠','🫀','🫁','👫','👬','👭','💏','💑','👨‍👩‍👧','👶','🤰','🤱','🫂'],
  Sentimentos: ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💖','💕','💞','💓','💗','💘','💝','💟','♥️','💌','💍','🌹','😍','🥰','😘','😻','💋','🥺','🤝','🤗','🤲','🙏'],
  Símbolos: ['♈','♉','♊','♋','♌','♍','♎','♏','♐','♑','♒','♓','⚜️','🔱','♾️','☯️','☮️','✝️','☪️','🕉️','🕎','🔯','🛐','⚛️','♻️','✅','❌','⭕','‼️','❓','❗','💯','🆗','🆒','🆕','🆙','🆓'],
  Festa: ['🎉','🎊','🎂','🎁','🎈','🎀','🪅','🪩','✨','🎆','🎇','🧨','🪔','🕯️','🎃','🎄','🎅','🤶','🧑‍🎄','☃️','⛄','🎋','🎍','🎎','🎏','🎐','🎑'],
  'Modo +18': ['🔥','💋','💦','💎','👀','🌈','👑','🔒','🔓','⛓️','🪢','🧸','🎭','🩱','👙','👠','👗','🩲','🩳','🧴','🛁','🛏️','💃','🕺','🍑','🍒','🍆','🌶️','🧊','💍','🎲','🪞','🪄','🩰','🎀','🪩'],
  'Alienígenas & UFO': ['👽','🛸','🛰️','🚀','🌌','🌠','☄️','🪐','🌑','🌒','🌓','🌔','🌕','🌖','🌗','🌘','🌚','🌝','🌞','⭐','🌟','✨','💫','🔭','📡','🌀','🌐','🛜','👁️','🟢','🛎️','🗿'],
  'Espiritualidade': ['🕉️','☯️','☮️','✝️','☪️','🕎','🔯','🛐','⚛️','✡️','☸️','🧘','🙏','😇','👼','🕊️','🪬','📿','🕯️','🔮','🪞','🌅','🌄','🪷','🪔','📖','📜','⛩️','🛕','⛪','🕌','🕍','🛐'],
  'Energias & Chakras': ['⚡','✨','💫','🌟','🔆','♻️','🌀','🌈','💎','💠','🔵','🟣','🟡','🟢','🔴','🟠','⚪','⚫','🟤','🫧','🪩','💥','🌊','🔥','💧','🌬️','🌪️','☀️','🌙','🌌','🧿','🪬'],
  'Terapias & Bem-estar': ['🧘','🧖','💆','💇','🪷','🌿','🍃','🌱','🌾','🌻','🍵','🫖','🛁','🛌','🛀','💧','🫧','🕯️','🪔','📿','🔔','🎐','🎵','🎶','🥗','🥑','🍯','🪴','💚','💛','🧠','❤️‍🩹','🩺','💊','🌸'],
  'Magia & Bruxaria': ['🔮','🪄','🧙','🧙‍♀️','🧙‍♂️','🧚','🧚‍♀️','🧚‍♂️','🧛','🧛‍♀️','🧛‍♂️','🧞','🧞‍♀️','🧞‍♂️','🧟','🪬','🧿','🃏','🎴','🀄','🕯️','📜','📖','🗝️','🔑','🍀','🌙','⭐','✨','💫','🌟','⚗️','🧪','🪞','👁️','🦉','🐈‍⬛','🕸️','🕷️','🐍','🐉'],
  'Fantasia & Mitologia': ['🐉','🦄','🧝','🧝‍♀️','🧝‍♂️','🧞','🧜','🧜‍♀️','🧜‍♂️','🧌','🧙','👑','⚔️','🗡️','🛡️','🏹','🪓','🏰','🐲','🦅','🦉','🦋','🌳','🍄','🌲','🌟','✨','💫','🔥','❄️','🌊','⚡','🪐','🌠','🗺️','📜','🎭','🎲','🃏'],
};



const ALL_FLAT = Array.from(new Set(Object.values(ICONS).flat()));

export function InterestIconPicker({ value, onChange, kind = 'social', className }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return ICONS;
    const out: Record<string, string[]> = {};
    for (const [cat, list] of Object.entries(ICONS)) {
      const m = list.filter((e) => e.includes(q) || cat.toLowerCase().includes(q));
      if (m.length) out[cat] = m;
    }
    return out;
  }, [search]);

  function pick(emoji: string) {
    onChange(emoji);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn(
            'h-10 w-12 shrink-0 p-0 text-xl',
            'border-primary/40 bg-card/60 hover:bg-primary/10',
            className,
          )}
          title="Escolher ícone"
          aria-label="Escolher ícone"
        >
          {value || (kind === 'adult' ? '🔥' : '🏷️')}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[320px] max-h-[420px] overflow-hidden p-0 bg-background border-border"
      >
        <div className="p-2 border-b border-border/50 space-y-2">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar ícone…"
            className="h-8 text-xs"
            autoFocus={false}
          />
          <div className="flex items-center gap-2">
            <Input
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder="Personalizado"
              maxLength={4}
              className="h-8 w-24 text-center text-sm"
            />
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-8 px-2 text-xs"
              onClick={() => onChange('')}
            >
              Limpar
            </Button>
          </div>
        </div>
        <div className="overflow-y-auto max-h-[320px] p-2 space-y-3">
          {Object.entries(filtered).map(([cat, list]) => (
            <div key={cat}>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1 px-1">
                {cat}
              </p>
              <div className="grid grid-cols-8 gap-1">
                {list.map((emoji, i) => (
                  <button
                    key={`${cat}-${i}-${emoji}`}
                    type="button"
                    onClick={() => pick(emoji)}
                    className={cn(
                      'h-8 w-8 rounded-md text-lg flex items-center justify-center',
                      'hover:bg-primary/20 transition-colors',
                      value === emoji && 'bg-primary/30 ring-1 ring-primary',
                    )}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          ))}
          {!Object.keys(filtered).length && (
            <p className="text-xs text-center text-muted-foreground py-6">
              Nenhum ícone encontrado.
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export const INTEREST_ICON_LIBRARY = ALL_FLAT;

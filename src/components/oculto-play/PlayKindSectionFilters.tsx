/**
 * PlayKindSectionFilters — barra de filtros leve para a seção "Áudios" / "Vídeos".
 * Auto-alimenta as tags com base nos itens carregados; expõe sort por data,
 * filtro de criador e busca por título.
 */
import { useMemo, useState } from 'react';
import { Search, ArrowDownNarrowWide, ArrowUpNarrowWide, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { OcultoPlayItem } from '@/hooks/useOcultoPlayContent';

export type PlaySectionSort = 'newest' | 'oldest';

export interface PlaySectionFilterState {
  query: string;
  tag: string | null;
  creatorId: string | null;
  sort: PlaySectionSort;
}

const norm = (s: string | null | undefined) =>
  (s ?? '').toString().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

export function applyPlaySectionFilters(
  items: OcultoPlayItem[],
  state: PlaySectionFilterState,
): OcultoPlayItem[] {
  const q = norm(state.query);
  const tag = state.tag ? norm(state.tag) : null;
  let out = items.filter((it) => {
    if (state.creatorId && it.author_id !== state.creatorId) return false;
    if (tag) {
      const tags = [...(it.tags || []), ...((it as any).genre_tags || [])].map(norm);
      if (!tags.includes(tag)) return false;
    }
    if (q) {
      const hay = [it.title, it.caption, it.composer_name, it.author_username, it.author_display_name]
        .map(norm).join(' • ');
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  out = out.sort((a, b) => {
    const ta = new Date(a.published_at).getTime();
    const tb = new Date(b.published_at).getTime();
    return state.sort === 'newest' ? tb - ta : ta - tb;
  });
  return out;
}

interface Props {
  items: OcultoPlayItem[];
  state: PlaySectionFilterState;
  onChange: (next: PlaySectionFilterState) => void;
  defaultTagsOpen?: boolean;
}

export function PlayKindSectionFilters({ items, state, onChange, defaultTagsOpen = false }: Props) {
  const [open, setOpen] = useState(defaultTagsOpen);

  const tags = useMemo(() => {
    const map = new Map<string, number>();
    for (const it of items) {
      const all = [...(it.tags || []), ...((it as any).genre_tags || [])];
      for (const raw of all) {
        const t = (raw ?? '').toString().trim();
        if (!t) continue;
        map.set(t, (map.get(t) ?? 0) + 1);
      }
    }
    return [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30)
      .map(([name, count]) => ({ name, count }));
  }, [items]);

  const creators = useMemo(() => {
    const map = new Map<string, { id: string; name: string; count: number }>();
    for (const it of items) {
      if (!it.author_id) continue;
      const name = it.author_display_name || it.author_username || 'Criador';
      const prev = map.get(it.author_id);
      if (prev) prev.count += 1;
      else map.set(it.author_id, { id: it.author_id, name, count: 1 });
    }
    return [...map.values()].sort((a, b) => b.count - a.count);
  }, [items]);

  const hasActive = !!(state.query || state.tag || state.creatorId || state.sort !== 'newest');

  return (
    <div className="mb-2 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[180px] max-w-[320px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="search"
            value={state.query}
            onChange={(e) => onChange({ ...state, query: e.target.value })}
            placeholder="Buscar título, composer, criador…"
            className="w-full h-8 pl-8 pr-7 text-xs rounded-full bg-card/40 border border-border/50 focus:border-fuchsia-400/60 focus:outline-none placeholder:text-muted-foreground/70"
          />
          {state.query && (
            <button
              type="button"
              onClick={() => onChange({ ...state, query: '' })}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Limpar"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={() => onChange({ ...state, sort: state.sort === 'newest' ? 'oldest' : 'newest' })}
          className="shrink-0 inline-flex items-center gap-1 px-2.5 h-8 rounded-full text-[11px] font-medium border border-border/50 bg-card/40 text-muted-foreground hover:text-foreground"
          title="Alternar ordem por data"
        >
          {state.sort === 'newest'
            ? <><ArrowDownNarrowWide className="h-3 w-3" /> Mais novos</>
            : <><ArrowUpNarrowWide className="h-3 w-3" /> Mais antigos</>}
        </button>

        {creators.length > 1 && (
          <select
            value={state.creatorId ?? ''}
            onChange={(e) => onChange({ ...state, creatorId: e.target.value || null })}
            className="shrink-0 h-8 px-2 text-[11px] rounded-full bg-card/40 border border-border/50 text-foreground focus:outline-none"
          >
            <option value="">Todos os criadores</option>
            {creators.map((c) => (
              <option key={c.id} value={c.id}>{c.name} ({c.count})</option>
            ))}
          </select>
        )}

        {tags.length > 0 && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className={cn(
              'shrink-0 px-2.5 h-8 rounded-full text-[11px] font-medium border',
              open || state.tag
                ? 'bg-fuchsia-500/20 border-fuchsia-400/60 text-fuchsia-100'
                : 'bg-card/40 border-border/50 text-muted-foreground hover:text-foreground',
            )}
          >
            Estilos {state.tag ? `· ${state.tag}` : `(${tags.length})`}
          </button>
        )}

        {hasActive && (
          <button
            type="button"
            onClick={() => onChange({ query: '', tag: null, creatorId: null, sort: 'newest' })}
            className="shrink-0 text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2"
          >
            Limpar
          </button>
        )}
      </div>

      {open && tags.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {tags.map((t) => {
            const active = state.tag && norm(state.tag) === norm(t.name);
            return (
              <button
                key={t.name}
                type="button"
                onClick={() => onChange({ ...state, tag: active ? null : t.name })}
                className={cn(
                  'shrink-0 px-2.5 h-7 rounded-full text-[11px] font-medium border whitespace-nowrap transition-colors',
                  active
                    ? 'bg-fuchsia-500/25 border-fuchsia-400/60 text-fuchsia-100'
                    : 'bg-card/40 border-border/50 text-muted-foreground hover:text-foreground hover:bg-muted/40',
                )}
              >
                #{t.name}
                <span className="ml-1 text-[9px] opacity-70">{t.count}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

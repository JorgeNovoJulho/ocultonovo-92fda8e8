/**
 * Banner "Em destaque" da seção Filmes, em carrossel.
 *
 * Sequência de cada rodada:
 *   1) os 5 filmes postados mais recentemente (do mais novo ao mais antigo);
 *   2) 10 sugestões sorteadas entre os demais títulos.
 * Ao fim das 15 trocas, monta uma nova rodada (novo sorteio) e recomeça.
 *
 * Leve para celulares fracos (Realme C55 e abaixo): só uma imagem visível, a
 * próxima é pré-carregada, e o carrossel para quando sai da tela ou a aba fica
 * em segundo plano.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Play } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { OcultoPlayItem } from '@/hooks/useOcultoPlayContent';

const NEWEST = 5;
const SUGGESTIONS = 10;
const INTERVAL_MS = 7000;

const ts = (it: OcultoPlayItem) => {
  const v = Date.parse((it as any).published_at || (it as any).created_at || '');
  return Number.isFinite(v) ? v : 0;
};

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function MoviesHeroCarousel({ items, onOpen }: { items: OcultoPlayItem[]; onOpen: (it: OcultoPlayItem) => void }) {
  const sorted = useMemo(() => [...items].sort((a, b) => ts(b) - ts(a)), [items]);
  // Só remonta a sequência quando a lista de filmes realmente muda (não a cada
  // atualização de contadores em tempo real).
  const signature = useMemo(() => sorted.map((i) => i.id).join(','), [sorted]);
  const sortedRef = useRef(sorted);
  sortedRef.current = sorted;

  const build = useCallback(() => {
    const list = sortedRef.current;
    return [...list.slice(0, NEWEST), ...shuffle(list.slice(NEWEST)).slice(0, SUGGESTIONS)];
  }, []);

  const [state, setState] = useState(() => ({ seq: build(), pos: 0 }));
  useEffect(() => { setState({ seq: build(), pos: 0 }); }, [signature, build]);

  const next = useCallback(() => {
    setState((s) => (s.pos + 1 >= s.seq.length ? { seq: build(), pos: 0 } : { ...s, pos: s.pos + 1 }));
  }, [build]);
  const prev = useCallback(() => {
    setState((s) => ({ ...s, pos: s.pos > 0 ? s.pos - 1 : Math.max(0, s.seq.length - 1) }));
  }, []);

  // Pausa fora da tela / aba oculta / enquanto o usuário interage.
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(true);
  const [hover, setHover] = useState(false);
  const [tabVisible, setTabVisible] = useState(() => typeof document === 'undefined' || !document.hidden);
  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.25 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    const on = () => setTabVisible(!document.hidden);
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, []);

  const total = state.seq.length;
  const running = total > 1 && visible && tabVisible && !hover;
  useEffect(() => {
    if (!running) return;
    const t = window.setTimeout(next, INTERVAL_MS);
    return () => window.clearTimeout(t);
  }, [running, next, state.pos, state.seq]);

  const hero = state.seq[state.pos] ?? sorted[0];
  const upcoming = state.seq[state.pos + 1];
  // Pré-carrega a próxima capa para a troca não piscar.
  useEffect(() => {
    if (!upcoming?.thumb_url) return;
    const img = new Image();
    img.decoding = 'async';
    img.src = upcoming.thumb_url;
  }, [upcoming?.thumb_url]);

  // Deslizar com o dedo no celular.
  const touchX = useRef<number | null>(null);

  if (!hero) return null;
  const isNew = state.pos < NEWEST;

  return (
    <div
      ref={rootRef}
      className="group relative aspect-video w-full overflow-hidden rounded-xl bg-black"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onTouchStart={(e) => { touchX.current = e.touches[0]?.clientX ?? null; }}
      onTouchEnd={(e) => {
        const start = touchX.current;
        touchX.current = null;
        if (start == null) return;
        const dx = (e.changedTouches[0]?.clientX ?? start) - start;
        if (Math.abs(dx) > 45) (dx < 0 ? next : prev)();
      }}
    >
      {hero.thumb_url && (
        <img
          key={hero.id}
          src={hero.thumb_url}
          alt=""
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover animate-in fade-in duration-500"
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
      <div key={`txt-${hero.id}`} className="absolute inset-x-0 bottom-0 p-3 pb-6 sm:p-5 sm:pb-8 animate-in fade-in slide-in-from-bottom-1 duration-500">
        <p className="text-[10px] font-bold uppercase tracking-widest text-red-400">
          {isNew ? 'Em destaque · Novo' : 'Sugestão para você'}
        </p>
        <p className="mt-0.5 line-clamp-2 text-lg font-extrabold text-white sm:text-2xl">{hero.title || 'Filme'}</p>
        {hero.caption && <p className="mt-1 line-clamp-2 max-w-xl text-xs text-white/80">{hero.caption}</p>}
        <button
          type="button"
          onClick={() => onOpen(hero)}
          className="mt-2.5 inline-flex items-center gap-1.5 rounded-md bg-white px-4 py-2 text-sm font-bold text-black active:scale-95 transition"
        >
          <Play className="h-4 w-4 fill-current" /> Assistir
        </button>
      </div>

      {total > 1 && (
        <>
          <button
            type="button"
            onClick={prev}
            aria-label="Anterior"
            className="absolute left-2 top-1/2 z-10 hidden h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-black/55 text-white opacity-0 ring-1 ring-white/20 transition group-hover:opacity-100 hover:bg-black/80 [@media(hover:hover)]:grid"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={next}
            aria-label="Próximo"
            className="absolute right-2 top-1/2 z-10 hidden h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-black/55 text-white opacity-0 ring-1 ring-white/20 transition group-hover:opacity-100 hover:bg-black/80 [@media(hover:hover)]:grid"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
          <div className="absolute inset-x-0 bottom-2 flex justify-center gap-1">
            {state.seq.map((it, i) => (
              <button
                key={`${it.id}-${i}`}
                type="button"
                aria-label={`Ir para ${i + 1}`}
                onClick={() => setState((s) => ({ ...s, pos: i }))}
                className={cn(
                  'h-1.5 rounded-full transition-all',
                  i === state.pos ? 'w-5 bg-white' : 'w-1.5 bg-white/40 hover:bg-white/70',
                  i === NEWEST && 'ml-1.5',
                )}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * HojeNoOcultoPanel — "Hoje no Oculto"
 *
 * Painel leve de entrada. Cards mostram a curadoria do dia (RPC oculto_play_today_list).
 * Só renderiza se OCULTO PLAY estiver ativo para o usuário.
 * Não carrega mídia pesada — apenas thumbs.
 *
 * Props.compact => versão para Modo Simples / topo de feed.
 */
import { useMemo, useState, useEffect } from 'react';
import { Star, X, Play, Headphones, Image as ImageIcon, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useOcultoPlayEnabled } from '@/hooks/useOcultoPlayEnabled';
import { useOcultoPlayToday, type OcultoPlayTodayPick } from '@/hooks/useOcultoPlayGamification';

const DISMISS_KEY = 'oculto:hoje-dismiss';

function isDismissedToday(): boolean {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const day = new Date().toISOString().slice(0, 10);
    return raw === day;
  } catch { return false; }
}

function dismissToday() {
  try { localStorage.setItem(DISMISS_KEY, new Date().toISOString().slice(0, 10)); } catch {}
}

function kindIcon(kind: string) {
  switch (kind) {
    case 'audio': return Headphones;
    case 'meme':
    case 'image': return ImageIcon;
    default: return Play;
  }
}

export interface HojeNoOcultoPanelProps {
  compact?: boolean;
  maxItems?: number;
  className?: string;
}

export function HojeNoOcultoPanel({ compact = false, maxItems = 8, className }: HojeNoOcultoPanelProps) {
  const navigate = useNavigate();
  const { isEnabledForCurrentUser } = useOcultoPlayEnabled();
  const [dismissed, setDismissed] = useState<boolean>(false);

  useEffect(() => { setDismissed(isDismissedToday()); }, []);

  const { data, isLoading } = useOcultoPlayToday();

  const items = useMemo<OcultoPlayTodayPick[]>(
    () => (data ?? []).slice(0, Math.max(1, maxItems)),
    [data, maxItems]
  );

  if (!isEnabledForCurrentUser) return null;
  if (dismissed) return null;
  if (isLoading) return null;
  if (!items.length) return null;

  const onDismiss = () => { dismissToday(); setDismissed(true); };
  const onOpen = (id: string) => navigate(`/play/p/${id}`);

  return (
    <section
      aria-label="Hoje no Oculto"
      className={['rounded-xl border border-fuchsia-500/20 bg-fuchsia-500/[0.04] p-3', className ?? ''].join(' ')}
    >
      <header className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <Star className="h-4 w-4 text-amber-400 shrink-0" />
          <h3 className="text-xs font-semibold uppercase tracking-wide text-fuchsia-200 truncate">
            Hoje no Oculto
          </h3>
          <span className="text-[10px] text-muted-foreground hidden sm:inline">
            — selecionados para você
          </span>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dispensar"
          className="grid place-items-center h-7 w-7 rounded-full text-muted-foreground hover:text-foreground hover:bg-white/5"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </header>

      {compact ? (
        <ul className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {items.map((it) => {
            const Icon = kindIcon(it.kind);
            return (
              <li key={it.item_id} className="shrink-0">
                <button
                  type="button"
                  onClick={() => onOpen(it.item_id)}
                  className="group relative w-24 aspect-[3/4] rounded-lg overflow-hidden border border-border/40 bg-card"
                  title={it.title ?? it.caption ?? 'Abrir'}
                >
                  {it.thumb_url ? (
                    <img
                      src={it.thumb_url}
                      loading="lazy"
                      alt=""
                      className="absolute inset-0 w-full h-full object-cover opacity-90 group-hover:opacity-100"
                    />
                  ) : (
                    <div className="absolute inset-0 grid place-items-center text-muted-foreground">
                      <Icon className="h-5 w-5" />
                    </div>
                  )}
                  <div className="absolute inset-x-0 bottom-0 p-1 bg-gradient-to-t from-black/85 to-transparent">
                    <p className="text-[10px] text-white/95 line-clamp-1 text-left">
                      {it.title ?? it.caption ?? '—'}
                    </p>
                  </div>
                  <div className="absolute top-1 right-1 grid place-items-center h-5 w-5 rounded-full bg-black/60 text-white">
                    <Icon className="h-3 w-3" />
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          {items.map((it) => {
            const Icon = kindIcon(it.kind);
            return (
              <li key={it.item_id}>
                <button
                  type="button"
                  onClick={() => onOpen(it.item_id)}
                  className="group relative w-full aspect-[3/4] rounded-lg overflow-hidden border border-border/40 bg-card"
                  title={it.title ?? it.caption ?? 'Abrir'}
                >
                  {it.thumb_url ? (
                    <img
                      src={it.thumb_url}
                      loading="lazy"
                      alt=""
                      className="absolute inset-0 w-full h-full object-cover opacity-90 group-hover:opacity-100"
                    />
                  ) : (
                    <div className="absolute inset-0 grid place-items-center text-muted-foreground">
                      <Icon className="h-6 w-6" />
                    </div>
                  )}
                  <div className="absolute inset-x-0 bottom-0 p-1.5 bg-gradient-to-t from-black/85 to-transparent">
                    <p className="text-[11px] text-white/95 line-clamp-1 text-left">
                      {it.title ?? it.caption ?? '—'}
                    </p>
                    {it.note && (
                      <p className="text-[10px] text-fuchsia-200/90 line-clamp-1 text-left">{it.note}</p>
                    )}
                  </div>
                  <div className="absolute top-1.5 right-1.5 grid place-items-center h-6 w-6 rounded-full bg-black/60 text-white">
                    <Icon className="h-3 w-3" />
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex justify-end mt-2">
        <button
          type="button"
          onClick={() => navigate('/play')}
          className="text-[11px] inline-flex items-center gap-1 text-fuchsia-200 hover:text-fuchsia-100"
        >
          Ver tudo no Oculto Play <ChevronRight className="h-3 w-3" />
        </button>
      </div>
    </section>
  );
}

export default HojeNoOcultoPanel;

/**
 * PlayCaptionOverlay — Etapa 42
 *
 * Overlay client-side de legendas para o PlayUpNextPlayer.
 * - Botão CC com badge do idioma e popover de seleção (quando há 2+ faixas).
 * - Controle de offset (-2s / +2s) para correção de sincronia.
 * - Texto sincronizado sobreposto na parte inferior do player.
 *
 * O componente cuida do estado interno usando `useOcultoPlayCaptions`,
 * desabilitando o render nativo do <track> via `mode = 'disabled'` para
 * evitar duplicação visual quando há legendas embutidas pelo navegador.
 */
import { useEffect } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Captions as CaptionsIcon, Check, Minus, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useOcultoPlayCaptions } from '@/hooks/useOcultoPlayCaptions';
import type { PlayTrack } from '@/hooks/useOcultoPlayTracks';

interface Props {
  tracks: PlayTrack[];
  mediaRef: React.RefObject<HTMLVideoElement | HTMLAudioElement | null>;
  /** CC ligado/desligado (controlado pelo player). */
  enabled: boolean;
  onToggle: (next: boolean) => void;
}

export function PlayCaptionOverlayButton({ tracks, mediaRef, enabled, onToggle }: Props) {
  const subs = tracks.filter(t => t.kind === 'subtitles' || t.kind === 'captions');
  const { selectedLang, setLang, offset, setOffset, currentText, loading } =
    useOcultoPlayCaptions(tracks, mediaRef, enabled);

  // Desliga o render nativo do <track> para evitar duplicação
  useEffect(() => {
    const el = mediaRef.current as HTMLVideoElement | null;
    if (!el || !('textTracks' in el)) return;
    for (let i = 0; i < el.textTracks.length; i++) {
      const t = el.textTracks[i];
      if (t.kind === 'subtitles' || t.kind === 'captions') {
        t.mode = 'disabled';
      }
    }
  }, [mediaRef, tracks]);

  if (subs.length === 0) return null;

  const selectedLabel =
    subs.find(s => s.lang === selectedLang)?.label || selectedLang?.toUpperCase() || 'CC';

  return (
    <>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              'text-white hover:bg-white/10 relative',
              enabled && 'bg-white/15',
            )}
            title={enabled ? `Legendas (${selectedLabel})` : 'Ligar legendas'}
          >
            <CaptionsIcon className="h-5 w-5" />
            {enabled && selectedLang && (
              <span className="absolute -bottom-0.5 -right-0.5 text-[8px] font-bold bg-fuchsia-500 text-white rounded px-1 leading-tight">
                {selectedLang.slice(0, 2).toUpperCase()}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          className="w-60 p-2 bg-background/95 backdrop-blur border-border/60"
        >
          <div className="space-y-1">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground px-2 pt-1">
              Legendas
            </div>

            <button
              onClick={() => onToggle(false)}
              className={cn(
                'w-full flex items-center justify-between gap-2 text-sm px-2 py-1.5 rounded-md hover:bg-muted',
                !enabled && 'text-fuchsia-400 font-medium',
              )}
            >
              <span>Desligado</span>
              {!enabled && <Check className="h-3.5 w-3.5" />}
            </button>

            {subs.map(t => {
              const active = enabled && selectedLang === t.lang;
              return (
                <button
                  key={t.id}
                  onClick={() => { onToggle(true); setLang(t.lang); }}
                  className={cn(
                    'w-full flex items-center justify-between gap-2 text-sm px-2 py-1.5 rounded-md hover:bg-muted',
                    active && 'text-fuchsia-400 font-medium',
                  )}
                >
                  <span className="truncate">{t.label}</span>
                  <span className="flex items-center gap-1">
                    <span className="text-[10px] uppercase opacity-60">{t.lang}</span>
                    {active && <Check className="h-3.5 w-3.5" />}
                  </span>
                </button>
              );
            })}

            {enabled && (
              <div className="border-t border-border/40 mt-2 pt-2 px-2">
                <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
                  <span>Sincronia</span>
                  <span className="font-mono text-foreground">
                    {offset > 0 ? '+' : ''}{offset.toFixed(1)}s
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline" size="sm"
                    className="h-7 flex-1"
                    onClick={() => setOffset(offset - 0.5)}
                    title="Adiantar legenda 0.5s"
                  >
                    <Minus className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost" size="sm"
                    className="h-7 px-2 text-[10px]"
                    onClick={() => setOffset(0)}
                    title="Zerar offset"
                  >
                    Reset
                  </Button>
                  <Button
                    variant="outline" size="sm"
                    className="h-7 flex-1"
                    onClick={() => setOffset(offset + 0.5)}
                    title="Atrasar legenda 0.5s"
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
                {loading && (
                  <div className="text-[10px] text-muted-foreground mt-1 text-center">
                    Carregando…
                  </div>
                )}
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>

      {/* Overlay sincronizado */}
      {enabled && currentText && (
        <div className="pointer-events-none absolute inset-x-0 bottom-28 z-20 px-4 flex justify-center">
          <div className="max-w-3xl text-center">
            <span
              className="inline-block whitespace-pre-line text-white text-base md:text-lg leading-snug font-medium px-3 py-1 rounded bg-black/65"
              style={{ textShadow: '0 1px 2px rgba(0,0,0,0.9)' }}
            >
              {currentText}
            </span>
          </div>
        </div>
      )}
    </>
  );
}

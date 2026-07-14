/**
 * PlayPlaybackControls — Etapa 41
 *
 * Popover de controles avançados de reprodução para o PlayUpNextPlayer:
 * - Velocidade (0.5x..2x)
 * - Sleep timer (5/15/30/60 min ou desligado)
 * Sincroniza com Supabase via useOcultoPlayPlaybackPrefs.
 */
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Gauge, MoonStar } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useOcultoPlayPlaybackPrefs,
  PLAYBACK_RATES,
  SLEEP_OPTIONS,
} from '@/hooks/useOcultoPlayPlaybackPrefs';

interface Props {
  mediaRef: React.RefObject<HTMLVideoElement | HTMLAudioElement>;
  onSleep?: () => void;
}

export function PlayPlaybackControls({ mediaRef, onSleep }: Props) {
  const { prefs, setRate, setSleep } = useOcultoPlayPlaybackPrefs(mediaRef, onSleep);

  const rateLabel = prefs.playback_rate === 1 ? '1x' : `${prefs.playback_rate}x`;
  const sleepActive = prefs.sleep_minutes > 0;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            'text-white hover:bg-white/10',
            (prefs.playback_rate !== 1 || sleepActive) && 'bg-fuchsia-500/30',
          )}
          title="Velocidade e Sleep Timer"
         aria-label="Ação">
          <Gauge className="h-5 w-5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-64 p-3 bg-background/95 backdrop-blur border-border/60"
      >
        <div className="space-y-3">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold mb-2">
              <Gauge className="h-3.5 w-3.5 text-fuchsia-400" />
              Velocidade · <span className="text-fuchsia-400">{rateLabel}</span>
            </div>
            <div className="flex flex-wrap gap-1">
              {PLAYBACK_RATES.map(r => (
                <button
                  key={r}
                  onClick={() => setRate(r)}
                  className={cn(
                    'text-[11px] rounded-full px-2 py-1 border transition-colors',
                    prefs.playback_rate === r
                      ? 'bg-fuchsia-500 border-fuchsia-500 text-white'
                      : 'bg-muted/50 border-border hover:bg-muted',
                  )}
                >
                  {r === 1 ? '1x' : `${r}x`}
                </button>
              ))}
            </div>
          </div>

          <div className="border-t border-border/40 pt-3">
            <div className="flex items-center gap-2 text-xs font-semibold mb-2">
              <MoonStar className="h-3.5 w-3.5 text-fuchsia-400" />
              Sleep Timer{' '}
              {sleepActive && (
                <span className="text-fuchsia-400">· {prefs.sleep_minutes} min</span>
              )}
            </div>
            <div className="flex flex-wrap gap-1">
              {SLEEP_OPTIONS.map(m => (
                <button
                  key={m}
                  onClick={() => setSleep(m)}
                  className={cn(
                    'text-[11px] rounded-full px-2 py-1 border transition-colors',
                    prefs.sleep_minutes === m
                      ? 'bg-fuchsia-500 border-fuchsia-500 text-white'
                      : 'bg-muted/50 border-border hover:bg-muted',
                  )}
                >
                  {m === 0 ? 'Off' : `${m}m`}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground mt-2">
              Ao expirar, o player pausa automaticamente.
            </p>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

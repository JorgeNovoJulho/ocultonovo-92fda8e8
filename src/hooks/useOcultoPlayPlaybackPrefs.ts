/**
 * useOcultoPlayPlaybackPrefs — Etapa 41
 *
 * Carrega/salva preferências de playback (velocidade, sleep timer) no
 * Supabase externo. Aplica a velocidade no <video>/<audio> ref fornecido
 * e dispara onSleep() quando o tempo configurado expira.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseExternal';

export const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const;
export const SLEEP_OPTIONS = [0, 5, 15, 30, 60] as const;

export interface PlaybackPrefs {
  playback_rate: number;
  sleep_minutes: number;
  auto_sleep: boolean;
}

const DEFAULTS: PlaybackPrefs = { playback_rate: 1, sleep_minutes: 0, auto_sleep: false };

export function useOcultoPlayPlaybackPrefs(
  mediaRef: React.RefObject<HTMLVideoElement | HTMLAudioElement>,
  onSleep?: () => void,
) {
  const [prefs, setPrefs] = useState<PlaybackPrefs>(DEFAULTS);
  const [loaded, setLoaded] = useState(false);
  const sleepTimerRef = useRef<number | null>(null);
  const onSleepRef = useRef(onSleep);
  onSleepRef.current = onSleep;

  // Carregar do servidor
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data } = await supabase.rpc('oculto_play_get_playback_prefs');
        if (!alive) return;
        if (data) {
          setPrefs({
            playback_rate: Number((data as any).playback_rate) || 1,
            sleep_minutes: Number((data as any).sleep_minutes) || 0,
            auto_sleep: !!(data as any).auto_sleep,
          });
        }
      } catch {
        /* ignora */
      } finally {
        if (alive) setLoaded(true);
      }
    })();
    return () => { alive = false; };
  }, []);

  // Aplica velocidade ao media element
  useEffect(() => {
    const el = mediaRef.current;
    if (el) el.playbackRate = prefs.playback_rate;
  }, [prefs.playback_rate, mediaRef]);

  // Sleep timer
  useEffect(() => {
    if (sleepTimerRef.current) {
      window.clearTimeout(sleepTimerRef.current);
      sleepTimerRef.current = null;
    }
    if (prefs.sleep_minutes > 0) {
      sleepTimerRef.current = window.setTimeout(() => {
        const el = mediaRef.current;
        if (el) el.pause();
        onSleepRef.current?.();
      }, prefs.sleep_minutes * 60_000);
    }
    return () => {
      if (sleepTimerRef.current) window.clearTimeout(sleepTimerRef.current);
    };
  }, [prefs.sleep_minutes, mediaRef]);

  const save = useCallback(async (patch: Partial<PlaybackPrefs>) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    try {
      await supabase.rpc('oculto_play_save_playback_prefs', {
        p_playback_rate: next.playback_rate,
        p_sleep_minutes: next.sleep_minutes,
        p_auto_sleep: next.auto_sleep,
      });
    } catch {
      /* silencioso — UI já atualizou */
    }
  }, [prefs]);

  const setRate = useCallback((rate: number) => save({ playback_rate: rate }), [save]);
  const setSleep = useCallback((minutes: number) => save({ sleep_minutes: minutes }), [save]);
  const setAutoSleep = useCallback((v: boolean) => save({ auto_sleep: v }), [save]);

  return { prefs, loaded, setRate, setSleep, setAutoSleep };
}

/**
 * useMatchNotification — som + vibração quando ocorre um match.
 * Configurações vivem em `oculto_match_notification_settings` (singleton id=1)
 * e biblioteca de sons em `oculto_match_sounds`. Admin master gerencia em
 * /admin/match-notification.
 */
import { useEffect, useMemo, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';

export interface MatchSound {
  id: string;
  name: string;
  file_url: string;
  file_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
}

export interface MatchNotificationSettings {
  id: number;
  sound_enabled: boolean;
  vibration_enabled: boolean;
  volume: number;
  active_sound_id: string | null;
  vibration_pattern: number[];
  updated_at: string;
}

export function useMatchNotificationSettings() {
  return useQuery({
    queryKey: ['oculto_match_notification_settings'],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('oculto_match_notification_settings')
        .select('*')
        .eq('id', 1)
        .maybeSingle();
      if (error) throw error;
      return (data ?? {
        id: 1,
        sound_enabled: true,
        vibration_enabled: true,
        volume: 0.8,
        active_sound_id: null,
        vibration_pattern: [120, 60, 180, 60, 240],
      }) as MatchNotificationSettings;
    },
  });
}

export function useMatchSoundsLibrary() {
  return useQuery({
    queryKey: ['oculto_match_sounds'],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('oculto_match_sounds')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as MatchSound[];
    },
  });
}

/**
 * Retorna `playMatchAlert()` que toca o som configurado + vibra
 * (respeitando os toggles do painel admin master).
 */
export function useMatchNotification() {
  const { data: settings } = useMatchNotificationSettings();
  const { data: sounds } = useMatchSoundsLibrary();
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const activeUrl = useMemo(() => {
    if (!settings?.active_sound_id) return null;
    return sounds?.find((s) => s.id === settings.active_sound_id)?.file_url ?? null;
  }, [settings?.active_sound_id, sounds]);

  // Pré-carrega o áudio assim que conhecemos a URL ativa
  useEffect(() => {
    if (!activeUrl) {
      audioRef.current = null;
      return;
    }
    const a = new Audio(activeUrl);
    a.preload = 'auto';
    a.crossOrigin = 'anonymous';
    audioRef.current = a;
  }, [activeUrl]);

  const playMatchAlert = useCallback(async () => {
    const s = settings;
    if (!s) return;

    // 1) Som
    if (s.sound_enabled && audioRef.current) {
      try {
        audioRef.current.currentTime = 0;
        audioRef.current.volume = Math.max(0, Math.min(1, s.volume ?? 0.8));
        await audioRef.current.play();
      } catch {
        /* autoplay pode falhar sem interação prévia — sem ruído no console */
      }
    }

    // 2) Vibração (mobile / desktops com suporte)
    if (s.vibration_enabled && typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        const pattern = Array.isArray(s.vibration_pattern) && s.vibration_pattern.length > 0
          ? s.vibration_pattern
          : [120, 60, 180, 60, 240];
        navigator.vibrate(pattern as number[]);
      } catch {
        /* noop */
      }
    }
  }, [settings]);

  return { playMatchAlert, settings, activeSoundUrl: activeUrl };
}

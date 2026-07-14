/**
 * useOcultoPlayAccess — gate do OCULTO PLAY (Etapa 2).
 *
 * Fonte da verdade: RPC `can_access_oculto_play()` no Supabase EXTERNO.
 * Retorna `true` apenas para:
 *   - Admin Master (preview)
 *   - Usuários em `oculto_play_allowlist`
 *   - Quando `beta_open` ou `visible_to_users` estiverem ativos no config
 *
 * Enquanto o flag estiver desligado, NENHUM usuário comum verá nada.
 */
import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { subscribeTable } from '@/lib/realtimeBus';
import { useAuth } from '@/hooks/useAuth';
import { useIsMasterAdmin } from '@/hooks/useUserRoles';

export interface OcultoPlayConfig {
  id: string;
  enabled: boolean;
  visible_to_users: boolean;
  beta_open: boolean;
  short_videos_on: boolean;
  memes_on: boolean;
  audios_on: boolean;
  vip_teasers_on: boolean;
  communities_on: boolean;
  challenges_on: boolean;
  gamification_on: boolean;
  today_section_on: boolean;
  comeback_section_on: boolean;
  // Etapa 7 — áudio/MP3 (campos opcionais; defaults aplicados no client)
  allow_audio_mp3?: boolean | null;
  require_audio_rights_confirmation?: boolean | null;
  audio_authoral_only?: boolean | null;
  audio_legal_text?: string | null;
  max_audio_size_mb?: number | null;
  max_audio_duration_seconds?: number | null;
  notes: string | null;
  updated_at: string;
}

const ACCESS_KEY = ['oculto-play', 'access'];
const CONFIG_KEY = ['oculto-play', 'config'];

function accessCacheKey(userId?: string | null) {
  return userId ? `oculto-play:access-ok:${userId}` : null;
}

function rememberAccessOk(userId?: string | null) {
  const key = accessCacheKey(userId);
  if (!key || typeof window === 'undefined') return;
  try { window.sessionStorage.setItem(key, '1'); } catch { /* noop */ }
}

function forgetAccessOk(userId?: string | null) {
  const key = accessCacheKey(userId);
  if (!key || typeof window === 'undefined') return;
  try { window.sessionStorage.removeItem(key); } catch { /* noop */ }
}

function hadRecentAccessOk(userId?: string | null) {
  const key = accessCacheKey(userId);
  if (!key || typeof window === 'undefined') return false;
  try { return window.sessionStorage.getItem(key) === '1'; } catch { return false; }
}

export function useOcultoPlayAccess() {
  const qc = useQueryClient();
  const { user, loading: authLoading, authReady } = useAuth();
  const { data: isMaster, isLoading: masterLoading } = useIsMasterAdmin();

  const { data: canAccess, isLoading } = useQuery<boolean>({
    queryKey: [...ACCESS_KEY, user?.id ?? 'anon'],
    enabled: !!user?.id,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('can_access_oculto_play');
      if (error) return hadRecentAccessOk(user?.id) === true;
      if (data === true) {
        rememberAccessOk(user?.id);
        return true;
      }
      forgetAccessOk(user?.id);
      return false;
    },
  });

  useEffect(() => {
    const unsub = subscribeTable('oculto_play_config', () => {
      qc.invalidateQueries({ queryKey: ACCESS_KEY });
      qc.invalidateQueries({ queryKey: CONFIG_KEY });
    });
    return () => unsub();
  }, [qc]);

  const resolvedCanAccess = isMaster === true ? true : canAccess === true;

  return {
    // Master admin SEMPRE tem acesso (preview/upload/configuração)
    canAccess: resolvedCanAccess,
    loading: authLoading || !authReady || (!!user?.id && !resolvedCanAccess && (isLoading || masterLoading)),
  };
}

export function useOcultoPlayConfig() {
  const qc = useQueryClient();

  const query = useQuery<OcultoPlayConfig | null>({
    queryKey: CONFIG_KEY,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_oculto_play_config');
      if (error || !data) return null;
      return data as OcultoPlayConfig;
    },
  });

  useEffect(() => {
    const unsub = subscribeTable('oculto_play_config', () => {
      qc.invalidateQueries({ queryKey: CONFIG_KEY });
    });
    return () => unsub();
  }, [qc]);

  return query;
}

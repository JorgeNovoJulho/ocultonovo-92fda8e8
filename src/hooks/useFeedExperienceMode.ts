/**
 * useFeedExperienceMode — preferência do usuário entre
 * 'adult_only' (somente +18) e 'complete' (universo completo).
 *
 * Persiste em profiles.feed_experience_mode e sincroniza em tempo
 * real via o canal de realtime já habilitado para profiles.
 *
 * Atualização otimista: o setter aplica imediatamente no cache do
 * React Query e dispara o UPDATE no banco em background. O feed
 * reage instantaneamente, sem reload.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useProfile } from '@/hooks/useProfile';
import { useViewStore } from '@/store/useViewStore';

export type FeedExperienceMode = 'adult_only' | 'complete' | 'oculto_only';

const STORAGE_KEY = 'oculto:feedExperienceMode';
const MODE_EVENT = 'oculto:feedExperienceModeChanged';
const SYNC_STORAGE_KEY = 'oculto:feedExperienceMode:lastSync';
const SYNC_TTL_MS = 4000; // janela em que o badge ainda aparece após reload

const readStoredMode = (): FeedExperienceMode | null => {
  try {
    const raw = typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY) : null;
    return raw === 'adult_only' || raw === 'complete' || raw === 'oculto_only' ? raw : null;
  } catch {
    return null;
  }
};

const writeStoredMode = (mode: FeedExperienceMode) => {
  try { if (typeof window !== 'undefined') window.localStorage.setItem(STORAGE_KEY, mode); }
  catch { /* noop */ }
};

const readStoredSync = (): number | null => {
  try {
    if (typeof window === 'undefined') return null;
    const raw = window.localStorage.getItem(SYNC_STORAGE_KEY);
    if (!raw) return null;
    const ts = Number(raw);
    if (!Number.isFinite(ts)) return null;
    return Date.now() - ts <= SYNC_TTL_MS ? ts : null;
  } catch {
    return null;
  }
};

const writeStoredSync = (ts: number) => {
  try { if (typeof window !== 'undefined') window.localStorage.setItem(SYNC_STORAGE_KEY, String(ts)); }
  catch { /* noop */ }
};

export const FEED_MODE_SYNCED_EVENT = 'oculto:feedExperienceModeSynced';

export function useFeedExperienceMode() {
  const { profile, updateProfile, isUpdating } = useProfile() as any;
  const queryClient = useQueryClient();
  const storeMode = useViewStore((s) => s.feedExperienceMode);
  const setStoreMode = useViewStore((s) => s.setFeedExperienceMode);
  // Fonte da verdade local-first: Zustand (persistido) > localStorage > null.
  const [localMode, setLocalMode] = useState<FeedExperienceMode | null>(
    () => storeMode ?? readStoredMode()
  );
  const lastSyncedRef = useRef<FeedExperienceMode | null>(null);
  // Inicializa com o último sync persistido (se estiver dentro do TTL),
  // assim o badge ainda aparece logo após um reload.
  const [justSyncedAt, setJustSyncedAt] = useState<number | null>(() => readStoredSync());

  // Mantém localMode em sincronia com Zustand (hidratação assíncrona do persist)
  useEffect(() => {
    if (storeMode && storeMode !== localMode) {
      setLocalMode(storeMode);
      writeStoredMode(storeMode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeMode]);

  const rawMode = (profile as any)?.feed_experience_mode as
    | FeedExperienceMode
    | null
    | undefined;

  // Default seguro: 'complete' (não restringe), mas com fallback local.
  // Importante: alguns ambientes ainda não possuem profiles.feed_experience_mode;
  // nesse caso o UPDATE pode falhar e o cache do perfil fazer rollback. O modo
  // escolhido precisa continuar funcionando no frontend imediatamente.
  const mode: FeedExperienceMode = rawMode === 'adult_only' || rawMode === 'complete' || rawMode === 'oculto_only'
    ? rawMode
    : (localMode ?? 'complete');
  const hasChosen = rawMode === 'adult_only' || rawMode === 'complete' || rawMode === 'oculto_only' || !!localMode;

  // Sincroniza mudanças vindas do REALTIME (outro device alterou o modo).
  // Atualiza local + invalida queries do feed para refletir imediatamente
  // sem precisar recarregar a página.
  useEffect(() => {
    if (rawMode !== 'adult_only' && rawMode !== 'complete' && rawMode !== 'oculto_only') return;
    setLocalMode(rawMode);
    writeStoredMode(rawMode);
    setStoreMode(rawMode);
    if (lastSyncedRef.current && lastSyncedRef.current !== rawMode) {
      try { window.dispatchEvent(new CustomEvent(MODE_EVENT, { detail: rawMode })); } catch { /* noop */ }
      try { window.dispatchEvent(new CustomEvent(FEED_MODE_SYNCED_EVENT, { detail: rawMode })); } catch { /* noop */ }
      const ts = Date.now();
      setJustSyncedAt(ts);
      writeStoredSync(ts);
      queryClient.invalidateQueries({ queryKey: ['posts-infinite'], refetchType: 'active' });
      queryClient.invalidateQueries({ queryKey: ['posts'], refetchType: 'active' });
    }
    lastSyncedRef.current = rawMode;
  }, [rawMode, queryClient, setStoreMode]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const syncLocalMode = () => setLocalMode(readStoredMode());
    window.addEventListener(MODE_EVENT, syncLocalMode as EventListener);
    window.addEventListener('storage', syncLocalMode);
    return () => {
      window.removeEventListener(MODE_EVENT, syncLocalMode as EventListener);
      window.removeEventListener('storage', syncLocalMode);
    };
  }, []);

  const setMode = useCallback(
    (next: FeedExperienceMode) => {
      setLocalMode(next);
      writeStoredMode(next);
      setStoreMode(next);
      try { window.dispatchEvent(new CustomEvent(MODE_EVENT, { detail: next })); }
      catch { /* noop */ }
      try {
        updateProfile({ feed_experience_mode: next });
      } catch {
        /* updateProfile já lida com toasts/erros */
      }
    },
    [updateProfile, setStoreMode]
  );

  return {
    mode,
    hasChosen,
    isAdultOnly: mode === 'adult_only',
    isOcultoOnly: mode === 'oculto_only',
    setMode,
    isUpdating: !!isUpdating,
    justSyncedAt,
  };
}

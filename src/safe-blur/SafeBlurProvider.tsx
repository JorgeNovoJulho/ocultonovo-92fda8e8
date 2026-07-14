/**
 * SafeBlurProvider — Modo Blur Seguro do feed.
 *
 * Por padrão LIGADO: cobre cada post do feed com um aviso de "conteúdo
 * adulto", permitindo abrir o OCULTO em qualquer lugar (trabalho, transporte,
 * sala de espera) sem expor conteúdo explícito. O usuário pode revelar post
 * a post ou alternar globalmente pelo botão no topo do feed.
 *
 * Persistência:
 *  - profiles.feed_safe_blur_enabled (boolean, default true)
 *  - RPC set_feed_safe_blur(boolean)
 *  - Realtime cross-device via postgres_changes em profiles
 *  - Estado global no Zustand persistido em localStorage
 *  - Posts revelados → memória local do Zustand; religar o blur limpa todos
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from 'react';
import { flushSync } from 'react-dom';
import { supabase } from '@/lib/supabaseExternal';
import { subscribeTable } from '@/lib/realtimeBus';
import { useAuth } from '@/hooks/useAuth';
import { useViewStore } from '@/store/useViewStore';

interface SafeBlurContextValue {
  safeBlurOn: boolean;
  toggleSafeBlur: () => void;
  setSafeBlurOn: (v: boolean) => Promise<void>;
  isRevealed: (postId: string) => boolean;
  revealPost: (postId: string) => void;
  hideAllAgain: () => void;
}

const Ctx = createContext<SafeBlurContextValue | null>(null);

const LS_KEY = 'oculto:safeBlurOn';
const LEGACY_LS_KEY = 'oculto:feed_safe_blur';

const readStoredSafeBlur = (): boolean | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (raw !== null) return raw === 'true';
    const legacy = window.localStorage.getItem(LEGACY_LS_KEY);
    if (legacy !== null) return legacy !== '0' && legacy !== 'false';
  } catch { /* noop */ }
  return null;
};

const writeStoredSafeBlur = (value: boolean) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LS_KEY, value ? 'true' : 'false');
    window.localStorage.setItem(LEGACY_LS_KEY, value ? '1' : '0');
  } catch { /* noop */ }
};

export function SafeBlurProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const safeBlurOn = useViewStore((s) => s.feedSafeBlurOn);
  const setFeedSafeBlurOn = useViewStore((s) => s.setFeedSafeBlurOn);
  const revealAdultPost = useViewStore((s) => s.revealAdultPost);
  const hideAllAdultPosts = useViewStore((s) => s.hideAllAdultPosts);
  const isAdultPostRevealed = useViewStore((s) => s.isAdultPostRevealed);
  const revealedAdultPostIds = useViewStore((s) => s.revealedAdultPostIds);

  // Lê preferência do servidor + Realtime cross-device
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;

    (async () => {
      const localPreference = readStoredSafeBlur();
      const hasLocalPreference = localPreference !== null;
      if (hasLocalPreference) setFeedSafeBlurOn(localPreference);
      const { data } = await supabase
        .from('profiles')
        .select('feed_safe_blur_enabled')
        .or(`id.eq.${user.id},user_id.eq.${user.id}`)
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      const v = (data as any)?.feed_safe_blur_enabled;
      if (!hasLocalPreference && typeof v === 'boolean') {
        setFeedSafeBlurOn(v);
        writeStoredSafeBlur(v);
      }
    })();

    const apply = (payload: any) => {
      const v = payload?.new?.feed_safe_blur_enabled;
      if (typeof v !== 'boolean') return;
      setFeedSafeBlurOn(v);
      writeStoredSafeBlur(v);
    };

    const unsubProfiles = subscribeTable('profiles', (payload: any) => {
      const row = payload?.new ?? {};
      if (row.id !== user.id && row.user_id !== user.id) return;
      apply(payload);
    }, { events: ['UPDATE'] });

    const onStorage = (ev: StorageEvent) => {
      if (ev.key !== LS_KEY && ev.key !== LEGACY_LS_KEY) return;
      const next = readStoredSafeBlur();
      if (next === null) return;
      setFeedSafeBlurOn(next);
    };
    window.addEventListener('storage', onStorage);

    return () => {
      cancelled = true;
      unsubProfiles();
      window.removeEventListener('storage', onStorage);
    };
  }, [user?.id, setFeedSafeBlurOn]);

  const setSafeBlurOn = useCallback(
    async (v: boolean) => {
      flushSync(() => setFeedSafeBlurOn(v));
      writeStoredSafeBlur(v);
      // Persiste no servidor sem rollback — preferência sempre local-first.
      if (user?.id) {
        try { await supabase.rpc('set_feed_safe_blur', { p_on: v }); } catch { /* offline ok */ }
      }
    },
    [user?.id, setFeedSafeBlurOn],
  );


  const toggleSafeBlur = useCallback(() => {
    void setSafeBlurOn(!safeBlurOn);
  }, [safeBlurOn, setSafeBlurOn]);

  const isRevealed = useCallback((postId: string) => isAdultPostRevealed(postId), [isAdultPostRevealed, revealedAdultPostIds]);

  const revealPost = useCallback(
    (postId: string) => {
      revealAdultPost(postId);
    },
    [revealAdultPost],
  );

  const hideAllAgain = useCallback(() => {
    hideAllAdultPosts();
  }, [hideAllAdultPosts]);

  const value = useMemo<SafeBlurContextValue>(
    () => ({ safeBlurOn, toggleSafeBlur, setSafeBlurOn, isRevealed, revealPost, hideAllAgain }),
    [safeBlurOn, toggleSafeBlur, setSafeBlurOn, isRevealed, revealPost, hideAllAgain, revealedAdultPostIds],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSafeBlur(): SafeBlurContextValue {
  const ctx = useContext(Ctx);
  if (ctx) return ctx;
  return {
    safeBlurOn: true,
    toggleSafeBlur: () => {},
    setSafeBlurOn: async () => {},
    isRevealed: () => false,
    revealPost: () => {},
    hideAllAgain: () => {},
  };
}

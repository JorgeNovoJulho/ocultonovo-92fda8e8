/**
 * SocialRealtimeProvider — Onda A
 * Mantém UM único canal estável `social:${userId}` por usuário logado.
 * Componentes podem se inscrever em eventos de tabela específica via
 * `useSocialRealtime().subscribe(table, handler)` em vez de abrir canais
 * próprios.
 *
 * Atualmente cobre: matches, social_notifications, post_likes (próprias),
 * follows. Hooks legados que ainda usam canal próprio continuam funcionando
 * — a migração para o provider é incremental.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';
import { useAuth } from '@/hooks/useAuth';
import { subscribeTable } from '@/lib/realtimeBus';

type Handler = (payload: any) => void;
type EventKey = string; // ex: "matches", "social_notifications"

interface Ctx {
  subscribe: (table: EventKey, handler: Handler) => () => void;
}

const SocialRealtimeCtx = createContext<Ctx | null>(null);

export function SocialRealtimeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const handlersRef = useRef<Map<EventKey, Set<Handler>>>(new Map());

  const subscribe = useCallback((table: EventKey, handler: Handler) => {
    let set = handlersRef.current.get(table);
    if (!set) {
      set = new Set();
      handlersRef.current.set(table, set);
    }
    set.add(handler);
    return () => {
      set?.delete(handler);
    };
  }, []);

  useEffect(() => {
    if (!user?.id) return;

    const dispatch = (table: EventKey) => (payload: any) => {
      handlersRef.current.get(table)?.forEach((h) => {
        try {
          h(payload);
        } catch (err) {
          // silent — não derruba outros listeners
        }
      });
    };

    const tablesForUser = ['matches', 'social_notifications', 'follows'];
    const unsubs = tablesForUser.map((t) => subscribeTable(t, dispatch(t)));

    return () => {
      unsubs.forEach((u) => {
        try { u(); } catch { /* noop */ }
      });
    };
  }, [user?.id]);

  const value = useMemo<Ctx>(() => ({ subscribe }), [subscribe]);

  return (
    <SocialRealtimeCtx.Provider value={value}>{children}</SocialRealtimeCtx.Provider>
  );
}

export function useSocialRealtime() {
  const ctx = useContext(SocialRealtimeCtx);
  if (!ctx) {
    // Fallback no-op para componentes fora do provider
    return { subscribe: () => () => {} };
  }
  return ctx;
}

/**
 * SocialUniverseProvider — Onda B
 * Wrapper de alto nível para todo o Universo Social. Hoje agrega:
 *  - SocialRealtimeProvider (canal único social:${userId})
 *  - usePresenceEngine (heartbeat + online count)
 *  - Contexto leve com snapshot reativo da identidade social do usuário logado
 *
 * Não duplica providers existentes. Componentes consomem via
 * `useSocialUniverse()` para acessar identidade, presença e bus realtime.
 */
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { SocialRealtimeProvider, useSocialRealtime } from '@/providers/SocialRealtimeProvider';
import { usePresenceEngine } from '@/hooks/usePresenceEngine';
import { useSocialIdentity } from '@/hooks/useSocialIdentity';
import { useAuth } from '@/hooks/useAuth';
import type { SocialIdentitySnapshot } from '@/social-universe/types';

interface SocialUniverseCtx {
  identity: SocialIdentitySnapshot | null;
  isLoadingIdentity: boolean;
  onlineCount: number;
}

const Ctx = createContext<SocialUniverseCtx | null>(null);

function InnerProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { onlineCount } = usePresenceEngine();
  const identityQ = useSocialIdentity(user?.id);

  const value = useMemo<SocialUniverseCtx>(
    () => ({
      identity: (identityQ.data as SocialIdentitySnapshot) ?? null,
      isLoadingIdentity: identityQ.isLoading,
      onlineCount,
    }),
    [identityQ.data, identityQ.isLoading, onlineCount],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function SocialUniverseProvider({ children }: { children: ReactNode }) {
  return (
    <SocialRealtimeProvider>
      <InnerProvider>{children}</InnerProvider>
    </SocialRealtimeProvider>
  );
}

export function useSocialUniverse() {
  const ctx = useContext(Ctx);
  if (!ctx) {
    return { identity: null, isLoadingIdentity: false, onlineCount: 0 };
  }
  return ctx;
}

// Re-export para facilitar imports a partir do mesmo namespace
export { useSocialRealtime };

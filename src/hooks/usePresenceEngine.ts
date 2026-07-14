/**
 * usePresenceEngine — Onda A
 * Fonte única de presença. Atualmente delega para `usePresence` (já estável)
 * e expõe API consistente para futuras consolidações.
 *
 * Não duplica heartbeat. Não abre canal próprio. `useOnlineCount` continua
 * sendo a fonte de leitura agregada.
 */
import { usePresence } from './usePresence';
import { useOnlineCount } from './useOnlineCount';

export function usePresenceEngine() {
  usePresence(); // heartbeat + offline beacon (já throttled)
  const onlineCount = useOnlineCount();
  return {
    onlineCount: onlineCount.data ?? 0,
    isLoading: onlineCount.isLoading,
  };
}

import { useOnlineCounterStore } from '@/store/useOnlineCounterStore';
import { useOnlineCount } from './useOnlineCount';

/**
 * Hook de contagem de usuários online.
 * Agora apenas retorna o estado sincronizado do Zustand.
 * A lógica de atualização em tempo real está concentrada no useOnlineCount.
 */
export function useSmartOnlineCounter() {
  // Selectors atomizados: evita re-render sempre que qualquer campo do store muda.
  const count = useOnlineCounterStore((s) => s.count);
  const isInitialized = useOnlineCounterStore((s) => s.isInitialized);
  
  // Garante que o worker de contagem real esteja rodando
  const { isLoading } = useOnlineCount();
  
  return {
    count,
    isLoading: !isInitialized || isLoading,
    isRealtime: true,
    mode: 'realtime',
  };
}

/**
 * useGuestGate — detecta visitante (sem login) e oferece `requireAccount`
 * que abre o `GuestSignupGateModal` caso a ação seja bloqueada.
 *
 * Uso:
 *   const { isGuest, requireAccount } = useGuestGate();
 *   const onLike = () => {
 *     if (!requireAccount('curtir', itemId)) return;
 *     toggleLike.mutate(itemId);
 *   };
 *
 * Também dispara via window event 'oculto-play:require-account' para que
 * camadas profundas (hooks de mutação, modais já abertos) consigam pedir
 * o gate sem importar o hook.
 */
import { useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useGuestGateStore } from '@/store/useGuestGateStore';

export function useGuestGate() {
  const { user } = useAuth();
  const open = useGuestGateStore((s) => s.open);
  const isGuest = !user;

  const requireAccount = (reason?: string, intentItemId?: string | null): boolean => {
    if (!isGuest) return true;
    open(reason, intentItemId ?? null);
    return false;
  };

  return { isGuest, requireAccount };
}

/**
 * Listener global — qualquer parte do app pode disparar
 * `window.dispatchEvent(new CustomEvent('oculto-play:require-account', { detail: { reason, itemId } }))`
 * e o modal abrirá.
 */
export function useGuestGateGlobalListener() {
  const open = useGuestGateStore((s) => s.open);
  useEffect(() => {
    const handler = (ev: Event) => {
      const detail = (ev as CustomEvent<{ reason?: string; itemId?: string | null }>).detail ?? {};
      open(detail.reason, detail.itemId ?? null);
    };
    window.addEventListener('oculto-play:require-account', handler as EventListener);
    return () =>
      window.removeEventListener('oculto-play:require-account', handler as EventListener);
  }, [open]);
}

/** Helper sem hook — para chamar de funções utilitárias. */
export function emitRequireAccount(reason?: string, itemId?: string | null) {
  try {
    window.dispatchEvent(
      new CustomEvent('oculto-play:require-account', { detail: { reason, itemId } }),
    );
  } catch {
    /* noop */
  }
}

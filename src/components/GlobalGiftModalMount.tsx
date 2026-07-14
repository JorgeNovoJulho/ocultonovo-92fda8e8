/**
 * GlobalGiftModalMount — mount global do AuraXpGiftModal.
 *
 * Permite que qualquer parte do app dispare:
 *   window.dispatchEvent(new Event('oculto:open-gift-modal'))
 * e o modal de envio de presente abre instantaneamente (sem precisar navegar).
 */
import { useEffect, useState } from 'react';
import { AuraXpGiftModal } from '@/components/aura-match/AuraXpGiftModal';

export function GlobalGiftModalMount() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener('oculto:open-gift-modal', handler as EventListener);
    return () => window.removeEventListener('oculto:open-gift-modal', handler as EventListener);
  }, []);

  if (!open) return null;
  return <AuraXpGiftModal open={open} onOpenChange={setOpen} />;
}

export default GlobalGiftModalMount;

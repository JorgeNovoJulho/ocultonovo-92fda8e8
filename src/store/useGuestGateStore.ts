/**
 * useGuestGateStore — controla o modal "Crie sua conta" para visitantes
 * do OCULTO PLAY. Quando um visitante tenta executar uma ação que exige
 * conta (curtir, salvar, comentar, compartilhar, etc.), abrimos este modal
 * com o motivo e o id do item de origem para retornar após o cadastro.
 */
import { create } from 'zustand';

interface GuestGateState {
  isOpen: boolean;
  reason: string | null;
  intentItemId: string | null;
  open: (reason?: string, intentItemId?: string | null) => void;
  close: () => void;
}

export const useGuestGateStore = create<GuestGateState>((set) => ({
  isOpen: false,
  reason: null,
  intentItemId: null,
  open: (reason, intentItemId = null) =>
    set({ isOpen: true, reason: reason ?? null, intentItemId }),
  close: () => set({ isOpen: false }),
}));

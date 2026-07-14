/**
 * Preferências persistentes do fluxo de upload do Oculto Play.
 *
 * - `dismissLongVideoWarning`: quando true, o aviso de "vídeo longo" no
 *   VideoTrimAndCoverPicker não é exibido para o usuário (escolha lembrada
 *   após ele clicar em "Continuar mesmo assim" com a opção marcada).
 * - `qualityPreset`: preset padrão de compressão do vídeo escolhido pelo
 *   usuário (`smaller` | `balanced` | `best`). Padrão = `balanced`.
 */
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type OcultoPlayQualityPreset = 'smaller' | 'balanced' | 'best';

interface OcultoPlayUploadPrefsState {
  dismissLongVideoWarning: boolean;
  qualityPreset: OcultoPlayQualityPreset;
  setDismissLongVideoWarning: (v: boolean) => void;
  setQualityPreset: (p: OcultoPlayQualityPreset) => void;
}

export const useOcultoPlayUploadPrefsStore = create<OcultoPlayUploadPrefsState>()(
  persist(
    (set) => ({
      dismissLongVideoWarning: false,
      qualityPreset: 'balanced',
      setDismissLongVideoWarning: (v) => set({ dismissLongVideoWarning: v }),
      setQualityPreset: (p) => set({ qualityPreset: p }),
    }),
    {
      name: 'oculto-play:upload-prefs',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        dismissLongVideoWarning: s.dismissLongVideoWarning,
        qualityPreset: s.qualityPreset,
      }),
    },
  ),
);

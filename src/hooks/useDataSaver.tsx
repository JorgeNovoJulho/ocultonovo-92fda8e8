import { useState, useEffect, useCallback } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useAuthStore } from '@/store/useAuthStore';

interface DataSaverStore {
  /** Preferência efetiva (auto + manual unificada para compat). */
  isEnabled: boolean;
  /** Override explícito do usuário: null = seguir auto; true/false = forçar. */
  userOverride: boolean | null;
  /** Mock por-usuário: { [userId]: boolean | null } — sobrevive logout/login. */
  perUser: Record<string, boolean | null>;
  setEnabled: (enabled: boolean) => void;
  toggle: () => void;
  setUserOverride: (v: boolean | null) => void;
  setForUser: (userId: string, v: boolean | null) => void;
}

export const useDataSaverStore = create<DataSaverStore>()(
  persist(
    (set, get) => ({
      isEnabled: false,
      userOverride: null,
      perUser: {},
      setEnabled: (enabled) => set({ isEnabled: enabled }),
      toggle: () => set((state) => ({ isEnabled: !state.isEnabled })),
      setUserOverride: (v) => set({ userOverride: v }),
      setForUser: (userId, v) =>
        set((state) => ({ perUser: { ...state.perUser, [userId]: v } })),
    }),
    { name: 'data-saver-preference' },
  ),
);

export type ConnectionKind = 'wifi' | 'cellular' | 'ethernet' | 'unknown';

function readConnectionKind(): ConnectionKind {
  const c =
    (navigator as any).connection ||
    (navigator as any).mozConnection ||
    (navigator as any).webkitConnection;
  const t: string | undefined = c?.type;
  if (t === 'wifi') return 'wifi';
  if (t === 'ethernet') return 'ethernet';
  if (t === 'cellular' || t === 'wimax') return 'cellular';
  return 'unknown';
}

/**
 * Modo Economia (ECO) — auto-detecta SOMENTE em redes móveis ou conexões
 * lentas/saveData. Em Wi-Fi/Ethernet mantém qualidade padrão.
 *
 * Persistência:
 *  - userOverride global (zustand+persist) sobrevive entre sessões.
 *  - perUser[userId] (mock no localStorage) — se houver usuário logado,
 *    a preferência por-perfil tem precedência sobre o override global.
 */
export function useDataSaver() {
  const {
    isEnabled,
    userOverride,
    perUser,
    setEnabled,
    toggle,
    setUserOverride,
    setForUser,
  } = useDataSaverStore();

  const userId = useAuthStore((s) => s.user?.id ?? null);

  const [connectionKind, setConnectionKind] = useState<ConnectionKind>('unknown');
  const [effectiveType, setEffectiveType] = useState<string>('unknown');
  const [saveData, setSaveData] = useState<boolean>(false);

  const [autoFromHtml, setAutoFromHtml] = useState<boolean>(() => {
    if (typeof document === 'undefined') return false;
    return document.documentElement.getAttribute('data-data-saver') === 'true';
  });

  // Observa atributo global do PerformanceContext (hw fraco / FPS baixo)
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const html = document.documentElement;
    const obs = new MutationObserver(() => {
      setAutoFromHtml(html.getAttribute('data-data-saver') === 'true');
    });
    obs.observe(html, { attributes: true, attributeFilter: ['data-data-saver'] });
    return () => obs.disconnect();
  }, []);

  // Lê e observa Network Information API
  useEffect(() => {
    const connection =
      (navigator as any).connection ||
      (navigator as any).mozConnection ||
      (navigator as any).webkitConnection;

    const refresh = () => {
      setConnectionKind(readConnectionKind());
      setEffectiveType(connection?.effectiveType || 'unknown');
      setSaveData(!!connection?.saveData);
    };
    refresh();

    connection?.addEventListener?.('change', refresh);
    return () => connection?.removeEventListener?.('change', refresh);
  }, []);

  // Resolve override por-usuário (mock) → global → auto
  const perUserPref = userId ? perUser[userId] ?? null : null;
  const effectiveOverride = perUserPref !== null ? perUserPref : userOverride;

  // Auto: SÓ em rede móvel, conexão lenta (2g) ou saveData explícito.
  // Wi-Fi/Ethernet NUNCA dispara auto-ECO.
  const slowConn =
    effectiveType === '2g' ||
    effectiveType === 'slow-2g' ||
    saveData;
  const autoEco =
    autoFromHtml ||
    slowConn ||
    (connectionKind === 'cellular' && effectiveType !== '4g');
  // Em 4G celular não força ECO — só em 3G/2G celular.

  const effective = effectiveOverride !== null ? effectiveOverride : autoEco;

  // Mantém o `isEnabled` legado em sync (componentes que ainda leem direto)
  useEffect(() => {
    if (effective !== isEnabled) setEnabled(effective);
  }, [effective, isEnabled, setEnabled]);

  const toggleDataSaver = useCallback(() => {
    const next = !effective;
    setUserOverride(next);
    if (userId) setForUser(userId, next);
    toggle();
  }, [effective, setUserOverride, setForUser, toggle, userId]);

  const enableDataSaver = useCallback(() => {
    setUserOverride(true);
    if (userId) setForUser(userId, true);
    setEnabled(true);
  }, [setUserOverride, setForUser, setEnabled, userId]);

  const disableDataSaver = useCallback(() => {
    setUserOverride(false);
    if (userId) setForUser(userId, false);
    setEnabled(false);
  }, [setUserOverride, setForUser, setEnabled, userId]);

  /** Resolve para 'auto' — limpa override e volta a seguir a rede. */
  const resetDataSaver = useCallback(() => {
    setUserOverride(null);
    if (userId) setForUser(userId, null);
  }, [setUserOverride, setForUser, userId]);

  // Rótulo de qualidade que será efetivamente solicitada à CDN
  const qualityLabel = effective ? '480p' : 'auto';

  return {
    isDataSaverEnabled: effective,
    connectionType: effectiveType,
    connectionKind,
    saveData,
    /** Origem do estado atual — útil para UI/badges. */
    source: (effectiveOverride !== null
      ? 'manual'
      : autoEco
        ? 'auto'
        : 'off') as 'manual' | 'auto' | 'off',
    qualityLabel,
    enableDataSaver,
    disableDataSaver,
    toggleDataSaver,
    resetDataSaver,
    shouldLoadVideo: !effective,
    shouldLoadHDImages: !effective,
    shouldAutoplay: !effective,
    imageQuality: effective ? 'low' : 'high',
  };
}

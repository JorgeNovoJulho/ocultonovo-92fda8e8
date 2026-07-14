/**
 * useOcultoPlayCountersStore — Store Zustand dedicado APENAS aos contadores
 * de visualização (view_count) dos cards do Oculto Play.
 *
 * Por quê?
 *  - Os cards de Áudio e Vídeo estão em sessões diferentes (containers) na
 *    página, mas precisam refletir o MESMO valor de view_count quando o
 *    mesmo item aparece em mais de um lugar (ex.: feed + trending + perfil).
 *  - O React Query patcha cada cache do feed isoladamente; a store funciona
 *    como "fonte da verdade" cruzando todas as sessões e remounts.
 *  - Realtime do banco escreve aqui também, então qualquer device que
 *    incrementar o contador propaga para os outros instantaneamente.
 *  - `registeredOnce` evita que `onLoad` da `<img>` (que dispara mais de uma
 *    vez por re-render ou cache) conte a mesma visualização repetidas vezes
 *    no MESMO sessão do navegador.
 */
import { create } from 'zustand';

interface OcultoPlayCountersState {
  /** Mapa itemId -> view_count efetivo (>= fallback do servidor). */
  views: Record<string, number>;
  /** Itens já registrados nesta sessão do navegador (anti-duplicidade). */
  registeredOnce: Set<string>;

  /** Define o valor absoluto vindo do servidor (realtime/RPC). Só sobe. */
  setView: (itemId: string, value: number) => void;
  /** Hidrata vários itens de uma vez (feed/trending). Só sobe valores. */
  hydrateMany: (entries: Array<{ id: string; view_count: number | null | undefined }>) => void;
  /** Incrementa em +1 (otimista) — chamado por registerPlay. */
  bumpView: (itemId: string) => void;
  /** Retorna o maior valor entre store e fallback do feed. */
  getView: (itemId: string, fallback: number) => number;

  /** Marca como registrado nesta sessão. Retorna true se foi a 1ª vez. */
  markRegistered: (itemId: string) => boolean;
  hasRegistered: (itemId: string) => boolean;
}

export const useOcultoPlayCountersStore = create<OcultoPlayCountersState>((set, get) => ({
  views: {},
  registeredOnce: new Set<string>(),

  setView: (itemId, value) => {
    if (!itemId || !Number.isFinite(value)) return;
    set((state) => {
      const current = state.views[itemId] ?? -1;
      // Só atualiza se o novo valor for maior (evita regredir por race).
      if (value <= current) return state;
      return { views: { ...state.views, [itemId]: value } };
    });
  },

  hydrateMany: (entries) => {
    if (!entries || entries.length === 0) return;
    set((state) => {
      let changed = false;
      const next = { ...state.views };
      for (const e of entries) {
        const v = Number(e?.view_count ?? 0);
        if (!e?.id || !Number.isFinite(v)) continue;
        const current = next[e.id] ?? -1;
        if (v > current) {
          next[e.id] = v;
          changed = true;
        }
      }
      return changed ? { views: next } : state;
    });
  },

  bumpView: (itemId) => {
    if (!itemId) return;
    set((state) => {
      const current = state.views[itemId] ?? 0;
      return { views: { ...state.views, [itemId]: current + 1 } };
    });
  },

  getView: (itemId, fallback) => {
    const v = get().views[itemId];
    const fb = Number(fallback ?? 0);
    if (v == null) return fb;
    return v > fb ? v : fb;
  },

  markRegistered: (itemId) => {
    if (!itemId) return false;
    const reg = get().registeredOnce;
    if (reg.has(itemId)) return false;
    const next = new Set(reg);
    next.add(itemId);
    set({ registeredOnce: next });
    return true;
  },

  hasRegistered: (itemId) => get().registeredOnce.has(itemId),
}));

/**
 * Selector hook — devolve o view_count efetivo (store > fallback do feed).
 * Re-renderiza apenas quando o valor desse item muda.
 */
export function useEffectiveViewCount(itemId: string | null | undefined, fallback: number): number {
  return useOcultoPlayCountersStore((s) => {
    if (!itemId) return Number(fallback ?? 0);
    const v = s.views[itemId];
    const fb = Number(fallback ?? 0);
    if (v == null) return fb;
    return v > fb ? v : fb;
  });
}

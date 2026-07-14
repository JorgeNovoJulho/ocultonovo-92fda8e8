/**
 * useRegisterOcultoPlayCardView — registrador UNIFICADO de visualização
 * para qualquer card do Oculto Play (áudio, vídeo curto, vip_teaser, meme...).
 *
 * Garante que:
 *  - O contador NUNCA fica zerado depois que o card aparece/é aberto.
 *  - Não conta duplicado se o `<img onLoad>` disparar mais de uma vez no
 *    mesmo card (cache, re-render, troca de aba) dentro da MESMA sessão.
 *  - Após F5/refresh: a deduplicação continua valendo porque enviamos o
 *    `viewer_key` anônimo persistido em localStorage para o servidor
 *    (`oculto_play_register_play(p_item_id, p_viewer_key)`), que tem
 *    janela própria de 30 min. Também guardamos um carimbo local por item
 *    para evitar round-trip desnecessário ao backend.
 *  - Áudio e vídeo seguem exatamente o mesmo fluxo (RPC + Zustand store
 *    + patch otimista nas queries do feed).
 */
import { useCallback } from 'react';
import { supabase } from '@/lib/supabaseExternal';
import { useQueryClient } from '@tanstack/react-query';
import { useOcultoPlayCountersStore } from '@/store/useOcultoPlayCountersStore';
import { getOcultoPlayViewerKey } from '@/lib/ocultoPlayViewerKey';
import type { OcultoPlayItem } from './useOcultoPlayContent';

const COUNTED_PREFIX = 'oculto:play:card-counted:';
const COUNTED_TTL_MS = 30 * 60 * 1000;

function alreadyCountedLocally(itemId: string): boolean {
  try {
    const raw = localStorage.getItem(COUNTED_PREFIX + itemId);
    if (!raw) return false;
    const ts = Number(raw);
    if (!Number.isFinite(ts)) return false;
    return Date.now() - ts < COUNTED_TTL_MS;
  } catch {
    return false;
  }
}

function markCountedLocally(itemId: string) {
  try {
    localStorage.setItem(COUNTED_PREFIX + itemId, String(Date.now()));
  } catch {
    /* noop */
  }
}

export function useRegisterOcultoPlayCardView() {
  const qc = useQueryClient();
  const markRegistered = useOcultoPlayCountersStore((s) => s.markRegistered);
  const bumpView = useOcultoPlayCountersStore((s) => s.bumpView);
  const setView = useOcultoPlayCountersStore((s) => s.setView);

  return useCallback(
    async (itemId: string | null | undefined) => {
      if (!itemId) return;
      // 1) Idempotente em memória (mesma sessão de navegação).
      const firstTime = markRegistered(itemId);
      if (!firstTime) return;
      // 2) Idempotente após refresh: dedup persistido em localStorage.
      if (alreadyCountedLocally(itemId)) return;
      markCountedLocally(itemId);

      // 3) Bump otimista na store global (todas as sessões do app)
      bumpView(itemId);

      // 4) Patch otimista em TODOS os caches do feed (várias listas)
      qc.setQueriesData<OcultoPlayItem[] | undefined>(
        { queryKey: ['oculto-play', 'feed'] },
        (old) => {
          if (!old) return old;
          return old.map((it) =>
            it.id === itemId
              ? { ...it, view_count: (it.view_count ?? 0) + 1 }
              : it,
          );
        },
      );

      // 5) Persiste no backend e reconcilia com o valor real. Passamos o
      //    viewer_key anônimo persistido para que o servidor também faça
      //    a deduplicação (janela de 30 min) caso o usuário limpe a aba,
      //    abra outra ou recarregue a página.
      try {
        const viewerKey = getOcultoPlayViewerKey();
        const { data } = await supabase.rpc('oculto_play_register_play', {
          p_item_id: itemId,
          p_viewer_key: viewerKey,
        } as never);
        const serverCount = typeof data === 'number' ? data : null;
        if (serverCount !== null && serverCount > 0) {
          setView(itemId, serverCount);
          qc.setQueriesData<OcultoPlayItem[] | undefined>(
            { queryKey: ['oculto-play', 'feed'] },
            (old) => {
              if (!old) return old;
              return old.map((it) =>
                it.id === itemId ? { ...it, view_count: serverCount } : it,
              );
            },
          );
        }
      } catch {
        /* silencioso: o bump otimista já garante feedback visual */
      }
    },
    [qc, markRegistered, bumpView, setView],
  );
}

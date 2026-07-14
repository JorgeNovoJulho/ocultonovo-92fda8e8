/**
 * usePlayLinkViews — contador de visualizações em tempo real para itens do
 * Oculto Play do tipo `link`.
 *
 * - Lê o `view_count` da tabela `oculto_play_items` (com fallback no valor
 *   inicial do feed).
 * - Inscreve um canal Realtime que escuta UPDATEs na linha específica e
 *   atualiza o contador imediatamente — todos os usuários vendo o card
 *   recebem a contagem nova sem refresh.
 * - Expõe `registerView()` que dispara a RPC `oculto_play_register_view`
 *   (dedup por viewer + 30 min) e atualiza o estado local de forma otimista
 *   caso a RPC retorne o novo total.
 *
 * Persistência: o incremento é gravado no banco; a contagem fica disponível
 * para todas as próximas sessões de qualquer usuário.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseExternal';
import { getOcultoPlayViewerKey as getViewerKey } from '@/lib/ocultoPlayViewerKey';

const COUNTED_PREFIX = 'oculto:play:counted:'; // dedup local por aba (30 min)
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

export function usePlayLinkViews(itemId: string | null | undefined, initial = 0) {
  const [views, setViews] = useState<number>(initial);
  const lockRef = useRef(false);

  // Sincroniza quando o feed traz um novo valor inicial maior.
  useEffect(() => {
    setViews((curr) => (initial > curr ? initial : curr));
  }, [initial]);

  // Fetch inicial + realtime na linha específica.
  useEffect(() => {
    if (!itemId) return;
    let cancelled = false;

    (async () => {
      try {
        const { data } = await supabase
          .from('oculto_play_items')
          .select('view_count')
          .eq('id', itemId)
          .maybeSingle();
        if (cancelled || !data) return;
        const v = Number((data as any).view_count ?? 0);
        setViews((curr) => (v > curr ? v : curr));
      } catch {
        /* noop */
      }
    })();

    const channel = supabase
      .channel(`oculto-play-views:${itemId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'oculto_play_items',
          filter: `id=eq.${itemId}`,
        },
        (payload: any) => {
          const next = Number(payload?.new?.view_count ?? 0);
          if (Number.isFinite(next)) {
            setViews((curr) => (next > curr ? next : curr));
          }
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      try {
        supabase.removeChannel(channel);
      } catch {
        /* noop */
      }
    };
  }, [itemId]);

  const registerView = useCallback(async () => {
    if (!itemId || lockRef.current) return;
    if (alreadyCountedLocally(itemId)) return;
    lockRef.current = true;
    markCountedLocally(itemId);
    try {
      const { data, error } = await supabase.rpc('oculto_play_register_view', {
        p_item_id: itemId,
        p_viewer_key: getViewerKey(),
      });
      if (!error && data != null) {
        const total = Number(data);
        if (Number.isFinite(total)) {
          setViews((curr) => (total > curr ? total : curr));
        }
      }
    } catch {
      /* noop */
    } finally {
      lockRef.current = false;
    }
  }, [itemId]);

  return { views, registerView };
}

/**
 * Formata o número de visualizações em estilo compacto (1.2k / 3.4M).
 */
export function formatViewsCompact(n: number): string {
  const v = Math.max(0, Math.floor(n || 0));
  if (v < 1000) return String(v);
  if (v < 1_000_000) return `${(v / 1000).toFixed(v < 10_000 ? 1 : 0).replace(/\.0$/, '')}k`;
  return `${(v / 1_000_000).toFixed(v < 10_000_000 ? 1 : 0).replace(/\.0$/, '')}M`;
}

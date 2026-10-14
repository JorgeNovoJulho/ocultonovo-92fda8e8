/**
 * Pede ao servidor (edge function `oculto-play-audio-preview`) o clip curto da
 * prévia de músicas que ainda não têm `audio_preview_url`.
 *
 * Qualquer usuário logado que vê o card dispara o pedido uma única vez; o
 * servidor gera o clip para TODOS. Depois disso o botão de prévia do card
 * passa a tocar o clip pequeno (instantâneo) em vez do MP3 completo.
 *
 * - 1 pedido por vez (não compete com a reprodução do usuário);
 * - cada item é pedido no máximo uma vez por sessão (sucesso ou falha);
 * - com sucesso, atualiza o item nos caches do React Query.
 */
import type { QueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';

const requested = new Set<string>();
const queue: Array<{ id: string; resolve: (url: string | null) => void }> = [];
let running = false;
// Se a função ainda não foi publicada no Supabase, para de tentar na sessão.
let unavailable = false;

export function patchItemInCaches(qc: QueryClient, itemId: string, audioPreviewUrl: string) {
  qc.setQueriesData({ queryKey: ['oculto-play'] }, (old: any) => {
    if (!Array.isArray(old)) return old;
    let hit = false;
    const next = old.map((it: any) => {
      if (it && it.id === itemId) {
        hit = true;
        return { ...it, audio_preview_url: audioPreviewUrl };
      }
      return it;
    });
    return hit ? next : old;
  });
}

async function pump(qc: QueryClient) {
  if (running) return;
  running = true;
  try {
    while (queue.length > 0 && !unavailable) {
      const job = queue.shift()!;
      let url: string | null = null;
      try {
        const { data, error } = await supabase.functions.invoke('oculto-play-audio-preview', {
          body: { item_id: job.id },
        });
        if (error) {
          const status = (error as any)?.context?.status;
          if (status === 404) unavailable = true;
        } else if (data?.ok && typeof data.audio_preview_url === 'string') {
          url = data.audio_preview_url;
          patchItemInCaches(qc, job.id, url);
        }
      } catch { /* rede: tenta de novo na próxima sessão */ }
      job.resolve(url);
    }
  } finally {
    running = false;
  }
}

/**
 * Agenda a geração do clip no servidor. `priority` (toque/hover no card)
 * passa o item para a frente da fila.
 */
export function requestServerPreviewClip(
  qc: QueryClient,
  itemId: string | null | undefined,
  opts?: { priority?: boolean },
): Promise<string | null> {
  if (!itemId || unavailable) return Promise.resolve(null);
  if (requested.has(itemId)) {
    if (opts?.priority) {
      const idx = queue.findIndex((q) => q.id === itemId);
      if (idx > 0) queue.unshift(queue.splice(idx, 1)[0]);
    }
    return Promise.resolve(null);
  }
  requested.add(itemId);
  return new Promise((resolve) => {
    if (opts?.priority) queue.unshift({ id: itemId, resolve });
    else queue.push({ id: itemId, resolve });
    void pump(qc);
  });
}

/**
 * Regera no servidor o clip de um item do próprio usuário (após publicar ou
 * editar música/trecho). O servidor recorta o MP3 original sem recodificar —
 * o clip fica bem menor que o WAV gerado no navegador e toca mais rápido.
 * Melhor esforço: se a função não estiver publicada, o clip do navegador fica.
 */
export async function regenerateServerPreviewClip(qc: QueryClient, itemId: string): Promise<string | null> {
  if (!itemId || unavailable) return null;
  try {
    const { data, error } = await supabase.functions.invoke('oculto-play-audio-preview', {
      body: { item_id: itemId, force: true },
    });
    if (error) {
      if ((error as any)?.context?.status === 404) unavailable = true;
      return null;
    }
    if (data?.ok && typeof data.audio_preview_url === 'string') {
      patchItemInCaches(qc, itemId, data.audio_preview_url);
      return data.audio_preview_url;
    }
  } catch { /* noop */ }
  return null;
}

/**
 * slideGuideViewed — persistência do estado "Visto" dos modais de Saiba mais.
 * - localStorage: cache instantâneo / offline.
 * - profiles.viewed_slide_guides (jsonb): espelho cross-device, sincronizado em background.
 * Evento `slide-guide-viewed` é disparado a cada mudança para atualizar a UI em tempo real.
 */
import { supabase } from '@/lib/supabaseExternal';

const KEY = 'oculto_slide_guides_viewed_v1';

function readMap(): Record<string, number> {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Record<string, number>) : {};
  } catch {
    return {};
  }
}

function writeMap(m: Record<string, number>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(m));
  } catch {
    /* noop */
  }
}

export function hasViewedSlideGuide(slug: string): boolean {
  if (!slug) return false;
  return !!readMap()[slug];
}

export function getViewedSlideGuides(): string[] {
  return Object.keys(readMap());
}

export function markSlideGuideViewed(slug: string): void {
  if (!slug) return;
  const m = readMap();
  if (m[slug]) return; // já marcado, evita ruído
  m[slug] = Date.now();
  writeMap(m);
  window.dispatchEvent(new CustomEvent('slide-guide-viewed', { detail: { slug } }));

  // Espelha no banco em background (best-effort, silencioso)
  void (async () => {
    try {
      await (supabase as any).rpc('slide_guide_mark_viewed', { p_slug: slug });
    } catch {
      /* silencioso — localStorage continua sendo a fonte primária */
    }
  })();
}

/** Redefine o estado de "Visto" — limpa local e remoto. */
export async function resetViewedSlideGuides(): Promise<void> {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* noop */
  }
  window.dispatchEvent(new CustomEvent('slide-guide-viewed', { detail: { slug: '__reset__' } }));
  try {
    await (supabase as any).rpc('slide_guide_viewed_reset');
  } catch {
    /* silencioso */
  }
}

/** Sincroniza o mapa remoto → local (chamar 1x ao logar). */
export async function syncViewedSlideGuidesFromServer(): Promise<void> {
  try {
    const { data } = await (supabase as any).rpc('slide_guide_viewed_get');
    if (data && typeof data === 'object') {
      const local = readMap();
      const merged: Record<string, number> = { ...(data as Record<string, number>), ...local };
      writeMap(merged);
      window.dispatchEvent(new CustomEvent('slide-guide-viewed', { detail: { slug: '__sync__' } }));
    }
  } catch {
    /* silencioso */
  }
}

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseExternal';

export type WelcomeLabels = {
  badge_text: string;
  copy_button_label: string;
  share_button_label: string;
};

const DEFAULTS: WelcomeLabels = {
  badge_text: 'Boas-vindas OCULTO',
  copy_button_label: 'Copiar link de divulgação',
  share_button_label: 'Compartilhar',
};

// Cache simples em módulo — uma única requisição por sessão
let cache: WelcomeLabels | null = null;
let inflight: Promise<WelcomeLabels> | null = null;

async function fetchLabels(): Promise<WelcomeLabels> {
  if (cache) return cache;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const { data } = await supabase
        .from('oculto_welcome_message_settings')
        .select('badge_text, copy_button_label, share_button_label')
        .eq('id', 1)
        .maybeSingle();
      const row = (data ?? {}) as Partial<WelcomeLabels>;
      cache = {
        badge_text: row.badge_text || DEFAULTS.badge_text,
        copy_button_label: row.copy_button_label || DEFAULTS.copy_button_label,
        share_button_label: row.share_button_label || DEFAULTS.share_button_label,
      };
      return cache;
    } catch {
      cache = DEFAULTS;
      return DEFAULTS;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export function useWelcomeLabels(enabled: boolean): WelcomeLabels {
  const [labels, setLabels] = useState<WelcomeLabels>(cache ?? DEFAULTS);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    fetchLabels().then((l) => { if (active) setLabels(l); });
    return () => { active = false; };
  }, [enabled]);
  return labels;
}

export function trackWelcomeAction(action: 'copy' | 'share' | 'view') {
  // Fire-and-forget; nunca quebra a UI
  try {
    supabase.rpc('welcome_metric_increment', { p_action: action }).then(() => {});
  } catch { /* noop */ }
}

const VIEW_STORAGE_PREFIX = 'welcome-view:';

export function shouldTrackWelcomeView(messageId: string, userId?: string | null) {
  if (!messageId) return false;

  const key = `${VIEW_STORAGE_PREFIX}${userId ?? 'anon'}:${messageId}`;

  try {
    if (typeof window === 'undefined' || !window.sessionStorage) {
      return true;
    }

    if (window.sessionStorage.getItem(key) === '1') {
      return false;
    }

    window.sessionStorage.setItem(key, '1');
    return true;
  } catch {
    return true;
  }
}

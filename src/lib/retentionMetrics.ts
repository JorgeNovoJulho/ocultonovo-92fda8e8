/**
 * logRetentionView — telemetria leve, 1x por sessão por feature.
 * Usa a RPC `log_retention_view(_feature)` no Supabase Externo (incremento
 * atômico em usage_counters). Falha silenciosa — nunca derruba UI.
 */
import { supabase } from '@/lib/supabaseExternal';

const sent = new Set<string>();

export function logRetentionView(feature: string): void {
  if (typeof window === 'undefined') return;
  if (sent.has(feature)) return;
  sent.add(feature);
  // fire-and-forget; idle para não competir com render
  const fire = () => {
    try {
      (supabase as any).rpc('log_retention_view', { _feature: feature }).then?.(() => {}, () => {});
    } catch { /* noop */ }
  };
  if ('requestIdleCallback' in window) {
    (window as any).requestIdleCallback(fire, { timeout: 2000 });
  } else {
    setTimeout(fire, 500);
  }
}

import { supabase } from '@/lib/supabaseExternal';

// Chave exclusiva do bloqueio de sessão ativa.
// Não reutilizar `oculto_session_id`: essa chave também era usada pelo consentimento
// de cookies para visitantes e podia ser removida/recriada em fluxos de modal/aba,
// gerando falso "session_taken_over" e piscadas no feed.
const STORAGE_KEY = 'oculto_active_session_id';
const MASTER_EMAIL = 'ocultomaster@gmail.com';

export function isMasterEmail(email?: string | null): boolean {
  return (email || '').trim().toLowerCase() === MASTER_EMAIL;
}

export function getOrCreateLocalSessionId(): string {
  try {
    const existing = localStorage.getItem(STORAGE_KEY);
    if (existing && existing.length > 8) return existing;
    const fresh =
      (globalThis.crypto as any)?.randomUUID?.() ??
      `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(STORAGE_KEY, fresh);
    return fresh;
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

export function clearLocalSessionId(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

function detectDeviceLabel(): string {
  const ua = navigator.userAgent || '';
  if (/Mobi|Android|iPhone|iPad|iPod/i.test(ua)) return 'mobile';
  if (/Tablet/i.test(ua)) return 'tablet';
  return 'desktop';
}

export async function claimActiveSession(sessionId: string): Promise<boolean> {
  try {
    const { error } = await (supabase as any).rpc('claim_active_session', {
      p_session_id: sessionId,
      p_device_label: detectDeviceLabel(),
      p_user_agent: navigator.userAgent?.slice(0, 250) ?? null,
      p_ip_hint: null,
    });
    if (error) {
      console.warn('[singleSession] claim RPC error', error);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[singleSession] claim failed', err);
    return false;
  }
}

export async function fetchCurrentSessionId(userId: string): Promise<string | null> {
  try {
    const { data } = await supabase
      .from('oculto_active_sessions' as any)
      .select('current_session_id')
      .eq('user_id', userId)
      .maybeSingle();
    return (data as any)?.current_session_id ?? null;
  } catch {
    return null;
  }
}

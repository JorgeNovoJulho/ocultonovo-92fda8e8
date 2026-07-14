/**
 * Activity Logger — chama RPC log_user_activity no Supabase externo.
 * - device_id persistente em localStorage (uuid v4 random)
 * - IP capturado via cdn (cache 10min)
 * - Falha silenciosa: nunca quebra a UX
 */
import { supabase } from '@/lib/supabaseExternal';

const DEVICE_KEY = 'oculto_device_id';
const IP_KEY = 'oculto_cached_ip';
const IP_TTL_MS = 10 * 60 * 1000;

function getDeviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return 'unknown';
  }
}

let ipPromise: Promise<string | null> | null = null;
async function getIp(): Promise<string | null> {
  try {
    const cached = localStorage.getItem(IP_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Date.now() - parsed.t < IP_TTL_MS) return parsed.ip;
    }
  } catch { /* ignore */ }

  if (ipPromise) return ipPromise;
  ipPromise = fetch('https://api.ipify.org?format=json')
    .then((r) => r.json())
    .then((d: { ip?: string }) => {
      const ip = d?.ip ?? null;
      if (ip) {
        try { localStorage.setItem(IP_KEY, JSON.stringify({ ip, t: Date.now() })); } catch { /* ignore */ }
      }
      return ip;
    })
    .catch(() => null)
    .finally(() => { ipPromise = null; });
  return ipPromise;
}

export type ActivityAction =
  | 'signup' | 'login' | 'logout'
  | 'payment_init' | 'payment_success' | 'payment_failed'
  | 'post_view' | 'post_like' | 'subscribe' | 'message_send';

export async function logActivity(
  action: ActivityAction | string,
  metadata: Record<string, unknown> = {},
  userId?: string | null
): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const uid = userId ?? session?.user?.id ?? null;
    if (!uid) return; // RPC requer user_id
    const [ip] = await Promise.all([getIp()]);
    await supabase.rpc('log_user_activity', {
      p_user_id: uid,
      p_action_type: action,
      p_ip: ip,
      p_device_id: getDeviceId(),
      p_user_agent: navigator.userAgent.slice(0, 500),
      p_metadata: metadata as never,
    });
  } catch {
    // Falha silenciosa: telemetria nunca quebra a UX
  }
}

export const activityLogger = { log: logActivity, getDeviceId };

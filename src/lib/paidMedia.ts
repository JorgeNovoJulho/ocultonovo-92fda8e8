import { supabase } from '@/lib/supabaseExternal';

interface SignedUrlResult {
  url: string | null;
  expires_in: number | null;
  legacy?: boolean;
  error?: string;
}

const cache = new Map<string, { url: string; expiresAt: number }>();

/**
 * Get a short-lived signed URL for a paid post media via edge function.
 * Cached locally for ~50s to avoid re-calls within TTL.
 */
export async function fetchPaidMediaUrl(postId: string): Promise<SignedUrlResult> {
  const now = Date.now();
  const hit = cache.get(postId);
  if (hit && hit.expiresAt > now + 5_000) {
    return { url: hit.url, expires_in: Math.round((hit.expiresAt - now) / 1000) };
  }

  // Sem sessão → não chama a função (evita 401 ruidoso).
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (!token) {
    return { url: null, expires_in: null, error: 'unauthorized' };
  }

  // Chamada direta via fetch para tratarmos 401/403 silenciosamente
  // (supabase.functions.invoke loga console.error em respostas não-2xx,
  // o que pode disparar overlays de erro no preview).
  try {
    const projectRef = (import.meta as any).env?.VITE_SUPABASE_EXTERNAL_URL
      || 'https://rvybbrkzmboqbhcemqar.supabase.co';
    const res = await fetch(`${projectRef}/functions/v1/paid-media-signed-url`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        apikey: (supabase as any).supabaseKey ?? '',
      },
      body: JSON.stringify({ post_id: postId }),
    });

    if (res.status === 401 || res.status === 403) {
      // Sem acesso/entitlement — não é erro de runtime, apenas sem permissão.
      return { url: null, expires_in: null, error: 'forbidden' };
    }
    if (!res.ok) {
      return { url: null, expires_in: null, error: `http_${res.status}` };
    }
    const result = (await res.json().catch(() => ({}))) as SignedUrlResult;
    if (result.url && result.expires_in) {
      cache.set(postId, { url: result.url, expiresAt: now + result.expires_in * 1000 });
    }
    return result;
  } catch (e: any) {
    return { url: null, expires_in: null, error: String(e?.message ?? e) };
  }
}

export function clearPaidMediaCache(postId?: string) {
  if (postId) cache.delete(postId);
  else cache.clear();
}

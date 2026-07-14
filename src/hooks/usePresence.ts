/**
 * Hook de presença: mantém is_online=true e last_seen atualizado enquanto
 * o usuário estiver logado. Estratégia anti-flicker:
 *
 *  - Heartbeat curto (45s) atualizando last_seen
 *  - NÃO marca offline em pagehide/beforeunload/visibilitychange (esses eventos
 *    disparam em BFCache no iOS, troca de aba, scroll na PWA etc. — causavam o
 *    pisca-pisca online↔offline)
 *  - NÃO marca offline no cleanup do effect (React Strict Mode / navegação SPA
 *    re-mountava o provider e derrubava o status)
 *  - Marca offline EXCLUSIVAMENTE quando o usuário faz logout
 *    (useAuth.signOut chama `markCurrentUserOffline()` exportado abaixo)
 *  - Ao voltar de "visible" força um heartbeat imediato (sem throttle) p/
 *    reduzir a janela de "stale" no banco.
 */
import { useEffect } from 'react';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from './useAuth';
import { EXTERNAL_SUPABASE_URL } from '@/lib/appConfig';

const HEARTBEAT_INTERVAL = 45_000; // 45s
const MIN_UPDATE_INTERVAL = 20_000; // throttle: 1 update a cada 20s

// Cache cross-módulo do profile.id do usuário logado — usado pelo signOut.
let currentProfileId: string | null = null;
let currentAccessToken: string | null = null;

/**
 * Marca o usuário ATUAL como offline no banco. Chamar SOMENTE no logout.
 * Idempotente e à prova de falha (não lança).
 */
export async function markCurrentUserOffline(): Promise<void> {
  const profileId = currentProfileId;
  const token = currentAccessToken;
  if (!profileId) return;
  try {
    // Tentativa 1: SDK (passa pelo RLS com sessão ainda válida)
    await (supabase as any)
      .from('profiles')
      .update({ is_online: false, last_seen: new Date().toISOString() })
      .eq('id', profileId);
  } catch {
    // Tentativa 2 (fallback): fetch keepalive — não bloqueia o signOut
    try {
      if (!token) return;
      const url = `${EXTERNAL_SUPABASE_URL}/rest/v1/profiles?id=eq.${profileId}`;
      const apikey =
        (supabase as any).rest?.headers?.apikey ||
        (supabase as any)?.supabaseKey ||
        '';
      await fetch(url, {
        method: 'PATCH',
        keepalive: true,
        headers: {
          'Content-Type': 'application/json',
          apikey,
          Authorization: `Bearer ${token}`,
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({
          is_online: false,
          last_seen: new Date().toISOString(),
        }),
      });
    } catch {
      // ignore
    }
  } finally {
    currentProfileId = null;
    currentAccessToken = null;
  }
}

export function usePresence() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user?.id) {
      currentProfileId = null;
      currentAccessToken = null;
      return;
    }

    let cancelled = false;
    let lastUpdate = 0;

    const bootstrap = async () => {
      const [{ data: profile }, { data: sessionData }] = await Promise.all([
        supabase.from('profiles').select('id').eq('user_id', user.id).maybeSingle(),
        supabase.auth.getSession(),
      ]);
      if (cancelled) return;
      currentProfileId = profile?.id ?? null;
      currentAccessToken = sessionData.session?.access_token ?? null;
    };

    const heartbeat = async (force = false) => {
      if (cancelled) return;
      // Anti-falso-online: NÃO mandar heartbeat quando a aba está oculta
      // (background tab/PWA dormindo). Sem heartbeat, last_seen envelhece
      // e o usuário some da lista de online em ~2 min, sem precisar marcar
      // offline explicitamente (o que causava o flicker antes).
      if (!force && typeof document !== 'undefined' && document.visibilityState !== 'visible') {
        return;
      }
      const now = Date.now();
      if (!force && now - lastUpdate < MIN_UPDATE_INTERVAL) return;
      lastUpdate = now;
      try {
        if (!currentProfileId) await bootstrap();
        if (!currentProfileId) return;
        // Otimismo no frontend: dispara antes do round-trip para que
        // listas (ex.: "Boas-vindas aos novos") movam o card pra primeira
        // posição na hora, sem esperar realtime.
        try {
          window.dispatchEvent(
            new CustomEvent('oculto:presence-online', {
              detail: { profileId: currentProfileId, ts: Date.now() },
            }),
          );
        } catch {}
        await (supabase as any)
          .from('profiles')
          .update({
            is_online: true,
            last_seen: new Date().toISOString(),
          })
          .eq('id', currentProfileId);
      } catch {
        // silencioso — próximo heartbeat tenta de novo
      }
    };

    // Boot + heartbeat inicial imediato
    bootstrap().then(() => heartbeat(true));
    // Heartbeat só roda quando aba visível — heartbeat() já checa visibility,
    // mas pausamos o setInterval em background para zerar custo de CPU/wake-lock
    // em low-end mobile (Android backgrounded WebView).
    let interval: number | null = window.setInterval(() => heartbeat(false), HEARTBEAT_INTERVAL);
    const ensureInterval = () => {
      if (interval == null) {
        interval = window.setInterval(() => heartbeat(false), HEARTBEAT_INTERVAL);
      }
    };
    const clearTick = () => {
      if (interval != null) { window.clearInterval(interval); interval = null; }
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        ensureInterval();
        // FORÇA atualização ao retornar para a aba — evita janela "stale"
        heartbeat(true);
      } else {
        // Pausa o tick em background — zera CPU/bateria em low-end.
        clearTick();
      }
    };

    const handleFocus = () => heartbeat(true);

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleFocus);

    return () => {
      cancelled = true;
      clearTick();
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleFocus);
      // IMPORTANTE: NÃO marca offline aqui. Só o signOut explícito faz isso.
    };
  }, [user?.id]);
}

/**
 * useEnsureWelcomeMessage — rede de segurança com retry exponencial.
 * Chama o RPC `ensure_welcome_message_for_me` no /feed.
 * - 1x por usuário (sessionStorage). Em falha, tenta até 3x (1.5s/4s/9s).
 * - Idempotente no DB. Loga warning em cada falha.
 */
import { useEffect } from 'react';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from './useAuth';

const KEY_PREFIX = 'oculto:welcome-ensured:v2:';
const DELAYS_MS = [1500, 4000, 9000];

export function useEnsureWelcomeMessage() {
  const { user } = useAuth();

  useEffect(() => {
    const uid = user?.id;
    if (!uid) return;

    const key = KEY_PREFIX + uid;
    try {
      if (sessionStorage.getItem(key) === '1') return;
    } catch { /* sessionStorage indisponível */ }

    let cancelled = false;
    const timers: number[] = [];

    const attempt = async (i: number): Promise<void> => {
      if (cancelled) return;
      try {
        const { error } = await (supabase as any).rpc('ensure_welcome_message_for_me');
        if (error) throw error;
        try { sessionStorage.setItem(key, '1'); } catch { /* noop */ }
        // sucesso silencioso
      } catch (err: any) {
        const msg = err?.message || String(err);
        console.warn(
          `[Oculto] ensure_welcome_message_for_me falhou (tentativa ${i + 1}/${DELAYS_MS.length}):`,
          msg,
        );
        const next = i + 1;
        if (next < DELAYS_MS.length) {
          const t = window.setTimeout(() => attempt(next), DELAYS_MS[next]);
          timers.push(t);
        } else {
          console.warn(
            '[Oculto] ensure_welcome_message_for_me: todas as tentativas falharam. ' +
            'A mensagem será reenviada no próximo login.',
          );
        }
      }
    };

    const t0 = window.setTimeout(() => attempt(0), DELAYS_MS[0]);
    timers.push(t0);

    return () => {
      cancelled = true;
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, [user?.id]);
}

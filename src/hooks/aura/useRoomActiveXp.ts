/**
 * useRoomActiveXp — Recompensa por permanência ativa em uma sala do Aura Match.
 *
 * Regras:
 * - Ciclo = 600s (10 min) com aba visível e usuário presente.
 * - Para receber +10 XP no fim do ciclo, precisa ter enviado >= 2 mensagens
 *   com textos DIFERENTES (normalizados).
 * - Se ficar oculto/sair da rota → reset total.
 * - Após o 1º ciclo, inatividade > 120s sem nova mensagem válida → contador PAUSA
 *   (não zera) até o usuário voltar a escrever.
 * - Toda a lógica usa refs e um único setInterval(1s) → zero overhead de re-render.
 *
 * Server-side: o RPC `aura_room_award_active_xp` aplica cooldown de 9 min como
 * fonte da verdade — burlas no client são bloqueadas.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseExternal';
import { toast } from 'sonner';

const CYCLE_SECONDS = 600;            // 10 min
const INACTIVITY_FREEZE_SEC = 120;    // 2 min
const MIN_UNIQUE_MESSAGES = 2;
const MAX_UNIQUE_TRACKED = 20;

export type RoomActiveXpStatus = 'idle' | 'counting' | 'paused' | 'rewarded';

export interface RoomActiveXpState {
  elapsed: number;           // segundos no ciclo atual
  remaining: number;         // segundos restantes (CYCLE_SECONDS - elapsed)
  uniqueCount: number;       // mensagens diferentes no ciclo atual
  cycleCount: number;        // ciclos concluídos com bônus
  status: RoomActiveXpStatus;
  awardFlash: boolean;       // true por 2s após bonificação
}

interface Options {
  slug: string;
  enabled: boolean;
  meUserId: string | null;
}

function normalize(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function useRoomActiveXp({ slug, enabled, meUserId }: Options) {
  const [state, setState] = useState<RoomActiveXpState>({
    elapsed: 0,
    remaining: CYCLE_SECONDS,
    uniqueCount: 0,
    cycleCount: 0,
    status: 'idle',
    awardFlash: false,
  });

  // Refs internas (não disparam re-render)
  const elapsedRef = useRef(0);
  const uniqueRef = useRef<Set<string>>(new Set());
  const cycleCountRef = useRef(0);
  const pausedRef = useRef(false);
  const lastActivityRef = useRef<number>(Date.now());
  const visibleRef = useRef<boolean>(
    typeof document === 'undefined' || document.visibilityState !== 'hidden'
  );
  const awardingRef = useRef(false);
  const flashTimerRef = useRef<number | null>(null);
  const tickKeyRef = useRef(0);

  // Sincroniza estado público apenas 1x/segundo
  const publish = useCallback((partial: Partial<RoomActiveXpState>) => {
    setState((prev) => {
      const next = { ...prev, ...partial };
      if (
        prev.elapsed === next.elapsed &&
        prev.uniqueCount === next.uniqueCount &&
        prev.cycleCount === next.cycleCount &&
        prev.status === next.status &&
        prev.awardFlash === next.awardFlash
      ) return prev;
      next.remaining = Math.max(0, CYCLE_SECONDS - next.elapsed);
      return next;
    });
  }, []);

  const resetCycle = useCallback(() => {
    elapsedRef.current = 0;
    uniqueRef.current = new Set();
    pausedRef.current = false;
    lastActivityRef.current = Date.now();
  }, []);

  const fullReset = useCallback(() => {
    resetCycle();
    cycleCountRef.current = 0;
    publish({
      elapsed: 0, remaining: CYCLE_SECONDS, uniqueCount: 0,
      cycleCount: 0, status: 'idle', awardFlash: false,
    });
  }, [publish, resetCycle]);

  // Registra atividade (chamado por handleSend após envio bem-sucedido)
  const registerMessage = useCallback((rawText: string) => {
    if (!enabled) return;
    const norm = normalize(rawText);
    if (!norm) return;
    const set = uniqueRef.current;
    if (set.has(norm)) {
      // mensagem repetida — não conta, mas conta como atividade leve para despausar
      lastActivityRef.current = Date.now();
      if (pausedRef.current) {
        pausedRef.current = false;
        publish({ status: 'counting' });
      }
      return;
    }
    set.add(norm);
    if (set.size > MAX_UNIQUE_TRACKED) {
      // remove o primeiro (mais antigo) — Set mantém ordem de inserção
      const first = set.values().next().value;
      if (first !== undefined) set.delete(first);
    }
    lastActivityRef.current = Date.now();
    if (pausedRef.current) {
      pausedRef.current = false;
    }
    publish({ uniqueCount: set.size, status: 'counting' });
  }, [enabled, publish]);

  // Loop principal
  useEffect(() => {
    if (!enabled || !meUserId) {
      fullReset();
      return;
    }
    publish({ status: 'counting' });
    const key = ++tickKeyRef.current;

    const onVisibility = () => {
      visibleRef.current = document.visibilityState !== 'hidden';
    };
    document.addEventListener('visibilitychange', onVisibility);

    const interval = window.setInterval(async () => {
      if (key !== tickKeyRef.current) return;
      if (!visibleRef.current) return; // aba oculta — não conta
      if (pausedRef.current) return;

      // Verifica congelamento por inatividade (apenas após 1º ciclo)
      if (cycleCountRef.current >= 1) {
        const idleMs = Date.now() - lastActivityRef.current;
        if (idleMs > INACTIVITY_FREEZE_SEC * 1000) {
          pausedRef.current = true;
          publish({ status: 'paused' });
          return;
        }
      }

      elapsedRef.current += 1;

      if (elapsedRef.current >= CYCLE_SECONDS) {
        // Fim do ciclo
        const eligible = uniqueRef.current.size >= MIN_UNIQUE_MESSAGES;
        if (eligible && !awardingRef.current) {
          awardingRef.current = true;
          try {
            const { data } = await (supabase as any).rpc('aura_room_award_active_xp', {
              p_slug: slug,
            });
            const row = Array.isArray(data) ? data[0] : data;
            if (row?.ok) {
              cycleCountRef.current += 1;
              toast.success('+10 XP por 10 min ativo na sala 🔥');
              if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current);
              publish({
                cycleCount: cycleCountRef.current,
                status: 'rewarded',
                awardFlash: true,
              });
              flashTimerRef.current = window.setTimeout(() => {
                publish({ awardFlash: false, status: 'counting' });
              }, 2000);
              try {
                window.dispatchEvent(new CustomEvent('aura-xp:room-cycle', {
                  detail: { slug, amount: 10, newXp: row.new_xp },
                }));
              } catch { /* noop */ }
            }
          } catch { /* silencioso */ }
          finally { awardingRef.current = false; }
        }
        resetCycle();
        publish({ elapsed: 0, uniqueCount: 0 });
      } else {
        publish({ elapsed: elapsedRef.current, uniqueCount: uniqueRef.current.size });
      }
    }, 1000);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
      if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current);
      fullReset();
    };
  }, [enabled, meUserId, slug, publish, resetCycle, fullReset]);

  return { state, registerMessage };
}

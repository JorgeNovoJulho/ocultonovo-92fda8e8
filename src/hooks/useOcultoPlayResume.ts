/**
 * useOcultoPlayResume — Etapa 45
 *
 * Busca a última posição salva do usuário para um item e faz seek
 * automático no media element quando ele estiver pronto (loadedmetadata).
 * Mostra toast informando "Continuando aos mm:ss".
 *
 * Regras:
 * - Não retoma se já estava `completed`.
 * - Não retoma se posição < 5s (curto demais para valer a pena).
 * - Não retoma se posição estiver a menos de 10s do fim.
 */
import { useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabaseExternal';
import { toast } from '@/hooks/use-toast';
import { consumePlaySeekHint } from '@/lib/ocultoPlaySeekHint';

interface Options {
  itemId: string | null | undefined;
  mediaRef: React.RefObject<HTMLVideoElement | HTMLAudioElement | null>;
  /** Se false, desativa o resume (ex.: usuário escolheu reiniciar). */
  enabled?: boolean;
}

const MIN_RESUME_SECONDS = 5;
const TAIL_SAFETY_SECONDS = 10;

function fmt(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function useOcultoPlayResume({ itemId, mediaRef, enabled = true }: Options) {
  const appliedItemRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || !itemId) return;
    if (appliedItemRef.current === itemId) return;

    let alive = true;
    let attached = false;
    const el = mediaRef.current;

    (async () => {
      try {
        // Etapa 52 — hint de timestamp via link compartilhado (?t=NN) tem prioridade
        const hint = consumePlaySeekHint(itemId);
        if (hint != null && hint >= MIN_RESUME_SECONDS) {
          const m = mediaRef.current;
          const applyHint = () => {
            try {
              if (!m) return;
              m.currentTime = hint;
              toast({
                title: 'Pulando para o momento compartilhado',
                description: fmt(hint),
                duration: 2500,
              });
              appliedItemRef.current = itemId;
            } catch { /* ignore */ }
          };
          if (m && m.readyState >= 1) applyHint();
          else if (m) {
            attached = true;
            m.addEventListener('loadedmetadata', applyHint, { once: true });
          }
          return;
        }

        const { data, error } = await supabase.rpc('oculto_play_resume_position', {
          p_item_id: itemId,
        });
        if (!alive || error) return;
        const row = Array.isArray(data) ? data[0] : data;
        if (!row) return;

        const pos = Number(row.position_seconds) || 0;
        const dur = Number(row.duration_seconds) || 0;
        const done = !!row.completed;

        if (done) return;
        if (pos < MIN_RESUME_SECONDS) return;
        if (dur > 0 && pos >= dur - TAIL_SAFETY_SECONDS) return;

        const m = mediaRef.current;
        if (!m) return;

        const applySeek = () => {
          try {
            m.currentTime = pos;
            toast({
              title: 'Continuando de onde parou',
              description: `${fmt(pos)} · clique no início para reiniciar`,
              duration: 2500,
            });
            appliedItemRef.current = itemId;
          } catch { /* ignore */ }
        };

        if (m.readyState >= 1 /* HAVE_METADATA */) {
          applySeek();
        } else {
          attached = true;
          m.addEventListener('loadedmetadata', applySeek, { once: true });
        }
      } catch { /* silencioso */ }
    })();

    return () => {
      alive = false;
      if (attached && el) {
        // listener é once: -se ainda não disparou, removemos
        el.removeEventListener('loadedmetadata', () => {});
      }
    };
  }, [itemId, enabled, mediaRef]);

  /** Reset manual — para botão "Recomeçar do início". */
  const restart = () => {
    appliedItemRef.current = null;
    const m = mediaRef.current;
    if (m) {
      try { m.currentTime = 0; } catch { /* ignore */ }
    }
  };

  return { restart };
}

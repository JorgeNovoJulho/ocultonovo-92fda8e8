/**
 * useOcultoPlayPipMode — Etapa 38
 *
 * Engloba a Picture-in-Picture API do navegador e um "Modo Áudio em Segundo Plano"
 * leve (oculta o vídeo na UI, mas mantém o <video> tocando para preservar o áudio).
 *
 * - PiP: usa requestPictureInPicture / exitPictureInPicture (quando suportado).
 * - Audio: estado local; o consumidor decide ocultar visualmente o vídeo.
 * - Telemetria opcional via RPC `oculto_play_log_pip_event` (silencioso em falha).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseExternal';

type Mode = 'pip' | 'audio';

type VideoEl = HTMLVideoElement & {
  requestPictureInPicture?: () => Promise<PictureInPictureWindow>;
  disablePictureInPicture?: boolean;
};

type DocEl = Document & {
  pictureInPictureElement?: Element | null;
  exitPictureInPicture?: () => Promise<void>;
  pictureInPictureEnabled?: boolean;
};

function logEvent(itemId: string | null | undefined, mode: Mode, event: 'enter' | 'exit', durationMs?: number) {
  if (!itemId) return;
  try {
    supabase.rpc('oculto_play_log_pip_event', {
      _item_id: itemId,
      _mode: mode,
      _event: event,
      _duration_ms: durationMs ?? null,
    }).then(() => {}, () => {});
  } catch {
    // ignora — telemetria não pode quebrar UX
  }
}

export function useOcultoPlayPipMode(videoRef: React.RefObject<HTMLVideoElement | null>, currentItemId?: string | null) {
  const [pipActive, setPipActive] = useState(false);
  const [audioOnly, setAudioOnly] = useState(false);
  const pipStartRef = useRef<number | null>(null);
  const audioStartRef = useRef<number | null>(null);

  const pipSupported = typeof window !== 'undefined' && !!(document as DocEl).pictureInPictureEnabled;

  // Sincroniza estado quando o usuário sai do PiP por fora (botão nativo)
  useEffect(() => {
    const v = videoRef.current as VideoEl | null;
    if (!v) return;
    const onEnter = () => {
      setPipActive(true);
      pipStartRef.current = Date.now();
      logEvent(currentItemId, 'pip', 'enter');
    };
    const onLeave = () => {
      const dur = pipStartRef.current ? Date.now() - pipStartRef.current : undefined;
      pipStartRef.current = null;
      setPipActive(false);
      logEvent(currentItemId, 'pip', 'exit', dur);
    };
    v.addEventListener('enterpictureinpicture', onEnter);
    v.addEventListener('leavepictureinpicture', onLeave);
    return () => {
      v.removeEventListener('enterpictureinpicture', onEnter);
      v.removeEventListener('leavepictureinpicture', onLeave);
    };
  }, [videoRef, currentItemId]);

  const togglePip = useCallback(async () => {
    const v = videoRef.current as VideoEl | null;
    const doc = document as DocEl;
    if (!v || !pipSupported) return;
    try {
      if (doc.pictureInPictureElement === v) {
        await doc.exitPictureInPicture?.();
      } else {
        if (v.disablePictureInPicture) v.disablePictureInPicture = false;
        await v.requestPictureInPicture?.();
      }
    } catch {
      // navegador pode recusar (autoplay/gesture). Silencioso.
    }
  }, [videoRef, pipSupported]);

  const toggleAudioOnly = useCallback(() => {
    setAudioOnly((prev) => {
      const next = !prev;
      if (next) {
        audioStartRef.current = Date.now();
        logEvent(currentItemId, 'audio', 'enter');
      } else {
        const dur = audioStartRef.current ? Date.now() - audioStartRef.current : undefined;
        audioStartRef.current = null;
        logEvent(currentItemId, 'audio', 'exit', dur);
      }
      return next;
    });
  }, [currentItemId]);

  // Ao desmontar, fecha PiP defensivamente para liberar pipeline
  useEffect(() => {
    return () => {
      const doc = document as DocEl;
      if (doc.pictureInPictureElement) {
        doc.exitPictureInPicture?.().catch(() => {});
      }
    };
  }, []);

  return {
    pipSupported,
    pipActive,
    audioOnly,
    togglePip,
    toggleAudioOnly,
  };
}

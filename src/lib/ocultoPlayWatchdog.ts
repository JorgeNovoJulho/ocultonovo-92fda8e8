/**
 * ocultoPlayWatchdog — observa eventos de ciclo de vida e limpa somente mídia
 * DOM pesada (vídeos/previews) sem interromper a sessão compartilhada de áudio.
 *
 * Também expõe `stopAllOcultoPlayMediaNow()` para uso direto no fechamento
 * de modais (focus item / fullscreen player).
 *
 * Implementado como singleton com contador de refs, para múltiplos
 * componentes poderem registrar/desregistrar sem se atropelarem.
 */
import { stopOcultoPlayMedia } from './ocultoPlayMediaStop';

let refs = 0;
let attached = false;

function killPageMediaOnly() {
  try { stopOcultoPlayMedia(document, { pauseSharedAudio: false }); } catch { /* noop */ }
}

/**
 * Soft-pause: apenas pausa mídia visível sem remover src/load().
 * Usado em blur/visibility para não destruir o player quando o usuário
 * clica fora, abre um menu, ou uma iframe/anúncio rouba foco.
 */
function softPausePageMedia() {
  try {
    document.querySelectorAll<HTMLMediaElement>('video,audio').forEach((el) => {
      // Não pause o player principal em fullscreen — usuário está assistindo.
      if (document.fullscreenElement && document.fullscreenElement.contains(el)) return;
      // Só pausa se estava tocando; preserva src e posição.
      try { if (!el.paused) el.pause(); } catch { /* noop */ }
    });
  } catch { /* noop */ }
}

function onVisibility() {
  // Apenas soft-pause quando a aba fica oculta: preserva posição e src.
  if (typeof document !== 'undefined' && document.hidden) softPausePageMedia();
}
function onPageHide() { killPageMediaOnly(); }
function onFreeze() { killPageMediaOnly(); }

function attach() {
  if (attached || typeof window === 'undefined') return;
  attached = true;
  document.addEventListener('visibilitychange', onVisibility, { passive: true });
  // NOTA: `window.blur` era destrutivo — disparava em cliques inócuos
  // (menus, iframes, popovers) e quebrava a reprodução. Removido.
  window.addEventListener('pagehide', onPageHide, { passive: true });
  // 'freeze' existe em Chromium (Page Lifecycle API)
  document.addEventListener('freeze', onFreeze as EventListener, { passive: true } as AddEventListenerOptions);
}

function detach() {
  if (!attached || typeof window === 'undefined') return;
  attached = false;
  document.removeEventListener('visibilitychange', onVisibility);
  window.removeEventListener('pagehide', onPageHide);
  document.removeEventListener('freeze', onFreeze as EventListener);
}

/** Registra um consumidor do watchdog. Retorna fn para desregistrar. */
export function registerOcultoPlayWatchdog(): () => void {
  refs += 1;
  attach();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    refs = Math.max(0, refs - 1);
    if (refs === 0) {
      detach();
      // Ao sair da rota, mata vídeos/previews residuais sem derrubar o mini player.
      killPageMediaOnly();
    }
  };
}

/** Para imediatamente toda mídia do Oculto Play (use ao fechar modal). */
export function stopAllOcultoPlayMediaNow(opts: { pauseSharedAudio?: boolean } = {}) {
  try { stopOcultoPlayMedia(document, { pauseSharedAudio: opts.pauseSharedAudio !== false }); } catch { /* noop */ }
}

/**
 * ocultoPlayMediaStop — utilitário de "kill switch" para mídia do OCULTO PLAY.
 *
 * Garante que ao fechar o modal de vídeo, sair da página /oculto-play ou
 * desmontar o feed vertical, NENHUM <video>/<audio> continue baixando ou
 * tocando em segundo plano (sintoma: o som do vídeo voltava em outra tela
 * depois de o usuário ter saído do Oculto Play).
 *
 * Estratégia:
 *  - Para cada elemento encontrado: pause(); zera src; chama load() para
 *    forçar o browser a liberar decoder/buffer; remove autoplay/loop.
 *  - Remove todos os `<link rel="preload" as="video" data-op-preload-video>`
 *    do <head>: senão o browser segue baixando o arquivo inteiro mesmo após
 *    a navegação SPA, ocupando rede e podendo retomar reprodução em mobile.
 *  - Pausa qualquer áudio compartilhado do Play (mini player) — opcional.
 */
import { pauseAllAudios } from './ocultoPlayAudioBus';

function hardStopMediaElement(el: HTMLMediaElement | null | undefined) {
  if (!el) return;
  try { el.pause(); } catch { /* noop */ }
  try { el.muted = true; } catch { /* noop */ }
  try { (el as HTMLMediaElement).autoplay = false; } catch { /* noop */ }
  try { (el as HTMLMediaElement).loop = false; } catch { /* noop */ }
  try {
    // Remover o src + load() é o único caminho cross-browser que realmente
    // mata download em andamento e libera o decoder em mobile.
    el.removeAttribute('src');
    while (el.firstChild) el.removeChild(el.firstChild);
    el.load();
  } catch { /* noop */ }
}

export function clearOcultoPlayPreloadLinks() {
  try {
    document.head
      .querySelectorAll<HTMLLinkElement>('link[data-op-preload-video]')
      .forEach((l) => { try { l.remove(); } catch { /* noop */ } });
  } catch { /* noop */ }
}

/**
 * Para toda a mídia do Oculto Play dentro de `root` (ou no documento todo
 * se `root` não for passado). Também limpa `<link rel=preload as=video>`
 * residuais e, por padrão, pausa o mini player de áudio compartilhado.
 */
export function stopOcultoPlayMedia(root?: ParentNode | null, opts: { pauseSharedAudio?: boolean } = {}) {
  const scope: ParentNode = root ?? document;
  try {
    scope.querySelectorAll<HTMLVideoElement>('video').forEach(hardStopMediaElement);
    scope.querySelectorAll<HTMLAudioElement>('audio').forEach(hardStopMediaElement);
  } catch { /* noop */ }
  clearOcultoPlayPreloadLinks();
  if (opts.pauseSharedAudio !== false) {
    try { pauseAllAudios(); } catch { /* noop */ }
  }
}

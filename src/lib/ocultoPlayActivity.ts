/**
 * ocultoPlayActivity — registra quais mídias do Oculto Play estão tocando agora.
 * Usado pelo useInactivityLogout para NÃO deslogar o usuário enquanto houver
 * vídeo ou áudio reproduzindo no Oculto Play.
 */
const active = new Set<string>();

export function markOcultoPlayMediaPlaying(id: string) {
  if (!id) return;
  active.add(id);
}

export function markOcultoPlayMediaStopped(id: string) {
  if (!id) return;
  active.delete(id);
}

export function isAnyOcultoPlayMediaPlaying(): boolean {
  return active.size > 0;
}

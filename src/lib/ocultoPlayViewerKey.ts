/**
 * ocultoPlayViewerKey — chave anônima do "viewer" do Oculto Play, persistida
 * em localStorage para que a deduplicação de visualizações continue válida
 * mesmo após o usuário atualizar a página, abrir uma nova aba ou ficar
 * deslogado. A chave NÃO contém PII e é apenas um identificador opaco.
 *
 * Reutilizada por:
 *  - usePlayLinkViews (links externos)
 *  - useRegisterOcultoPlayCardView (vídeos/áudios nativos)
 */
const VIEWER_KEY_LS = 'oculto:play:viewer-key';

export function getOcultoPlayViewerKey(): string {
  try {
    const existing = localStorage.getItem(VIEWER_KEY_LS);
    if (existing && existing.length > 0) return existing;
    const fresh =
      (globalThis.crypto?.randomUUID?.() as string | undefined) ||
      `anon-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(VIEWER_KEY_LS, fresh);
    return fresh;
  } catch {
    // localStorage indisponível (modo privado etc.) — chave volátil de fallback.
    return `anon-${Date.now()}`;
  }
}

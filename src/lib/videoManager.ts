/**
 * Singleton Global Video/Audio Manager
 * Garante que apenas 1 player de vídeo esteja ativo por vez.
 * Ao ativar um novo player, destrói completamente o anterior.
 */

type CleanupFn = () => void;

class VideoManager {
  private activeId: string | null = null;
  private cleanupFn: CleanupFn | null = null;

  /**
   * Registra um player como ativo. Se já houver outro ativo, destrói-o.
   * Retorna `true` se o registro foi aceito.
   */
  activate(id: string, cleanup: CleanupFn): boolean {
    // Se é o mesmo player, ignora
    if (this.activeId === id) return true;

    // Destrói o anterior
    this.killActive();

    this.activeId = id;
    this.cleanupFn = cleanup;
    return true;
  }

  /**
   * Desativa um player específico (se for o ativo).
   */
  deactivate(id: string) {
    if (this.activeId !== id) return;
    this.killActive();
  }

  /**
   * Destrói o player ativo, liberando memória.
   */
  private killActive() {
    if (this.cleanupFn) {
      try {
        this.cleanupFn();
      } catch {
        // silencioso
      }
    }
    this.activeId = null;
    this.cleanupFn = null;
  }

  /**
   * Verifica se um dado id é o player ativo.
   */
  isActive(id: string): boolean {
    return this.activeId === id;
  }

  /** Pausa o player ativo (se houver), sem desregistrar. */
  pauseActive() {
    this.killActive();
  }
}

// Singleton exportado
export const videoManager = new VideoManager();


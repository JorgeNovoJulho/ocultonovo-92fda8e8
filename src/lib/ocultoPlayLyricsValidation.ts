/**
 * Validação centralizada para letras de música (Oculto Play).
 * Usado pelo modal de publicação e pelo modal de edição.
 */
export const LYRICS_MAX_CHARS = 20000;
export const LYRICS_MAX_FILE_BYTES = 200 * 1024; // 200 KB
export const LYRICS_ACCEPTED_EXT = ['.txt'];
export const LYRICS_ACCEPTED_MIMES = ['text/plain', ''];

export interface LyricsValidationResult {
  ok: boolean;
  value: string;
  /** Mensagem amigável para exibir ao usuário (toast / inline). */
  error?: string;
  /** true quando o texto foi aceito porém truncado para caber no limite. */
  truncated?: boolean;
}

/** Valida um File selecionado/arrastado antes da leitura. */
export function validateLyricsFile(file: File): { ok: boolean; error?: string } {
  const name = (file.name || '').toLowerCase();
  const okExt = LYRICS_ACCEPTED_EXT.some((e) => name.endsWith(e));
  const okMime = LYRICS_ACCEPTED_MIMES.includes(file.type);
  if (!okExt && !okMime) {
    return { ok: false, error: 'Formato inválido. Envie um arquivo .txt em UTF-8.' };
  }
  if (file.size > LYRICS_MAX_FILE_BYTES) {
    const kb = (file.size / 1024).toFixed(0);
    return {
      ok: false,
      error: `Arquivo muito grande (${kb} KB). Limite: 200 KB.`,
    };
  }
  return { ok: true };
}

/** Valida o texto cru (após leitura ou colagem). Trunca se necessário. */
export function validateLyricsText(raw: string): LyricsValidationResult {
  const text = typeof raw === 'string' ? raw : '';
  if (text.length <= LYRICS_MAX_CHARS) {
    return { ok: true, value: text };
  }
  return {
    ok: false,
    value: text.slice(0, LYRICS_MAX_CHARS),
    truncated: true,
    error: `Letra excede ${LYRICS_MAX_CHARS.toLocaleString('pt-BR')} caracteres — texto cortado no limite.`,
  };
}

/**
 * Lê um File de letra (.txt) com as mesmas validações de tamanho/formato
 * usadas no upload via input. Resolve com o texto validado (possivelmente
 * truncado) ou rejeita com mensagem amigável.
 */
export function readLyricsFile(file: File): Promise<LyricsValidationResult> {
  return new Promise((resolve, reject) => {
    const fileCheck = validateLyricsFile(file);
    if (!fileCheck.ok) {
      reject(new Error(fileCheck.error ?? 'Arquivo inválido.'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const raw = String(reader.result ?? '');
      resolve(validateLyricsText(raw));
    };
    reader.onerror = () => reject(new Error('Falha ao ler o arquivo.'));
    reader.readAsText(file, 'utf-8');
  });
}

/**
 * Extrai o primeiro arquivo .txt de um DataTransfer (drag-and-drop ou
 * clipboard). Retorna null se nada compatível for encontrado.
 */
export function pickLyricsFileFromDataTransfer(dt: DataTransfer | null): File | null {
  if (!dt) return null;
  const files = Array.from(dt.files ?? []);
  if (files.length === 0) return null;
  // Prefere .txt explicitamente
  const txt = files.find((f) => /\.txt$/i.test(f.name) || f.type === 'text/plain' || f.type === '');
  return txt ?? files[0] ?? null;
}


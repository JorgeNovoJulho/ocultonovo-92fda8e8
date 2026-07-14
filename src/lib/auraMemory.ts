/**
 * Etapa 12 — IA comportamental leve.
 * Memória efêmera (sessionStorage) que aumenta o score de auras com as quais
 * o usuário interagiu na sessão. Zero rede, zero RPC, zero peso.
 *
 * Sinais capturados:
 *  - tap (abriu painel)         → +6 pts
 *  - mensagem/super-like enviada → +12 pts (handled em outros pontos)
 *  - ignorada (dislike)         → -8 pts (decay já natural pelo PP)
 *
 * Tudo no client; não persiste entre sessões para preservar privacidade.
 */
const KEY = 'auraMemoryV1';

type Memory = Record<string, number>;

function read(): Memory {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Memory) : {};
  } catch {
    return {};
  }
}

function write(m: Memory) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(m));
  } catch {
    // silencioso (privacy mode etc.)
  }
}

export function bumpAuraInteraction(id: string, delta: number) {
  if (!id) return;
  const m = read();
  m[id] = Math.max(-30, Math.min(30, (m[id] || 0) + delta));
  write(m);
}

export function getAuraBoost(id: string): number {
  if (!id) return 0;
  const m = read();
  return m[id] || 0;
}

export function getAuraMemory(): Memory {
  return read();
}

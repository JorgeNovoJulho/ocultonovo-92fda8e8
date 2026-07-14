/**
 * Toast visual de nova mensagem — complementa som/vibração com aviso na tela.
 *
 * Regras invioláveis:
 *  1. UM toast por mensagem. Dedup tripla:
 *     - cache module-level por message id;
 *     - cache module-level por (conversationId + conteúdo);
 *     - `id` próprio do sonner (que também desduplica).
 *  2. Remetente SEMPRE como `@username`. Qualquer outra forma é normalizada
 *     para "Alguém". Função `formatSenderHandle` é o ponto único e exportado
 *     que valida isso (regex estrito Instagram-like: letras/dígitos/_./).
 *  3. Apenas UMA instância de listener pode disparar o toast (ver
 *     `acquireToastLeader` em `useGlobalChatNotifications`). Mesmo se este
 *     helper for chamado por engano de outro lugar, a dedup acima protege.
 */

import { toast } from 'sonner';

const recentlyShown = new Map<string, number>();
const DEDUP_WINDOW_MS = 6000;

function shouldShow(key: string): boolean {
  const now = Date.now();
  // GC do cache
  for (const [k, ts] of recentlyShown) {
    if (now - ts > DEDUP_WINDOW_MS) recentlyShown.delete(k);
  }
  if (recentlyShown.has(key)) return false;
  recentlyShown.set(key, now);
  return true;
}

/**
 * Valida e formata o remetente para exibição. Aceita strings no formato
 * `@usuario` (Instagram-like). Qualquer outra coisa — nome real, e-mail,
 * frase com espaços, undefined — vira "Alguém".
 *
 * Exportada para que QUALQUER call site que precise mencionar o remetente
 * em UI passe por aqui. Nunca formate handles à mão.
 */
export function formatSenderHandle(raw: unknown): string {
  if (typeof raw !== 'string') return 'Alguém';
  const v = raw.trim();
  if (!v.startsWith('@')) return 'Alguém';
  // @ + 1-30 chars de username válidos
  if (!/^@[a-zA-Z0-9._]{1,30}$/.test(v)) return 'Alguém';
  return v;
}

export interface NewMessageToastOptions {
  /** Identificador único do evento (ex.: `toast:<messageId>`) — dedup global. */
  key: string;
  /** Handle do remetente — DEVE vir como `@username`; será validado. */
  senderName?: string;
  /** Avatar opcional (URL). */
  avatarUrl?: string | null;
  /** Conteúdo bruto da mensagem (será truncado). */
  content?: string;
  /** Conversa de destino para o CTA "Abrir". */
  conversationId: string;
  /** Hook de navegação — receber callback evita acoplar este lib ao router. */
  onOpen?: (conversationId: string) => void;
  /** Mantido por compat — não tem mais efeito (sempre exibe se passar nos dedups). */
  force?: boolean;
}

export function showNewMessageToast(opts: NewMessageToastOptions): boolean {
  if (!opts || !opts.key) return false;

  // Dedup primário: por id da mensagem.
  if (!shouldShow(opts.key)) return false;

  // Dedup secundário: por (conversationId + conteúdo bruto). Protege contra
  // re-inserts/race entre listeners ou re-renders.
  const raw = (opts.content || '').trim();
  const contentKey = `cv:${opts.conversationId}::${raw.slice(0, 120)}`;
  if (!shouldShow(contentKey)) return false;

  const safeLabel = formatSenderHandle(opts.senderName);
  const title = `Nova mensagem de ${safeLabel}`;
  const preview = raw.length > 80 ? `${raw.slice(0, 77)}…` : (raw || 'Toque para ver');

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  toast(title, {
    id: opts.key, // sonner também desduplica por id
    description: preview,
    duration: 5000,
    position: isMobile ? 'top-center' : undefined,
    action: opts.onOpen
      ? {
          label: 'Abrir',
          onClick: () => opts.onOpen?.(opts.conversationId),
        }
      : undefined,
  });
  return true;
}

/** Utilitário para testes — limpa o cache de dedup. */
export function _resetNewMessageToastDedupForTests() {
  recentlyShown.clear();
}


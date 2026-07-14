/**
 * GlobalAdminCommentsRealtime — Inscrição única em oculto_post_admin_comments,
 * montada uma vez no topo da App para que QUALQUER página (feed, perfil, post
 * isolado) receba criação/edição/remoção do Comentário Master em tempo real.
 */
import { useAdminCommentsRealtime } from '@/hooks/useAdminCommentsRealtime';

export function GlobalAdminCommentsRealtime() {
  useAdminCommentsRealtime();
  return null;
}

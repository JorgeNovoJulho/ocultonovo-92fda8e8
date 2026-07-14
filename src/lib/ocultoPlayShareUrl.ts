import { EXTERNAL_SUPABASE_URL } from '@/lib/appConfig';
/**
 * Origem canônica para links de compartilhamento do OCULTO PLAY.
 * Em ambientes de preview (lovable.app, localhost) usamos o domínio
 * de produção para que previews de OG funcionem em apps externos
 * (WhatsApp, Telegram, iMessage, etc.).
 */
const CANONICAL_ORIGIN = 'https://ocultoswing.com.br';

/**
 * Endpoint SSR (edge function `og-play`) que serve HTML com Open Graph
 * dinâmico (título, descrição, capa do item) e redireciona humanos para
 * `/play/p/:id`. Crawlers como Telegram/WhatsApp/iMessage não executam
 * JS, então precisam de meta tags renderizadas no servidor — esta URL
 * é usada APENAS quando o link sai para fora (compartilhamento nativo,
 * DM, comunidade). A UI continua exibindo a URL canônica limpa.
 */
const OG_PLAY_ENDPOINT =
  `${EXTERNAL_SUPABASE_URL}/functions/v1/og-play`;

export function ocultoPlayShareOrigin(): string {
  if (typeof window === 'undefined') return CANONICAL_ORIGIN;
  const host = window.location.hostname;
  if (host === 'ocultoswing.com.br' || host === 'www.ocultoswing.com.br') {
    return window.location.origin;
  }
  return CANONICAL_ORIGIN;
}

/**
 * URL canônica do item (sem query). Usar para `<link rel="canonical">`,
 * `og:url` e qualquer referência que deva consolidar para o crawler.
 */
export function ocultoPlayShareUrl(itemId: string): string {
  return `${ocultoPlayShareOrigin()}/play/p/${itemId}`;
}

/**
 * URL canônica + cache-buster (`?v=<timestamp>`). É o que aparece no
 * campo "Copiar" do modal e na pré-visualização do link — sempre
 * bonita e padronizada.
 */
export function ocultoPlayShareUrlWithBust(itemId: string): string {
  return `${ocultoPlayShareUrl(itemId)}?v=3`;
}

/**
 * URL usada quando o link sai do app (Web Share API, DM, comunidade,
 * e-mail, etc.). `v=3` força crawlers (Facebook/WhatsApp/Telegram/X)
 * a refazerem o scrape após o deploy que estabilizou o endpoint da
 * capa em `/play/og-image/:id.<ext>` (sem fallback HTML).
 */
export function ocultoPlayShareUrlForSocial(itemId: string): string {
  return `${ocultoPlayShareOrigin()}/play/p/${itemId}?v=3`;
}

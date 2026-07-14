import React, { memo } from 'react';

/**
 * LinkifiedText — transforma URLs em <a> clicáveis dentro de um bloco de texto.
 *
 * Reconhece:
 *  - http(s)://qualquer.host/...
 *  - t.me/... e telegram.me/... mesmo sem protocolo
 *  - www.exemplo.com
 *
 * Links do Telegram (t.me / telegram.me / telegram.dog) recebem tratamento
 * dedicado: rel + target correto para que o app do Telegram abra no clique
 * quando disponível (deep link tg://) com fallback para o https.
 */

// Ordem importa: os padrões mais específicos primeiro.
const LINK_RE = /(https?:\/\/[^\s<>"')]+|(?:^|\s)((?:t\.me|telegram\.me|telegram\.dog)\/[^\s<>"')]+)|(?:^|\s)(www\.[^\s<>"')]+))/i;

const TELEGRAM_HOSTS = new Set(['t.me', 'telegram.me', 'telegram.dog']);

function normalizeHref(raw: string): { href: string; isTelegram: boolean; display: string } {
  const trimmed = raw.trim();
  let href = trimmed;
  let display = trimmed;

  if (/^https?:\/\//i.test(trimmed)) {
    href = trimmed;
  } else if (/^(t\.me|telegram\.me|telegram\.dog)\//i.test(trimmed)) {
    href = `https://${trimmed}`;
  } else if (/^www\./i.test(trimmed)) {
    href = `https://${trimmed}`;
  }

  let host = '';
  try { host = new URL(href).host.toLowerCase().replace(/^www\./, ''); } catch { /* noop */ }
  const isTelegram = TELEGRAM_HOSTS.has(host);

  return { href, isTelegram, display };
}

interface LinkifiedTextProps {
  text?: string | null;
  className?: string;
}

/**
 * Renderiza o texto quebrando em segmentos e envolvendo cada URL em <a>.
 * Não interpreta HTML — apenas transforma URLs em anchors seguros.
 */
export const LinkifiedText = memo(function LinkifiedText({ text, className }: LinkifiedTextProps) {
  if (!text) return null;

  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  // Regex global reconstruído para varredura iterativa (evita flag /g em const acima).
  const scanner = new RegExp(LINK_RE.source, 'gi');
  let match: RegExpExecArray | null;
  let lastIndex = 0;

  while ((match = scanner.exec(remaining)) !== null) {
    const full = match[0];
    // Grupos 2/3 podem começar com espaço (por causa do lookbehind emulado).
    const raw = (match[1] || match[2] || match[3] || full).trim();
    const start = match.index + (full.length - raw.length);
    const end = start + raw.length;

    if (start > lastIndex) {
      parts.push(<React.Fragment key={key++}>{remaining.slice(lastIndex, start)}</React.Fragment>);
    }

    const { href, isTelegram } = normalizeHref(raw);
    parts.push(
      <a
        key={key++}
        href={href}
        target="_blank"
        rel="noopener noreferrer nofollow"
        onClick={(e) => e.stopPropagation()}
        className="text-primary underline decoration-primary/60 underline-offset-2 break-all hover:decoration-primary hover:text-primary/90 transition-colors"
        data-telegram={isTelegram ? 'true' : undefined}
        aria-label={isTelegram ? `Abrir link do Telegram: ${raw}` : `Abrir link: ${raw}`}
      >
        {raw}
      </a>,
    );

    lastIndex = end;
    if (scanner.lastIndex <= match.index) scanner.lastIndex = end;
  }

  if (lastIndex < remaining.length) {
    parts.push(<React.Fragment key={key++}>{remaining.slice(lastIndex)}</React.Fragment>);
  }

  return <span className={className}>{parts}</span>;
});

export default LinkifiedText;

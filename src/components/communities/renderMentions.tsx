/**
 * renderMentions — quebra um texto em fragmentos React, transformando
 * `@username` em links fuchsia para `/perfil/:username` e URLs http(s)
 * em links externos clicáveis (target=_blank, rel=nofollow).
 *
 * `renderRichText` é o alias preferido (mantém compatibilidade com o
 * nome antigo `renderMentions`).
 */
import { Link } from 'react-router-dom';
import React from 'react';

const MENTION_RE = /(^|\s)@([A-Za-z0-9_.]{2,30})/g;
const URL_RE = /(https?:\/\/[^\s<>"')]+)/g;

interface Token {
  start: number;
  end: number;
  node: React.ReactNode;
}

function buildTokens(text: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  // Mentions
  MENTION_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = MENTION_RE.exec(text)) !== null) {
    const lead = m[1] ?? '';
    const username = m[2];
    const start = m.index + lead.length;
    const end = start + 1 + username.length;
    tokens.push({
      start,
      end,
      node: (
        <Link
          key={`m-${i++}-${start}`}
          to={`/perfil/${username}`}
          className="text-fuchsia-400 hover:text-fuchsia-300 hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          @{username}
        </Link>
      ),
    });
  }

  // URLs
  URL_RE.lastIndex = 0;
  while ((m = URL_RE.exec(text)) !== null) {
    const url = m[1].replace(/[)\].,!?;:]+$/g, '');
    const start = m.index;
    const end = start + url.length;
    // Evita conflito com menções já capturadas
    if (tokens.some((t) => start < t.end && end > t.start)) continue;
    tokens.push({
      start,
      end,
      node: (
        <a
          key={`u-${i++}-${start}`}
          href={url}
          target="_blank"
          rel="noopener noreferrer nofollow"
          onClick={(e) => e.stopPropagation()}
          className="text-sky-400 hover:text-sky-300 underline break-all"
        >
          {url}
        </a>
      ),
    });
  }

  return tokens.sort((a, b) => a.start - b.start);
}

export function renderRichText(text: string | null | undefined): React.ReactNode {
  if (!text) return null;
  const tokens = buildTokens(text);
  if (tokens.length === 0) return text;

  const out: React.ReactNode[] = [];
  let last = 0;
  for (const t of tokens) {
    if (t.start > last) out.push(text.slice(last, t.start));
    out.push(t.node);
    last = t.end;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

// Alias retrocompatível
export const renderMentions = renderRichText;

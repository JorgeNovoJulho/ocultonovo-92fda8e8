/**
 * MentionTextarea — Textarea com autocomplete de @usuário para comunidades.
 *
 * - Detecta `@token` antes do caret e abre um dropdown com membros ativos.
 * - Substitui o token pelo `@username` selecionado (com espaço final).
 * - Navegação por teclado: ↑ ↓ Enter Tab Esc.
 * - Touch/click no item também seleciona.
 */
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { supabase } from '@/lib/supabaseExternal';
import { cn } from '@/lib/utils';

interface MentionUser {
  user_id: string;
  username: string;
  name: string | null;
  avatar_url: string | null;
}

interface Props {
  communityId: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  maxLength?: number;
  className?: string;
  id?: string;
  disabled?: boolean;
}

function findMentionToken(text: string, caret: number): { start: number; query: string } | null {
  if (caret <= 0) return null;
  const upto = text.slice(0, caret);
  // Procura o @ mais recente seguido apenas de [A-Za-z0-9_.]
  const m = upto.match(/(^|\s)@([A-Za-z0-9_.]{0,30})$/);
  if (!m) return null;
  const start = upto.length - m[2].length - 1; // posição do '@'
  return { start, query: m[2] };
}

export function MentionTextarea({
  communityId,
  value,
  onChange,
  placeholder,
  rows = 3,
  maxLength,
  className,
  id,
  disabled,
}: Props) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const [token, setToken] = useState<{ start: number; query: string } | null>(null);
  const [results, setResults] = useState<MentionUser[]>([]);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);

  const open = !!token && (results.length > 0 || loading);

  // Debounced search
  useEffect(() => {
    if (!token) { setResults([]); return; }
    const q = token.query;
    if (q.length < 1) { setResults([]); return; }
    let cancelled = false;
    setLoading(true);
    const handle = setTimeout(async () => {
      try {
        const { data, error } = await (supabase as any).rpc('community_search_mentionable_users', {
          _community: communityId,
          _q: q,
          _limit: 8,
        });
        if (cancelled) return;
        if (error) { setResults([]); return; }
        setResults((data ?? []) as MentionUser[]);
        setActive(0);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 120);
    return () => { cancelled = true; clearTimeout(handle); };
  }, [token?.query, communityId]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.target.value;
    onChange(v);
    const t = findMentionToken(v, e.target.selectionStart ?? v.length);
    setToken(t);
  };

  const handleSelectionChange = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const t = findMentionToken(value, el.selectionStart ?? value.length);
    setToken(t);
  }, [value]);

  const insertMention = useCallback((u: MentionUser) => {
    if (!token) return;
    const before = value.slice(0, token.start);
    const after = value.slice(token.start + 1 + token.query.length);
    const inserted = `@${u.username} `;
    const next = before + inserted + after;
    onChange(next);
    setToken(null);
    setResults([]);
    // Reposiciona caret após a menção
    queueMicrotask(() => {
      const el = ref.current;
      if (!el) return;
      const pos = (before + inserted).length;
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  }, [token, value, onChange]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!open) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(results.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
    else if (e.key === 'Enter' || e.key === 'Tab') {
      if (results[active]) { e.preventDefault(); insertMention(results[active]); }
    } else if (e.key === 'Escape') { e.preventDefault(); setToken(null); }
  };

  return (
    <div className="relative">
      <Textarea
        ref={ref}
        id={id}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onKeyUp={handleSelectionChange}
        onClick={handleSelectionChange}
        onBlur={() => setTimeout(() => setToken(null), 120)}
        placeholder={placeholder}
        rows={rows}
        maxLength={maxLength}
        disabled={disabled}
        className={className}
      />
      {open && (
        <div className="absolute left-0 right-0 bottom-full mb-1 z-50 max-h-60 overflow-y-auto rounded-lg border border-border bg-popover shadow-lg">
          {loading && results.length === 0 && (
            <div className="px-3 py-2 text-xs text-muted-foreground">Buscando…</div>
          )}
          {results.map((u, i) => (
            <button
              key={u.user_id}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); insertMention(u); }}
              className={cn(
                'w-full flex items-center gap-2 px-2 py-1.5 text-left text-sm hover:bg-accent transition-colors',
                i === active && 'bg-accent',
              )}
            >
              <Avatar className="h-7 w-7">
                <AvatarImage src={u.avatar_url ?? undefined} alt={u.username} />
                <AvatarFallback className="text-[10px]">{u.username.slice(0, 2).toUpperCase()}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-foreground truncate">@{u.username}</div>
                {u.name && u.name !== u.username && (
                  <div className="text-[11px] text-muted-foreground truncate">{u.name}</div>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

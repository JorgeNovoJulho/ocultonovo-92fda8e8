/**
 * LoungeContent — "Quem passou por aqui nas últimas 24h".
 * Recepção real do slot Lounge: mostra avatares anônimos de visitantes recentes.
 */
import { Users2, Clock3 } from 'lucide-react';
import { useSocialBetaRecentUsers } from '@/hooks/useSocialBetaRecentUsers';
import { resolveAvatarUrl } from '@/lib/avatarUrl';
import { buildSupabaseImageThumb } from '@/lib/imageTransform';

function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'agora';
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

export function LoungeContent() {
  const { data, loading } = useSocialBetaRecentUsers('lounge', true, 18, 24);

  return (
    <section className="rounded-xl border border-border bg-card p-5 space-y-3">
      <div className="flex items-center gap-2">
        <Users2 className="h-4 w-4 text-foreground" />
        <h2 className="font-semibold">Quem passou por aqui</h2>
        <span className="ml-auto text-xs text-muted-foreground">últimas 24h</span>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : data.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Ninguém passou pelo Lounge nas últimas 24h. Seja o primeiro a abrir o espaço.
        </p>
      ) : (
        <ul className="flex flex-wrap gap-3">
          {data.map((u) => (
            <li key={u.user_id} className="flex items-center gap-2 rounded-lg border border-border bg-background px-2.5 py-1.5">
              {u.avatar_url ? (
                <img decoding="async" src={buildSupabaseImageThumb(resolveAvatarUrl(u.avatar_url) || '', { width: 56, quality: 70 }) || ''} alt="" loading="lazy"
                  className="h-7 w-7 rounded-full object-cover" />
              ) : (
                <div className="h-7 w-7 rounded-full bg-muted" />
              )}
              <div className="flex flex-col leading-tight">
                <span className="text-xs font-medium text-foreground">
                  {u.username ? '@' + u.username : (u.name || 'misterioso(a)')}
                </span>
                <span className="text-[10px] text-muted-foreground inline-flex items-center gap-1">
                  <Clock3 className="h-2.5 w-2.5" /> {timeAgo(u.last_visit)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

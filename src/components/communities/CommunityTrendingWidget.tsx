/**
 * Widget de comunidades em alta — exibido na página /comunidades.
 * Score: tópicos 7d ×3 + respostas 7d ×1 + membros ×0.1 (RPC community_trending).
 */
import { Link } from 'react-router-dom';
import { Flame, Users } from 'lucide-react';
import { useCommunityTrending } from '@/hooks/useCommunities';
import { buildSupabaseImageThumb } from '@/lib/imageTransform';

export function CommunityTrendingWidget() {
  const { data: trending = [], isLoading } = useCommunityTrending(5);

  if (isLoading || trending.length === 0) return null;

  return (
    <div className="mb-4 rounded-xl border border-border bg-card/40 p-3">
      <h2 className="text-xs font-semibold uppercase text-muted-foreground mb-2 flex items-center gap-1.5">
        <Flame className="h-3.5 w-3.5 text-orange-400" />
        Em alta esta semana
      </h2>
      <div className="space-y-1.5">
        {trending.map((c, idx) => (
          <Link
            key={c.community_id}
            to={`/comunidades/${c.slug}`}
            className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-accent/40 active:bg-accent transition-colors"
          >
            <span className="text-xs font-bold text-muted-foreground w-4 text-center">{idx + 1}</span>
            <div
              className="h-8 w-8 rounded-lg overflow-hidden flex items-center justify-center shrink-0"
              style={{ backgroundColor: c.accent_color || '#a855f7' }}
            >
              {c.avatar_url ? (
                <img src={buildSupabaseImageThumb(c.avatar_url, { width: 64, quality: 70 }) ?? c.avatar_url} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
              ) : (
                <Users className="h-4 w-4 text-white" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{c.title}</p>
              <p className="text-[10px] text-muted-foreground">
                {c.topics_7d} tópicos · {c.replies_7d} respostas · {c.members_count} membros
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

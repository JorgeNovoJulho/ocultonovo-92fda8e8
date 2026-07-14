/**
 * Strip horizontal "Suas comunidades" — exibe comunidades nas quais o usuário
 * é membro/dono. Some quando o usuário não participa de nenhuma.
 * Flat, sem shadows pesados, mobile-first (Realme C55 friendly).
 */
import { memo } from 'react';
import { Link } from 'react-router-dom';
import { Users, ChevronRight } from 'lucide-react';
import { useMyCommunities } from '@/hooks/useCommunities';
import { buildSupabaseImageThumb } from '@/lib/imageTransform';

export const MyCommunitiesFeedStrip = memo(function MyCommunitiesFeedStrip() {
  const { data: communities = [], isLoading } = useMyCommunities();

  if (isLoading || communities.length === 0) return null;

  return (
    <div className="mb-3 px-3">
      <div className="rounded-xl border border-border bg-card/40 p-3">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xs font-semibold uppercase text-muted-foreground flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" />
            Suas comunidades
          </h2>
          <Link
            to="/comunidades"
            className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-0.5"
          >
            ver todas <ChevronRight className="h-3 w-3" />
          </Link>
        </div>

        <div
          className="flex gap-2 overflow-x-auto -mx-1 px-1 pb-1 snap-x snap-mandatory"
          style={{ scrollbarWidth: 'none' }}
        >
          {communities.slice(0, 12).map((c) => {
            const accent = (c as any).accent_color || '#a855f7';
            const avatar = (c as any).avatar_url as string | null;
            return (
              <Link
                key={c.id}
                to={`/comunidades/${c.slug}`}
                className="snap-start shrink-0 w-[88px] flex flex-col items-center gap-1.5 p-1.5 rounded-lg hover:bg-accent/40 active:bg-accent transition-colors"
              >
                <div
                  className="h-14 w-14 rounded-xl overflow-hidden flex items-center justify-center"
                  style={{ backgroundColor: accent }}
                >
                  {avatar ? (
                    <img src={buildSupabaseImageThumb(avatar, { width: 112, quality: 70 }) ?? avatar} alt="" width={56} height={56} className="h-full w-full object-cover" loading="lazy" decoding="async" />
                  ) : (
                    <Users className="h-6 w-6 text-white" />
                  )}
                </div>
                <p className="text-[11px] font-medium text-center leading-tight line-clamp-2 w-full">
                  {c.title}
                </p>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
});

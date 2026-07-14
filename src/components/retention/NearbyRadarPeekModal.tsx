/**
 * NearbyRadarPeekModal — modal disparado pelo card "Quem cruzou seu caminho?"
 * dentro do Central Aura IA. Mostra um grid com perfis próximos usando a
 * MESMA fonte do Radar (`useRadarUsers`).
 */
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Radar, Loader2, MapPin, ArrowRight } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { useRadarUsers, type RadarMapUser } from '@/hooks/useRadarUsers';
import { buildSupabaseImageThumb } from '@/lib/imageTransform';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function NearbyRadarPeekModal({ open, onClose }: Props) {
  const { user } = useAuth();
  const { profile } = useProfile();

  const userLocation = useMemo(() => {
    const lat = profile?.address_lat ?? profile?.location_lat ?? null;
    const lng = profile?.address_lng ?? profile?.location_lng ?? null;
    if (typeof lat !== 'number' || typeof lng !== 'number') return undefined;
    return {
      lat,
      lng,
      city: profile?.address_city ?? null,
      state: profile?.address_state ?? null,
      verified: profile?.address_verified ?? null,
    };
  }, [profile]);

  // Só faz a query quando o modal abre (mas o hook não tem `enabled`; o custo
  // é aceitável e o cache do React Query reaproveita resultados do Radar).
  const { data: radarUsers = [], isLoading } = useRadarUsers(userLocation, { includeAll: !userLocation });

  const list = useMemo<RadarMapUser[]>(() => {
    if (!open) return [];
    return radarUsers
      .filter((u) => u.id !== profile?.id && u.id !== user?.id)
      .slice(0, 18);
  }, [open, radarUsers, profile?.id, user?.id]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="
          !z-[90] p-0 gap-0 border-0 overflow-hidden bg-black
          !w-screen !h-[100dvh] !max-h-[100dvh] !max-w-none rounded-none
          sm:!w-[min(720px,95vw)] sm:!h-auto sm:!max-h-[85dvh] sm:rounded-2xl
          shadow-[0_0_0_1px_rgba(139,92,246,0.25),0_30px_80px_-20px_rgba(139,92,246,0.5)]
        "
      >
        <div aria-hidden className="pointer-events-none absolute -top-24 -left-24 h-72 w-72 rounded-full blur-3xl opacity-40"
          style={{ background: 'radial-gradient(circle, rgba(168,85,247,0.55), transparent 70%)' }} />
        <div aria-hidden className="pointer-events-none absolute -bottom-24 -right-24 h-72 w-72 rounded-full blur-3xl opacity-40"
          style={{ background: 'radial-gradient(circle, rgba(34,211,238,0.45), transparent 70%)' }} />

        <header className="relative flex items-center gap-3 border-b border-white/5 px-4 py-3 sm:px-5">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500/40 to-fuchsia-500/30 ring-1 ring-violet-300/40">
            <Radar className="h-5 w-5 text-violet-100" />
          </span>
          <div className="flex-1 min-w-0">
            <DialogTitle className="text-base font-semibold text-white">Quem cruzou seu caminho?</DialogTitle>
            <DialogDescription className="text-[11px] text-white/60">
              Perfis que estiveram perto de você recentemente.
            </DialogDescription>
          </div>
          <Link
            to="/radar"
            onClick={onClose}
            className="hidden sm:inline-flex items-center gap-1 rounded-lg bg-gradient-to-r from-violet-500/30 to-fuchsia-500/30 px-3 py-1.5 text-[11px] font-bold text-white ring-1 ring-violet-300/40 hover:brightness-110"
          >
            Abrir Radar <ArrowRight className="h-3 w-3" />
          </Link>
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="ml-2 inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/5 text-white/70 ring-1 ring-white/10 hover:bg-white/10 hover:text-white"
          >
            ×
          </button>
        </header>

        <div className="relative max-h-[calc(100dvh-4rem)] sm:max-h-[70dvh] overflow-y-auto overscroll-contain px-3 py-4 sm:px-5">
          {isLoading ? (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-violet-300" />
            </div>
          ) : list.length === 0 ? (
            <div className="rounded-xl bg-white/[0.03] p-6 text-center text-sm text-white/55 ring-1 ring-white/5">
              Ninguém cruzou seu caminho ainda. Ative o radar para começar.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              {list.map((u) => {
                const display = u.username ? `@${u.username}` : u.name || 'Misterioso(a)';
                const href = u.username
                  ? `/u/${encodeURIComponent(u.username)}`
                  : `/creator/${u.id}`;
                const avatar = buildSupabaseImageThumb(u.avatar_url, { width: 320, quality: 70 }) || u.avatar_url;
                const distance = u.distanceKm ?? u.displayDistanceKm;
                return (
                  <Link
                    key={u.id}
                    to={href}
                    onClick={onClose}
                    className="group relative overflow-hidden rounded-xl bg-gradient-to-br from-violet-500/15 to-fuchsia-500/5 ring-1 ring-violet-400/25 transition-all hover:-translate-y-0.5 hover:ring-2 hover:ring-fuchsia-300/80 hover:shadow-[0_0_28px_-2px_rgba(217,70,239,0.7)] focus-visible:ring-2 focus-visible:ring-fuchsia-300/90 focus-visible:shadow-[0_0_28px_-2px_rgba(217,70,239,0.8)] active:ring-2 active:ring-fuchsia-300 active:shadow-[0_0_36px_-2px_rgba(217,70,239,0.95)]"
                  >
                    <div className="relative aspect-[3/4] overflow-hidden bg-black">
                      {avatar ? (
                        <img src={avatar} alt="" loading="lazy" decoding="async"
                          className="h-full w-full object-cover" style={{ objectPosition: 'center 25%' }} />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-3xl">🌙</div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" />
                      {u.is_online && (
                        <span className="absolute top-1.5 right-1.5 inline-flex items-center gap-1 rounded-full bg-emerald-500/85 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white shadow">
                          <span className="h-1.5 w-1.5 rounded-full bg-white" /> online
                        </span>
                      )}
                      {u.profile_type === 'couple' && (
                        <span className="absolute top-1.5 left-1.5 rounded-full bg-gradient-to-r from-pink-500 to-amber-500 px-1.5 py-0.5 text-[9px] font-bold text-white shadow">
                          👫 CASAL
                        </span>
                      )}
                    </div>
                    <div className="absolute inset-x-0 bottom-0 p-2">
                      <div className="text-xs font-semibold text-white truncate drop-shadow">{display}</div>
                      {(u.address_city || u.address_state || typeof distance === 'number') && (
                        <div className="flex items-center gap-1 text-[10px] text-white/75 truncate">
                          <MapPin className="h-2.5 w-2.5" />
                          {typeof distance === 'number'
                            ? `${distance < 1 ? '< 1' : Math.round(distance)} km`
                            : [u.address_city, u.address_state].filter(Boolean).join(', ')}
                        </div>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}

          <Link
            to="/radar"
            onClick={onClose}
            className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 via-fuchsia-500 to-cyan-500 px-4 py-3 text-sm font-bold text-white shadow-[0_0_24px_-4px_rgba(168,85,247,0.7)] transition-all hover:brightness-110 sm:hidden"
          >
            <Radar className="h-4 w-4" />
            Abrir Radar completo
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default NearbyRadarPeekModal;

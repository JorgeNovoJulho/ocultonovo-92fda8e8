import { memo, useEffect, useState } from 'react';
import { useAuraRoomsList, type AuraRoomItem } from '@/hooks/useAuraRoomsList';
import { Sheet, SheetTrigger } from '@/components/ui/sheet';
import { AuraRoomLive } from './AuraRoomLive';
import { Sparkles, Flame, Lock, Users, ArrowRight, Star } from 'lucide-react';

/* ──────────────────────────────────────────────────────────────────────────
 * Card destacado de sala — substitui o pill anterior.
 * Visual moderno: gradiente por hue, emoji grande, status ao vivo,
 * contador de pessoas e CTA "Entrar" sempre visível.
 * ──────────────────────────────────────────────────────────────────────── */
function RoomCard({ room, forcedOpen = false, onForcedOpenHandled }: { room: AuraRoomItem; forcedOpen?: boolean; onForcedOpenHandled?: () => void }) {
  const [open, setOpen] = useState(false);
  const [autoJoinOnOpen, setAutoJoinOnOpen] = useState(false);
  const [networkOnline, setNetworkOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine !== false : true,
  );
  useEffect(() => {
    if (forcedOpen) {
      setOpen(true);
      setAutoJoinOnOpen(true);
      onForcedOpenHandled?.();
    }
  }, [forcedOpen, onForcedOpenHandled]);

  useEffect(() => {
    const on = () => setNetworkOnline(true);
    const off = () => setNetworkOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  const bg = `linear-gradient(135deg,
    hsl(${room.hue} 75% 22% / 0.95) 0%,
    hsl(${(room.hue + 30) % 360} 60% 14% / 0.85) 55%,
    hsl(${(room.hue + 60) % 360} 55% 10% / 0.7) 100%)`;
  const glow = `0 8px 28px -14px hsl(${room.hue} 90% 55% / 0.55), inset 0 0 0 1px hsl(${room.hue} 90% 70% / 0.18)`;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          aria-label={`Entrar em ${room.name}`}
          className="group relative w-full overflow-hidden rounded-2xl text-left transition-transform active:scale-[0.985] hover:-translate-y-0.5"
          style={{ background: bg, boxShadow: glow }}
        >
          {/* shimmer sutil */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-0 transition-opacity group-hover:opacity-100"
            style={{
              background: `radial-gradient(120% 80% at 0% 0%, hsl(${room.hue} 100% 70% / 0.18), transparent 60%)`,
            }}
          />
          {/* Tag Especial — salas temáticas / ciclos especiais */}
          {(room.isSpecialCycle || room.mood === 'especial') && (
            <span className="absolute left-2 top-2 z-[2] inline-flex items-center gap-0.5 rounded-full bg-fuchsia-500/95 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-white shadow">
              <Star className="h-2.5 w-2.5" /> Especial
            </span>
          )}
          {/* rising flame */}
          {room.rising && (
            <span className="absolute right-2 top-2 z-[2] inline-flex items-center gap-0.5 rounded-full bg-amber-400/95 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-amber-950 shadow">
              <Flame className="h-2.5 w-2.5" /> Em alta
            </span>
          )}

          <div className="relative z-[1] flex items-center gap-2.5 p-2.5 sm:gap-3 sm:p-3">
            {/* Emoji destacado */}
            <span
              aria-hidden
              className="grid h-10 w-10 sm:h-11 sm:w-11 shrink-0 place-items-center rounded-xl text-xl sm:text-2xl"
              style={{
                background: `linear-gradient(135deg, hsl(${room.hue} 90% 70% / 0.25), hsl(${room.hue} 80% 40% / 0.15))`,
                boxShadow: `inset 0 0 0 1px hsl(${room.hue} 90% 75% / 0.35)`,
              }}
            >
              {room.emoji}
            </span>

            <div className="min-w-0 flex-1">
              <div className="flex items-start gap-1.5">
                <h4 className="aura-room-title-text min-w-0 flex-1 text-[13px] sm:text-[14px] font-bold leading-tight break-words [overflow-wrap:anywhere] line-clamp-2">
                  {room.name}
                </h4>
                {!room.allowed && <Lock className="mt-0.5 h-3 w-3 shrink-0 text-amber-300" aria-label="bloqueada" />}
              </div>

              <div className="mt-1 flex flex-wrap items-center gap-1">
                {/* status ao vivo */}
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                    networkOnline ? 'bg-emerald-500/25 text-emerald-100' : 'bg-rose-500/20 text-rose-100'
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      networkOnline ? 'bg-emerald-300 animate-pulse' : 'bg-rose-300'
                    }`}
                  />
                  {networkOnline ? 'AO VIVO' : 'offline'}
                </span>

                {/* contagem de pessoas */}
                {room.active_count > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-black/35 px-1.5 py-0.5 text-[9px] font-bold text-white/95">
                    <Users className="h-2.5 w-2.5" />
                    {room.active_count}
                  </span>
                )}
              </div>
            </div>

            {/* CTA seta — sempre visível */}
            <span
              className="ml-0.5 inline-flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-full bg-white/95 text-black shadow-md transition-transform group-hover:translate-x-0.5"
              aria-hidden
            >
              <ArrowRight className="h-4 w-4" />
            </span>
          </div>
        </button>
      </SheetTrigger>
      {open && <AuraRoomLive room={room} open={open} onOpenChange={setOpen} autoJoinOnOpen={autoJoinOnOpen} onAutoJoinConsumed={() => setAutoJoinOnOpen(false)} />}
    </Sheet>
  );
}

function AuraRoomsStripImpl({ forcedRoomSlug }: { forcedRoomSlug?: string | null }) {
  const { data, loading } = useAuraRoomsList();
  const [pendingForcedSlug, setPendingForcedSlug] = useState<string | null>(forcedRoomSlug ?? null);

  useEffect(() => {
    setPendingForcedSlug(forcedRoomSlug ?? null);
  }, [forcedRoomSlug]);

  // Particiona:
  // - specialRooms: somente salas especiais COM sessão ativa agora
  //   (isSpecialCycle === true), respeitando horário/clima/tema do ciclo.
  // - regularRooms: salas comuns. Salas marcadas como "especial" que NÃO
  //   estão em sessão ativa ficam ocultas até sua condição ser atendida.
  const isSpecialMarker = (r: typeof data[number]) =>
    r.isSpecialCycle === true ||
    r.mood === 'especial' ||
    (Array.isArray(r.tags) && r.tags.includes('especial'));

  // Especiais visíveis = APENAS quando há ciclo ativo agora (isSpecialCycle).
  // Salas marcadas como especiais sem sessão ficam ocultas até seu ciclo abrir.
  const specialRooms = data.filter((r) => r.isSpecialCycle === true);
  const regularRooms = data.filter((r) => !isSpecialMarker(r));

  const totalVisible = regularRooms.length + specialRooms.length;
  const liveCount =
    regularRooms.reduce((acc, r) => acc + (r.active_count ?? 0), 0) +
    specialRooms.reduce((acc, r) => acc + (r.active_count ?? 0), 0);

  const renderGrid = (rooms: typeof data) => (
    <div
      className="relative grid gap-2"
      style={{
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        overscrollBehavior: 'contain',
      }}
    >
      {rooms.map((room) => (
        <RoomCard
          key={room.slug}
          room={room}
          forcedOpen={pendingForcedSlug === room.slug}
          onForcedOpenHandled={() => setPendingForcedSlug((current) => (current === room.slug ? null : current))}
        />
      ))}
    </div>
  );

  return (
    <section
      aria-label="Salas de chat ao vivo"
      className="relative overflow-hidden rounded-3xl border border-fuchsia-400/25 p-3 sm:p-4"
      style={{
        background:
          'radial-gradient(140% 100% at 0% 0%, hsl(290 80% 35% / 0.22), transparent 55%), radial-gradient(120% 90% at 100% 100%, hsl(45 90% 50% / 0.10), transparent 55%), linear-gradient(180deg, hsl(285 50% 8% / 0.85), hsl(280 40% 5% / 0.9))',
        boxShadow: '0 20px 60px -30px hsl(290 90% 50% / 0.55), inset 0 0 0 1px hsl(290 90% 70% / 0.05)',
      }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -top-16 -right-16 h-56 w-56 rounded-full opacity-60 blur-3xl"
        style={{ background: 'radial-gradient(circle, hsl(290 90% 55% / 0.35), transparent 70%)' }}
      />

      <header className="relative mb-3 flex items-end justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span
            className="grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br from-fuchsia-500/70 via-purple-600/60 to-amber-500/50 ring-1 ring-fuchsia-200/40"
            style={{ boxShadow: '0 0 24px -4px hsl(290 90% 60% / 0.65)' }}
            aria-hidden
          >
            <Sparkles className="h-5 w-5 text-white drop-shadow" />
          </span>
          <div className="flex flex-col leading-tight">
              <h3
                className="aura-room-title-text text-base sm:text-lg font-black uppercase tracking-[0.18em]"
                style={{ textShadow: '0 0 24px hsl(290 90% 60% / 0.35), 0 1px 0 hsl(0 0% 0% / 0.35)' }}
              >
              Salas do Oculto
            </h3>
              <span className="aura-room-title-subtext text-[10px] sm:text-[11px] uppercase tracking-[0.18em]">
              entre · observe · provoque
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {liveCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-100">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-300 animate-pulse" />
              {liveCount} agora
            </span>
          )}
          {!loading && totalVisible > 0 && (
            <span className="rounded-full border border-fuchsia-300/25 bg-black/40 px-2 py-1 text-[10px] font-bold text-fuchsia-100/90">
              {totalVisible} {totalVisible === 1 ? 'sala' : 'salas'}
            </span>
          )}
        </div>
      </header>

      {loading && data.length === 0 ? (
        <div
          className="grid gap-2"
          style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}
        >
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-[80px] animate-pulse rounded-2xl bg-white/[0.04]" />
          ))}
        </div>
      ) : totalVisible === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 text-center">
          <div className="text-sm text-white/70">Nenhuma sala disponível no momento.</div>
          <div className="mt-1 text-xs text-white/45">Volte em instantes — o universo está se reorganizando.</div>
        </div>
      ) : (
        <div
          className="relative max-h-[58vh] overflow-y-auto pr-0 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden [&::-webkit-scrollbar]:w-0"
          style={{ overscrollBehavior: 'contain' }}
        >
          {/* ─── Seção 1 (destaque): Ciclos especiais ativos agora ─── */}
          {specialRooms.length > 0 ? (
            <div className="mb-4">
              <div className="mb-2 flex items-center gap-2 px-0.5">
                <Star className="h-3 w-3 text-fuchsia-300" />
                <span className="aura-room-title-text text-[10px] font-bold uppercase tracking-[0.22em]">
                  Especiais ativas agora
                </span>
                <span className="h-px flex-1 bg-gradient-to-r from-fuchsia-400/40 to-transparent" />
                <span className="inline-flex items-center gap-1 rounded-full bg-fuchsia-500/20 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-fuchsia-100">
                  <span className="h-1.5 w-1.5 rounded-full bg-fuchsia-300 animate-pulse" />
                  {specialRooms.length} ao vivo
                </span>
              </div>
              <div
                className="rounded-2xl p-2 ring-1 ring-fuchsia-400/30"
                style={{
                  background:
                    'radial-gradient(120% 100% at 0% 0%, hsl(290 80% 35% / 0.22), transparent 60%), linear-gradient(180deg, hsl(290 60% 12% / 0.55), hsl(290 50% 8% / 0.35))',
                  boxShadow: '0 10px 30px -18px hsl(290 90% 55% / 0.5)',
                }}
              >
                {renderGrid(specialRooms)}
              </div>
            </div>
          ) : regularRooms.length > 0 ? (
            <div className="mb-4 rounded-xl border border-dashed border-fuchsia-300/20 bg-fuchsia-500/[0.05] p-3 text-center">
              <div className="aura-room-title-subtext flex items-center justify-center gap-1.5 text-[11px] font-bold uppercase tracking-wider">
                <Star className="h-3 w-3" />
                Nenhum ciclo especial ativo agora
              </div>
              <div className="mt-1 text-[10px] text-fuchsia-100/50">
                Salas especiais abrem em horários, climas e temas específicos.
              </div>
            </div>
          ) : null}

          {/* ─── Seção 2: Salas regulares ─── */}
          {regularRooms.length > 0 && (
            <div>
              <div className="mb-2 flex items-center gap-2 px-0.5">
                <span className="aura-room-title-text text-[10px] font-bold uppercase tracking-[0.22em]">
                  Salas regulares
                </span>
                <span className="h-px flex-1 bg-gradient-to-r from-white/15 to-transparent" />
                <span className="text-[10px] font-bold text-white/50">{regularRooms.length}</span>
              </div>
              {renderGrid(regularRooms)}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export const AuraRoomsStrip = memo(AuraRoomsStripImpl);

import { useState, useMemo, useRef, memo } from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles, Users, User2, Gift } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useNewestMembers, useNewestMembersGiftTotals } from "@/hooks/useNewestMembers";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { OnlineDot } from "@/components/ui/OnlineDot";
import { isReallyOnline } from "@/lib/onlineStatus";
import NewMembersListModal from "./NewMembersListModal";
import { AuraXpGiftModal } from "@/components/aura-match/AuraXpGiftModal";
import GiftSendersModal from "./GiftSendersModal";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { resolveAvatarUrl } from "@/lib/avatarUrl";
import { CarouselScrollbar } from "./CarouselScrollbar";
import { CachedImg } from "./CachedImg";

export const NewMembersStrip = memo(function NewMembersStrip() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data, isLoading, isFetching } = useNewestMembers(25);
  const [modalOpen, setModalOpen] = useState(false);
  const [giftTarget, setGiftTarget] = useState<{ id: string; user_id: string; username: string; avatar_url: string | null } | null>(null);
  const [sendersTarget, setSendersTarget] = useState<{ id: string; username: string } | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const handleScrollKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const el = scrollRef.current;
    if (!el) return;
    const step = Math.max(120, Math.floor(el.clientWidth * 0.35));
    const max = el.scrollWidth - el.clientWidth;
    let target: number | null = null;
    if (e.key === "ArrowLeft") target = el.scrollLeft - step;
    else if (e.key === "ArrowRight") target = el.scrollLeft + step;
    else if (e.key === "Home") target = 0;
    else if (e.key === "End") target = max;
    else return;
    e.preventDefault();
    el.scrollTo({ left: Math.max(0, Math.min(max, target)), behavior: "smooth" });
  };

  const members = useMemo(() => {
    const list = data || [];
    // Online primeiro, mantendo a ordem cronológica dentro de cada grupo.
    return [...list].sort((a, b) => {
      const onlineA = isReallyOnline({
        is_online: a.is_online,
        last_seen: a.last_seen,
        show_online_status: a.show_online_status,
      }) ? 1 : 0;
      const onlineB = isReallyOnline({
        is_online: b.is_online,
        last_seen: b.last_seen,
        show_online_status: b.show_online_status,
      }) ? 1 : 0;
      if (onlineA !== onlineB) return onlineB - onlineA;
      // Recém-chegados primeiro dentro do mesmo grupo
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [data]);

  // IDs aceitos como receiver_id por presente (profile.id OU profile.user_id).
  // Buscamos totais ao vivo de oculto_aura_xp_gifts com realtime para que
  // o contador no card atualize instantaneamente sem reload.
  const giftLookupIds = useMemo(() => {
    const ids: string[] = [];
    for (const m of members) {
      if (m.id) ids.push(m.id);
      if (m.user_id && m.user_id !== m.id) ids.push(m.user_id);
    }
    return ids;
  }, [members]);
  const { data: liveGiftTotals } = useNewestMembersGiftTotals(giftLookupIds);

  const getLiveGiftCount = (m: typeof members[number]) => {
    const base = m.gifts_received_count || 0;
    const byId = liveGiftTotals?.[m.id]?.count ?? 0;
    const byUser = m.user_id ? (liveGiftTotals?.[m.user_id]?.count ?? 0) : 0;
    // soma de presentes vindos por qualquer um dos identificadores
    const live = byId + (m.user_id && m.user_id !== m.id ? byUser : 0);
    return Math.max(base, live);
  };

  const hasSkeleton = isLoading && members.length === 0;

  if (hasSkeleton) {
    return (
      <div className="px-3 pt-2 pb-3">
        <div className="flex gap-2 overflow-hidden">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="w-[110px] h-[150px] rounded-xl shrink-0" />
          ))}
        </div>
      </div>
    );
  }

  if (members.length === 0) return null;

  return (
    <>
      <section className="pt-2 pb-3" aria-label="Boas-vindas aos novos do OCULTO">
        <div className="px-3 mb-1.5 flex items-center gap-1.5">
          <Users className="w-3.5 h-3.5 text-primary" />
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Boas-vindas aos novos do OCULTO
          </h3>
        </div>

        <div
          ref={scrollRef}
          id="new-members-scroll"
          tabIndex={0}
          role="region"
          aria-label="Carrossel de novos misteriosos"
          onKeyDown={handleScrollKey}
          className="scrollbar-hide flex gap-2 overflow-x-auto pb-1 px-3 outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-400/60 rounded"
          style={{ WebkitOverflowScrolling: "touch", scrollSnapType: "x mandatory", scrollbarWidth: "none" }}
        >
          {/* Card fixo de boas-vindas */}
          <button
            onClick={() => setModalOpen(true)}
            className="relative shrink-0 w-[110px] h-[150px] rounded-xl overflow-hidden bg-gradient-to-br from-primary/30 via-primary/10 to-accent/20 border border-primary/40 flex flex-col items-center justify-center p-2 text-center hover:scale-[1.02] transition-transform"
            style={{ scrollSnapAlign: "start" }}
            aria-label="Ver lista de novos misteriosos"
          >
            <Sparkles className="w-6 h-6 text-primary mb-1.5" />
            <span className="text-[10.5px] font-semibold leading-tight text-foreground">
              Dê boas-vindas aos novos Misteriosos(as) do OCULTO
            </span>
            <span className="mt-1.5 text-[9px] uppercase tracking-wider text-primary font-bold">
              Ver todos
            </span>
          </button>

          {/* Cards dos novos usuários */}
          <AnimatePresence initial={false}>
            {members.map((m) => {
            const isMe = user?.id === m.user_id;
            const avatarSrc = resolveAvatarUrl(m.avatar_url);
            const bannerSrc = resolveAvatarUrl(m.banner_url) || resolveAvatarUrl(m.cover_image_url);
            const online = isReallyOnline({
              is_online: m.is_online,
              last_seen: m.last_seen,
              show_online_status: m.show_online_status,
            });
            return (
              <motion.div
                key={m.id}
                layout
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.92 }}
                transition={{ type: "spring", stiffness: 380, damping: 30, mass: 0.6 }}
                className={cn(
                  "relative shrink-0 w-[110px] h-[150px] rounded-xl overflow-hidden bg-muted",
                  online
                    ? "border-2 border-[#39ff14] shadow-[0_0_12px_rgba(57,255,20,0.75),0_0_24px_rgba(57,255,20,0.45)] online-neon-pulse"
                    : "border border-border"
                )}
                style={{ scrollSnapAlign: "start" }}
              >
                <button
                  type="button"
                  onClick={() => navigate(`/u/${encodeURIComponent(m.username)}`)}
                  className="absolute inset-0 w-full h-full hover:scale-[1.02] transition-transform"
                  aria-label={`Abrir perfil de @${m.username}`}
                >
                  {/* Banner ao fundo */}
                  {bannerSrc ? (
                    <CachedImg
                      src={bannerSrc}
                      alt=""
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                  ) : (
                    <div className="absolute inset-0 bg-gradient-to-br from-muted to-muted-foreground/20" />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-black/10" />

                  <div className="absolute inset-0 flex flex-col items-center justify-center pt-2">
                    <div className="relative">
                      <Avatar className="w-14 h-14 ring-2 ring-primary shadow-lg">
                        {avatarSrc ? (
                          <CachedImg
                            src={avatarSrc}
                            alt={m.username}
                            referrerPolicy="no-referrer"
                            className="aspect-square h-full w-full object-cover"
                          />
                        ) : null}
                        <AvatarFallback className="bg-gradient-to-br from-fuchsia-600 via-pink-600 to-amber-500 text-white font-black text-lg uppercase">
                          {m.username?.charAt(0) || <User2 className="w-6 h-6 opacity-80" />}
                        </AvatarFallback>
                      </Avatar>
                      <OnlineDot
                        user={{
                          is_online: m.is_online,
                          last_seen: m.last_seen,
                          show_online_status: m.show_online_status,
                        }}
                        size="md"
                        positionClassName="absolute bottom-0 right-0"
                        borderClassName="border-black/70"
                      />
                    </div>
                  </div>

                  <div className="absolute bottom-0 left-0 right-0 p-1.5 text-center">
                    <span className="text-[11px] font-semibold text-white drop-shadow-md truncate block">
                      @{m.username}
                    </span>
                  </div>
                </button>

                {/* Contador de Presentes */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSendersTarget({ id: m.id, username: m.username });
                  }}
                  className={cn(
                    "absolute top-1.5 left-1.5 z-10 px-1.5 py-0.5 rounded-full bg-black/60 text-white text-[10px] font-bold flex items-center gap-1 ring-1 ring-white/20 shadow-lg cursor-pointer hover:bg-primary hover:text-primary-foreground transition-all",
                    isMe && "scale-110"
                  )}
                  title={`Ver quem enviou presentes para @${m.username}`}
                  aria-label={`Ver remetentes de presentes de @${m.username}`}
                >
                  <Gift className="w-2.5 h-2.5 text-amber-400" />
                  {getLiveGiftCount(m)}
                </button>

                {/* Botão Enviar Presente — fica acima do card */}
                {!isMe && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setGiftTarget({
                        id: m.id,
                        user_id: m.user_id,
                        username: m.username,
                        avatar_url: m.avatar_url,
                      });
                    }}
                    className="absolute top-1.5 right-1.5 z-10 h-7 w-7 rounded-full bg-primary/90 hover:bg-primary text-primary-foreground flex items-center justify-center shadow-lg ring-1 ring-white/30"
                    aria-label={`Enviar presente para @${m.username}`}
                    title="Enviar presente"
                  >
                    <Gift className="w-3.5 h-3.5" />
                  </button>
                )}
              </motion.div>
            );
          })}
          </AnimatePresence>

          {/* Skeletons sutis ao final enquanto realtime busca novos perfis */}
          {isFetching && !isLoading && (
            <>
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton
                  key={`fetching-skel-${i}`}
                  className="shrink-0 w-[110px] h-[150px] rounded-xl opacity-60"
                  style={{ scrollSnapAlign: "start" }}
                />
              ))}
            </>
          )}
        </div>

        <CarouselScrollbar
          scrollRef={scrollRef}
          ariaLabel="Rolar carrossel de novos misteriosos"
          controlsId="new-members-scroll"
          className="px-3 pb-2"
        />
      </section>

      <NewMembersListModal open={modalOpen} onOpenChange={setModalOpen} members={members} />

      <GiftSendersModal
        open={!!sendersTarget}
        onOpenChange={(v) => { if (!v) setSendersTarget(null); }}
        profileId={sendersTarget?.id ?? null}
        username={sendersTarget?.username ?? null}
      />

      {giftTarget && (
        <AuraXpGiftModal
          open={!!giftTarget}
          onOpenChange={(v) => { if (!v) setGiftTarget(null); }}
          lockedReceiver={{
            id: giftTarget.id,
            user_id: giftTarget.user_id,
            username: giftTarget.username,
            name: null,
            avatar_url: giftTarget.avatar_url,
          }}
          title="Presente de boas-vindas"
          contextLabel={`para @${giftTarget.username}`}
        />
      )}
    </>
  );
});

export default NewMembersStrip;

import { memo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { RadarMapUser } from "@/hooks/useRadarUsers";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Crown, CheckCircle, Flame, MessageCircle, UserPlus, MapPin, X, Radio, Check, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabaseExternal";
import { OnlineDot } from "@/components/ui/OnlineDot";
import { getPublicHandle } from "@/lib/userHandle";
import { getGenderLabel, formatCidadeUF } from "@/lib/profileFormat";
import { useIsFollowing, useToggleFollow } from "@/hooks/useFollows";

/**
 * Bloco do Canal VIP do usuário visualizado no Radar.
 * Substitui o antigo "Últimas localizações detectadas".
 * Só renderiza se o perfil tiver plano VIP e ao menos 1 plano de assinatura ativo.
 */
function RadarVipChannelBlock({ profileId }: { profileId: string }) {
  const navigate = useNavigate();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["radar-vip-channel", profileId],
    enabled: !!profileId,
    staleTime: 5 * 60_000,
    retry: 1,
    queryFn: async () => {
      const { data: plans, error } = await (supabase as any)
        .from("subscription_plans")
        .select("id,title,price,is_active,sort_order,created_at")
        .eq("profile_id", profileId)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      const active = (plans || []).filter((p: any) => p.is_active !== false);
      return active[0] || null;
    },
  });

  const Frame = ({ children }: { children: React.ReactNode }) => (
    <div className="mt-4 rounded-lg border border-[hsl(45,93%,47%)]/30 bg-gradient-to-r from-[hsl(45,93%,47%)]/10 via-transparent to-[hsl(45,93%,47%)]/10 p-3">
      <div className="flex items-center gap-2 mb-1.5">
        <Crown className="h-4 w-4 text-[hsl(45,93%,47%)]" />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-[hsl(45,93%,47%)]">
          Canal VIP
        </span>
      </div>
      {children}
    </div>
  );

  if (isLoading) {
    return (
      <Frame>
        <div className="space-y-2 animate-pulse">
          <div className="h-4 w-2/3 rounded bg-muted/60" />
          <div className="h-3 w-1/3 rounded bg-muted/40" />
          <div className="h-9 w-full rounded bg-muted/40" />
        </div>
      </Frame>
    );
  }

  if (isError || !data) {
    return (
      <Frame>
        <p className="text-xs text-muted-foreground">
          {isError
            ? "Não foi possível carregar o canal agora. Tente novamente em instantes."
            : "Este criador ainda não publicou um plano de assinatura."}
        </p>
        <Button
          onClick={() => navigate(`/canal/${profileId}`)}
          size="sm"
          variant="outline"
          className="mt-2 h-9 w-full border-[hsl(45,93%,47%)]/40 text-[hsl(45,93%,47%)] hover:bg-[hsl(45,93%,47%)]/10 text-xs"
        >
          <Crown className="h-3.5 w-3.5 mr-1" />
          Ver Canal VIP
        </Button>
      </Frame>
    );
  }

  return (
    <Frame>
      <p className="text-sm font-semibold text-foreground truncate">
        {data.title || "Canal VIP exclusivo"}
      </p>
      {typeof data.price === "number" && data.price > 0 && (
        <p className="text-[11px] text-muted-foreground mt-0.5">
          A partir de R$ {Number(data.price).toFixed(2).replace(".", ",")}/mês
        </p>
      )}
      <Button
        onClick={() => navigate(`/canal/${profileId}`)}
        size="sm"
        className="mt-2 h-9 w-full bg-gradient-to-r from-[hsl(45,93%,47%)] to-[hsl(35,93%,47%)] text-background hover:opacity-90 font-semibold text-xs"
      >
        <Crown className="h-3.5 w-3.5 mr-1" />
        Ver Canal VIP
      </Button>
    </Frame>
  );
}

export type RadarSheetLocationEntry = {
  ts: number;
  lat: number;
  lng: number;
  source: "gps" | "profile" | "none";
  city?: string | null;
  distanceFromHomeKm?: number | null;
};

interface RadarUserSheetProps {
  user: RadarMapUser | null;
  onClose: () => void;
  onSendPing?: (userId: string) => void;
  isPingSending?: boolean;
  hasPingedMe?: boolean;
  alreadyPinged?: boolean;
  /** Últimas localizações detectadas na sessão atual (mock-friendly). */
  recentLocationHistory?: RadarSheetLocationEntry[];
}

function formatAgo(ts: number) {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return `há ${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `há ${m}min`;
  const h = Math.floor(m / 60);
  return `há ${h}h`;
}

export const RadarUserSheet = memo(function RadarUserSheet({
  user,
  onClose,
  onSendPing,
  isPingSending,
  hasPingedMe,
  alreadyPinged,
  recentLocationHistory,
}: RadarUserSheetProps) {
  const navigate = useNavigate();
  const { user: authUser } = useAuth();
  const isVip = user?.plan_type === "vip";

  const { data: isFollowing } = useIsFollowing(user?.id);
  const toggleFollow = useToggleFollow();

  const handleViewProfile = () => {
    if (!user) return;
    // Rota válida do app: /u/:creatorId (aceita id ou username)
    navigate(`/u/${user.username || user.id}`);
  };

  const handleChat = () => {
    if (!authUser || !user) return;
    // MessagesPage espera ?to=<profileId> (não ?user=)
    navigate(`/messages?to=${user.id}`);
  };

  const handleFollow = () => {
    if (!authUser || !user || toggleFollow.isPending) return;
    toggleFollow.mutate({ targetProfileId: user.id, isFollowing: !!isFollowing });
  };

  const handlePing = () => {
    if (!user || !onSendPing) return;
    onSendPing(user.id);
  };

  return (
    <AnimatePresence>
      {user && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-black/40"
          />

          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border rounded-t-2xl px-4 pt-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] max-h-[85vh] sm:max-h-[70vh] overflow-y-auto [scrollbar-width:thin]"
          >
            <div className="w-10 h-1 rounded-full bg-muted-foreground/30 mx-auto mb-3" />

            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              aria-label="Fechar"
              className="absolute top-2 right-2 h-10 w-10 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/15 text-foreground shadow-md"
            >
              <X className="h-5 w-5" />
            </Button>

            {/* Ping received indicator */}
            {hasPingedMe && (
              <div className="mb-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/10 border border-primary/20">
                <Radio className="h-4 w-4 text-primary animate-pulse" />
                <span className="text-xs text-primary font-medium">Acenou para você!</span>
              </div>
            )}

            {/* Header */}
            <div className="flex items-start gap-3">
              <div className="relative flex-shrink-0">
                <img loading="lazy" decoding="async"
                  src={user.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.id}`}
                  alt={getPublicHandle(user)}
                  className="w-16 h-16 rounded-full object-cover border-2"
                  style={{ borderColor: isVip ? "hsl(var(--primary))" : "hsl(var(--border))" }}
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.id}`;
                  }}
                />
                <OnlineDot user={user as any} size="xl" borderClassName="border-card" />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-semibold text-foreground truncate">{getPublicHandle(user)}</span>
                  {user.is_verified && <CheckCircle className="h-4 w-4 text-primary flex-shrink-0" />}
                  {isVip && <Crown className="h-4 w-4 text-primary flex-shrink-0" />}
                </div>
                {(() => {
                  const tipo = getGenderLabel(user.gender, user.profile_type);
                  const loc = formatCidadeUF((user as any).address_city, (user as any).address_state);
                  const idade = user.age != null ? `${user.age} anos` : "Idade não informada";
                  if (!tipo && !loc && user.age == null) {
                    return (
                      <p className="text-[11px] text-muted-foreground/70 italic mt-0.5 truncate">
                        Idade não informada
                      </p>
                    );
                  }
                  return (
                    <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                      {[tipo, loc, idade].filter(Boolean).join(" • ")}
                    </p>
                  );
                })()}
                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                  {user.is_looking_now && (
                    <Badge className="bg-gradient-to-r from-orange-500 to-red-500 text-white text-[10px] px-1.5 py-0 animate-pulse">
                      <Flame className="h-2.5 w-2.5 mr-0.5" />
                      Buscando
                    </Badge>
                  )}
                  {user.distanceKm != null && (
                    <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                      <MapPin className="h-3 w-3" />
                      {user.distanceKm < 1
                        ? `${Math.round(user.distanceKm * 1000)}m`
                        : `${user.distanceKm.toFixed(1)}km`}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {user.bio && (
              <p className="text-sm text-muted-foreground mt-3 line-clamp-3">{user.bio}</p>
            )}

            {(user.tags_social.length > 0 || user.tags_adult.length > 0) && (
              <div className="mt-3 space-y-1.5">
                {user.tags_social.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {user.tags_social.slice(0, 5).map(tag => (
                      <span key={tag} className="text-[11px] px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
                {user.tags_adult.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {user.tags_adult.slice(0, 4).map(tag => (
                      <span key={tag} className="text-[11px] px-2 py-0.5 rounded-full bg-destructive/10 text-destructive border border-destructive/20">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Canal VIP do criador (substitui o antigo histórico de localizações) */}
            {isVip && <RadarVipChannelBlock profileId={user.id} />}

            {/* Actions — grid responsivo, botões compactos sem corte */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
              <Button
                onClick={handlePing}
                size="sm"
                variant="outline"
                disabled={isPingSending || alreadyPinged}
                className="h-10 border-primary/30 hover:bg-primary/10 hover:text-primary text-xs"
                title={alreadyPinged ? "Aceno já enviado" : "Toque para acenar silenciosamente"}
              >
                <Radio className="h-4 w-4 mr-1" />
                {alreadyPinged ? "Acenado" : "Acenar"}
              </Button>
              <Button
                onClick={handleFollow}
                size="sm"
                variant="outline"
                disabled={toggleFollow.isPending}
                className={
                  isFollowing
                    ? "h-10 border-primary text-primary hover:bg-primary/10 text-xs"
                    : "h-10 border-primary/30 hover:bg-primary/10 hover:text-primary text-xs"
                }
                title={isFollowing ? "Você já segue" : "Seguir este perfil"}
              >
                {toggleFollow.isPending ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : isFollowing ? (
                  <Check className="h-4 w-4 mr-1" />
                ) : (
                  <UserPlus className="h-4 w-4 mr-1" />
                )}
                {isFollowing ? "Seguindo" : "Seguir"}
              </Button>
              <Button
                onClick={handleChat}
                size="sm"
                variant="outline"
                className="h-10 text-xs"
              >
                <MessageCircle className="h-4 w-4 mr-1" />
                Chat
              </Button>
              <Button
                onClick={handleViewProfile}
                size="sm"
                className="h-10 bg-gradient-to-r from-primary to-[hsl(338,100%,50%)] hover:opacity-90 text-xs"
              >
                Perfil social
              </Button>
            </div>

            {/* Legenda discreta explicando o que é Acenar */}
            <p className="mt-2 text-[10px] text-muted-foreground/80 leading-snug">
              <span className="font-semibold text-foreground/80">Acenar</span> é um sinal silencioso —
              avisa a pessoa que você está por perto e demonstrou interesse, sem precisar puxar conversa.
            </p>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
});

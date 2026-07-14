import { useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { RadarMapUser } from "@/hooks/useRadarUsers";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { MapPin, Users, Crown, CheckCircle, Sparkles, MessageCircle } from "lucide-react";
import { OnlineDot } from "@/components/ui/OnlineDot";
import { Radio } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconButtonTip } from "@/components/ui/icon-button-tip";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getPublicHandle } from "@/lib/userHandle";

interface UserListSidebarProps {
  users: RadarMapUser[];
  onUserClick: (user: RadarMapUser) => void;
  selectedUserId?: string;
  onSendPing?: (userId: string) => void;
  isPingSending?: boolean;
  pingedByMeSet?: Set<string>;
  className?: string;
}

function PlanBadge({ plan }: { plan: string }) {
  if (plan === "vip") {
    return (
      <Badge className="bg-gradient-to-r from-[hsl(45,93%,47%)] to-[hsl(35,93%,47%)] text-black border-0 text-[9px] px-1.5 py-0 h-4">
        <Crown className="h-2.5 w-2.5 mr-0.5" />VIP
      </Badge>
    );
  }
  if (plan === "monthly" || plan === "premium" || plan === "annual") {
    return (
      <Badge className="bg-gradient-to-r from-primary to-secondary text-primary-foreground border-0 text-[9px] px-1.5 py-0 h-4">
        <Sparkles className="h-2.5 w-2.5 mr-0.5" />Premium
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 border-muted-foreground/30 text-muted-foreground">
      Free
    </Badge>
  );
}

function AvatarWithLoading({
  user,
  handle,
}: {
  user: RadarMapUser;
  handle: string;
}) {
  const src = user.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.id}`;
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);
  return (
    <div className="relative flex-shrink-0">
      {!loaded && !errored && (
        <div
          className="absolute inset-0 w-12 h-12 rounded-full bg-muted animate-pulse border-2"
          style={{
            borderColor: user.plan_type === "vip" ? "hsl(var(--primary))" : "hsl(var(--border))",
          }}
          aria-hidden
        />
      )}
      <img
        loading="lazy"
        decoding="async"
        src={src}
        alt={handle}
        onLoad={() => setLoaded(true)}
        onError={() => {
          setErrored(true);
          setLoaded(true);
        }}
        className="w-12 h-12 rounded-full object-cover border-2"
        style={{
          borderColor: user.plan_type === "vip" ? "hsl(var(--primary))" : "hsl(var(--border))",
          opacity: loaded ? 1 : 0,
          transition: "opacity 150ms ease-out",
        }}
      />
      <OnlineDot user={user as any} size="lg" borderClassName="border-card" />
    </div>
  );
}

export function UserListSidebar({ users, onUserClick, selectedUserId, onSendPing, isPingSending, pingedByMeSet, className }: UserListSidebarProps) {
  const navigate = useNavigate();
  const onlineCount = users.filter((u) => u.is_online).length;

  const openProfile = (user: RadarMapUser) => {
    onUserClick(user);
    navigate(`/creator/${user.username || user.id}`);
  };

  const openChat = (user: RadarMapUser) => {
    onUserClick(user);
    const profileIdParam = user.id;
    navigate(`/messages?to=${profileIdParam}`, {
      state: {
        targetProfile: {
          id: user.id,
          user_id: (user as any).user_id ?? user.id,
          name: (user as any).name,
          username: user.username,
          avatar_url: user.avatar_url,
          is_online: user.is_online,
          is_verified: (user as any).is_verified,
          plan_type: user.plan_type,
        },
      },
    });
  };

  return (
    <div className={className ?? "w-80 bg-card/95 backdrop-blur-sm border-r border-border flex flex-col h-full"}>
      <div className="flex-shrink-0 px-3 py-2.5 border-b border-border/60">
        <h2 className="font-semibold text-sm sm:text-base flex items-center gap-2 leading-tight text-white">
          <Users className="h-4 w-4 text-primary" />
          Usuários Próximos
        </h2>
        <p className="text-[11px] sm:text-xs text-white/70 mt-0.5">
          <span className="text-emerald-400 font-medium">{onlineCount}</span> online · {users.length} no radar
        </p>
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div
          className="px-2 py-2 space-y-1"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1rem)" }}
        >
          {users.map((user, index) => {
            const handle = getPublicHandle(user);
            const isSelected = selectedUserId === user.id;
            return (
            <motion.div
              key={user.id}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: Math.min(index * 0.015, 0.2) }}
            >
              <div
                className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg transition-colors text-left ${
                  isSelected
                    ? "bg-primary/15 border border-primary/30"
                    : "hover:bg-muted/40 border border-transparent"
                }`}
              >
                {/* Avatar: tap abre o chat */}
                <Tooltip delayDuration={200}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => openChat(user)}
                      className="flex-shrink-0 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary cursor-pointer touch-manipulation"
                      aria-label={`Conversar com ${handle}`}
                    >
                      <AvatarWithLoading user={user} handle={handle} />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">
                    <span className="inline-flex items-center gap-1">
                      <MessageCircle className="h-3 w-3" /> Tocar para conversar com {handle}
                    </span>
                  </TooltipContent>
                </Tooltip>

                {/* Área de texto: tap abre o perfil */}
                <button
                  onClick={() => openProfile(user)}
                  className="flex-1 min-w-0 text-left cursor-pointer py-0.5"
                  aria-label={`Abrir perfil de ${handle}`}
                >
                  <div className="flex items-center gap-1 min-w-0">
                    <span className="font-medium text-sm text-white truncate">{handle}</span>
                    {user.is_verified && (
                      <CheckCircle className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    <PlanBadge plan={user.plan_type} />
                    {user.distanceKm !== undefined && (
                      <span className="text-[10px] text-white/70 inline-flex items-center gap-0.5 leading-none">
                        <MapPin className="h-2.5 w-2.5" />
                        {user.distanceKm < 1
                          ? `${Math.round(user.distanceKm * 1000)}m`
                          : `${user.distanceKm.toFixed(1)}km`}
                      </span>
                    )}
                    {user.is_online && (
                      <span className="text-[10px] text-emerald-400 leading-none">● online</span>
                    )}
                  </div>
                </button>

                <IconButtonTip label={pingedByMeSet?.has(user.id) ? 'Aceno já enviado' : 'Acenar: sinaliza interesse silencioso no Radar'} side="top">
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    disabled={!onSendPing || isPingSending || pingedByMeSet?.has(user.id)}
                    className="h-8 w-8 shrink-0 border-primary/30 hover:bg-primary/10 hover:text-primary"
                    onClick={(event) => {
                      event.stopPropagation();
                      onSendPing?.(user.id);
                    }}
                  >
                    <Radio className="h-3.5 w-3.5" />
                  </Button>
                </IconButtonTip>
              </div>
            </motion.div>
            );
          })}

          {users.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Users className="h-10 w-10 mb-2 opacity-30" />
              <p className="text-sm">Nenhum usuário encontrado</p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

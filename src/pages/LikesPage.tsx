import { memo, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Heart, Crown, Lock, Sparkles, Eye, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useReceivedProfileLikes, type ProfileLike } from "@/hooks/useProfileLikes";
import { useViewedLikes } from "@/hooks/useViewedLikes";
import { useProfile } from "@/hooks/useProfile";
import { usePlatformPhase } from "@/hooks/usePlatformPhase";
import { UserStatusBadge } from "@/components/UserStatusBadge";
import { OnlineDot } from "@/components/ui/OnlineDot";
import { SubscriptionModal } from "@/components/SubscriptionModal";
import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function LikesPage() {
  const { data: likes, isLoading, markAllAsSeen } = useReceivedProfileLikes();
  const { profile } = useProfile();
  const { freeGetsPremiumSocial } = usePlatformPhase();
  const [showSubscribeModal, setShowSubscribeModal] = useState(false);

  const hasPaidPlan = profile?.plan_type === 'premium' || profile?.plan_type === 'vip';
  // Durante o Beta, usuários FREE recebem acesso social Premium
  const isPremium = hasPaidPlan || freeGetsPremiumSocial;
  const totalLikes = likes?.length || 0;
  const hiddenCount = isPremium ? 0 : totalLikes;

  const allIds = useMemo(() => (likes || []).map((l) => l.id), [likes]);
  const { unviewedCount, viewedIds, markAllViewed } = useViewedLikes(allIds);

  // Paginação — 30 curtidas por página, histórico SEMPRE visível.
  const PAGE_SIZE = 30;
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(totalLikes / PAGE_SIZE));
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);
  const pagedLikes = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return (likes || []).slice(start, start + PAGE_SIZE);
  }, [likes, page]);
  const rangeStart = totalLikes === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, totalLikes);

  // Marca como vistas em background — NÃO remove do histórico.
  useEffect(() => {
    if (!isLoading && totalLikes > 0) {
      const timer = setTimeout(() => {
        markAllViewed();
        markAllAsSeen();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [isLoading, totalLikes, markAllViewed, markAllAsSeen]);

  if (isLoading) {
    return (
      <div className="p-4 md:p-6">
        <div className="mb-6">
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="space-y-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="flex items-center gap-4 p-4 rounded-xl bg-card/50">
              <Skeleton className="h-14 w-14 rounded-full" />
              <div className="flex-1">
                <Skeleton className="h-4 w-32 mb-2" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-primary/20 to-secondary/20">
            <Heart className="h-6 w-6 text-primary" fill="currentColor" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold text-foreground">Quem curtiu você</h1>
              <Badge variant="outline" className="border-primary/40 text-primary bg-primary/10 text-xs font-semibold">
                {totalLikes} no total
              </Badge>
            </div>
            <p className="text-muted-foreground text-sm mt-0.5">
              {unviewedCount > 0
                ? `${unviewedCount} nova${unviewedCount === 1 ? ' curtida' : 's curtidas'} • ${totalLikes} no histórico`
                : `${totalLikes} curtida${totalLikes === 1 ? '' : 's'} no histórico`}
            </p>
          </div>
        </div>
      </div>

      {/* Premium CTA for free users */}
      {!isPremium && totalLikes > 0 && (
        <Card className="mb-6 overflow-hidden border-primary/30 bg-gradient-to-r from-primary/5 to-secondary/5">
          <CardContent className="p-5">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-gradient-to-br from-primary/20 to-[hsl(var(--gold))]/20 flex items-center justify-center shrink-0">
                <Eye className="h-7 w-7 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-foreground text-base">
                  {hiddenCount} {hiddenCount === 1 ? 'pessoa' : 'pessoas'} te curtiu!
                </h3>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Seja Premium para revelar quem são e iniciar uma conversa
                </p>
              </div>
            </div>
            <Button
              onClick={() => setShowSubscribeModal(true)}
              className="w-full mt-4 bg-gradient-to-r from-primary to-[hsl(var(--gold))] text-primary-foreground font-semibold h-11"
            >
              <Crown className="h-4 w-4 mr-2" />
              Desbloquear — Seja Premium
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {totalLikes === 0 && (
        <Card>
          <CardContent className="p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <Heart className="h-8 w-8 text-primary" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">
              Nenhuma curtida nova
            </h3>
            <p className="text-muted-foreground">
              Complete seu perfil e adicione fotos para atrair mais pessoas!
            </p>
          </CardContent>
        </Card>
      )}

      {/* Likes List (paginada — histórico sempre visível) */}
      <div className="space-y-2">
        {pagedLikes.map((like) => (
          <LikeCard
            key={like.id}
            like={like}
            isPremium={isPremium}
            onSubscribe={() => setShowSubscribeModal(true)}
          />
        ))}
      </div>

      {/* Paginação — só aparece quando há mais de 30 curtidas */}
      {totalLikes > PAGE_SIZE && (
        <div className="mt-5 flex items-center justify-between gap-2 rounded-xl border border-border/30 bg-card/50 px-3 py-2.5">
          <p className="text-xs text-muted-foreground tabular-nums">
            <span className="font-semibold text-foreground">{rangeStart}–{rangeEnd}</span> de{' '}
            <span className="font-semibold text-foreground">{totalLikes}</span> curtidas
          </p>
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              variant="outline"
              className="h-8 px-2.5"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              aria-label="Página anterior"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <span className="text-xs font-semibold text-foreground/80 tabular-nums px-1">
              {page} / {totalPages}
            </span>
            <Button
              size="sm"
              variant="outline"
              className="h-8 px-2.5"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              aria-label="Próxima página"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      <SubscriptionModal
        open={showSubscribeModal}
        onOpenChange={setShowSubscribeModal}
      />
    </div>
  );
}

const LikeCard = memo(function LikeCard({ 
  like, 
  isPremium, 
  onSubscribe 
}: { 
  like: ProfileLike; 
  isPremium: boolean;
  onSubscribe: () => void;
}) {
  const liker = like.liker;
  const likeDate = new Date(like.created_at);
  const timeAgo = formatDistanceToNow(likeDate, { addSuffix: true, locale: ptBR });
  const exactTime = format(likeDate, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });

  // Free users: blurred cards with paywall
  if (!isPremium) {
    return (
      <div
        onClick={onSubscribe}
        className="flex items-center gap-4 p-4 rounded-xl bg-card/50 border border-border/30 hover:bg-card/80 transition-all cursor-pointer group relative overflow-hidden"
      >
        <div className="relative">
          <Avatar className="h-14 w-14 blur-md select-none pointer-events-none">
            <AvatarImage src={liker?.avatar_url || ''} alt="?" />
            <AvatarFallback className="bg-primary/20 text-primary">?</AvatarFallback>
          </Avatar>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-7 h-7 rounded-full bg-[hsl(var(--gold))]/90 flex items-center justify-center shadow-lg">
              <Lock className="h-3.5 w-3.5 text-[hsl(var(--gold-foreground))]" />
            </div>
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <p
            aria-label="Nome oculto"
            className="text-foreground font-medium blur-md select-none pointer-events-none truncate"
          >
            {liker?.name ? '••••••• ••••' : 'Alguém especial'}
          </p>
          <p className="text-xs text-muted-foreground" title={exactTime}>
            {timeAgo} · {exactTime}
          </p>
        </div>

        <Button
          size="sm"
          className="shrink-0 bg-gradient-to-r from-[hsl(var(--gold))] to-[hsl(35,93%,47%)] text-[hsl(var(--gold-foreground))] font-semibold text-xs px-3 group-hover:scale-105 transition-transform"
          onClick={(e) => { e.stopPropagation(); onSubscribe(); }}
        >
          <Sparkles className="h-3 w-3 mr-1" />
          Ver
        </Button>
      </div>
    );
  }

  // Premium users: full visibility
  return (
    <Link
      to={`/creator/${like.liker_id}`}
      className="flex items-center gap-4 p-4 rounded-xl bg-card/50 border border-border/30 hover:bg-card transition-all cursor-pointer"
    >
      <div className="relative">
        <Avatar className="h-14 w-14">
          <AvatarImage src={liker?.avatar_url || ''} alt={`@${liker?.username || 'usuario'}`} />
          <AvatarFallback className="bg-primary/20 text-primary">
            {(liker?.username || 'U')[0]?.toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <OnlineDot user={liker as any} size="lg" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="font-semibold text-foreground">@{liker?.username || 'usuario'}</span>
          {liker?.is_verified && (
            <span className="text-primary text-xs">✓</span>
          )}
          <UserStatusBadge planType={liker?.plan_type} size="sm" showLabel />
        </div>
        <p className="text-sm text-muted-foreground">
          {timeAgo}
        </p>
        <p className="text-xs text-muted-foreground/70 mt-0.5">
          {exactTime}
        </p>
      </div>

      <div className="shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
        <Heart className="h-5 w-5 text-primary" fill="currentColor" />
      </div>
    </Link>
  );
});

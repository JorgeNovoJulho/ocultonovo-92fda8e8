import { useState, memo, useCallback, useMemo, useRef, useEffect, lazy, Suspense } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bell, Check, CheckCheck, MessageCircle, Heart, Crown, UserPlus, Loader2,
  Ticket, Clock, Eye, Lock, Flame, AtSign, Reply, Gift, Target, Snowflake,
  AlertTriangle, Calendar, Star, LifeBuoy, Search, ArrowDownAZ, ArrowUpAZ,
  Bookmark, Filter, MapPin, MessageSquareQuote, ShieldCheck, X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useNotifications, Notification } from "@/hooks/useNotifications";
import { toast } from "sonner";

const SupportTicketModal = lazy(() => import("@/components/SupportTicketModal").then(m => ({ default: m.SupportTicketModal })));
import { Sparkles } from "lucide-react";
import { useActorProfiles, getProfileTypeLabel, type ActorProfile } from "@/hooks/useActorProfiles";
import { extractNotificationActorId, extractNotificationAvatarFallback, getNotificationDisplayTitle, getNotificationDisplayBody } from "@/lib/notificationActors";
import { NotificationActorAvatar } from "@/components/notifications/NotificationActorAvatar";
import { resolveNotificationTarget } from "@/lib/notificationTarget";

type FilterKey = 'all' | 'like' | 'comment' | 'save';
type SortKey = 'desc' | 'asc';

// Detect "save" via data.notification_type === 'save' OR data.kind === 'save'
function isSaveNotification(n: Notification): boolean {
  const data = (n.data || {}) as Record<string, any>;
  return data?.notification_type === 'save' || data?.kind === 'save' || (n.type as string) === 'save';
}

function matchesFilter(n: Notification, filter: FilterKey): boolean {
  if (filter === 'all') return true;
  if (filter === 'save') return isSaveNotification(n);
  if (filter === 'like') return n.type === 'like';
  if (filter === 'comment') return n.type === 'comment' || n.type === 'reply' || n.type === 'mention';
  return true;
}

type ExtendedNotificationType = Notification['type'] | 'coupon_expiring' | 'referral_expired' | 'looking_now_match' | 'save';

const notificationIcons: Record<string, React.ElementType> = {
  message: MessageCircle, like: Heart, subscription: Crown, follow: UserPlus,
  comment: MessageCircle, mention: AtSign, reply: Reply,
  coupon_expiring: Ticket, referral_expired: Clock, visit: Eye, unlock: Lock,
  looking_now: Flame, looking_now_match: Flame, gift_received: Gift,
  goal_contribution: Target, balance_frozen: Snowflake,
  verification_rejected: AlertTriangle, event_chat: Calendar, super_dm: Crown,
  match: Heart, superlike: Star, support_response: LifeBuoy, system: Bell,
  save: Bookmark,
  rating_received: Star, testimonial_received: MessageSquareQuote, recommendation_received: ShieldCheck,
  attention_ping: Bell,
  approach_received: Heart,

};

const notificationColors: Record<string, string> = {
  message: "text-blue-500 bg-blue-500/10",
  like: "text-pink-500 bg-pink-500/10",
  subscription: "text-amber-500 bg-amber-500/10",
  follow: "text-green-500 bg-green-500/10",
  comment: "text-cyan-500 bg-cyan-500/10",
  mention: "text-pink-400 bg-pink-400/10",
  reply: "text-green-400 bg-green-400/10",
  coupon_expiring: "text-orange-500 bg-orange-500/10",
  referral_expired: "text-gray-500 bg-gray-500/10",
  visit: "text-purple-400 bg-purple-400/10",
  unlock: "text-amber-400 bg-amber-400/10",
  looking_now: "text-orange-500 bg-orange-500/10",
  looking_now_match: "text-yellow-400 bg-gradient-to-r from-orange-500/10 to-yellow-500/10",
  gift_received: "text-yellow-500 bg-yellow-500/10",
  goal_contribution: "text-emerald-500 bg-emerald-500/10",
  balance_frozen: "text-blue-400 bg-blue-400/10",
  verification_rejected: "text-red-500 bg-red-500/10",
  event_chat: "text-purple-400 bg-purple-400/10",
  super_dm: "text-amber-400 bg-gradient-to-r from-amber-500/20 to-yellow-400/10",
  match: "text-pink-500 bg-gradient-to-r from-pink-500/10 to-rose-400/10",
  superlike: "text-cyan-400 bg-gradient-to-r from-cyan-500/10 to-blue-400/10",
  support_response: "text-green-500 bg-green-500/10",
  system: "text-blue-400 bg-blue-400/10",
  save: "text-violet-400 bg-violet-500/10",
  rating_received: "text-amber-400 bg-amber-500/10",
  testimonial_received: "text-purple-400 bg-purple-500/10",
  recommendation_received: "text-emerald-400 bg-emerald-500/10",
  attention_ping: "text-[#D4AF37] bg-amber-500/10",
  approach_received: "text-pink-500 bg-pink-500/10",

};

const NotificationItem = memo(function NotificationItem({
  notification, onClick, formatTime, justRead, actor, fallbackAvatarUrl
}: {
  notification: Notification;
  onClick: (n: Notification) => void;
  formatTime: (d: string) => string;
  justRead: boolean;
  actor?: ActorProfile | null;
  fallbackAvatarUrl?: string | null;
}) {
  const isSave = isSaveNotification(notification);
  const extendedType = (notification.data as any)?.notification_type as string | undefined;
  const displayType: string = isSave ? 'save' : (extendedType || notification.type);
  const Icon = notificationIcons[displayType] || Crown;
  const colorClass = notificationColors[displayType] || notificationColors.subscription;
  const isMatch = displayType === 'looking_now_match';

  const typeLabel = actor ? getProfileTypeLabel(actor.profile_type) : null;
  const cityText = actor
    ? [actor.address_city, actor.address_state].filter(Boolean).join(' / ')
    : '';
  const displayTitle = getNotificationDisplayTitle(notification, actor);
  return (
    <button
      onClick={() => onClick(notification)}
      aria-label={`${notification.title}${notification.is_read ? '' : ' (não lida)'}`}
      className={cn(
        "w-full flex items-start gap-3 p-4 hover:bg-muted/30 transition-colors text-left border-b border-border/10 min-h-[3rem] relative",
        !notification.is_read && "bg-primary/15 border-l-4 border-l-primary/60",
        isMatch && "bg-gradient-to-r from-orange-500/10 to-yellow-500/10",
        justRead && "ring-1 ring-primary/40 bg-primary/20 animate-pulse"
      )}
    >
      <NotificationActorAvatar
        actorProfile={actor}
        fallbackAvatarUrl={fallbackAvatarUrl}
        fallbackBg={cn(colorClass, isMatch && "shadow-[0_0_10px_rgba(234,179,8,0.3)]")}
        fallbackIcon={(
          <>
            <Icon className="h-3 w-3" />
            {isMatch && <Sparkles className="absolute -top-1 -right-1 h-3 w-3 text-yellow-300" />}
          </>
        )}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className={cn("text-sm", !notification.is_read && "font-medium text-foreground")}>{displayTitle}</p>
          <div className="flex items-center gap-1 flex-shrink-0">
            <span className="text-[10px] text-muted-foreground">{formatTime(notification.created_at)}</span>
            {!notification.is_read && <div className="w-2.5 h-2.5 rounded-full bg-primary shadow-[0_0_6px_rgba(217,70,239,0.6)]" aria-hidden />}
            {justRead && (
              <span className="text-[9px] font-medium text-primary uppercase tracking-wide">lida</span>
            )}
          </div>
        </div>
        {(typeLabel || cityText) && (
          <div className="flex items-center gap-1 flex-wrap mt-1">
            {typeLabel && (
              <span className="inline-flex items-center gap-0.5 bg-primary/10 text-primary px-1.5 py-0.5 rounded-full text-[10px] font-medium">
                {typeLabel.emoji} {typeLabel.label}
              </span>
            )}
            {cityText && (
              <span className="inline-flex items-center gap-0.5 bg-muted/60 text-muted-foreground px-1.5 py-0.5 rounded-full text-[10px]">
                <MapPin className="h-2.5 w-2.5" /> {cityText}
              </span>
            )}
          </div>
        )}
        {notification.body && (
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{getNotificationDisplayBody(notification, actor) || notification.body}</p>
        )}
      </div>
    </button>
  );
});

const FILTER_TABS: { key: FilterKey; label: string; icon: React.ElementType }[] = [
  { key: 'all', label: 'Todas', icon: Filter },
  { key: 'like', label: 'Curtidas', icon: Heart },
  { key: 'comment', label: 'Comentários', icon: MessageCircle },
  { key: 'save', label: 'Salvamentos', icon: Bookmark },
];

export function NotificationBell() {
  const { notifications, loading, loadingMore, hasMore, unreadCount, markAsRead, markAllAsRead, loadMore } = useNotifications();
  const [open, setOpen] = useState(false);
  const [showSupportModal, setShowSupportModal] = useState(false);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [sort, setSort] = useState<SortKey>('desc');
  const [search, setSearch] = useState('');
  const [justReadId, setJustReadId] = useState<string | null>(null);
  const navigate = useNavigate();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const justReadTimerRef = useRef<number | null>(null);

  // Cleanup highlight timer on unmount
  useEffect(() => () => {
    if (justReadTimerRef.current) window.clearTimeout(justReadTimerRef.current);
  }, []);

  const formatTime = useCallback((dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (mins < 1) return 'agora';
    if (mins < 60) return `${mins}min`;
    if (hours < 24) return `${hours}h`;
    if (days < 7) return `${days}d`;
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
  }, []);

  const visibleNotifications = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = notifications.filter(n => {
      if (!matchesFilter(n, filter)) return false;
      if (!term) return true;
      const hay = `${n.title} ${n.body || ''}`.toLowerCase();
      return hay.includes(term);
    });
    return filtered.sort((a, b) => {
      const ta = new Date(a.created_at).getTime();
      const tb = new Date(b.created_at).getTime();
      return sort === 'desc' ? tb - ta : ta - tb;
    });
  }, [notifications, filter, sort, search]);

  // Coleta actor_ids para buscar metadados (tipo, cidade) em batch
  const actorIds = useMemo(() => {
    const ids = new Set<string>();
    visibleNotifications.forEach(n => {
      const id = extractNotificationActorId(n);
      if (id && typeof id === 'string') ids.add(id);
    });
    return Array.from(ids);
  }, [visibleNotifications]);

  const actorProfiles = useActorProfiles(actorIds);

  const getActorForNotification = useCallback((n: Notification) => {
    const id = extractNotificationActorId(n);
    return id ? actorProfiles[id] : null;
  }, [actorProfiles]);

  const getFallbackAvatarForNotification = useCallback((n: Notification) => {
    return extractNotificationAvatarFallback(n);
  }, []);

  const handleNotificationClick = useCallback((notification: Notification) => {
    // Marca SOMENTE a notificação clicada como lida
    if (!notification.is_read) {
      markAsRead(notification.id);
      setJustReadId(notification.id);
      if (justReadTimerRef.current) window.clearTimeout(justReadTimerRef.current);
      // Highlight visível por ~1.4s antes de fechar o popover/navegar
      justReadTimerRef.current = window.setTimeout(() => setJustReadId(null), 2200);
    }

    // Pequeno delay para o usuário ver o feedback "lida" antes de navegar
    window.setTimeout(() => {
      setOpen(false);
      if (notification.type === 'support_response' || (notification.type === 'system' && (notification.data as any)?.source === 'support_ticket')) {
        setShowSupportModal(true);
        return;
      }
      // Regra única de destino (mesma da página de notificações e do push).
      const actor = getActorForNotification(notification);
      resolveNotificationTarget(notification, actor as any).then(({ url, state, toast: msg }) => {
        if (msg) toast.info(msg);
        // Fallback persistente: garante o scroll mesmo se o state do router se perder.
        if (state?.scrollToPost) {
          import('@/lib/feedScrollHint').then(m => m.rememberScrollToPost(state.scrollToPost, state.focus));
        }
        navigate(url, state ? { state } : undefined);
      });
    }, notification.is_read ? 0 : 350);
  }, [markAsRead, navigate, getActorForNotification]);


  // Infinite scroll: carrega mais quando chegar próximo ao fim
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    if (!hasMore || loadingMore) return;
    const el = e.currentTarget;
    const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distanceToBottom < 80) {
      loadMore();
    }
  }, [hasMore, loadingMore, loadMore]);

  // Abertura/fechamento NÃO marca todas como lidas — apenas o clique individual marca
  const handleOpenChange = useCallback((next: boolean) => {
    setOpen(next);
  }, []);

  return (
    <>
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={`Notificações${unreadCount > 0 ? ` (${unreadCount} não lidas)` : ''}`}>
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge className="absolute -top-1 -right-1 h-5 min-w-5 p-0 flex items-center justify-center bg-red-500 text-white text-[10px]">
              {unreadCount > 99 ? '99+' : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" side="bottom" sideOffset={8} className="w-[calc(100vw-1rem)] sm:w-[22rem] max-w-[22rem] p-0" style={{ zIndex: 9999 }}>
        {/* Header */}
        <div className="flex items-center justify-between gap-2 p-3 border-b border-border/30">
          <h3 className="font-semibold text-sm">Notificações</h3>
          <div className="flex items-center gap-1">
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-[11px] gap-1 text-primary hover:text-primary"
                onClick={() => {
                  markAllAsRead();
                  toast.success("Todas as notificações marcadas como lidas");
                }}
                aria-label="Marcar todas as notificações como lidas"
                title="Marcar todas como lidas"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Marcar como lidas
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setSort(s => s === 'desc' ? 'asc' : 'desc')}
              aria-label={`Ordenar por data: ${sort === 'desc' ? 'mais recentes primeiro' : 'mais antigas primeiro'}`}
              title={sort === 'desc' ? 'Mais recentes primeiro' : 'Mais antigas primeiro'}
            >
              {sort === 'desc' ? <ArrowDownAZ className="h-3.5 w-3.5 mr-1" /> : <ArrowUpAZ className="h-3.5 w-3.5 mr-1" />}
              {sort === 'desc' ? 'Recentes' : 'Antigas'}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
              onClick={() => setOpen(false)}
              aria-label="Fechar notificações"
              title="Fechar"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Search */}
        <div className="p-2 border-b border-border/30">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar notificações..."
              aria-label="Buscar notificações"
              className="h-8 pl-7 text-xs"
            />
          </div>
        </div>

        {/* Filter tabs */}
        <div className="flex items-center gap-1 px-2 py-2 border-b border-border/30 overflow-x-auto [&::-webkit-scrollbar]:hidden">
          {FILTER_TABS.map(tab => {
            const TabIcon = tab.icon;
            const active = filter === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setFilter(tab.key)}
                aria-pressed={active}
                aria-label={`Filtrar: ${tab.label}`}
                className={cn(
                  "flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium whitespace-nowrap transition-colors flex-shrink-0",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted/50 text-muted-foreground hover:bg-muted"
                )}
              >
                <TabIcon className="h-3 w-3" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Notifications List */}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          style={{
            maxHeight: '24rem',
            overflowY: 'auto',
            overflowX: 'hidden',
            WebkitOverflowScrolling: 'touch',
            touchAction: 'pan-y',
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
          }}
          className="[&::-webkit-scrollbar]:hidden"
        >
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : visibleNotifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center px-4">
              <Bell className="h-10 w-10 text-muted-foreground/30 mb-2" />
              <p className="text-sm text-muted-foreground">
                {search || filter !== 'all'
                  ? 'Nenhuma notificação corresponde ao filtro'
                  : 'Nenhuma notificação'}
              </p>
            </div>
          ) : (
            <div>
              {visibleNotifications.map((notification) => (
                <NotificationItem
                  key={notification.id}
                  notification={notification}
                  onClick={handleNotificationClick}
                  formatTime={formatTime}
                  justRead={notification.id === justReadId}
                  actor={getActorForNotification(notification)}
                  fallbackAvatarUrl={getFallbackAvatarForNotification(notification)}
                />
              ))}
              {loadingMore && (
                <div className="flex items-center justify-center py-3">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              )}
              {!hasMore && visibleNotifications.length > 0 && (
                <p className="text-center text-[10px] text-muted-foreground/60 py-3">
                  Você chegou ao fim
                </p>
              )}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
    {showSupportModal && (
      <Suspense fallback={null}>
        <SupportTicketModal open={showSupportModal} onOpenChange={setShowSupportModal} initialTab="history" />
      </Suspense>
    )}
    </>
  );
}

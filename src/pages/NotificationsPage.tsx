import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Virtuoso } from "react-virtuoso";
import { useNotifications, type Notification } from "@/hooks/useNotifications";
import {
  useActorProfiles,
  getProfileTypeLabel,
  normalizeProfileType,
  type ActorProfile,
  type ProfileTypeKey,
} from "@/hooks/useActorProfiles";
import { Link, useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Trash2, Eye, Heart, UserPlus, Crown, MessageCircle, Bell, CheckCheck,
  Lock, AtSign, Reply, Gift, Target, Snowflake, AlertTriangle, Star,
  Bookmark, Search, ArrowDownAZ, ArrowUpAZ, Filter, Loader2, MapPin,
  Check, Share2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { extractNotificationActorId, extractNotificationAvatarFallback, getNotificationDisplayTitle, getNotificationDisplayBody } from "@/lib/notificationActors";
import { NotificationActorAvatar } from "@/components/notifications/NotificationActorAvatar";
import { progressAuraQuest } from "@/lib/auraQuests";
import { useAuth } from "@/hooks/useAuth";
import { getDirectNotificationChatUrl, resolveNotificationChatUrl, isChatNotificationType } from "@/lib/notificationChatLink";

type FilterKey = 'all' | 'like' | 'comment' | 'save';
type SortKey = 'desc' | 'asc';

function isSaveNotification(n: Notification): boolean {
  const data = (n.data || {}) as Record<string, any>;
  return data?.notification_type === 'save' || data?.kind === 'save' || (n.type as string) === 'save';
}

function isShareNotification(n: Notification): boolean {
  const data = (n.data || {}) as Record<string, any>;
  return data?.notification_type === 'share' || data?.kind === 'share' || (n.type as string) === 'share';
}

function matchesFilter(n: Notification, filter: FilterKey): boolean {
  if (filter === 'all') return true;
  if (filter === 'save') return isSaveNotification(n);
  if (filter === 'like') return n.type === 'like';
  if (filter === 'comment') return n.type === 'comment' || n.type === 'reply' || n.type === 'mention';
  return true;
}

const notificationConfig: Record<string, { icon: React.ElementType; iconColor: string; bgColor: string }> = {
  visit: { icon: Eye, iconColor: "text-purple-400", bgColor: "bg-purple-500/20" },
  like: { icon: Heart, iconColor: "text-primary", bgColor: "bg-primary/20" },
  follow: { icon: UserPlus, iconColor: "text-green-400", bgColor: "bg-green-500/20" },
  subscription: { icon: Crown, iconColor: "text-yellow-400", bgColor: "bg-yellow-500/20" },
  message: { icon: MessageCircle, iconColor: "text-blue-400", bgColor: "bg-blue-500/20" },
  comment: { icon: MessageCircle, iconColor: "text-cyan-400", bgColor: "bg-cyan-500/20" },
  mention: { icon: AtSign, iconColor: "text-primary", bgColor: "bg-primary/20" },
  reply: { icon: Reply, iconColor: "text-green-400", bgColor: "bg-green-500/20" },
  unlock: { icon: Lock, iconColor: "text-amber-400", bgColor: "bg-amber-500/20" },
  gift_received: { icon: Gift, iconColor: "text-yellow-400", bgColor: "bg-yellow-500/20" },
  goal_contribution: { icon: Target, iconColor: "text-emerald-400", bgColor: "bg-emerald-500/20" },
  balance_frozen: { icon: Snowflake, iconColor: "text-blue-400", bgColor: "bg-blue-500/20" },
  verification_rejected: { icon: AlertTriangle, iconColor: "text-red-400", bgColor: "bg-red-500/20" },
  match: { icon: Heart, iconColor: "text-pink-500", bgColor: "bg-pink-500/20" },
  superlike: { icon: Star, iconColor: "text-cyan-400", bgColor: "bg-cyan-500/20" },
  save: { icon: Bookmark, iconColor: "text-violet-400", bgColor: "bg-violet-500/20" },
  share: { icon: Share2, iconColor: "text-emerald-400", bgColor: "bg-emerald-500/20" },
  system: { icon: Bell, iconColor: "text-blue-400", bgColor: "bg-blue-500/20" },
};

function formatTime(dateStr: string) {
  try {
    return formatDistanceToNow(new Date(dateStr), { addSuffix: false, locale: ptBR });
  } catch {
    return "agora";
  }
}

/**
 * Renderiza o título da notificação substituindo `@username` por um link
 * clicável para o perfil do ator (quando disponível).
 * Mantém o restante do texto inalterado.
 */
function renderTitleWithActorLink(
  title: string,
  actor?: ActorProfile | null,
  notification?: Notification,
): React.ReactNode {
  if (!actor) return title;
  const username = actor.username;
  if (!username) return title;

  // Para notificações de post (curtida, comentário, salvar, share, presente),
  // NUNCA transformar o @username em link para o perfil do criador — o clique
  // do card inteiro precisa abrir a publicação. Sem link evita conflito de UX.
  const type = (notification?.type as string) || '';
  const postFocusTypes = new Set(['like', 'dislike', 'comment', 'reply', 'mention', 'save', 'share', 'gift_received']);
  if (postFocusTypes.has(type)) return title;

  const re = new RegExp(`@(${username.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')})`, 'i');
  const m = title.match(re);
  const targetId = actor.username || actor.id;
  if (!m || m.index === undefined) return title;
  const before = title.slice(0, m.index);
  const after = title.slice(m.index + m[0].length);
  return (
    <>
      {before}
      <Link
        to={`/creator/${targetId}`}
        onClick={(e) => e.stopPropagation()}
        className="text-primary hover:underline font-semibold"
      >
        @{m[1]}
      </Link>
      {after}
    </>
  );
}

type PostFocus = 'likes' | 'comments' | 'saved' | 'shares';

/**
 * Mapeia o tipo de notificação para um "foco" no meu perfil.
 * Retorna null para tipos que não envolvem um post próprio.
 */
function resolvePostFocus(notification: Notification): PostFocus | null {
  if (isSaveNotification(notification)) return 'saved';
  if (isShareNotification(notification)) return 'shares';
  switch (notification.type as string) {
    case 'like':
    case 'dislike':
    case 'gift_received': // presente associado a um post abre o modal do post
      return 'likes';
    case 'comment':
    case 'reply':
    case 'mention':
    case 'comment_like' as any:
    case 'comment_dislike' as any:
      return 'comments';
    default:
      return null;
  }
}

function buildOwnProfileUrl(focus: PostFocus, postId?: string | null): string {
  const params = new URLSearchParams({ tab: 'posts', focus });
  if (postId) params.set('highlight', postId);
  return `/profile?${params.toString()}`;
}

function getNavigation(notification: Notification, actorProfile?: ActorProfile | null): { url: string; state?: any; fallbackToast?: string } {
  const data = (notification.data || {}) as Record<string, any>;
  // Notificações antigas guardam o id em `related_id` (já normalizado para
  // `notification.post_id` pelo hook). Sempre priorize o campo da linha.
  const postId: string | undefined =
    (notification as any).post_id || data.post_id || data.related_id || (notification as any).related_id;
  const pollId: string | undefined = data.poll_id;

  if (pollId && postId) {
    return {
      url: `/profile?tab=posts&focus=comments&highlight=${postId}&poll=${pollId}`,
      state: { scrollToPost: postId, focus: 'comments', highlight: postId, pollId },
    };
  }

  const focus = resolvePostFocus(notification);
  if (focus && postId) {
    return {
      url: buildOwnProfileUrl(focus, postId),
      state: { scrollToPost: postId, focus, highlight: postId },
    };
  }
  if (focus) {
    return {
      url: '/feed',
      state: { focus },
      fallbackToast: 'Esta notificação não tem post vinculado — abrindo o feed.',
    };
  }

  const actorId =
    data.actor_id || data.sender_id || data.from_user_id || data.user_id || (notification as any).actor_id;
  const actorUsername = data.sender_username || data.actor_username || data.username;
  // Prioriza username/id do actorProfile resolvido (mais confiável que data bruto)
  const resolvedUsername = (actorProfile as any)?.username || actorUsername;
  const resolvedId = (actorProfile as any)?.id || actorId;
  const profileTarget = resolvedUsername || resolvedId;

  switch (notification.type as string) {
    case 'visit':
    case 'follow':
      return { url: profileTarget ? `/creator/${profileTarget}` : '/followers' };
    case 'looking_now':
    case 'looking_now_match' as any:
      // Aceno: sempre tenta abrir o perfil do usuário que acenou
      return { url: profileTarget ? `/creator/${profileTarget}` : '/radar' };
    case 'message':
    case 'new_message':
    case 'super_dm':
    case 'attention_ping': {
      const direct = getDirectNotificationChatUrl(notification);
      if (direct) return { url: direct };
      return { url: '/messages' };
    }
    case 'match':
    case 'superlike':
    case 'looking_now_match' as any: {
      const cid = data.conversation_id;
      if (cid) return { url: `/messages?c=${cid}` };
      return { url: profileTarget ? `/creator/${profileTarget}` : '/matches' };
    }
    case 'subscription': return { url: '/subscriptions' };
    case 'gift_received':
      return {
        url: '/my-gifts',
        fallbackToast: 'Presente sem post vinculado — abrindo Meus Presentes.',
      };
    case 'goal_contribution': return { url: '/wallet' };
    case 'verification_rejected': return { url: '/couple-verification' };
    case 'audio_bio_request' as any:
      return {
        url: data?.cta_url || '/profile#voice-bio',
        state: { focusSection: 'voice-bio' },
      };
    case 'community_reply':
    case 'community_new_reply':
    case 'community_new_topic':
    case 'community_new_member':
    case 'community_topic_approved':
    case 'community_topic_rejected':
    case 'community_membership_request': {
      // Slug pode estar no data; senão será resolvido async no handleClick
      const slug = data.slug || data.community_slug;
      const communityId = data.community_id;
      const topicId = data.topic_id;
      const replyId = data.reply_id;
      if (slug && topicId) {
        const hash = replyId ? `#reply-${replyId}` : '';
        return { url: `/comunidades/${slug}/topico/${topicId}${hash}` };
      }
      if (slug) return { url: `/comunidades/${slug}` };
      // sinaliza resolução async via campo especial
      if (!communityId) return { url: '/comunidades' };
      return {
        url: '',
        state: { __communityResolve: { communityId, topicId, replyId } },
      } as any;
    }
    case 'rating_received':
    case 'testimonial_received':
    case 'recommendation_received': {
      const t = notification.type as string;
      const section = data.section
        || (t === 'testimonial_received' ? 'testimonials'
          : t === 'recommendation_received' ? 'recommendations'
          : 'rating');
      return { url: `/profile#${section}`, state: { focusSection: section } };
    }
    case 'event_chat': return { url: data?.event_id ? `/events/${data.event_id}` : '/events' };
    case 'support_response': return { url: '/support' };
    case 'unlock':
      return { url: data?.cta_url || (postId ? buildOwnProfileUrl('comments', postId) : '/notifications') };
    case 'oculto_play_new':
      return { url: data?.cta_url || (data.item_id ? `/oculto-play?item=${data.item_id}` : '/oculto-play') };
    case 'approach_received':
      return { url: data.url || '/feed?focus=newcomers', state: { focusSection: 'newcomers' } };
    default: return { url: data?.cta_url || '/profile?tab=posts' };
  }
}





const NotificationItem = memo(function NotificationItem({
  notification, onClick, justRead, actorProfile, fallbackAvatarUrl,
}: {
  notification: Notification;
  onClick: (n: Notification, actorProfile?: ActorProfile | null) => void;
  justRead: boolean;
  actorProfile?: ActorProfile | null;
  fallbackAvatarUrl?: string | null;
}) {
  const isSave = isSaveNotification(notification);
  const isShare = isShareNotification(notification);
  const displayType = isShare ? 'share' : isSave ? 'save' : notification.type;
  const config = notificationConfig[displayType] || notificationConfig.message;
  const Icon = config.icon;

  const typeLabel = getProfileTypeLabel(actorProfile?.profile_type);
  const cityParts = [actorProfile?.address_city, actorProfile?.address_state].filter(Boolean);
  const cityText = cityParts.join(' / ');
  const displayTitle = getNotificationDisplayTitle(notification, actorProfile);

  return (
    <button
      onClick={() => onClick(notification, actorProfile)}
      className={cn(
        "w-full flex items-start gap-3 p-4 text-left transition-all",
        "hover:bg-muted/50 border-l-2",
        notification.is_read
          ? "bg-transparent border-transparent"
          : "bg-purple-900/20 border-primary",
        justRead && "ring-1 ring-emerald-500/40 bg-emerald-500/5"
      )}
    >
      <NotificationActorAvatar
        actorProfile={actorProfile}
        fallbackAvatarUrl={fallbackAvatarUrl}
        fallbackBg={config.bgColor}
        fallbackIcon={<Icon className={cn("h-3 w-3", config.iconColor)} />}
      />


      <div className="flex-1 min-w-0">
        <p className={cn(
          "text-sm",
          notification.is_read ? "text-muted-foreground" : "text-foreground"
        )}>
          {renderTitleWithActorLink(displayTitle, actorProfile, notification)}
        </p>
        {notification.body && (
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
            {getNotificationDisplayBody(notification, actorProfile) || notification.body}
          </p>
        )}

        {/* Metadata do ator: tipo de perfil + cidade */}
        {(typeLabel || cityText) && (
          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
            {typeLabel && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-medium leading-none">
                <span aria-hidden>{typeLabel.emoji}</span>
                {typeLabel.label}
              </span>
            )}
            {cityText && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-muted/60 text-muted-foreground text-[10px] font-medium leading-none">
                <MapPin className="h-2.5 w-2.5" />
                {cityText}
              </span>
            )}
          </div>
        )}

        <p className="text-xs text-muted-foreground/70 mt-1">
          {formatTime(notification.created_at)}
        </p>
      </div>

      <div className="relative flex items-center justify-end shrink-0 mt-2 h-4 w-14 [contain:layout_paint] [will-change:opacity]">
        {/* Unread dot — fades out smoothly */}
        <span
          aria-hidden
          className={cn(
            "absolute right-0 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-primary transition-opacity duration-300 ease-out motion-reduce:transition-none",
            (!notification.is_read && !justRead) ? "opacity-100" : "opacity-0"
          )}
        />
        {/* "LIDA" badge — crossfades in/out, no layout shift */}
        <span
          className={cn(
            "absolute right-0 top-1/2 -translate-y-1/2 inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-500 uppercase tracking-wide",
            "transition-opacity duration-300 ease-out motion-reduce:transition-none",
            justRead ? "opacity-100" : "opacity-0 pointer-events-none"
          )}
        >
          <Check className="h-3 w-3" /> lida
        </span>
      </div>
    </button>
  );
});

function NotificationSkeleton() {
  return (
    <div className="flex items-start gap-3 p-4">
      <Skeleton className="h-8 w-8 rounded-full" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
      </div>
    </div>
  );
}

const FILTER_TABS: { key: FilterKey; label: string; icon: React.ElementType }[] = [
  { key: 'all', label: 'Todas', icon: Filter },
  { key: 'like', label: 'Curtidas', icon: Heart },
  { key: 'comment', label: 'Comentários', icon: MessageCircle },
  { key: 'save', label: 'Salvamentos', icon: Bookmark },
];

const PROFILE_TYPE_FILTERS: { key: ProfileTypeKey | 'all'; label: string; emoji: string }[] = [
  { key: 'all', label: 'Todos', emoji: '👥' },
  { key: 'couple', label: 'Casal', emoji: '👫' },
  { key: 'male', label: 'Homem', emoji: '👨' },
  { key: 'female', label: 'Mulher', emoji: '👩' },
  { key: 'trans', label: 'Trans', emoji: '⚧️' },
];

export default function NotificationsPage() {
  const { user } = useAuth();
  useEffect(() => {
    if (!user?.id) return;
    void progressAuraQuest('visit_notifications', 1, { reason: 'central de notificações aberta' });
  }, [user?.id]);
  const {
    notifications, loading, loadingMore, hasMore,
    unreadCount, markAsRead, markAllAsRead, clearAllNotifications, loadMore,
  } = useNotifications();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<FilterKey>('all');
  const [typeFilter, setTypeFilter] = useState<ProfileTypeKey | 'all'>('all');
  const [sort, setSort] = useState<SortKey>('desc');
  const [search, setSearch] = useState('');
  const [justReadId, setJustReadId] = useState<string | null>(null);
  const justReadTimerRef = useRef<number | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => () => {
    if (justReadTimerRef.current) window.clearTimeout(justReadTimerRef.current);
  }, []);

  // Pre-filtro (sem tipo de perfil) — usado para coletar actor_ids e fazer fetch
  const baseFiltered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return notifications.filter(n => {
      if (!matchesFilter(n, filter)) return false;
      if (!term) return true;
      const hay = `${n.title} ${n.body || ''}`.toLowerCase();
      return hay.includes(term);
    });
  }, [notifications, filter, search]);

  const actorIds = useMemo(
    () =>
      baseFiltered
        .map((n) => extractNotificationActorId(n))
        .filter(Boolean) as string[],
    [baseFiltered],
  );
  const actorProfiles = useActorProfiles(actorIds);

  // Filtro final aplica tipo de perfil (depende dos perfis carregados) + ordenação
  const visibleNotifications = useMemo(() => {
    const filtered = baseFiltered.filter((n) => {
      if (typeFilter === 'all') return true;
      const aid = extractNotificationActorId(n);
      const profile = aid ? actorProfiles[aid] : null;
      return normalizeProfileType(profile?.profile_type) === typeFilter;
    });
    return filtered.sort((a, b) => {
      const ta = new Date(a.created_at).getTime();
      const tb = new Date(b.created_at).getTime();
      return sort === 'desc' ? tb - ta : ta - tb;
    });
  }, [baseFiltered, typeFilter, actorProfiles, sort]);

  const getFallbackAvatarForNotification = useCallback((notification: Notification) => {
    return extractNotificationAvatarFallback(notification);
  }, []);

  const handleClick = useCallback(async (n: Notification, actorProfile?: ActorProfile | null) => {
    // 1) Marca como lida IMEDIATAMENTE (otimista) — antes de navegar.
    if (!n.is_read) {
      markAsRead(n.id);
      setJustReadId(n.id);
      if (justReadTimerRef.current) window.clearTimeout(justReadTimerRef.current);
      justReadTimerRef.current = window.setTimeout(() => setJustReadId(null), 2200);
    }
    // 2) Resolve destino e navega na sequência (sem atraso perceptível).
    if (isChatNotificationType(n.type as string)) {
      const chatUrl = await resolveNotificationChatUrl(n);
      navigate(chatUrl);
      return;
    }
    const { url, state, fallbackToast } = getNavigation(n, actorProfile);
    if (fallbackToast) {
      import('sonner').then((m) => m.toast.info(fallbackToast));
    }
    if (state?.scrollToPost) {
      import('@/lib/feedScrollHint').then((m) =>
        m.rememberScrollToPost(state.scrollToPost, state.focus),
      );
    }
    // Resolução async para notificações de comunidade quando o slug não veio no data.
    const communityResolve = (state as any)?.__communityResolve;
    if (!url && communityResolve?.communityId) {
      try {
        const { supabase } = await import('@/lib/supabaseExternal');
        const { data: ln } = await supabase
          .from('oculto_communities')
          .select('slug')
          .eq('id', communityResolve.communityId)
          .maybeSingle();
        const slug = (ln as any)?.slug;
        if (slug && communityResolve.topicId) {
          const hash = communityResolve.replyId ? `#reply-${communityResolve.replyId}` : '';
          navigate(`/comunidades/${slug}/topico/${communityResolve.topicId}${hash}`);
          return;
        }
        if (slug) {
          navigate(`/comunidades/${slug}`);
          return;
        }
      } catch {/* fallback abaixo */}
      navigate('/comunidades');
      return;
    }
    navigate(url, state ? { state } : undefined);
  }, [markAsRead, navigate]);




  // Infinite scroll via IntersectionObserver
  useEffect(() => {
    if (!sentinelRef.current || !hasMore) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && hasMore && !loadingMore) {
        loadMore();
      }
    }, { rootMargin: '200px' });
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, loadMore, visibleNotifications.length]);

  return (
    <div className="flex flex-col min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border/50 gap-2 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-full bg-primary/10">
            <Bell className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground">Notificações</h1>
            {unreadCount > 0 && (
              <p className="text-xs text-muted-foreground">
                {unreadCount} não {unreadCount === 1 ? "lida" : "lidas"}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSort(s => s === 'desc' ? 'asc' : 'desc')}
            className="h-8 px-2 text-xs"
            title={sort === 'desc' ? 'Mais recentes primeiro' : 'Mais antigas primeiro'}
          >
            {sort === 'desc' ? <ArrowDownAZ className="h-3.5 w-3.5 mr-1" /> : <ArrowUpAZ className="h-3.5 w-3.5 mr-1" />}
            {sort === 'desc' ? 'Recentes' : 'Antigas'}
          </Button>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={markAllAsRead}
              className="text-primary hover:text-primary hover:bg-primary/10"
            >
              <CheckCheck className="h-4 w-4 mr-1.5" />
              Marcar todas
            </Button>
          )}
          {notifications.some(n => n.is_read) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearAllNotifications}
              className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="h-4 w-4 mr-1.5" />
              Limpar
            </Button>
          )}
        </div>
      </div>

      {/* Search */}
      <div className="p-3 border-b border-border/30">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar notificações..."
            aria-label="Buscar notificações"
            className="h-9 pl-8 text-sm"
          />
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-border/30 overflow-x-auto [&::-webkit-scrollbar]:hidden">
        {FILTER_TABS.map(tab => {
          const TabIcon = tab.icon;
          const active = filter === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              aria-pressed={active}
              className={cn(
                "flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors flex-shrink-0",
                active
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted/50 text-muted-foreground hover:bg-muted"
              )}
            >
              <TabIcon className="h-3.5 w-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Profile-type filter chips */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-border/30 overflow-x-auto [&::-webkit-scrollbar]:hidden">
        {PROFILE_TYPE_FILTERS.map((opt) => {
          const active = typeFilter === opt.key;
          return (
            <button
              key={opt.key}
              onClick={() => setTypeFilter(opt.key)}
              aria-pressed={active}
              className={cn(
                "inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors flex-shrink-0",
                active
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted/50 text-muted-foreground hover:bg-muted",
              )}
            >
              <span aria-hidden>{opt.emoji}</span>
              {opt.label}
            </button>
          );
        })}
      </div>

      <div className="pb-24 md:pb-6">
        {loading ? (
          <div className="divide-y divide-border/30">
            {[...Array(5)].map((_, i) => (
              <NotificationSkeleton key={i} />
            ))}
          </div>
        ) : visibleNotifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
            <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mb-4">
              <Bell className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">
              {search || filter !== 'all' ? 'Nada encontrado' : 'Nenhuma notificação'}
            </h3>
            <p className="text-sm text-muted-foreground max-w-xs">
              {search || filter !== 'all'
                ? 'Tente ajustar os filtros ou limpar a busca.'
                : 'Quando alguém curtir, comentar ou salvar seu conteúdo, você verá aqui.'}
            </p>
          </div>
        ) : (
          <Virtuoso
            useWindowScroll
            data={visibleNotifications}
            endReached={() => {
              if (hasMore && !loadingMore) {
                // trigger sentinel-based loader by scrolling near bottom
                sentinelRef.current?.scrollIntoView({ block: "end" });
              }
            }}
            increaseViewportBy={{ top: 200, bottom: 600 }}
            itemContent={(_, n) => {
              const aid = extractNotificationActorId(n);
              return (
                <div className="border-b border-border/30">
                  <NotificationItem
                    notification={n}
                    onClick={handleClick}
                    justRead={n.id === justReadId}
                    actorProfile={aid ? actorProfiles[aid] : null}
                    fallbackAvatarUrl={getFallbackAvatarForNotification(n)}
                  />
                </div>
              );
            }}
            components={{
              Footer: () => (
                <>
                  <div ref={sentinelRef} className="h-2" />
                  {loadingMore && (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  )}
                  {!hasMore && (
                    <p className="text-center text-xs text-muted-foreground/60 py-4">
                      Você chegou ao fim
                    </p>
                  )}
                </>
              ),
            }}
          />
        )}
      </div>
    </div>
  );
}

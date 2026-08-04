import { useState, useCallback, memo, useMemo, useEffect, useRef } from "react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useToggleFollow, useIsFollowing } from "@/hooks/useFollows";
import { FollowButtonInline } from "@/components/FollowButtonInline";
import { InlineFollowChip } from "@/components/InlineFollowChip";
import { Button } from "@/components/ui/button";
import { SmartImage } from "@/components/SmartImage";
import { buildSupabaseImageThumb } from "@/lib/imageTransform";

import { VideoThumb } from "@/components/VideoThumb";
import { PaidMediaOverlay } from "@/components/PaidMediaOverlay";
import { useHasMediaAccess } from "@/hooks/useMediaAccess";
import { usePaidMediaUrl } from "@/hooks/usePaidMediaUrl";
import { SubscriptionModal } from "@/components/SubscriptionModal";
import { useAuth } from "@/hooks/useAuth";
import { useAdultBlurDecision } from "@/safe-blur/useAdultBlurDecision";
import {
  Heart, 
  ThumbsDown,
  MessageCircle, 
  Share2, 
  Play, 
  Lock, 
  BadgeCheck, 
  Users, 
  Flame, 
  Globe,
  Bookmark,
  MoreHorizontal,
  Flag,
  Trash2,
  MapPin,
  Pencil,
  BarChart3,
  Link as LinkIcon,
  RotateCw,
  Gift,
  Crown,
  EyeOff,
  Shield,
  Pin,
  PinOff,
  User as UserIcon,
  PenSquare,
  StickyNote,
  Loader2,
  Megaphone,
  Eye,
} from "lucide-react";
import { WriteOnMuralModal } from "./profile/WriteOnMuralModal";
import { AdultMediaBlurOverlay } from "@/components/feed/AdultMediaBlurOverlay";
import { OcultoPlayPostEmbed } from "@/components/oculto-play/OcultoPlayPostEmbed";
import { usePostAdminComment } from "@/hooks/usePostAdminComment";
import { AdminPostCommentModal } from "@/components/admin/AdminPostCommentModal";

import { Link, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { buildShareUrl } from "@/lib/appConfig";
import { ocultoPlayShareUrl } from "@/lib/ocultoPlayShareUrl";
import { getGenderLabel, formatCidadeUF } from "@/lib/profileFormat";
import { useToast } from "@/hooks/use-toast";
import { useSavePost, useDeletePost, type Post } from "@/hooks/usePosts";
import { useUserNotes } from "@/hooks/useUserNotes";
import { useLikePostExclusive } from "@/hooks/usePostLikes";
import { useDislikePost } from "@/hooks/usePostDislikes";
import { useSubscribe, useIsSubscribedTo } from "@/hooks/useSubscriptions";
import { useCanPerformActions } from "@/hooks/useCanPerformActions";
import { useLikeLimit } from "@/hooks/useLikeLimit";
import { useAuraXpInteraction, type AuraXpActionKey } from "@/hooks/useAuraXpInteraction";
import { VerifiedCoupleBadge, VerifiedCoupleAvatar } from "./VerifiedCoupleBadge";
import { UserStatusBadge } from "./UserStatusBadge";
import { VipAvatarBorder } from "./VipAvatarBorder";
import { PrestigeBadge } from "./social-score/PrestigeBadge";
import { ContentReportModal } from "./reports/ContentReportModal";
import { PostCommentsSection } from "./PostCommentsSection";
import { MobileCommentsModal } from "./comments/MobileCommentsModal";
import { useIsMobile } from "@/hooks/use-mobile";
import { PostExpandedModal } from "./PostExpandedModal";
import { PostImageCarousel } from "./PostImageCarousel";
import { LikersModal } from "./LikersModal";
import { SharePostModal } from "./SharePostModal";
import { PlayShareMenu } from "./oculto-play/PlayShareMenu";
import { PollCard, EditPollModal } from "./polls";
import { lazy, Suspense } from "react";
const CreatePostModal = lazy(() => import("./CreatePostModal").then(m => ({ default: m.CreatePostModal })));
import { AuraXpGiftModal } from "./aura-match/AuraXpGiftModal";
import { PostGiftCounter } from "./posts/PostGiftCounter";
import { VoiceBioExamplesDialog } from "./feed/VoiceBioExamplesDialog";
import { Headphones } from "lucide-react";


import { useDeletePoll, usePollByPostId } from "@/hooks/usePolls";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { useMoveMedia, type PrivacyLevel } from "@/hooks/useMediaManager";
import { IconButtonTip } from "@/components/ui/icon-button-tip";
import { useQueryClient } from "@tanstack/react-query";
import { resolveProfileByIdentifier } from "@/hooks/useCreatorProfile";
import { isGifUrl, isVideoUrl, resolveVideoThumbnail } from "@/lib/mediaType";
import { FeedMediaErrorBoundary } from "@/components/feed/FeedMediaErrorBoundary";
import { getPublicHandle } from "@/lib/userHandle";
import {
  classifyPost,
  extractFirstLink,
  getPostDurationSeconds,
  logMediaError,
  resolvePostMediaUrl,
} from "@/lib/postMediaUtils";
import { useIsMasterAdmin } from "@/hooks/useUserRoles";
import { supabase } from "@/lib/supabaseExternal";
import { PostTag } from "@/components/post/PostTag";
import { LinkPreviewCard } from "@/components/LinkPreviewCard";
import { InlineLinkMedia, hasEmbeddableLink } from "@/components/InlineLinkMedia";
import { LinkifiedText } from "@/components/LinkifiedText";



const syncPinnedPostInCache = (old: any, postId: string, nextPinned: boolean, pinnedAt: string | null) => {
  if (!old) return old;

  const updatePost = (item: any) => {
    if (!item || item.id !== postId) return item;
    return {
      ...item,
      is_pinned: nextPinned,
      pinned_at: pinnedAt,
    };
  };

  const sortPinnedPostsFirst = (items: any[]) =>
    items.slice().sort((a, b) => {
      const ap = a?.is_pinned ? 1 : 0;
      const bp = b?.is_pinned ? 1 : 0;
      if (ap !== bp) return bp - ap;

      const pinnedAtA = a?.pinned_at ? new Date(a.pinned_at).getTime() : 0;
      const pinnedAtB = b?.pinned_at ? new Date(b.pinned_at).getTime() : 0;
      if (pinnedAtA !== pinnedAtB) return pinnedAtB - pinnedAtA;

      const createdAtA = a?.created_at ? new Date(a.created_at).getTime() : 0;
      const createdAtB = b?.created_at ? new Date(b.created_at).getTime() : 0;
      return createdAtB - createdAtA;
    });

  if (old.pages) {
    return {
      ...old,
      pages: old.pages.map((page: any) => {
        const items = Array.isArray(page?.posts) ? page.posts : Array.isArray(page) ? page : null;
        if (!items) return page;
        const nextItems = sortPinnedPostsFirst(items.map(updatePost));
        return Array.isArray(page) ? nextItems : { ...page, posts: nextItems };
      }),
    };
  }

  if (Array.isArray(old)) {
    return sortPinnedPostsFirst(old.map(updatePost));
  }

  return old;
};

interface RealPostCardProps {
  post: Post;
  onSubscribe?: () => void;
  isDisliked?: boolean;
  onOpenExpandedPost?: (post: Post) => void;
  isOcultoOnly?: boolean;
}

const getPlanLabel = (plan?: string) => {
  if (plan === 'premium' || plan === 'monthly') return 'Premium';
  if (plan === 'vip') return 'VIP';
  return null;
};

export const RealPostCard = memo(function RealPostCard({ post: rawPost, onSubscribe, isDisliked = false, onOpenExpandedPost, isOcultoOnly }: RealPostCardProps) {
  useEffect(() => {
    if ((window as any).OCULTO_DEBUG_FEED) {
      console.log(`[FeedDebug] Render RealPostCard: ${rawPost.id}`, {
        author: (rawPost as any).author?.username,
        isPinned: (rawPost as any).is_pinned,
        timestamp: new Date().toISOString()
      });
    }
  });


  // Defensive normalization: aceita media_urls[] como fallback de media_url,
  // e garante que content_text nulo nunca quebre o render do card.
  const post = useMemo(() => {
    if (!rawPost) return rawPost;
    const resolvedMediaUrl = resolvePostMediaUrl(rawPost);
    const duration = getPostDurationSeconds(rawPost);
    return {
      ...rawPost,
      // +18 explícito: só recebe blur quando a publicação foi marcada como +18.
      is_adult: (rawPost as any).is_adult === true,
      content_text: rawPost.content_text ?? null,
      media_url: resolvedMediaUrl,
      // Mantém os dois campos sincronizados — UI antiga lê `video_duration_seconds`,
      // novas leituras usam `media_duration_seconds`.
      media_duration_seconds: duration || (rawPost as any).media_duration_seconds || null,
      video_duration_seconds: duration || (rawPost as any).video_duration_seconds || null,
    } as typeof rawPost;
  }, [rawPost]);
  
  const isAdult = (post as any).is_adult === true;
  if (isOcultoOnly && isAdult) return null;

  const { toast } = useToast();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Prefetch do perfil ao tocar/hover no avatar/nome — abre a página do criador
  // com os dados já em cache (ganho perceptível principalmente no mobile).
  const prefetchAuthorProfile = useCallback(() => {
    const id = (rawPost as any)?.author?.id || (rawPost as any)?.user_id;
    if (!id) return;
    queryClient.prefetchQuery({
      queryKey: ['creator-profile', id],
      queryFn: async () => {
        const profile = await resolveProfileByIdentifier(String(id));
        if (!profile) return null;
        const result = profile as any;
        if (result.is_ghost_active || !result.show_online_status) {
          result.is_online = false;
        }
        return result;
      },
      staleTime: 60_000,
    });
  }, [queryClient, rawPost]);
  const [mediaError, setMediaError] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showDeletePollConfirm, setShowDeletePollConfirm] = useState(false);
  const [showEditPoll, setShowEditPoll] = useState(false);
  const [reopenPollMode, setReopenPollMode] = useState(false);
  const [showEditPost, setShowEditPost] = useState(false);
  const isPoll = (post as any).post_type === 'poll';
  const { data: pollData } = usePollByPostId(isPoll ? post.id : undefined);
  const isPollClosed = !!pollData?.closes_at && new Date(pollData.closes_at).getTime() < Date.now();
  const deletePoll = useDeletePoll();
  const likePost = useLikePostExclusive();
  const dislikePost = useDislikePost();
  const savePost = useSavePost();
  const deletePost = useDeletePost();
  const subscribe = useSubscribe();
  const moveMedia = useMoveMedia();
  const { data: isSubscribed } = useIsSubscribedTo(post.user_id);

  const currentPrivacy: PrivacyLevel = ((): PrivacyLevel => {
    if ((post as any).is_hidden === true || (post.privacy_level as string) === 'hidden') return 'hidden';
    if (post.privacy_level === 'vip' || (post.is_paid && (post.paid_price || 0) > 0)) return 'vip';
    if (post.privacy_level === 'friends') return 'friends';
    return 'public';
  })();

  const handleChangePrivacy = useCallback(
    async (level: PrivacyLevel) => {
      if (level === currentPrivacy && level !== 'vip') return;
      let price: number | null | undefined = undefined;
      if (level === 'vip') {
        const existing = Number(post.paid_price || 0);
        const input = window.prompt(
          'Defina o preço em R$ para desbloquear este conteúdo VIP:',
          existing > 0 ? String(existing) : '9.90'
        );
        if (input == null) return;
        const parsed = Number(String(input).replace(',', '.'));
        if (!Number.isFinite(parsed) || parsed <= 0) {
          toast({ title: 'Preço inválido', description: 'Informe um valor maior que zero.', variant: 'destructive' });
          return;
        }
        price = Number(parsed.toFixed(2));
      }
      try {
        await moveMedia.mutateAsync({ mediaId: post.id, newPrivacyLevel: level, price });
      } catch {
        // toast já tratado no hook
      }
    },
    [currentPrivacy, moveMedia, post.id, post.paid_price, toast]
  );

  const { canAct, isFrozen } = useCanPerformActions();
  const { canLike, remaining: likesRemaining, recordLike, isFreePlan: isFreeLikes } = useLikeLimit();
  const { chargeAction: chargeXp } = useAuraXpInteraction();

  // Profile id do autor (receiver). author.id quando hidratado, senão user_id.
  const authorReceiverId: string | null =
    ((rawPost as any)?.author?.id as string | undefined) ||
    ((rawPost as any)?.user_id as string | undefined) ||
    null;

  // Helper: cobra XP e retorna true se a ação pode prosseguir.
  const tryChargeXp = useCallback(
    async (actionKey: AuraXpActionKey, refKey: string) => {
      const res = await chargeXp({
        actionKey,
        postId: post.id,
        receiverId: authorReceiverId,
        refKey,
      });
      return res.ok;
    },
    [chargeXp, post.id, authorReceiverId],
  );
  const todayKey = useMemo(() => new Date().toISOString().slice(0, 10), []);

  
  // Paid content access check
  const isPaidPost = post.is_paid && (post.paid_price || 0) > 0;
  const isPostOwner = user?.id === post.user_id || user?.id === (post as any).author_id;
  // Posts compartilhados do OCULTO PLAY nunca recebem blur — a capa precisa aparecer inteira.
  const isOcultoPlayShare = !!(post as any)?.oculto_play_item_id;
  // Fonte ÚNICA de verdade do blur +18 (mobile e desktop): combina o modo de
  // experiência (adult_only vs complete) com o estado global do Modo Blur
  // Seguro (Zustand via useSafeBlur). Nenhum componente recalcula a regra.
  const {
    postIsAdult,
    shouldBlur: shouldBlurAdult,
    covered: adultTextCovered,
    reveal: revealAdultPost,
  } = useAdultBlurDecision({ postId: post.id, isAdult: (post as any)?.is_adult });
  const { data: isMasterAdmin = false } = useIsMasterAdmin();
  // Master pode fixar QUALQUER postagem no topo do feed global; demais usuários só nos próprios perfis (regra de UI já filtra).
  const canPinPost = isMasterAdmin;
  const isPinned = !!(post as any)?.is_pinned;
  // Comentário Master fixado no topo desta postagem (visível a todos).
  const { data: adminComment } = usePostAdminComment(post.id);
  const [showAdminCommentModal, setShowAdminCommentModal] = useState(false);
  const [pinSyncState, setPinSyncState] = useState<'idle' | 'saving' | 'synced'>('idle');
  const [adminCommentSyncFlash, setAdminCommentSyncFlash] = useState(false);
  const qcPin = useQueryClient();

  // Flash "✓ Sincronizado" sempre que o comentário master mudar via realtime.
  const lastCommentSigRef = useRef<string | null>(null);
  useEffect(() => {
    const sig = adminComment
      ? `${adminComment.content}|${adminComment.updated_at}`
      : 'EMPTY';
    if (lastCommentSigRef.current !== null && lastCommentSigRef.current !== sig) {
      setAdminCommentSyncFlash(true);
      const t = setTimeout(() => setAdminCommentSyncFlash(false), 1800);
      return () => clearTimeout(t);
    }
    lastCommentSigRef.current = sig;
  }, [adminComment]);

  const handleTogglePin = useCallback(async () => {
    try {
      const next = !isPinned;
      const nextPinnedAt = next ? new Date().toISOString() : null;
      setPinSyncState('saving');
      const applyPinnedOptimisticUpdate = (queryKey: string[]) => {
        qcPin.setQueriesData({ queryKey }, (old: any) =>
          syncPinnedPostInCache(old, post.id, next, nextPinnedAt)
        );
      };

      applyPinnedOptimisticUpdate(['posts']);
      applyPinnedOptimisticUpdate(['posts-infinite']);
      applyPinnedOptimisticUpdate(['creator-posts']);
      applyPinnedOptimisticUpdate(['profile-posts']);
      applyPinnedOptimisticUpdate(['my-posts']);

      const { error } = await (supabase as any)
        .from("posts")
        .update({ is_pinned: next, pinned_at: nextPinnedAt })
        .eq("id", post.id);
      if (error) throw error;
      setPinSyncState('synced');
      setTimeout(() => setPinSyncState('idle'), 1800);
      toast({
        title: next ? "📌 Postagem fixada" : "Fixação removida",
        description: next
          ? "Esta postagem agora permanece destacada no perfil e sobe para o topo do feed principal."
          : "A postagem voltou ao fluxo normal por data.",
      });
      qcPin.invalidateQueries({ queryKey: ['creator-posts'] });
      qcPin.invalidateQueries({ queryKey: ['profile-posts'] });
      qcPin.invalidateQueries({ queryKey: ['posts'] });
      qcPin.invalidateQueries({ queryKey: ['posts-infinite'] });
      qcPin.invalidateQueries({ queryKey: ['my-posts'] });
    } catch (e: any) {
      setPinSyncState('idle');
      qcPin.invalidateQueries({ queryKey: ['creator-posts'] });
      qcPin.invalidateQueries({ queryKey: ['profile-posts'] });
      qcPin.invalidateQueries({ queryKey: ['posts'] });
      qcPin.invalidateQueries({ queryKey: ['posts-infinite'] });
      qcPin.invalidateQueries({ queryKey: ['my-posts'] });
      toast({ title: "Erro ao fixar", description: e?.message || "Tente novamente.", variant: "destructive" });
    }
  }, [isPinned, post.id, qcPin, toast]);

  // Master Admin: força esta postagem a aparecer SEM blur para todos
  // (independe do "modo de visualização" / botão de blur do criador).
  const currentPreviewBlur = (post as any).preview_blur as string | null | undefined;
  const isMasterNoBlur = currentPreviewBlur === 'none';
  const [masterBlurSyncing, setMasterBlurSyncing] = useState(false);

  const handleToggleMasterNoBlur = useCallback(async () => {
    try {
      setMasterBlurSyncing(true);
      const next = isMasterNoBlur ? 'medium' : 'none';

      const applyOptimistic = (queryKey: string[]) => {
        qcPin.setQueriesData({ queryKey }, (old: any) => {
          if (!old) return old;
          const patch = (p: any) => p && p.id === post.id ? { ...p, preview_blur: next } : p;
          if (Array.isArray(old)) return old.map(patch);
          if (old?.pages) return { ...old, pages: old.pages.map((pg: any) => Array.isArray(pg) ? pg.map(patch) : { ...pg, items: pg?.items?.map(patch) }) };
          return patch(old);
        });
      };
      ['posts', 'posts-infinite', 'creator-posts', 'profile-posts', 'my-posts', 'creator-channel'].forEach((qk) => applyOptimistic([qk]));

      const { error } = await (supabase as any)
        .from('posts')
        .update({ preview_blur: next })
        .eq('id', post.id);
      if (error) throw error;

      toast({
        title: next === 'none' ? '✨ Blur removido (Master)' : 'Blur restaurado',
        description: next === 'none'
          ? 'Esta postagem agora aparece sem blur para todos, ignorando o modo de visualização.'
          : 'A postagem voltou ao blur padrão.',
      });
      ['posts', 'posts-infinite', 'creator-posts', 'profile-posts', 'my-posts', 'creator-channel'].forEach((qk) =>
        qcPin.invalidateQueries({ queryKey: [qk] })
      );
    } catch (e: any) {
      toast({ title: 'Erro ao alterar blur', description: e?.message || 'Tente novamente.', variant: 'destructive' });
    } finally {
      setMasterBlurSyncing(false);
    }
  }, [isMasterNoBlur, post.id, qcPin, toast]);
  const { data: hasMediaAccess = false } = useHasMediaAccess(isPaidPost ? post.id : undefined);
  // Resolve signed URL para mídia paga quando o usuário tem acesso (dono ou comprador).
  const canResolvePaidUrl = isPaidPost && (isPostOwner || hasMediaAccess);
  const { data: signedMedia } = usePaidMediaUrl(post.id, canResolvePaidUrl);
  const resolvedMediaUrl = canResolvePaidUrl && signedMedia?.url ? signedMedia.url : post.media_url;
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);

  const handleDeletePost = useCallback(async () => {
    try {
      await deletePost.mutateAsync({
        id: post.id,
        media_url: post.media_url,
        video_master_url: (post as any).video_master_url,
      });
      toast({ title: "✅ Postagem excluída", description: "A postagem foi removida permanentemente." });
    } catch {
      toast({ title: "Erro ao excluir", description: "Tente novamente.", variant: "destructive" });
    }
    setShowDeleteConfirm(false);
  }, [deletePost, post, toast]);

  const [showReportModal, setShowReportModal] = useState(false);
  const [showExpandedModal, setShowExpandedModal] = useState(false);
  const [showMobileComments, setShowMobileComments] = useState(false);
  const isMobile = useIsMobile();
  const [showVoiceBioExamples, setShowVoiceBioExamples] = useState(false);
  const [showLikersModal, setShowLikersModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showGiftModal, setShowGiftModal] = useState(false);
  const [showMuralModal, setShowMuralModal] = useState(false);
  const [savingToNotepad, setSavingToNotepad] = useState(false);
  const notepad = useUserNotes();

  const handleSendToNotepad = useCallback(async () => {
    const authorObj: any = (post as any).author || {};
    const profileId = authorObj?.id || post.user_id;
    if (!profileId) {
      toast({ title: 'Não foi possível salvar', description: 'Perfil indisponível.', variant: 'destructive' });
      return;
    }
    const handle = authorObj?.username
      ? `@${authorObj.username}`
      : 'Perfil';
    const profileUrl = `${window.location.origin}/creator/${authorObj?.username || profileId}`;
    setSavingToNotepad(true);
    try {
      await notepad.create.mutateAsync({
        title: `Perfil ${handle}`,
        content: profileUrl,
        color_tag: 'primary',
      });
      toast({
        title: 'Perfil salvo no bloco de notas',
        description: 'Acesse o Bloco de Notas para visualizar.',
      });
      window.dispatchEvent(new CustomEvent('oculto:open-notepad'));
    } catch (e: any) {
      toast({
        title: 'Não foi possível salvar',
        description: e?.message || 'Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setSavingToNotepad(false);
    }
  }, [post, notepad.create, toast]);


  // Listen to deep-link focus events from notifications -> open the relevant panel
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { postId?: string; focus?: string } | undefined;
      if (!detail || detail.postId !== post.id) return;
      if (detail.focus === 'likes') {
        setShowLikersModal(true);
      } else if (detail.focus === 'shares') {
        setShowShareModal(true);
      } else if (detail.focus === 'comments' || detail.focus === 'saved') {
        // Comments are inline; expanded modal gives a focused view for both
        if (onOpenExpandedPost) onOpenExpandedPost(post);
        else setShowExpandedModal(true);
      }
    };
    window.addEventListener('post:focus', handler as EventListener);
    return () => window.removeEventListener('post:focus', handler as EventListener);
  }, [post, onOpenExpandedPost]);

  const isVoiceBioPost = (post as any).post_type === 'voice_bio' || (post as any).media_type === 'audio';
  const isPollPost = (post as any).post_type === 'poll';
  const hasBlurEligibleMedia = !isVoiceBioPost && Boolean(resolvedMediaUrl || post.media_url);
  // Posts de bio em áudio e enquetes são SEMPRE visíveis no feed (sem blur/paywall, para todos os usuários).
  const isAlwaysPublic = isVoiceBioPost || isPollPost;
  const isBlocked = post.is_locked && !isSubscribed && !isAlwaysPublic;
  const isPaidBlocked = isPaidPost && !isPostOwner && !hasMediaAccess && !isAlwaysPublic;
  const isVip = post.privacy_level === 'vip';
  const isFriends = post.privacy_level === 'friends';
  const isSeedPost = (post as any).is_seed || (post.author as any)?.is_seed;
  const hasInlineEmbeddableLink = !!extractFirstLink(post.content_text) && hasEmbeddableLink(post.content_text);

  const handleLike = useCallback(async () => {
    if (isBlocked) return;
    if (isPostOwner) {
      toast({
        title: "Ação não permitida",
        description: "Você não pode curtir suas próprias publicações.",
        variant: "destructive",
      });
      return;
    }
    if (!canAct) {
      toast({
        title: "Conta congelada",
        description: "Você não pode curtir posts enquanto sua conta estiver congelada.",
        variant: "destructive",
      });
      return;
    }
    // Free plan: limit 10 likes/day
    if (isFreeLikes && !canLike && !(post.is_liked)) {
      toast({
        title: "Limite de curtidas atingido",
        description: `Você atingiu o limite de 10 curtidas por dia. Assine Premium para curtidas ilimitadas!`,
        variant: "destructive",
      });
      return;
    }
    // Cobra XP apenas no like (insert), nunca no unlike.
    if (!post.is_liked) {
      const ok = await tryChargeXp('post_like', `like:${post.id}:${user?.id ?? 'anon'}`);
      if (!ok) return;
      recordLike();
    }
    likePost.mutate({ postId: post.id, isLiked: post.is_liked || false });
  }, [isBlocked, isPostOwner, canAct, post.id, post.is_liked, likePost, toast, isFreeLikes, canLike, recordLike, tryChargeXp, user?.id]);

  const handleDislike = useCallback(async () => {
    if (isBlocked) return;
    if (!canAct) {
      toast({
        title: "Conta congelada",
        description: "Você não pode reagir enquanto sua conta estiver congelada.",
        variant: "destructive",
      });
      return;
    }
    if (!isDisliked) {
      const ok = await tryChargeXp('post_dislike', `dislike:${post.id}:${user?.id ?? 'anon'}`);
      if (!ok) return;
    }
    dislikePost.mutate({ postId: post.id, isDisliked });
  }, [isBlocked, canAct, post.id, isDisliked, dislikePost, toast, tryChargeXp, user?.id]);

  const handleSave = useCallback(async () => {
    if (isBlocked) return;
    if (!canAct) {
      toast({
        title: "Conta congelada",
        description: "Você não pode salvar posts enquanto sua conta estiver congelada.",
        variant: "destructive",
      });
      return;
    }
    if (!post.is_saved) {
      const ok = await tryChargeXp('post_save', `save:${post.id}:${user?.id ?? 'anon'}`);
      if (!ok) return;
    }
    savePost.mutate({ postId: post.id, isSaved: post.is_saved || false });
  }, [isBlocked, canAct, post.id, post.is_saved, savePost, toast]);

  const handleSubscribeToCreator = useCallback(() => {
    if (!post.user_id) return;
    subscribe.mutate(
      { creatorId: post.user_id, price: 25.90 },
      {
        onSuccess: () => {
          toast({
            title: "🎉 Assinatura VIP ativada!",
            description: `Agora você tem acesso ao conteúdo exclusivo`,
          });
        },
      }
    );
  }, [post.user_id, subscribe, toast]);

  const handleMediaClick = useCallback(() => {
    if (isBlocked || hasInlineEmbeddableLink) return;
    if (onOpenExpandedPost) onOpenExpandedPost(post);
    else setShowExpandedModal(true);
  }, [hasInlineEmbeddableLink, isBlocked, onOpenExpandedPost, post]);

  const formatNumber = (num: number | null | undefined): string => {
    const n = Number(num ?? 0);
    if (!Number.isFinite(n)) return '0';
    if (n >= 1000) {
      return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
    }
    return n.toString();
  };

  const getVisibilityBadge = () => {
    if (post.privacy_level === 'public') {
      return <PostTag icon={Globe} tone="neutral">Público</PostTag>;
    }
    if (post.privacy_level === 'friends') {
      return <PostTag icon={Users} tone="secondary">Amigos</PostTag>;
    }
    if (post.privacy_level === 'vip') {
      return <PostTag icon={Flame} tone="vip">VIP</PostTag>;
    }
    return null;
  };

  const getAdultStatusBadge = () => {
    if (isPoll) return null;
    return postIsAdult ? (
      <PostTag icon={EyeOff} tone="danger">+18</PostTag>
    ) : (
      <PostTag icon={Shield} tone="primary">Seguro</PostTag>
    );
  };


  const author = post.author;
  const createdAt = new Date(post.created_at);
  const dateLabel = createdAt.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' });
  const relativeTime = useMemo(() => formatDistanceToNow(createdAt, { addSuffix: true, locale: ptBR }), [post.created_at]);

  const dislikesCount = (post as any).dislikes_count || 0;
  const savesCount = (post as any).saves_count || 0;
  const sharesCount = (post as any).shares_count || 0;
  const postShareUrl = useMemo(() => {
    const slug = (post as any).share_slug || post.id;
    return post.is_paid ? buildShareUrl(`/c/${slug}`) : null;
  }, [post.id, post.is_paid, (post as any).share_slug]);

  const playShareUrl = useMemo(() => ocultoPlayShareUrl(post.id), [post.id]);

  // If bot post has broken media, hide entirely (visual integrity rule)
  if (isSeedPost && mediaError && post.media_url) {
    return null;
  }

  // Restrição por status do autor (banido/congelado): mostrar placeholder
  const restrictedReason = (post as any).restricted_reason as null | 'banido' | 'congelado';
  if (restrictedReason) {
    const label = restrictedReason === 'banido'
      ? 'Conteúdo indisponível — usuário banido'
      : 'Conteúdo indisponível — usuário com conta congelada';
    return (
      <article
        id={`post-${post.id}`}
        data-post-id={post.id}
        className="rounded-xl border border-border bg-muted/30 p-5 text-center text-sm text-muted-foreground animate-fade-in"
      >
        <div className="flex flex-col items-center gap-1">
          <span className="text-base font-medium text-foreground">Acesso restrito</span>
          <span>{label}</span>
        </div>
      </article>
    );
  }

  return (
    <>
      <article id={`post-${post.id}`} data-post-id={post.id} className="gradient-border rounded-xl overflow-hidden animate-fade-in">
        <div className="p-4 bg-card">
          {/* Header — alinhado à esquerda; tempo + menu 3 pontos sempre visíveis no canto direito */}
          <div className="flex items-start gap-3 mb-4">
            <Link
              to={`/creator/${(author as any)?.id || post.user_id}`}
              onMouseEnter={prefetchAuthorProfile}
              onTouchStart={prefetchAuthorProfile}
              className="shrink-0 relative"
            >
              <VipAvatarBorder isVip={(author as any)?.plan_type === 'vip'} size="md">
                <VerifiedCoupleAvatar
                  src={buildSupabaseImageThumb(author?.avatar_url || '', { width: 128, quality: 75, resize: 'contain' }) || author?.avatar_url || ''}
                  alt={author?.name || 'Usuário'}
                  size="md"
                  isVerifiedCouple={(author as any)?.is_verified_couple}
                  isOnline={(author as any)?.is_online}
                />
              </VipAvatarBorder>
              {(author?.is_verified || (author as any)?.is_verified_couple) && (
                <span
                  className="absolute -top-1 -right-1 inline-flex items-center justify-center rounded-full bg-card ring-2 ring-card shadow-sm"
                  title="Perfil verificado"
                >
                  <BadgeCheck className="h-4 w-4 text-[hsl(210,90%,55%)] fill-[hsl(210,90%,55%)]/20" />
                </span>
              )}
            </Link>
            <div className="flex-1 min-w-0">
              {/* Linha 1: username (sempre visível, nunca truncado) + menu 3 pontos (direita) */}
              <div className="flex items-start gap-2 min-w-0">
                <Link
                  to={`/creator/${(author as any)?.id || post.user_id}`}
                  className="hover:underline min-w-0 flex-1"
                  onMouseEnter={prefetchAuthorProfile}
                  onTouchStart={prefetchAuthorProfile}
                >
                  <span className="block font-semibold text-foreground text-[14px] leading-tight break-all">
                    {getPublicHandle(author as any)}
                  </span>
                </Link>
                <div className="flex items-center shrink-0">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" aria-label="Mais opções">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="end"
                      side="bottom"
                      sideOffset={6}
                      collisionPadding={12}
                      avoidCollisions
                      className="w-[min(260px,calc(100vw-24px))] max-h-[70vh] overflow-y-auto"
                    >
                      {isPostOwner && isPoll && (
                        <DropdownMenuItem
                          onClick={() => { setReopenPollMode(false); setShowEditPoll(true); }}
                          className="gap-2"
                        >
                          <Pencil className="h-4 w-4" />
                          Editar Enquete
                        </DropdownMenuItem>
                      )}
                      {isPostOwner && isPoll && isPollClosed && (
                        <DropdownMenuItem
                          onClick={() => { setReopenPollMode(true); setShowEditPoll(true); }}
                          className="gap-2 text-primary focus:text-primary"
                        >
                          <RotateCw className="h-4 w-4" />
                          Reabrir Enquete
                        </DropdownMenuItem>
                      )}
                      {isPostOwner && isPoll && (
                        <DropdownMenuItem
                          onClick={() => setShowDeletePollConfirm(true)}
                          className="gap-2 text-destructive focus:text-destructive"
                        >
                          <BarChart3 className="h-4 w-4" />
                          Excluir Enquete
                        </DropdownMenuItem>
                      )}
                      {canPinPost && (
                        <DropdownMenuItem
                          onClick={handleTogglePin}
                          disabled={pinSyncState === 'saving'}
                          className="gap-2 text-amber-300 focus:text-amber-200"
                        >
                          {isPinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
                          <span className="flex-1">
                            {isPinned ? "Desafixar do topo do feed" : "Fixar no topo do feed"}
                          </span>
                          {pinSyncState === 'saving' && (
                            <span className="text-[10px] text-amber-300/80 animate-pulse">salvando…</span>
                          )}
                          {pinSyncState === 'synced' && (
                            <span className="text-[10px] text-emerald-400">✓ sincronizado</span>
                          )}
                        </DropdownMenuItem>
                      )}
                      {isMasterAdmin && (
                        <DropdownMenuItem
                          onClick={() => setShowAdminCommentModal(true)}
                          className="gap-2 text-amber-400 focus:text-amber-300"
                        >
                          <Megaphone className="h-4 w-4" />
                          <span className="flex-1">
                            {adminComment ? "Editar comentário Master" : "Adicionar comentário Master"}
                          </span>
                          {adminCommentSyncFlash && (
                            <span className="text-[10px] text-emerald-400">✓ sincronizado</span>
                          )}
                        </DropdownMenuItem>
                      )}
                      {isMasterAdmin && (
                        <DropdownMenuItem
                          onClick={handleToggleMasterNoBlur}
                          disabled={masterBlurSyncing}
                          className="gap-2 text-emerald-400 focus:text-emerald-300"
                        >
                          <Eye className="h-4 w-4" />
                          <span className="flex-1">
                            {isMasterNoBlur ? 'Restaurar blur padrão' : 'Remover blur (todos)'}
                          </span>
                          {isMasterNoBlur && (
                            <span className="text-[10px] text-emerald-400">● sem blur</span>
                          )}
                        </DropdownMenuItem>
                      )}
                      {isPostOwner && !isPoll && (
                        <DropdownMenuItem
                          onClick={() => setShowEditPost(true)}
                          className="gap-2"
                        >
                          <Pencil className="h-4 w-4" />
                          Editar Postagem
                        </DropdownMenuItem>
                      )}
                      {isPostOwner && !isPoll && (
                        <DropdownMenuSub>
                          <DropdownMenuSubTrigger className="gap-2">
                            <Shield className="h-4 w-4" />
                            Privacidade
                          </DropdownMenuSubTrigger>
                          <DropdownMenuSubContent className="min-w-[200px]">
                            <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">
                              Mover para
                            </DropdownMenuLabel>
                            <DropdownMenuItem
                              onClick={() => handleChangePrivacy('public')}
                              className={cn("gap-2", currentPrivacy === 'public' && "bg-primary/10 text-primary")}
                            >
                              <Globe className="h-4 w-4 text-primary" />
                              Público {currentPrivacy === 'public' && '•'}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleChangePrivacy('friends')}
                              className={cn("gap-2", currentPrivacy === 'friends' && "bg-primary/10 text-primary")}
                            >
                              <Users className="h-4 w-4 text-blue-400" />
                              Amigos (Seguindo) {currentPrivacy === 'friends' && '•'}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleChangePrivacy('vip')}
                              className={cn("gap-2", currentPrivacy === 'vip' && "bg-primary/10 text-primary")}
                            >
                              <Crown className="h-4 w-4 text-[hsl(45,93%,47%)]" />
                              Conteúdo VIP {currentPrivacy === 'vip' && '•'}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => handleChangePrivacy('hidden')}
                              className={cn("gap-2", currentPrivacy === 'hidden' && "bg-destructive/10 text-destructive")}
                            >
                              <EyeOff className="h-4 w-4" />
                              Invisível a todos {currentPrivacy === 'hidden' && '•'}
                            </DropdownMenuItem>
                          </DropdownMenuSubContent>
                        </DropdownMenuSub>
                      )}
                      {isPostOwner && !isPoll && (
                        <DropdownMenuItem 
                          onClick={() => setShowDeleteConfirm(true)}
                          className="gap-2 text-destructive focus:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                          Excluir Postagem
                        </DropdownMenuItem>
                      )}
                      {!isPostOwner && isMasterAdmin && (
                        <DropdownMenuItem
                          onClick={() => setShowDeleteConfirm(true)}
                          className="gap-2 text-destructive focus:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                          Excluir postagem de Usuário
                        </DropdownMenuItem>
                      )}
                      {!isPostOwner && (
                        <DropdownMenuItem
                          onClick={() => {
                            const profileId = (author as any)?.id || post.user_id;
                            if (!profileId) return;
                            navigate(`/creator/${profileId}`);
                          }}
                          className="gap-2"
                        >
                          <UserIcon className="h-4 w-4" />
                          Ver perfil
                        </DropdownMenuItem>
                      )}
                      {!isPostOwner && (
                        <DropdownMenuItem
                          onClick={() => setShowMuralModal(true)}
                          className="gap-2"
                        >
                          <PenSquare className="h-4 w-4" />
                          Escrever no mural
                        </DropdownMenuItem>
                      )}
                      {!isPostOwner && (
                        <DropdownMenuItem
                          onClick={() => setShowGiftModal(true)}
                          className="gap-2 text-amber-500 focus:text-amber-400"
                        >
                          <Gift className="h-4 w-4" />
                          Enviar presente
                        </DropdownMenuItem>
                      )}
                      {!isPostOwner && (
                        <DropdownMenuItem 
                          onClick={() => {
                            const profileId = (author as any)?.id || post.user_id;
                            if (!profileId) return;
                            navigate(`/messages?to=${profileId}`);
                          }}
                          className="gap-2"
                        >
                          <MessageCircle className="h-4 w-4" />
                          Enviar mensagem
                        </DropdownMenuItem>
                      )}
                      {!isPostOwner && (
                        <DropdownMenuItem
                          onClick={handleSendToNotepad}
                          disabled={savingToNotepad}
                          className="gap-2"
                        >
                          {savingToNotepad ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <StickyNote className="h-4 w-4" />
                          )}
                          Enviar para Bloco de Notas
                        </DropdownMenuItem>
                      )}
                      {!isPostOwner && (
                        <DropdownMenuItem 
                          onClick={() => setShowReportModal(true)}
                          className="gap-2 text-destructive focus:text-destructive"
                        >
                          <Flag className="h-4 w-4" />
                          Denunciar
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(playShareUrl);
                            toast({ title: "✅ Link copiado!" });
                          } catch {
                            toast({ title: "Link gerado", description: playShareUrl });
                          }
                        }}
                        className="gap-2"
                      >
                        <LinkIcon className="h-4 w-4" />
                        Copiar link
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
              <Link to={`/creator/${(author as any)?.id || post.user_id}`} className="hover:underline block mt-1.5">
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground flex-wrap leading-none">
                  <span
                    className="text-[11px] text-muted-foreground leading-none whitespace-nowrap shrink-0"
                    title={dateLabel}
                  >
                    {relativeTime}
                  </span>
                  {isPinned && (
                    <PostTag
                      icon={Pin}
                      tone="warning"
                      title="Postagem fixada no topo do perfil"
                      className="!text-amber-300"
                    >
                      Fixada
                    </PostTag>
                  )}
                  <UserStatusBadge
                    planType={(author as any)?.plan_type}
                    isOcultoVerified={(author as any)?.is_oculto_verified === true}
                    size="sm"
                  />
                  {((author as any)?.id || post.user_id) && (
                    <PrestigeBadge userId={(author as any)?.id || post.user_id} interactive size="xs" showName={false} />
                  )}
                  {(() => {
                    const a: any = author || {};
                    const tipo = getGenderLabel(a.gender, a.profile_type);
                    return tipo ? <PostTag tone="primary">{tipo}</PostTag> : null;
                  })()}
                  {(() => {
                    const a: any = author || {};
                    const cityUF = !a.hide_location
                      ? formatCidadeUF(a.address_city, a.address_state)
                      : null;
                    return cityUF ? (
                      <PostTag icon={MapPin} tone="neutral" maxWidth={160}>
                        {cityUF}
                      </PostTag>
                    ) : null;
                  })()}
                  {getPlanLabel((author as any)?.plan_type) && (
                    <PostTag tone="neutral" className="capitalize">
                      {getPlanLabel((author as any)?.plan_type)}
                    </PostTag>
                  )}
                  {getVisibilityBadge()}
                  {getAdultStatusBadge()}
                  <InlineFollowChip targetProfileId={(author as any)?.id} isOwner={isPostOwner} />
                </div>
              </Link>
            </div>
          </div>

          {/* Content */}
          <div className={cn("relative", isBlocked && "select-none")}>
            <div>
            {/* Comentário Master — banner fixo no topo da postagem (@ocultomaster). */}
            {adminComment?.content && (
              <div
                className="relative mb-3 rounded-lg border border-amber-400/40 px-3 py-2 leading-snug whitespace-pre-wrap shadow-sm"
                style={{
                  backgroundColor: adminComment.bg_color,
                  color: adminComment.text_color,
                  fontSize: `${adminComment.font_size}px`,
                  fontFamily: adminComment.font_family,
                  fontWeight: adminComment.bold ? 700 : undefined,
                }}
              >
                <div className="mb-1 flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wider opacity-80">
                  <Megaphone className="h-3 w-3" />
                  Comentário Master
                </div>
                {adminComment.content}
                {isMasterAdmin && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setShowAdminCommentModal(true); }}
                    className="absolute top-1.5 right-1.5 rounded-full bg-black/40 p-1 text-amber-200 hover:bg-black/60 hover:text-amber-100 transition"
                    title="Editar comentário Master"
                    aria-label="Editar comentário Master"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            )}
            {/* Poll content */}
            {(post as any).post_type === 'poll' && (
              <div className="mb-4">
                <PollCard postId={post.id} />
              </div>
            )}

            {/* Text content */}
            {post.content_text && (post as any).post_type !== 'poll' && (() => {
              const sm = (post as any).style_meta as
                | { font_family?: string; font_size?: number; bold?: boolean; bg_color?: string; text_color?: string }
                | null
                | undefined;
              const fontMap: Record<string, string> = {
                serif: 'Georgia, "Times New Roman", serif',
                mono: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                rounded: '"Comic Sans MS", "Quicksand", system-ui, sans-serif',
                display: '"Bebas Neue", Impact, sans-serif',
              };
              const hasStyle = !!sm && !post.media_url;
              const hasBg = hasStyle && sm?.bg_color && sm.bg_color !== 'transparent';
              const style: React.CSSProperties = hasStyle ? {
                fontFamily: sm?.font_family && sm.font_family !== 'default' ? fontMap[sm.font_family] : undefined,
                fontSize: sm?.font_size ? `${sm.font_size}px` : undefined,
                fontWeight: sm?.bold ? 700 : undefined,
                backgroundColor: hasBg ? sm?.bg_color : undefined,
                color: sm?.text_color && sm.text_color !== 'auto' ? sm.text_color : undefined,
              } : {};
              return (
                <div className="relative mb-4">
                    <p
                    className={cn(
                      "text-foreground leading-relaxed whitespace-pre-wrap transition-[filter] duration-200",
                      hasBg && "rounded-lg px-4 py-3",
                      isBlocked && "blur-paywall",
                      "transition-[filter,opacity] duration-300 ease-out",
                      !isOcultoPlayShare && adultTextCovered && "blur-md select-none pointer-events-none opacity-90"
                    )}
                    style={style}
                  >
                    <LinkifiedText text={post.content_text} />

                  </p>
                  {!isOcultoPlayShare && adultTextCovered && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); revealAdultPost(); }}
                      className="absolute inset-0 flex items-center justify-center rounded-lg bg-background/40 backdrop-blur-[2px] text-[11px] font-bold uppercase tracking-wider text-rose-300 hover:text-rose-200 animate-fade-in transition-opacity duration-300"
                      aria-label="Mostrar texto +18"
                      title="Toque para revelar este post +18"
                    >
                      <span className="rounded-full bg-card/95 px-3 py-1 border border-rose-400/40 shadow hover-scale">
                        +18 · toque para mostrar
                      </span>
                    </button>
                  )}
                </div>
              );
            })()}

            {/* Link embedável (YouTube/Vimeo/TikTok/Spotify/SoundCloud/Twitch/Dailymotion/Twitter)
                → player inline (Twitter usa <video> nativo via syndication API).
                IMPORTANTE: quando o link é embedável, ignoramos `post.media_url`
                (que normalmente é apenas a og:image auto-extraída do mesmo link)
                e priorizamos o player inline — caso contrário o usuário caía no
                MediaGalleryModal e era jogado pro X externamente. */}
            {!isPaidBlocked && hasInlineEmbeddableLink && !(post as any).oculto_play_item_id && (
              <div className="mb-4">
                <InlineLinkMedia text={post.content_text || ''} />
              </div>
            )}

            {/* Fallback: preview rico OpenGraph para outros links (sem mídia própria). */}
            {!post.media_url && !isPaidBlocked && !!extractFirstLink(post.content_text) && !hasInlineEmbeddableLink && (
              <div className="mb-4">
                <LinkPreviewCard text={post.content_text || ''} />
              </div>
            )}



            {/* Embed de OCULTO PLAY (compartilhamento no feed) */}
            {(post as any).oculto_play_item_id && (
              <div className="mb-4">
                <OcultoPlayPostEmbed
                  itemId={(post as any).oculto_play_item_id as string}
                  fallbackCover={(post as any).thumbnail_url ?? null}
                />
              </div>
            )}

            {/* Media content - Clickable (não renderiza se o link já está sendo
                embedado inline acima — evita duplicar og:image + abrir externo). */}
            {(post.media_url || isPaidBlocked) && !(post as any).oculto_play_item_id && !hasInlineEmbeddableLink && (

              <FeedMediaErrorBoundary post={post} silent={isSeedPost}>

                <PaidMediaOverlay
                  postId={post.id}
                  price={post.paid_price || 0}
                  sellerName={post.author?.name || undefined}
                  creatorProfileId={(post.author as any)?.id || post.user_id}
                  creatorUsername={(post.author as any)?.username || undefined}
                  hasAccess={hasMediaAccess || !isPaidPost}
                  isOwner={isPostOwner}
                  previewBlur={(post as any).preview_blur as 'light' | 'medium' | 'strong' | 'none' | null}
                >
                  <AdultMediaBlurOverlay
                    postId={post.id}
                    active={
                      shouldBlurAdult &&
                      !isPoll &&
                      !isBlocked &&
                      hasBlurEligibleMedia
                    }
                  >
                  <div
                    className={cn(
                      "relative rounded-lg overflow-hidden mb-4 cursor-pointer group",
                      isBlocked && !isPaidPost && "blur-paywall cursor-default",
                      isPaidBlocked && !post.media_url && "min-h-[280px] bg-muted/30"
                    )}
                    onClick={handleMediaClick}
                  >
                    {mediaError && !isSeedPost ? (
                      <div className="flex flex-col items-center justify-center gap-2 min-h-[200px] bg-muted/20 text-muted-foreground text-sm p-4">
                        <span className="text-2xl" aria-hidden>📷</span>
                        <span>Não foi possível carregar esta mídia.</span>
                      </div>
                    ) : ((post as any).post_type === 'voice_bio' || (post as any).media_type === 'audio') ? (
                      <div
                        className="rounded-xl border border-primary/30 bg-gradient-to-br from-primary/10 to-secondary/10 p-3 space-y-3"
                        onClick={(e) => e.stopPropagation()}
                        onContextMenu={(e) => e.preventDefault()}
                      >
                        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-primary">
                          <Play className="h-3 w-3" /> Bio em áudio
                          {(post as any).media_duration_seconds ? (
                            <span className="text-muted-foreground font-normal">· {(post as any).media_duration_seconds}s</span>
                          ) : null}
                        </div>
                        <audio
                          src={resolvedMediaUrl || post.media_url || undefined}
                          controls
                          controlsList="nodownload noplaybackrate"
                          preload="metadata"
                          className="w-full"
                          onContextMenu={(e) => e.preventDefault()}
                        />
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="w-full gap-1"
                            onClick={(e) => {
                              e.stopPropagation();
                              const uname = (post.author as any)?.username;
                              navigate(uname ? `/u/${uname}` : `/creator/${post.user_id}`);
                            }}
                          >
                            <Users className="h-3.5 w-3.5" /> Ver perfil
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="w-full gap-1 border-primary/40 text-primary hover:bg-primary/10"
                            onClick={(e) => { e.stopPropagation(); setShowVoiceBioExamples(true); }}
                          >
                            <Headphones className="h-3.5 w-3.5" /> Ver exemplos
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            className="w-full gap-1 bg-gradient-to-r from-primary to-secondary text-primary-foreground"
                            onClick={(e) => { e.stopPropagation(); navigate('/profile#voice-bio'); }}
                          >
                            <Play className="h-3.5 w-3.5" /> Gravar minha bio
                          </Button>
                        </div>
                        <VoiceBioExamplesDialog
                          open={showVoiceBioExamples}
                          onOpenChange={setShowVoiceBioExamples}
                        />
                      </div>
                    ) : isVideoUrl(resolvedMediaUrl || post.media_url) ? (
                      /* Apenas capa do vídeo no feed — playback ocorre só no modal */
                      <div
                        className="relative w-full bg-black rounded-lg overflow-hidden group"
                        onContextMenu={(e) => e.preventDefault()}
                      >
                        <VideoThumb
                          thumbnailUrl={(post as any).thumbnail_url}
                          mediaUrl={resolvedMediaUrl || post.media_url}
                          orientation="landscape"
                        />
                      </div>
                    ) : isGifUrl(resolvedMediaUrl || post.media_url) ? (
                      <img
                        key={`gif-${post.id}-${resolvedMediaUrl || post.media_url}`}
                        src={resolvedMediaUrl || post.media_url}
                        alt="Post content"
                        className="block w-full max-h-[600px] object-contain transition-transform group-hover:scale-[1.02] pointer-events-none select-none bg-black/20"
                        loading="lazy"
                        decoding="async"
                        draggable={false}
                        onClick={handleMediaClick}
                        onError={(e) => { logMediaError('gif', post, (e.target as HTMLImageElement)?.src); setMediaError(true); }}
                        data-media-type="image/gif"
                      />
                    ) : (() => {
                      // Carrossel quando o post tem múltiplas imagens
                      const extras = Array.isArray((post as any).media_urls) ? ((post as any).media_urls as string[]).filter(Boolean) : [];
                      const allUrls = Array.from(new Set([
                        ...(resolvedMediaUrl ? [resolvedMediaUrl] : []),
                        ...extras,
                      ]));
                      if (allUrls.length > 1) {
                        return (
                          <PostImageCarousel
                            urls={allUrls}
                            altPrefix="Foto do post"
                            onImageClick={() => handleMediaClick()}
                          />
                        );
                      }
                      return (
                        <SmartImage
                          src={resolvedMediaUrl || post.media_url}
                          alt="Post content"
                          aspectRatio="auto"
                          className="transition-transform group-hover:scale-[1.02] pointer-events-none select-none"
                          containerClassName="w-full relative max-h-[600px]"
                          onClick={handleMediaClick}
                          onError={() => { logMediaError('image', post); setMediaError(true); }}
                        />
                      );
                    })()}
                  </div>
                  </AdultMediaBlurOverlay>
                </PaidMediaOverlay>
              </FeedMediaErrorBoundary>
            )}

            {/* Paywall overlay */}
            {isBlocked && !isPaidPost && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-t from-background via-background/95 to-background/80 rounded-lg">
                <div className="text-center p-6">
                  {isVip ? (
                    <>
                      <div className="w-16 h-16 rounded-full bg-[hsl(45,93%,47%)]/10 flex items-center justify-center mx-auto mb-4 animate-pulse">
                        <Flame className="h-8 w-8 text-[hsl(45,93%,47%)]" />
                      </div>
                      <p className="text-lg font-medium text-foreground mb-2">
                        Conteúdo VIP Exclusivo
                      </p>
                      <p className="text-muted-foreground mb-6">
                        Assine para desbloquear
                      </p>
                      <Button
                        onClick={handleSubscribeToCreator}
                        disabled={subscribe.isPending}
                        className="bg-gradient-to-r from-[hsl(45,93%,47%)] to-[hsl(35,93%,47%)] text-[hsl(45,93%,10%)] font-semibold px-8 hover:opacity-90"
                      >
                        <Flame className="h-4 w-4 mr-2" />
                        Assinar VIP - R$ 25,90/mês
                      </Button>
                    </>
                  ) : isFriends ? (
                    <>
                      <div className="w-16 h-16 rounded-full bg-secondary/10 flex items-center justify-center mx-auto mb-4">
                        <Users className="h-8 w-8 text-secondary" />
                      </div>
                      <p className="text-lg font-medium text-foreground mb-2">
                        Conteúdo para Amigos
                      </p>
                      <p className="text-muted-foreground mb-6">
                        Siga e espere ser seguido de volta
                      </p>
                      <FollowButtonInline targetProfileId={post.author?.id} />
                    </>
                  ) : (
                    <>
                      <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                        <Lock className="h-8 w-8 text-primary" />
                      </div>
                      <p className="text-lg font-medium text-foreground mb-2">
                        Conteúdo Bloqueado
                      </p>
                      <p className="text-muted-foreground mb-2">
                        Assine para ter acesso completo ao feed exclusivo, mensagens ilimitadas e curtidas sem limite.
                      </p>
                      {isFreeLikes && Number.isFinite(likesRemaining) && (
                        <p className="text-xs text-[hsl(45,93%,47%)] font-medium mb-4">
                          Você tem {likesRemaining} {likesRemaining === 1 ? 'curtida restante' : 'curtidas restantes'} hoje no plano Free
                        </p>
                      )}
                      <Button
                        onClick={() => {
                          onSubscribe?.();
                          const params = new URLSearchParams({ subscribe: '1' });
                          if (author?.id) params.set('creatorId', String(author.id));
                          if (author?.username) params.set('creatorName', `@${String(author.username)}`);
                          navigate(`/subscriptions?${params.toString()}`);
                        }}
                        className="glow-primary bg-gradient-to-r from-primary to-secondary hover:opacity-90 text-primary-foreground font-semibold px-8"
                      >
                        Assinar Agora
                      </Button>
                    </>
                  )}
                </div>
              </div>
            )}
            </div>
          </div>

          {/* Likes Count - Clickable */}
          {post.likes_count > 0 && (
            <button
              onClick={async () => {
                // "Ver quem curtiu" — cobra XP 1x/dia/post
                if (!isPostOwner) {
                  const ok = await tryChargeXp(
                    'view_likers',
                    `view_likers:${post.id}:${user?.id ?? 'anon'}:${Date.now()}`,
                  );
                  if (!ok) return;
                }
                setShowLikersModal(true);
              }}
              className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors mb-2"
            >
              {post.likes_count} {post.likes_count === 1 ? 'curtida' : 'curtidas'}
            </button>
          )}

          {/* Actions — cores destacadas por tipo */}
          <div className="flex flex-nowrap items-center gap-0.5 sm:gap-1 pt-2 border-t border-border/50 overflow-x-auto scrollbar-none -mx-1 px-1">
            <IconButtonTip label={post.is_liked ? `Descurtir (${post.likes_count})` : `Curtir (${post.likes_count})`}>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleLike}
                disabled={isBlocked || isPostOwner || likePost.isPending}
                className={cn(
                  "flex-1 min-w-0 gap-1 px-1 sm:gap-2 sm:px-3 active:scale-110 transition-transform [transition-duration:30ms]",
                  isPostOwner && "opacity-60 cursor-not-allowed",
                  post.is_liked
                    ? "text-[hsl(0,84%,55%)] hover:text-[hsl(0,84%,50%)]"
                    : "text-[hsl(0,84%,55%)]/70 hover:text-[hsl(0,84%,55%)] hover:bg-[hsl(0,84%,55%)]/10"
                )}
              >
                <Heart className={cn("h-5 w-5 transition-none", post.is_liked && "fill-current", likePost.isPending && "animate-pulse")} />
                <span>{formatNumber(post.likes_count)}</span>
              </Button>
            </IconButtonTip>
            <IconButtonTip label={isDisliked ? `Remover descurtida (${dislikesCount})` : `Descurtir (${dislikesCount})`}>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDislike}
                disabled={isBlocked || dislikePost.isPending}
                className={cn(
                  "flex-1 min-w-0 gap-1 px-1 sm:gap-2 sm:px-3",
                  isDisliked
                    ? "text-[hsl(220,15%,55%)] hover:text-[hsl(220,15%,45%)]"
                    : "text-[hsl(220,15%,55%)]/70 hover:text-[hsl(220,15%,55%)] hover:bg-[hsl(220,15%,55%)]/10"
                )}
              >
                <ThumbsDown className={cn("h-5 w-5", isDisliked && "fill-current", dislikePost.isPending && "animate-pulse")} />
                <span>{formatNumber(dislikesCount)}</span>
              </Button>
            </IconButtonTip>
            <IconButtonTip label={`Comentar (${post.comments_count})`}>
              <Button
                variant="ghost"
                size="sm"
                onClick={async () => {
                  if (!isPostOwner) {
                    const ok = await tryChargeXp(
                      'view_comments',
                      `view_comments:${post.id}:${user?.id ?? 'anon'}:${Date.now()}`,
                    );
                    if (!ok) return;
                  }
                  if (isMobile) setShowMobileComments(true);
                  else if (onOpenExpandedPost) onOpenExpandedPost(post);
                  else setShowExpandedModal(true);
                }}
                disabled={isBlocked}
                className="flex-1 min-w-0 gap-1 px-1 sm:gap-2 sm:px-3 text-[hsl(210,90%,55%)]/80 hover:text-[hsl(210,90%,55%)] hover:bg-[hsl(210,90%,55%)]/10"
              >
                <MessageCircle className="h-5 w-5" />
                <span>{formatNumber(post.comments_count)}</span>
              </Button>
            </IconButtonTip>
            <IconButtonTip label={post.is_saved ? `Remover dos salvos (${savesCount})` : `Salvar (${savesCount})`}>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSave}
                disabled={isBlocked || savePost.isPending}
                className={cn(
                  "flex-1 min-w-0 gap-1 px-1 sm:gap-2 sm:px-3",
                  post.is_saved
                    ? "text-[hsl(45,95%,55%)] hover:text-[hsl(45,95%,50%)]"
                    : "text-[hsl(45,95%,55%)]/70 hover:text-[hsl(45,95%,55%)] hover:bg-[hsl(45,95%,55%)]/10"
                )}
              >
                <Bookmark className={cn("h-5 w-5", post.is_saved && "fill-current", savePost.isPending && "animate-pulse")} />
                <span>{formatNumber(savesCount)}</span>
              </Button>
            </IconButtonTip>
            <IconButtonTip label={`Compartilhar (${sharesCount})`}>
              {isOcultoPlayShare ? (
                <PlayShareMenu
                  itemId={(post as any).oculto_play_item_id}
                  title={(post as any).content_text || null}
                  onShared={async () => {
                    if (!isPostOwner) {
                      const hourBucket = Math.floor(Date.now() / 3_600_000);
                      await tryChargeXp(
                        'post_share',
                        `share:${post.id}:${user?.id ?? 'anon'}:${hourBucket}`,
                      );
                    }
                  }}
                  trigger={
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={isBlocked}
                      className="flex-1 min-w-0 gap-1 px-1 sm:gap-2 sm:px-3 text-[hsl(150,70%,45%)]/80 hover:text-[hsl(150,70%,45%)] hover:bg-[hsl(150,70%,45%)]/10"
                    >
                      <Share2 className="h-5 w-5" />
                      <span>{formatNumber(sharesCount)}</span>
                    </Button>
                  }
                />
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={async () => {
                    if (!isPostOwner) {
                      const hourBucket = Math.floor(Date.now() / 3_600_000);
                      const ok = await tryChargeXp(
                        'post_share',
                        `share:${post.id}:${user?.id ?? 'anon'}:${hourBucket}`,
                      );
                      if (!ok) return;
                    }
                    setShowShareModal(true);
                  }}
                  disabled={isBlocked}
                  className="flex-1 min-w-0 gap-1 px-1 sm:gap-2 sm:px-3 text-[hsl(150,70%,45%)]/80 hover:text-[hsl(150,70%,45%)] hover:bg-[hsl(150,70%,45%)]/10"
                >
                  <Share2 className="h-5 w-5" />
                  <span>{formatNumber(sharesCount)}</span>
                </Button>
              )}
            </IconButtonTip>
            <IconButtonTip
              label={
                isPostOwner
                  ? "Presentes XP recebidos nesta publicação"
                  : "Enviar presente XP ao criador"
              }
            >
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (isPostOwner) return;
                  setShowGiftModal(true);
                }}
                disabled={isBlocked || isPostOwner}
                className={cn(
                  "flex-1 min-w-0 gap-1 px-1 sm:gap-2 sm:px-3 text-amber-500/80 hover:text-amber-500 hover:bg-amber-500/10",
                  isPostOwner && "opacity-70 cursor-not-allowed"
                )}
              >
                <Gift className="h-5 w-5" />
                <PostGiftCounter postId={post.id} />
              </Button>
            </IconButtonTip>

          </div>


          {/* Comments Section */}
          {postShareUrl && isPostOwner && (
            <div className="mb-4 rounded-lg border border-border/50 bg-muted/20 px-3 py-2">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                <LinkIcon className="h-3.5 w-3.5" />
                <span>Link de compartilhamento</span>
              </div>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(postShareUrl);
                    toast({ title: "✅ Link copiado!" });
                  } catch {
                    toast({ title: "Link gerado", description: postShareUrl });
                  }
                }}
                className="block w-full text-left text-xs text-primary break-all hover:underline"
              >
                {postShareUrl}
              </button>
            </div>
          )}

          {!isMobile && (
            <PostCommentsSection
              postId={post.id}
              commentsCount={post.comments_count || 0}
              isBlocked={isBlocked}
              onBeforeExpand={
                isPostOwner
                  ? undefined
                  : () =>
                      tryChargeXp(
                        'view_comments',
                        `view_comments:${post.id}:${user?.id ?? 'anon'}:${Date.now()}`,
                      )
              }
              onBeforeSubmit={
                isPostOwner
                  ? undefined
                  : () =>
                      tryChargeXp(
                        'post_comment',
                        `comment:${post.id}:${user?.id ?? 'anon'}:${Date.now()}`,
                      )
              }
            />
          )}
        </div>
      </article>

      {/* Modal: escrever no mural do autor */}
      <WriteOnMuralModal
        open={showMuralModal}
        onOpenChange={setShowMuralModal}
        profileOwnerId={(author as any)?.id || post.user_id}
        ownerHandle={author?.username || null}
      />

      {/* Modal: Comentário Master (apenas @ocultomaster) */}
      {isMasterAdmin && user?.id && (
        <AdminPostCommentModal
          open={showAdminCommentModal}
          onOpenChange={setShowAdminCommentModal}
          postId={post.id}
          authorId={user.id}
          existing={adminComment ?? null}
        />
      )}


      {/* Modal de Denúncia */}
      <ContentReportModal
        open={showReportModal}
        onOpenChange={setShowReportModal}
        postId={post.id}
        reportedUserId={post.user_id}
        contentPreview={post.content_text || undefined}
      />

      {/* Modal Expandido */}
      {!onOpenExpandedPost && (
        <PostExpandedModal
          open={showExpandedModal}
          onOpenChange={setShowExpandedModal}
          post={post}
          isLiked={post.is_liked || false}
          isDisliked={isDisliked}
          isSaved={post.is_saved || false}
        />
      )}

      {/* Modal mobile dedicado a comentários */}
      <MobileCommentsModal
        open={showMobileComments}
        onOpenChange={setShowMobileComments}
        postId={post.id}
        commentsCount={post.comments_count || 0}
        onBeforeSubmit={async () => {
          if (isPostOwner) return true;
          return await tryChargeXp(
            'post_comment',
            `comment:${post.id}:${user?.id ?? 'anon'}:${Date.now()}`,
          );
        }}
      />



      {/* Modal de Likers */}
      <LikersModal
        open={showLikersModal}
        onOpenChange={setShowLikersModal}
        postId={post.id}
        likesCount={post.likes_count}
      />

      {/* Modal de Compartilhamento */}
      <SharePostModal
        open={showShareModal}
        onOpenChange={setShowShareModal}
        postId={post.id}
        postPreview={post.content_text || undefined}
      />

      {/* Modal de Presente XP — destinatário travado no criador da postagem */}
      {!isPostOwner && (
        <AuraXpGiftModal
          open={showGiftModal}
          onOpenChange={setShowGiftModal}
          title="Enviar presente ao criador"
          contextLabel="por esta publicação"
          postId={post.id}
          lockedReceiver={{
            id: ((author as any)?.id ?? post.user_id) as string,
            user_id: (post.user_id ?? null) as string | null,
            username: (author?.username ?? null) as string | null,
            name: (author?.name ?? null) as string | null,
            avatar_url: (author?.avatar_url ?? null) as string | null,
          }}
        />
      )}




      {/* Confirmação de exclusão */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent className="w-[calc(100vw-1rem)] sm:w-auto max-w-sm rounded-2xl p-4 sm:p-6">
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir postagem?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir esta postagem permanentemente? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeletePost}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deletePost.isPending}
            >
              {deletePost.isPending ? 'Excluindo...' : 'Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edição de enquete */}
      {isPoll && (
        <EditPollModal
          open={showEditPoll}
          onOpenChange={(o) => { setShowEditPoll(o); if (!o) setReopenPollMode(false); }}
          postId={post.id}
          initialContentText={post.content_text}
          defaultReopen={reopenPollMode}
        />
      )}

      {/* Confirmação de exclusão da enquete */}
      {isPoll && (
        <AlertDialog open={showDeletePollConfirm} onOpenChange={setShowDeletePollConfirm}>
          <AlertDialogContent className="w-[calc(100vw-1rem)] sm:w-auto max-w-sm rounded-2xl p-4 sm:p-6">
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir enquete?</AlertDialogTitle>
              <AlertDialogDescription>
                Todos os votos e opções serão removidos permanentemente. Esta ação não pode ser desfeita.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={async () => {
                  if (!pollData) return;
                  await deletePoll.mutateAsync({ pollId: pollData.id, postId: post.id });
                  setShowDeletePollConfirm(false);
                }}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={deletePoll.isPending}
              >
                {deletePoll.isPending ? 'Excluindo...' : 'Excluir'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      <SubscriptionModal
        open={showSubscriptionModal}
        onOpenChange={setShowSubscriptionModal}
        creatorName={author?.name}
      />

      {isPostOwner && !isPoll && showEditPost && (
        <Suspense fallback={null}>
          <CreatePostModal
            open={showEditPost}
            onOpenChange={setShowEditPost}
            editPost={post}
          />
        </Suspense>
      )}
    </>
  );
});

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseExternal";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";

/**
 * Resolve acesso a um post do Diário VIP em todas as dimensões:
 *  - isOwner: o usuário logado é o criador do post (profile.id ou user.id casam com author_id/creator_id/user_id)
 *  - isPublic: privacy_level='public' && !is_paid && !is_locked
 *  - isSubscribed: tem assinatura ativa do canal do criador (post não é PPV avulso)
 *  - hasPurchase: comprou avulso (media_access ou beta)
 *  - effectiveAccess = isOwner || isPublic || hasPurchase || (isSubscribed && !is_paid_ppv)
 *
 * Compatível com posts gratuitos públicos (libera para anônimo via isPublic).
 */
export interface DiaryAccessResult {
  loading: boolean;
  isOwner: boolean;
  isPublic: boolean;
  isSubscribed: boolean;
  hasPurchase: boolean;
  effectiveAccess: boolean;
  price: number;
  needsLogin: boolean;
  reason: "owner" | "public" | "subscriber" | "purchased" | "locked";
}

export function useDiaryPostAccess(post: any | null | undefined): DiaryAccessResult {
  const { user } = useAuth();
  const { profile } = useProfile();

  const postId = post?.id || null;
  const creatorIdCandidates = [post?.author_id, post?.creator_id, post?.user_id].filter(Boolean);
  const creatorKey = creatorIdCandidates.join("|");
  const isPaid = !!post?.is_paid || Number(post?.paid_price || post?.unlock_price || 0) > 0;
  const price = Number(post?.paid_price ?? post?.unlock_price ?? 0) || 0;
  const isPublic =
    (post?.privacy_level || "public") === "public" && !isPaid && !post?.is_locked;

  // Owner detection (profile.id OR user.id)
  const isOwner = !!(
    (profile?.id && creatorIdCandidates.includes(profile.id)) ||
    (user?.id && creatorIdCandidates.includes(user.id))
  );

  // Subscription check (only when authenticated and not the owner)
  const subQuery = useQuery({
    queryKey: ["diary-subscription", profile?.id, creatorKey],
    enabled: !!profile?.id && !!creatorKey && !isOwner && !isPublic,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      try {
        const { data } = await (supabase as any)
          .from("subscriptions")
          .select("id")
          .eq("subscriber_id", profile!.id)
          .in("creator_id", creatorIdCandidates as string[])
          .eq("status", "active")
          .limit(1)
          .maybeSingle();
        return !!data;
      } catch {
        return false;
      }
    },
  });

  // Purchase check (only when PPV avulso e não dono e não público)
  const purchaseQuery = useQuery({
    queryKey: ["diary-purchase", user?.id, postId],
    enabled: !!user?.id && !!postId && isPaid && !isOwner,
    staleTime: 60_000,
    queryFn: async () => {
      try {
        const [real, beta] = await Promise.all([
          (supabase as any).rpc("check_media_access", { p_user_id: user!.id, p_post_id: postId }),
          (supabase as any).rpc("has_beta_post_access", { p_user: user!.id, p_post: postId }),
        ]);
        return !!real?.data || !!beta?.data;
      } catch {
        return false;
      }
    },
  });

  const isSubscribed = !!subQuery.data;
  const hasPurchase = !!purchaseQuery.data;

  // PPV avulso (is_paid) exige compra OU dono — assinatura sozinha não libera.
  // Posts vip_only sem is_paid → assinatura libera.
  const subscriberUnlocks = isSubscribed && !isPaid;

  const effectiveAccess =
    isOwner || isPublic || hasPurchase || subscriberUnlocks;

  let reason: DiaryAccessResult["reason"] = "locked";
  if (isOwner) reason = "owner";
  else if (isPublic) reason = "public";
  else if (hasPurchase) reason = "purchased";
  else if (subscriberUnlocks) reason = "subscriber";

  return {
    loading: subQuery.isLoading || purchaseQuery.isLoading,
    isOwner,
    isPublic,
    isSubscribed,
    hasPurchase,
    effectiveAccess,
    price,
    needsLogin: !user,
    reason,
  };
}

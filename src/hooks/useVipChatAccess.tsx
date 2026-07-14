import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseExternal";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";

interface VipChatAccess {
  isVipRecipient: boolean;
  isSubscribed: boolean;
  canSendFree: boolean;
  recipientPlan: string;
  loading: boolean;
  messageCost: number;
}

/**
 * Check if the chat recipient is a VIP creator and whether the sender
 * has an active subscription. Results are cached to avoid flicker.
 */
export function useVipChatAccess(recipientProfileId: string | undefined): VipChatAccess {
  const { user } = useAuth();
  const { profile } = useProfile();

  const { data, isLoading } = useQuery({
    queryKey: ["vip-chat-access", user?.id, recipientProfileId],
    enabled: !!user?.id && !!recipientProfileId && !!profile?.id,
    staleTime: 5 * 60_000, // Cache for 5 minutes
    gcTime: 10 * 60_000,
    queryFn: async () => {
      // 1. Check recipient's plan
      const { data: recipientProfile } = await supabase
        .from("profiles")
        .select("plan_type")
        .eq("id", recipientProfileId!)
        .maybeSingle();

      const recipientPlan = (recipientProfile as any)?.plan_type || "free";

      if (recipientPlan !== "vip") {
        return { isVipRecipient: false, isSubscribed: false, canSendFree: true, recipientPlan, messageCost: 0 };
      }

      // 2. If sender is also VIP, they can message freely
      const senderPlan = profile?.plan_type || "free";
      if (senderPlan === "vip") {
        return { isVipRecipient: true, isSubscribed: true, canSendFree: true, recipientPlan, messageCost: 0 };
      }

      // 3. Check subscription
      const { data: subscription } = await supabase
        .from("subscriptions" as any)
        .select("id")
        .eq("subscriber_id", profile!.id)
        .eq("creator_id", recipientProfileId!)
        .eq("status", "active")
        .maybeSingle();

      const isSubscribed = !!subscription;

      return {
        isVipRecipient: true,
        isSubscribed,
        canSendFree: isSubscribed,
        recipientPlan,
        messageCost: 5.00, // Default R$ 5.00 per message
      };
    },
  });

  return {
    isVipRecipient: data?.isVipRecipient || false,
    isSubscribed: data?.isSubscribed || false,
    canSendFree: data?.canSendFree ?? true,
    recipientPlan: data?.recipientPlan || "free",
    loading: isLoading,
    messageCost: data?.messageCost || 5.00,
  };
}

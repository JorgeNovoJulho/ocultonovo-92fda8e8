import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseExternal";

/**
 * Fetch all users referred by a given profile (referred_by_creator_id = profileId).
 */
export function useProfileReferrals(profileId: string | undefined) {
  return useQuery({
    queryKey: ["profile-referrals", profileId],
    queryFn: async () => {
      if (!profileId) return [];
      const { data, error } = await supabase
        .from("profiles")
        .select("id, name, username, avatar_url, created_at")
        .eq("referred_by_creator_id", profileId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) {
        console.error("[useProfileReferrals]", error.message);
        return [];
      }
      return data || [];
    },
    enabled: !!profileId,
    staleTime: 60000,
  });
}

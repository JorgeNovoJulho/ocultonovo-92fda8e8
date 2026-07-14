/**
 * useFollowRelationships — carrega de uma vez:
 *   - quem EU sigo (followingSet)
 *   - quem ME segue (followerSet)
 * Indexados por profile.id (e também por user_id, para tolerar dados legados).
 *
 * Útil para listas/grades onde precisamos mostrar uma tag por card:
 *   • mutual    — seguimos um ao outro
 *   • following — eu sigo essa pessoa
 *   • follower  — essa pessoa me segue
 *   • none      — sem relação
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "./useAuth";
import { useProfile } from "./useProfile";
import { supabase } from "@/lib/supabaseExternal";
import { selectFollowers, selectFollowing } from "@/lib/followsApi";

export type FollowRelationship = "mutual" | "following" | "follower" | "none";

interface RelSets {
  followingSet: Set<string>; // ids que EU sigo
  followerSet: Set<string>;  // ids que me seguem
}

export function useFollowRelationships() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const myProfileId = profile?.id;
  const myUserId = user?.id;

  const query = useQuery<RelSets>({
    queryKey: ["follow-relationships", myProfileId, myUserId],
    enabled: !!myProfileId,
    staleTime: 60_000,
    queryFn: async () => {
      if (!myProfileId) return { followingSet: new Set(), followerSet: new Set() };

      const [followingRes, followersRes] = await Promise.all([
        selectFollowing(myProfileId),
        selectFollowers(myProfileId),
      ]);

      const followingIds = (followingRes.data || []).map((f: any) => f.following_id).filter(Boolean);
      const followerIds = (followersRes.data || []).map((f: any) => f.follower_id).filter(Boolean);

      // Mapeia user_id -> profile.id (e vice-versa) para tolerar dados legados
      // onde follower_id/following_id às vezes guardam auth.users.id.
      const allIds = [...new Set([...followingIds, ...followerIds])];
      let idMap: Record<string, string[]> = {};
      if (allIds.length > 0) {
        const inList = allIds.map((v) => `"${v}"`).join(",");
        const { data: rows } = await (supabase as any)
          .from("profiles")
          .select("id, user_id")
          .or(`id.in.(${inList}),user_id.in.(${inList})`);
        for (const r of rows || []) {
          const both = [r.id, r.user_id].filter(Boolean) as string[];
          for (const k of both) {
            idMap[k] = idMap[k] ? [...new Set([...idMap[k], ...both])] : both;
          }
        }
      }

      const expand = (id: string): string[] => idMap[id] || [id];

      const followingSet = new Set<string>();
      for (const id of followingIds) for (const e of expand(id)) followingSet.add(e);
      const followerSet = new Set<string>();
      for (const id of followerIds) for (const e of expand(id)) followerSet.add(e);

      return { followingSet, followerSet };
    },
  });

  const getRelationship = useMemo(() => {
    const followingSet = query.data?.followingSet ?? new Set<string>();
    const followerSet = query.data?.followerSet ?? new Set<string>();
    return (targetId?: string | null): FollowRelationship => {
      if (!targetId) return "none";
      const iFollow = followingSet.has(targetId);
      const followsMe = followerSet.has(targetId);
      if (iFollow && followsMe) return "mutual";
      if (iFollow) return "following";
      if (followsMe) return "follower";
      return "none";
    };
  }, [query.data]);

  return { ...query, getRelationship };
}

export function relationshipLabel(rel: FollowRelationship): { label: string; cls: string } | null {
  switch (rel) {
    case "mutual":
      return {
        label: "Vocês se seguem",
        cls: "border-emerald-500/50 bg-emerald-500/15 text-emerald-400",
      };
    case "following":
      return {
        label: "Você segue",
        cls: "border-primary/50 bg-primary/15 text-primary",
      };
    case "follower":
      return {
        label: "Te segue",
        cls: "border-sky-500/50 bg-sky-500/15 text-sky-400",
      };
    default:
      return null;
  }
}

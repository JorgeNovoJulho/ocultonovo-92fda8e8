import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseExternal";
import { subscribeTable } from "@/lib/realtimeBus";

export interface OnlineUserRow {
  id: string;
  user_id: string | null;
  username: string | null;
  name: string | null;
  avatar_url: string | null;
  plan_type: string | null;
  last_seen: string | null;
  is_verified: boolean | null;
  aura_level: number | null;
}

const QUERY_KEY = ["online-users:list"] as const;

export function useOnlineUsersList(enabled = true) {
  const qc = useQueryClient();

  // Realtime: invalida lista quando is_online/last_seen mudam em profiles
  useEffect(() => {
    if (!enabled) return;
    return subscribeTable('profiles', (payload: any) => {
      const oldOn = payload?.old?.is_online;
      const newOn = payload?.new?.is_online;
      if (oldOn !== newOn || newOn === true) {
        qc.invalidateQueries({ queryKey: QUERY_KEY });
      }
    }, { events: ['UPDATE'] });
  }, [enabled, qc]);

  return useQuery({
    queryKey: QUERY_KEY,
    enabled,
    refetchInterval: 10_000,
    refetchOnWindowFocus: true,
    staleTime: 5_000,
    queryFn: async (): Promise<OnlineUserRow[]> => {
      const twoMinAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
      const { data, error } = await (supabase as any)
        .from("profiles")
        .select(
          "id,user_id,username,name,avatar_url,plan_type,last_seen,is_verified,aura_level"
        )
        .eq("is_online", true)
        .gte("last_seen", twoMinAgo)
        .eq("is_seed", false)
        .order("last_seen", { ascending: false })
        .limit(500);
      if (error) {
        console.warn("[useOnlineUsersList] fail:", error.message);
        return [];
      }
      return (data || []) as OnlineUserRow[];
    },
  });
}

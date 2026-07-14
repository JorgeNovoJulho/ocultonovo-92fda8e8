import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/lib/supabaseExternal";
import { subscribeTable } from "@/lib/realtimeBus";
import { useAuth } from "@/hooks/useAuth";

export interface AdminAlert {
  id: string;
  alert_type: string;
  severity: "info" | "low" | "medium" | "high" | "critical";
  title: string;
  body: string | null;
  ref_user_id: string | null;
  ref_table: string | null;
  ref_id: string | null;
  read: boolean;
  created_at: string;
}

/**
 * Realtime feed of admin_alerts (fraud, financial, abuse, system).
 * Read-only for the admin UI bell + monitor pages.
 */
export function useAdminAlerts(limit = 50) {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ["admin-alerts", limit],
    enabled: !!user?.id,
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("admin_alerts")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data as AdminAlert[]) || [];
    },
  });

  useEffect(() => {
    if (!user?.id) return;
    const unsub = subscribeTable("admin_alerts", () => query.refetch(), { events: ["INSERT"] });
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const markRead = async (id: string) => {
    await (supabase as any).from("admin_alerts").update({ read: true }).eq("id", id);
    query.refetch();
  };

  const unreadCount = (query.data || []).filter((a) => !a.read).length;

  return { ...query, alerts: query.data || [], unreadCount, markRead };
}

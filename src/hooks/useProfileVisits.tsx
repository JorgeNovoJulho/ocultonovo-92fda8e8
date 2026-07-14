import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseExternal";
import { useProfile } from "@/hooks/useProfile";

export interface ProfileVisit {
  id: string;
  visitor_id: string;
  visited_at: string;
  first_visited_at: string;
  visit_count: number;
  visitor_name: string;
  visitor_username: string | null;
  visitor_avatar: string | null;
  visitor_plan: string;
}


/**
 * Fetch all individual visits to the current user's profile (NOT aggregated).
 */
export function useMyProfileVisits(limit = 100) {
  const { profile } = useProfile();

  return useQuery({
    queryKey: ["profile-visits", profile?.id, limit],
    enabled: !!profile?.id,
    staleTime: 60_000,
    placeholderData: (prev: any) => prev,
    queryFn: async (): Promise<ProfileVisit[]> => {
      const { data, error } = await supabase
        .from("profile_visits")
        .select("id, visitor_id, visited_at")
        .eq("visited_id", profile!.id)
        .order("visited_at", { ascending: false })
        .limit(limit);

      if (error) {
        console.warn("[Visits] fetch error:", error.message);
        return [];
      }

      const rows = (data as any[]) || [];
      const visitorIds = [...new Set(rows.map((r) => r.visitor_id).filter(Boolean))];
      let visitorMap = new Map<string, any>();
      if (visitorIds.length) {
        const [byId, byUserId] = await Promise.all([
          supabase
            .from("profiles")
            .select("id, user_id, name, username, display_name, avatar_url, plan_type")
            .in("id", visitorIds),
          supabase
            .from("profiles")
            .select("id, user_id, name, username, display_name, avatar_url, plan_type")
            .in("user_id", visitorIds),
        ]);
        [...((byId.data as any[]) || []), ...((byUserId.data as any[]) || [])].forEach((p: any) => {
          if (p.id) visitorMap.set(p.id, p);
          if (p.user_id) visitorMap.set(p.user_id, p);
        });
      }

      // Aggregate by visitor_id: 1 row per visitor with count + last visit
      const grouped = new Map<string, ProfileVisit>();
      // rows is desc-ordered (last visit first)
      for (const row of rows) {
        const key = row.visitor_id;
        const existing = grouped.get(key);
        if (existing) {
          existing.visit_count += 1;
          // visited_at is earlier than the stored last → update first_visited_at
          if (new Date(row.visited_at) < new Date(existing.first_visited_at)) {
            existing.first_visited_at = row.visited_at;
          }
        } else {
          const p = visitorMap.get(row.visitor_id);
          const uname = p?.username || null;
          grouped.set(key, {
            id: row.id,
            visitor_id: row.visitor_id,
            visited_at: row.visited_at, // última visita (mais recente)
            first_visited_at: row.visited_at,
            visit_count: 1,
            visitor_name: uname ? `@${uname}` : "Usuário",
            visitor_username: uname,
            visitor_avatar: p?.avatar_url || null,
            visitor_plan: p?.plan_type || "free",
          });

        }
      }
      return Array.from(grouped.values()).sort(
        (a, b) => new Date(b.visited_at).getTime() - new Date(a.visited_at).getTime(),
      );
    },
  });
}

/**
 * Record a visit to another user's profile.
 * Fire-and-forget — never blocks UI.
 */
export function useRecordProfileVisit() {
  return useMutation({
    mutationFn: async ({
      visitorId,
      visitedId,
    }: {
      visitorId: string;
      visitedId: string;
    }) => {
      // Backend rate-limit: dispara apenas notificação visual,
      // NUNCA bloqueia o registro da visita (fail-open total).
      // O dono do perfil precisa ver TODAS as visitas recebidas.
      (async () => {
        try {
          const { data: rl } = await (supabase as any).rpc('check_and_increment_usage', { _feature: 'profile_view' });
          if (rl && rl.allowed === false) {
            const { dispatchRateLimit } = await import('@/components/RateLimitProvider');
            dispatchRateLimit({
              feature: 'profile_view',
              reason: rl.reason,
              count: rl.count,
              limit: rl.limit,
              resetAt: rl.reset_at,
              plan: rl.plan,
            });
          }
        } catch { /* silencioso */ }
      })();

      // Resolve visitorId real caso o id local esteja stale/ausente
      let resolvedVisitorId = visitorId;
      if (!resolvedVisitorId) {
        try {
          const { resolveActorId } = await import('@/lib/ensureProfile');
          resolvedVisitorId = await resolveActorId();
        } catch {
          console.warn('[Visit] could not resolve visitor id');
          return;
        }
      }

      if (!resolvedVisitorId || !visitedId || resolvedVisitorId === visitedId) return;

      // Não notificar/registrar se houver bloqueio em qualquer direção
      try {
        const { data: blocked } = await (supabase as any).rpc('is_chat_blocked_pair', {
          _user_a: resolvedVisitorId,
          _user_b: visitedId,
        });
        if (blocked === true) return;
      } catch { /* se RPC falhar, segue fluxo normal */ }

      const { error } = await (supabase as any).rpc("record_profile_visit", {
        p_visitor_id: resolvedVisitorId,
        p_visited_id: visitedId,
      });

      if (!error) {
        const { data: visitorProfile } = await supabase
          .from('profiles')
          .select('username')
          .eq('id', resolvedVisitorId)
          .maybeSingle();

        const visitorName = (visitorProfile as any)?.username ? `@${(visitorProfile as any).username}` : 'Alguém';


        await supabase
          .from('notifications')
          .insert({
            user_id: visitedId,
            type: 'visit',
              title: `${visitorName} visitou seu perfil`,
          } as any);
      }

      if (error) console.warn("[Visit] silent fail:", error.message);
    },
    // No retry — visit recording is best-effort
    retry: false,
  });
}

/**
 * Count total visits to a profile
 */
export function useVisitCount() {
  const { profile } = useProfile();

  return useQuery({
    queryKey: ["profile-visit-count", profile?.id],
    enabled: !!profile?.id,
    staleTime: 120_000,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("profile_visits")
        .select("*", { count: "exact", head: true })
        .eq("visited_id", profile!.id);

      if (error) return 0;
      return count || 0;
    },
  });
}

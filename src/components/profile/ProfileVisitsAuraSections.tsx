import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseExternal";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useProfile } from "@/hooks/useProfile";
import { calculateCompatibility } from "@/data/tagsData";
import { cn } from "@/lib/utils";

interface VisitProfile {
  id: string;
  user_id: string | null;
  username: string | null;
  avatar_url: string | null;
  affinity: number;
}

function auraClasses(pct: number): { ring: string; shadow: string } {
  if (pct >= 95) return { ring: "ring-emerald-500", shadow: "shadow-[0_0_12px_rgba(16,185,129,0.7)]" };
  if (pct >= 51) return { ring: "ring-yellow-400", shadow: "shadow-[0_0_12px_rgba(250,204,21,0.7)]" };
  if (pct >= 26) return { ring: "ring-orange-500", shadow: "shadow-[0_0_12px_rgba(249,115,22,0.7)]" };
  return { ring: "ring-red-500", shadow: "shadow-[0_0_12px_rgba(239,68,68,0.7)]" };
}

async function fetchVisitProfiles(
  ids: string[],
  mySocial: string[],
  myAdult: string[],
): Promise<VisitProfile[]> {
  if (!ids.length) return [];
  const [byId, byUserId] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, user_id, username, avatar_url, tags, tags_social, tags_adult")
      .in("id", ids),
    supabase
      .from("profiles")
      .select("id, user_id, username, avatar_url, tags, tags_social, tags_adult")
      .in("user_id", ids),
  ]);
  const map = new Map<string, any>();
  [...((byId.data as any[]) || []), ...((byUserId.data as any[]) || [])].forEach((p: any) => {
    if (p.id) map.set(p.id, p);
    if (p.user_id) map.set(p.user_id, p);
  });
  const out: VisitProfile[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    const p = map.get(id);
    if (!p || seen.has(p.id)) continue;
    seen.add(p.id);
    // Fallback: alguns perfis guardam tags sociais na coluna legada `tags`.
    const social = Array.isArray(p.tags_social) && p.tags_social.length
      ? p.tags_social
      : Array.isArray(p.tags) ? p.tags : [];
    const adult = Array.isArray(p.tags_adult) ? p.tags_adult : [];
    const comp = calculateCompatibility(mySocial, myAdult, social, adult);
    out.push({
      id: p.id,
      user_id: p.user_id,
      username: p.username,
      avatar_url: p.avatar_url,
      affinity: comp.totalPct,
    });
  }
  return out;
}

function VisitBubble({ p }: { p: VisitProfile }) {
  const navigate = useNavigate();
  const { ring, shadow } = auraClasses(p.affinity);
  const handle = p.username ? `@${p.username}` : "perfil";
  return (
    <button
      onClick={() => navigate(p.username ? `/u/${p.username}` : `/profile/${p.id}`)}
      className="shrink-0 flex flex-col items-center gap-1 group"
      title={`${handle} · ${p.affinity}% afinidade`}
    >
      <div className={cn("rounded-full p-[2px] ring-2 transition-transform group-hover:scale-105", ring, shadow)}>
        <Avatar className="h-14 w-14">
          <AvatarImage src={p.avatar_url || undefined} alt={handle} />
          <AvatarFallback>{(p.username || "?").slice(0, 1).toUpperCase()}</AvatarFallback>
        </Avatar>
      </div>
      <span className="text-[10px] text-muted-foreground leading-none">{p.affinity}%</span>
    </button>
  );
}

function Section({ title, items, loading }: { title: string; items: VisitProfile[]; loading: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-card/40 p-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <span className="text-xs text-muted-foreground tabular-nums">{loading ? "…" : items.length}</span>
      </div>
      {loading ? (
        <div className="h-20 animate-pulse rounded-md bg-muted/40" />
      ) : items.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhum perfil ainda.</p>
      ) : (
        <div
          className="grid grid-flow-row gap-3 max-h-56 overflow-y-auto pr-1 scrollbar-none [&::-webkit-scrollbar]:hidden"
          style={{ gridTemplateColumns: "repeat(auto-fill, minmax(64px, 1fr))", scrollbarWidth: "none" as any }}
        >
          {items.map((p) => (
            <VisitBubble key={p.id} p={p} />
          ))}
        </div>
      )}
    </div>
  );
}

export function ProfileVisitsAuraSections() {
  const { profile } = useProfile();
  const profileId = profile?.id;
  const userId = profile?.user_id;
  const mySocial = profile?.tags_social || [];
  const myAdult = profile?.tags_adult || [];

  const received = useQuery({
    queryKey: ["visits-received-aura", profileId, userId],
    enabled: !!profileId,
    staleTime: 60_000,
    queryFn: async (): Promise<VisitProfile[]> => {
      // Try both visited_id semantics: profile.id and user_id (auth.users.id).
      const orFilter = userId ? `visited_id.eq.${profileId},visited_id.eq.${userId}` : `visited_id.eq.${profileId}`;
      const { data } = await supabase
        .from("profile_visits")
        .select("visitor_id, visited_at")
        .or(orFilter)
        .order("visited_at", { ascending: false })
        .limit(200);
      const ids = [...new Set(((data as any[]) || []).map((r) => r.visitor_id).filter(Boolean))];
      return fetchVisitProfiles(ids, mySocial, myAdult);
    },
  });

  const visited = useQuery({
    queryKey: ["visits-made-aura", profileId, userId],
    enabled: !!profileId,
    staleTime: 60_000,
    queryFn: async (): Promise<VisitProfile[]> => {
      const orFilter = userId ? `visitor_id.eq.${profileId},visitor_id.eq.${userId}` : `visitor_id.eq.${profileId}`;
      const { data } = await supabase
        .from("profile_visits")
        .select("visited_id, visited_at")
        .or(orFilter)
        .order("visited_at", { ascending: false })
        .limit(200);
      const ids = [...new Set(((data as any[]) || []).map((r) => r.visited_id).filter(Boolean))];
      return fetchVisitProfiles(ids, mySocial, myAdult);
    },
  });

  if (!profileId) return null;

  return (
    <div className="space-y-3">
      <Section title="Últimas visitas recebidas" items={received.data || []} loading={received.isLoading} />
      <Section title="Últimos perfis visitados" items={visited.data || []} loading={visited.isLoading} />
      <p className="text-[10px] text-muted-foreground text-center">
        Afinidade de Aura: <span className="text-emerald-500">95–100%</span> · <span className="text-yellow-400">51–94%</span> ·{" "}
        <span className="text-orange-500">26–50%</span> · <span className="text-red-500">0–25%</span>
      </p>
    </div>
  );
}

export default ProfileVisitsAuraSections;

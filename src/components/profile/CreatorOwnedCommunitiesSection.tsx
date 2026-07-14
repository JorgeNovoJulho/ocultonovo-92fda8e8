/**
 * CreatorOwnedCommunitiesSection — exibe no perfil os cards das
 * comunidades em que o usuário é dono (owner_id = userId).
 * Filtra somente comunidades ativas. Comunidades privadas só aparecem
 * para o próprio dono (isOwnProfile).
 */
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Users2, ArrowRight, Lock } from "lucide-react";
import { supabase } from "@/lib/supabaseExternal";

interface Props {
  userId?: string | null;
  isOwnProfile?: boolean;
}

interface OwnedCommunity {
  id: string;
  slug: string;
  title: string;
  description?: string | null;
  avatar_url?: string | null;
  cover_url?: string | null;
  accent_color?: string | null;
  visibility?: string | null;
  is_adult?: boolean | null;
  members_count?: number | null;
}

export function CreatorOwnedCommunitiesSection({ userId, isOwnProfile }: Props) {
  const navigate = useNavigate();

  const { data: communities = [] } = useQuery({
    queryKey: ["creator-owned-communities", userId, isOwnProfile],
    enabled: !!userId,
    staleTime: 60_000,
    queryFn: async (): Promise<OwnedCommunity[]> => {
      const { data, error } = await (supabase as any)
        .from("oculto_communities")
        .select("id,slug,title,description,avatar_url,cover_url,accent_color,visibility,is_adult,members_count,status,owner_id")
        .eq("owner_id", userId)
        .eq("status", "active")
        .order("last_activity_at", { ascending: false, nullsFirst: false })
        .limit(12);
      if (error) return [];
      const rows = (data ?? []) as OwnedCommunity[];
      // Esconde privadas para visitantes
      return isOwnProfile
        ? rows
        : rows.filter((c) => c.visibility !== "private");
    },
  });

  if (!communities.length) return null;

  return (
    <div className="mx-auto w-full max-w-xl">
      <div className="flex items-center justify-center gap-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground mb-2">
        <Users2 className="h-3 w-3" />
        Comunidades que {isOwnProfile ? "você administra" : "administra"}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {communities.map((c) => {
          const accent = c.accent_color || "#a855f7";
          const isPrivate = c.visibility === "private";
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => navigate(`/comunidades/${c.slug}`)}
              className="group text-left rounded-xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] transition overflow-hidden"
            >
              {/* Cover */}
              <div
                className="h-14 w-full relative"
                style={{
                  background: c.cover_url
                    ? `url(${c.cover_url}) center/cover no-repeat`
                    : `linear-gradient(135deg, ${accent}33, ${accent}11)`,
                }}
              >
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
              </div>

              <div className="px-2.5 py-2 -mt-5 relative flex items-start gap-2">
                {/* Avatar */}
                <div
                  className="h-10 w-10 rounded-lg border-2 border-background shrink-0 overflow-hidden flex items-center justify-center text-sm font-bold text-white"
                  style={{
                    background: c.avatar_url
                      ? `url(${c.avatar_url}) center/cover no-repeat`
                      : accent,
                  }}
                >
                  {!c.avatar_url && (c.title?.[0]?.toUpperCase() ?? "C")}
                </div>

                <div className="min-w-0 flex-1 pt-3">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-semibold text-foreground truncate">
                      {c.title}
                    </p>
                    {isPrivate && (
                      <Lock className="h-3 w-3 text-muted-foreground shrink-0" />
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span>{c.members_count ?? 0} membros</span>
                    {c.is_adult && (
                      <span className="text-rose-400 font-semibold">+18</span>
                    )}
                  </div>
                </div>

                <ArrowRight className="h-4 w-4 text-muted-foreground self-center group-hover:translate-x-0.5 transition shrink-0" />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

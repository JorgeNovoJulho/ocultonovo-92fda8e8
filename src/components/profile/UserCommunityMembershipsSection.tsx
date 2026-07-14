/**
 * UserCommunityMembershipsSection — exibe as comunidades das quais
 * o usuário é MEMBRO ATIVO (excluindo as que ele administra).
 * Visível a todos os visitantes do perfil. Apenas comunidades públicas
 * e em status 'active' são retornadas pela RPC.
 */
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { UsersRound, ArrowRight } from "lucide-react";
import { supabase } from "@/lib/supabaseExternal";

interface Props {
  userId?: string | null;
  isOwnProfile?: boolean;
}

interface MemberCommunity {
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
  joined_at?: string | null;
  role?: string | null;
}

export function UserCommunityMembershipsSection({ userId, isOwnProfile }: Props) {
  const navigate = useNavigate();

  const { data: communities = [] } = useQuery({
    queryKey: ["user-member-communities", userId],
    enabled: !!userId,
    staleTime: 60_000,
    queryFn: async (): Promise<MemberCommunity[]> => {
      const { data, error } = await (supabase as any).rpc(
        "oculto_user_public_memberships",
        { p_user_id: userId, p_limit: 24 }
      );
      if (error) {
        console.warn("[UserCommunityMembershipsSection]", error.message);
        return [];
      }
      return (data ?? []) as MemberCommunity[];
    },
  });

  if (!communities.length) return null;

  return (
    <div className="mx-auto w-full max-w-xl mt-4">
      <div className="flex items-center justify-center gap-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground mb-2">
        <UsersRound className="h-3 w-3" />
        Comunidades que {isOwnProfile ? "você participa" : "participa"}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {communities.map((c) => {
          const accent = c.accent_color || "#38bdf8";
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => navigate(`/comunidades/${c.slug}`)}
              className="group text-left rounded-xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] transition overflow-hidden"
            >
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
                  <p className="text-sm font-semibold text-foreground truncate">
                    {c.title}
                  </p>
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span>{c.members_count ?? 0} membros</span>
                    {c.is_adult && (
                      <span className="text-rose-400 font-semibold">+18</span>
                    )}
                    {c.role && c.role !== "member" && (
                      <span className="text-amber-400 font-semibold uppercase tracking-wider">
                        {c.role}
                      </span>
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

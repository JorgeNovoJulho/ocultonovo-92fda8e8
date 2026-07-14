import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck, MapPin, UserRound, Star, ChevronDown, ChevronUp, HelpCircle } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/lib/supabaseExternal";
import { subscribeTable } from "@/lib/realtimeBus";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getPublicHandle } from "@/lib/userHandle";

interface Props {
  targetProfileId: string;
}

interface RecommenderRow {
  recommender_profile_id: string;
  created_at: string;
  profile?: {
    id: string;
    username: string | null;
    name: string | null;
    avatar_url: string | null;
    gender: string | null;
    city: string | null;
    state: string | null;
    rating_avg: number | null;
    rating_count: number | null;
  } | null;
}

const GENDER_LABEL: Record<string, string> = {
  male: "Homem",
  female: "Mulher",
  couple: "Casal",
  trans: "Trans",
  homem: "Homem",
  mulher: "Mulher",
  casal: "Casal",
};

export function ProfileRecommendationsSection({ targetProfileId }: Props) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const key = ["profile-recommendations", targetProfileId] as const;

  const [collapsed, setCollapsed] = useState(false);
  const [visibleCount, setVisibleCount] = useState(3);

  const { data: rows = [] } = useQuery<RecommenderRow[]>({
    queryKey: key,
    enabled: !!targetProfileId,
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("oculto_real_recommendations")
        .select("recommender_profile_id, created_at")
        .eq("target_profile_id", targetProfileId)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) {
        if ((error as any).code === "PGRST205" || (error as any).code === "42P01") return [];
        throw error;
      }
      const list = (data || []) as RecommenderRow[];
      if (list.length === 0) return [];
      const ids = Array.from(new Set(list.map((r) => r.recommender_profile_id)));
      const { data: profs, error: profErr } = await supabase
        .from("profiles")
        .select("id, username, name, avatar_url, gender, address_city, address_state, rating_avg, rating_count")
        .in("id", ids);
      if (profErr) {
        console.warn("[ProfileRecommendationsSection] profiles fetch error:", profErr.message);
      }
      const map = new Map(
        (profs || []).map((p: any) => [
          p.id,
          { ...p, city: p.address_city ?? null, state: p.address_state ?? null },
        ]),
      );
      return list.map((r) => ({ ...r, profile: (map.get(r.recommender_profile_id) as any) || null }));
    },
  });

  // Realtime
  useEffect(() => {
    if (!targetProfileId) return;
    const unsub = subscribeTable('oculto_real_recommendations', (payload: any) => {
      const row = payload?.new ?? payload?.old;
      if (row?.target_profile_id !== targetProfileId) return;
      qc.invalidateQueries({ queryKey: key });
    });
    return () => { unsub(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetProfileId]);


  const count = rows.length;
  const visibleRows = rows.slice(0, visibleCount);
  const remaining = count - visibleRows.length;
  const canShowLess = visibleCount > 3 && count > 3;

  return (
    <Card id="recommendations" className="w-full max-w-full min-w-0 overflow-hidden p-2.5 sm:p-4 mt-4 scroll-mt-24 border-emerald-500/25 bg-gradient-to-br from-emerald-500/10 via-teal-500/5 to-transparent">
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        className="w-full flex items-center justify-between mb-3 group"
        aria-expanded={!collapsed}
      >
        <div className="flex items-center gap-2 flex-wrap">
          <ShieldCheck className="h-4 w-4 text-emerald-400" />
          <h3 className="font-semibold text-foreground">Recomendações</h3>
          <Badge variant="secondary" className="text-[10px] bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
            {count} {count === 1 ? "real" : "reais"}
          </Badge>
          <Popover>
            <PopoverTrigger asChild>
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                aria-label="O que é uma recomendação?"
              >
                <HelpCircle className="h-3.5 w-3.5" /> Saiba mais
              </span>
            </PopoverTrigger>
            <PopoverContent
              side="bottom"
              align="start"
              onClick={(e) => e.stopPropagation()}
              className="w-[min(20rem,calc(100vw-1rem))] max-w-[calc(100vw-1rem)] text-xs leading-relaxed"
            >
              <p className="font-semibold text-sm mb-2 text-foreground">O que é uma Recomendação?</p>
              <p className="text-muted-foreground mb-3">
                Quando alguém marca este perfil como <span className="text-emerald-400 font-medium">pessoa real</span>, sinaliza para
                a comunidade que já conheceu, conversou ou se encontrou com a pessoa fora dos bastidores.
                É o selo de confiança mais forte do OCULTO.
              </p>
              <p className="font-semibold text-foreground mb-1">Como recomendar alguém:</p>
              <ol className="list-decimal pl-4 space-y-1 text-muted-foreground">
                <li>Abra o perfil de quem você conhece de verdade.</li>
                <li>Toque no menu (3 pontinhos) ao lado do nome.</li>
                <li>Escolha <span className="text-foreground">"Marcar como pessoa real"</span>.</li>
                <li>Pronto — seu nome aparece publicamente como referência.</li>
              </ol>
              <p className="mt-3 text-[10px] text-muted-foreground italic">
                Só recomende quem você realmente conhece. Recomendações falsas podem ser revertidas pela moderação.
              </p>
            </PopoverContent>
          </Popover>
        </div>
        {collapsed ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground group-hover:text-foreground" />
        ) : (
          <ChevronUp className="h-4 w-4 text-muted-foreground group-hover:text-foreground" />
        )}
      </button>

      {!collapsed && (
        <>
          {count === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              Ainda não há recomendações. Quem te conhece pode marcar como pessoa real pelo menu do perfil.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 w-full max-w-full min-w-0">
              {visibleRows.map((r) => {
                const p = r.profile;
                const handle = p ? (getPublicHandle(p as any) || (p.username ? `@${p.username}` : "@usuário")) : "@usuário";
                const gender = p?.gender ? GENDER_LABEL[p.gender.toLowerCase()] || p.gender : null;
                const location = [p?.city, p?.state].filter(Boolean).join(" / ");
                const href = p ? `/creator/${p.username || p.id}` : "#";
                const avg = Number(p?.rating_avg ?? 0);
                const ratingCount = Number(p?.rating_count ?? 0);
                return (
                  <button
                    key={r.recommender_profile_id}
                    type="button"
                    onClick={() => p && navigate(href)}
                    className="flex w-full max-w-full min-w-0 items-center gap-2 sm:gap-3 overflow-hidden rounded-lg border border-border/50 bg-muted/30 hover:bg-muted/60 hover:border-emerald-500/40 transition-colors p-2 text-left"
                  >
                    <Avatar className="h-10 w-10 ring-2 ring-emerald-500/40">
                      <AvatarImage src={p?.avatar_url || undefined} alt={handle} />
                      <AvatarFallback>{(handle[1] || "?").toUpperCase()}</AvatarFallback>
                    </Avatar>
                      <div className="min-w-0 flex-1 overflow-hidden">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="min-w-0 text-sm font-semibold truncate text-foreground">{handle}</p>
                        <Badge
                          variant="secondary"
                          className="bg-amber-500/15 text-amber-400 border-amber-500/30 text-[10px] px-1.5 py-0 h-4 gap-0.5 shrink-0"
                          title={`${ratingCount} avaliações`}
                        >
                          <Star className="h-2.5 w-2.5 fill-current" />
                          {avg.toFixed(1)}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5">
                        {gender && (
                          <span className="inline-flex items-center gap-0.5">
                            <UserRound className="h-3 w-3" /> {gender}
                          </span>
                        )}
                        {location && (
                          <span className="inline-flex items-center gap-0.5 truncate">
                            <MapPin className="h-3 w-3" /> <span className="truncate">{location}</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {(remaining > 0 || canShowLess) && (
            <div className="mt-3 flex items-center justify-center gap-2">
              {remaining > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setVisibleCount((c) => c + 10)}
                  className="text-xs"
                >
                  Ver mais ({Math.min(remaining, 10)})
                </Button>
              )}
              {canShowLess && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setVisibleCount(3)}
                  className="text-xs text-muted-foreground"
                >
                  Mostrar menos
                </Button>
              )}
            </div>
          )}
        </>
      )}
    </Card>
  );
}

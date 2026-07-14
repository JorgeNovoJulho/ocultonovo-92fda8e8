import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PenSquare, MapPin, UserRound, ChevronDown, ChevronUp, MessageSquareText, Trash2, Heart } from "lucide-react";
import { supabase } from "@/lib/supabaseExternal";
import { subscribeTable } from "@/lib/realtimeBus";
import { useProfile } from "@/hooks/useProfile";
import { useToast } from "@/hooks/use-toast";
import { WriteOnMuralModal } from "./WriteOnMuralModal";
import { cn } from "@/lib/utils";

interface Props {
  targetProfileId: string;
  ownerHandle?: string | null;
}

interface MuralRow {
  id: string;
  profile_owner_id: string;
  author_id: string;
  content_text: string;
  bg_id: string | null;
  image_url: string | null;
  mentions: string[] | null;
  created_at: string;
  likes_count?: number;
  liked_by_me?: boolean;
  author?: {
    id: string;
    username: string | null;
    name: string | null;
    avatar_url: string | null;
    gender: string | null;
    address_city: string | null;
    address_state: string | null;
  } | null;
}

const GENDER_LABEL: Record<string, string> = {
  male: "Homem", female: "Mulher", couple: "Casal", trans: "Trans",
  homem: "Homem", mulher: "Mulher", casal: "Casal",
};

function timeAgo(iso: string) {
  const ts = new Date(iso).getTime();
  const diff = Math.max(0, Date.now() - ts);
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "agora";
  if (m < 60) return `há ${m}min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `há ${d}d`;
  return new Date(iso).toLocaleDateString("pt-BR");
}

export function ProfileMuralSection({ targetProfileId, ownerHandle }: Props) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { profile: me } = useProfile();
  const { toast } = useToast();
  const key = ["profile-mural", targetProfileId] as const;

  const [collapsed, setCollapsed] = useState(false);
  const [visible, setVisible] = useState(4);
  const [openWrite, setOpenWrite] = useState(false);

  const { data: rows = [] } = useQuery<MuralRow[]>({
    queryKey: key,
    enabled: !!targetProfileId,
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("oculto_profile_mural_posts")
        .select("id, profile_owner_id, author_id, content_text, bg_id, image_url, mentions, created_at")
        .eq("profile_owner_id", targetProfileId)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) {
        if ((error as any).code === "PGRST205" || (error as any).code === "42P01") return [];
        throw error;
      }
      const list = (data || []) as MuralRow[];
      if (!list.length) return [];

      const ids = Array.from(new Set(list.map((r) => r.author_id)));
      const postIds = list.map((r) => r.id);

      const [profsRes, likesRes, myLikesRes] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, username, name, avatar_url, gender, address_city, address_state")
          .in("id", ids),
        (supabase as any)
          .from("oculto_profile_mural_likes")
          .select("mural_post_id")
          .in("mural_post_id", postIds),
        me?.id
          ? (supabase as any)
              .from("oculto_profile_mural_likes")
              .select("mural_post_id")
              .eq("user_id", me.id)
              .in("mural_post_id", postIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);

      const profMap = new Map(((profsRes as any).data || []).map((p: any) => [p.id, p]));
      const likeCounts = new Map<string, number>();
      for (const row of ((likesRes as any).data || []) as Array<{ mural_post_id: string }>) {
        likeCounts.set(row.mural_post_id, (likeCounts.get(row.mural_post_id) || 0) + 1);
      }
      const mySet = new Set(
        (((myLikesRes as any).data || []) as Array<{ mural_post_id: string }>).map((r) => r.mural_post_id),
      );

      return list.map((r) => ({
        ...r,
        author: (profMap.get(r.author_id) as any) || null,
        likes_count: likeCounts.get(r.id) || 0,
        liked_by_me: mySet.has(r.id),
      }));
    },
  });

  useEffect(() => {
    if (!targetProfileId) return;
    const unsub = subscribeTable('oculto_profile_mural_posts', (payload: any) => {
      const row = payload?.new ?? payload?.old;
      if (row?.profile_owner_id !== targetProfileId) return;
      qc.invalidateQueries({ queryKey: key });
    });
    return () => { unsub(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetProfileId]);


  const count = rows.length;
  const visibleRows = useMemo(() => rows.slice(0, visible), [rows, visible]);
  const remaining = count - visibleRows.length;
  const canShowLess = visible > 4 && count > 4;

  const isOwner = !!me?.id && me.id === targetProfileId;

  const handleDelete = async (row: MuralRow) => {
    if (!confirm("Remover esta publicação do mural?")) return;
    const { error } = await (supabase as any)
      .from("oculto_profile_mural_posts")
      .delete()
      .eq("id", row.id);
    if (error) {
      toast({ title: "Não foi possível remover", description: error.message, variant: "destructive" });
      return;
    }
    qc.invalidateQueries({ queryKey: key });
  };

  const handleToggleLike = async (row: MuralRow) => {
    if (!me?.id) {
      toast({ title: "Faça login para curtir", variant: "destructive" });
      return;
    }
    const willLike = !row.liked_by_me;
    // Otimista
    qc.setQueryData<MuralRow[]>(key, (prev) =>
      (prev || []).map((r) =>
        r.id === row.id
          ? { ...r, liked_by_me: willLike, likes_count: Math.max(0, (r.likes_count || 0) + (willLike ? 1 : -1)) }
          : r,
      ),
    );
    try {
      if (willLike) {
        const { error } = await (supabase as any)
          .from("oculto_profile_mural_likes")
          .insert({ mural_post_id: row.id, user_id: me.id });
        if (error && (error as any).code !== "23505") throw error;
      } else {
        const { error } = await (supabase as any)
          .from("oculto_profile_mural_likes")
          .delete()
          .eq("mural_post_id", row.id)
          .eq("user_id", me.id);
        if (error) throw error;
      }
    } catch (err: any) {
      // rollback
      qc.invalidateQueries({ queryKey: key });
      toast({ title: "Não foi possível curtir", description: err?.message, variant: "destructive" });
    }
  };


  return (
    <Card id="mural" className="w-full max-w-full min-w-0 overflow-hidden p-2.5 sm:p-4 mt-4 scroll-mt-24 border-fuchsia-500/25 bg-gradient-to-br from-fuchsia-500/10 via-purple-500/5 to-transparent">
      <div className="flex items-start sm:items-center justify-between mb-3 gap-2 min-w-0">
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-2 flex-wrap group"
          aria-expanded={!collapsed}
        >
          <MessageSquareText className="h-4 w-4 text-fuchsia-400" />
          <h3 className="font-semibold text-foreground">Mural</h3>
          <Badge variant="secondary" className="text-[10px] bg-fuchsia-500/15 text-fuchsia-300 border border-fuchsia-500/30">
            {count} {count === 1 ? "post" : "posts"}
          </Badge>
          {collapsed ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground group-hover:text-foreground" />
          ) : (
            <ChevronUp className="h-4 w-4 text-muted-foreground group-hover:text-foreground" />
          )}
        </button>

        {!isOwner && (
          <Button
            size="sm"
            onClick={() => setOpenWrite(true)}
            className="shrink-0 gap-1 bg-gradient-to-r from-pink-500 to-amber-500 text-white"
          >
            <PenSquare className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Escrever no mural</span><span className="sm:hidden">Escrever</span>
          </Button>
        )}
      </div>

      {!collapsed && (
        <>
          {count === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              O mural está vazio. {isOwner ? "Quem visitar seu perfil poderá deixar uma mensagem aqui." : "Seja o(a) primeiro(a) a deixar uma mensagem."}
            </p>
          ) : (
            <ul className="w-full max-w-full min-w-0 divide-y divide-border/40 rounded-xl border border-border/40 overflow-hidden bg-muted/10">
              {visibleRows.map((r) => {
                const a = r.author;
                const handle = a?.username ? `@${a.username}` : "@usuário";
                const gender = a?.gender ? GENDER_LABEL[a.gender.toLowerCase()] || a.gender : null;
                const location = [a?.address_city, a?.address_state].filter(Boolean).join(" / ");
                const href = a ? `/creator/${a.username || a.id}` : "#";
                const canDelete = !!me?.id && (me.id === r.author_id || me.id === r.profile_owner_id);
                const liked = !!r.liked_by_me;
                const likes = r.likes_count || 0;
                return (
                  <li
                    key={r.id}
                    className="flex w-full max-w-full min-w-0 items-stretch gap-2 sm:gap-3 p-2 sm:p-3 hover:bg-muted/20 transition-colors"
                  >
                    {/* Thumb da imagem gerada (lado esquerdo) */}
                    {r.image_url ? (
                      <img
                        src={r.image_url}
                        alt="Post de mural"
                        loading="lazy"
                        className="h-14 w-14 sm:h-20 sm:w-20 rounded-lg object-cover bg-muted flex-shrink-0"
                      />
                    ) : (
                      <div className="h-14 w-14 sm:h-20 sm:w-20 rounded-lg bg-fuchsia-500/15 flex items-center justify-center flex-shrink-0">
                        <MessageSquareText className="h-5 w-5 text-fuchsia-300" />
                      </div>
                    )}

                    {/* Conteúdo */}
                    <div className="min-w-0 flex-1 flex flex-col">
                      <div className="flex items-start gap-2">
                        <button
                          type="button"
                          onClick={() => a && navigate(href)}
                          className="flex items-center gap-2 min-w-0 flex-1 hover:opacity-80 text-left"
                        >
                          <Avatar className="h-6 w-6 ring-1 ring-fuchsia-400/40 flex-shrink-0">
                            <AvatarImage src={a?.avatar_url || undefined} alt={handle} />
                            <AvatarFallback className="text-[9px]">{handle.slice(1, 3).toUpperCase()}</AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="text-xs sm:text-sm font-semibold truncate text-foreground leading-tight">{handle}</p>
                            <div className="flex items-center gap-2 text-[10px] sm:text-[11px] text-muted-foreground leading-tight">
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
                          <span className="max-w-[3rem] truncate text-[10px] text-muted-foreground shrink-0 mt-0.5 sm:max-w-none">{timeAgo(r.created_at)}</span>
                      </div>

                      <p className="mt-1.5 text-xs sm:text-sm text-foreground/90 line-clamp-2 break-words">
                        {r.content_text}
                      </p>

                      {/* Ações */}
                      <div className="mt-1.5 flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => handleToggleLike(r)}
                          className={cn(
                            "inline-flex items-center gap-1 text-[11px] sm:text-xs transition-colors",
                            liked ? "text-pink-500" : "text-muted-foreground hover:text-pink-400",
                          )}
                          aria-pressed={liked}
                          aria-label={liked ? "Descurtir" : "Curtir"}
                        >
                          <Heart className={cn("h-3.5 w-3.5", liked && "fill-current")} />
                          <span>{likes}</span>
                        </button>
                        {canDelete && (
                          <button
                            type="button"
                            onClick={() => handleDelete(r)}
                            className="inline-flex items-center gap-1 text-[11px] sm:text-xs text-muted-foreground hover:text-destructive"
                            title="Remover"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}



          {(remaining > 0 || canShowLess) && (
            <div className="mt-3 flex items-center justify-center gap-2">
              {remaining > 0 && (
                <Button variant="outline" size="sm" onClick={() => setVisible((c) => c + 8)} className="text-xs">
                  Ver mais ({Math.min(remaining, 8)})
                </Button>
              )}
              {canShowLess && (
                <Button variant="ghost" size="sm" onClick={() => setVisible(4)} className="text-xs text-muted-foreground">
                  Mostrar menos
                </Button>
              )}
            </div>
          )}
        </>
      )}

      <WriteOnMuralModal
        open={openWrite}
        onOpenChange={setOpenWrite}
        profileOwnerId={targetProfileId}
        ownerHandle={ownerHandle || undefined}
      />
    </Card>
  );
}

export default ProfileMuralSection;

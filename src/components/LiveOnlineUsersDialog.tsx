import { useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Wifi, Users } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { buildSupabaseImageThumb } from "@/lib/imageTransform";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/lib/supabaseExternal";
import { subscribeTable } from "@/lib/realtimeBus";
import { useOnlineCounterStore } from "@/store/useOnlineCounterStore";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface OnlineProfile {
  id: string;
  user_id: string | null;
  username: string | null;
  display_name: string | null;
  name: string | null;
  avatar_url: string | null;
  is_creator: boolean | null;
  gender: string | null;
  profile_type: string | null;
  plan_type: string | null;
}

const PLAN_MAP: Record<string, { label: string; cls: string }> = {
  free:    { label: "Gratuito", cls: "bg-slate-500/15 text-slate-300 border-slate-500/40" },
  gratuito:{ label: "Gratuito", cls: "bg-slate-500/15 text-slate-300 border-slate-500/40" },
  premium: { label: "Premium",  cls: "bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/40" },
  vip:     { label: "VIP",      cls: "bg-gradient-to-r from-amber-500/20 to-fuchsia-500/20 text-amber-300 border-amber-400/50" },
};

function PlanBadge({ profile }: { profile: OnlineProfile }) {
  const raw = String(profile.plan_type || "free").toLowerCase().trim();
  const entry = PLAN_MAP[raw] || PLAN_MAP.free;
  return (
    <Badge variant="outline" className={`${entry.cls} text-[10px] px-1.5 py-0 h-4 whitespace-nowrap font-semibold`}>
      {entry.label}
    </Badge>
  );
}

const GENDER_MAP: Record<string, { label: string; cls: string }> = {
  homem: { label: "Homem", cls: "bg-sky-500/15 text-sky-300 border-sky-500/30" },
  man: { label: "Homem", cls: "bg-sky-500/15 text-sky-300 border-sky-500/30" },
  male: { label: "Homem", cls: "bg-sky-500/15 text-sky-300 border-sky-500/30" },
  m: { label: "Homem", cls: "bg-sky-500/15 text-sky-300 border-sky-500/30" },
  mulher: { label: "Mulher", cls: "bg-pink-500/15 text-pink-300 border-pink-500/30" },
  woman: { label: "Mulher", cls: "bg-pink-500/15 text-pink-300 border-pink-500/30" },
  female: { label: "Mulher", cls: "bg-pink-500/15 text-pink-300 border-pink-500/30" },
  f: { label: "Mulher", cls: "bg-pink-500/15 text-pink-300 border-pink-500/30" },
  casal: { label: "Casal", cls: "bg-purple-500/15 text-purple-300 border-purple-500/30" },
  couple: { label: "Casal", cls: "bg-purple-500/15 text-purple-300 border-purple-500/30" },
  trans: { label: "Trans", cls: "bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30" },
  travesti: { label: "Trans", cls: "bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30" },
  "não-binário": { label: "Não-binário", cls: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
  "nao-binario": { label: "Não-binário", cls: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
  nao_binario: { label: "Não-binário", cls: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
  non_binary: { label: "Não-binário", cls: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
};

function GenderBadge({ profile }: { profile: OnlineProfile }) {
  const candidates = [profile.gender, profile.profile_type]
    .map((v) => String(v || "").toLowerCase().trim())
    .filter(Boolean);
  const raw = candidates.find((v) => GENDER_MAP[v]) || candidates[0];
  if (!raw) return null;
  const entry =
    GENDER_MAP[raw] || {
      label: raw.charAt(0).toUpperCase() + raw.slice(1),
      cls: "bg-muted text-muted-foreground border-border",
    };
  return (
    <Badge variant="outline" className={`${entry.cls} text-[10px] px-1.5 py-0 h-4 whitespace-nowrap`}>
      {entry.label}
    </Badge>
  );
}

function useOnlineUsersList(enabled: boolean) {
  const qc = useQueryClient();
  const { setCount } = useOnlineCounterStore();

  useEffect(() => {
    if (!enabled) return;
    return subscribeTable('profiles', (payload: any) => {
      const isRelevant =
        payload.new?.is_online !== payload.old?.is_online ||
        payload.new?.username === 'ocultomaster' ||
        payload.old?.username === 'ocultomaster';
      if (isRelevant) {
        qc.invalidateQueries({ queryKey: ["live-online-users-list"] });
        qc.invalidateQueries({ queryKey: ["online-count-real"] });
      }
    });
  }, [enabled, qc]);

  const query = useQuery<OnlineProfile[]>({
    queryKey: ["live-online-users-list"],
    enabled,
    refetchInterval: 10_000,
    refetchOnWindowFocus: false,
    staleTime: 5_000,
    queryFn: async () => {
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const { data, error } = await (supabase as any)
        .from("profiles")
        .select(
          "id, user_id, username, display_name, name, avatar_url, is_creator, gender, profile_type, plan_type, is_seed, is_online, last_seen",
        )
        .eq("is_online", true)
        .gte("last_seen", fiveMinAgo)
        .not("username", "eq", "ocultomaster")
        .order("last_seen", { ascending: false })
        .limit(200);

      if (error) {
        console.warn("[LiveOnlineUsers] failed:", error.message);
        return [];
      }
      return ((data || []) as any[])
        .filter((p) => !p.is_seed)
        .map((p) => ({
          id: p.id,
          user_id: p.user_id ?? null,
          username: p.username ?? null,
          display_name: p.display_name ?? null,
          name: p.name ?? null,
          avatar_url: p.avatar_url ?? null,
          is_creator: !!p.is_creator,
          gender: p.gender ?? null,
          profile_type: p.profile_type ?? null,
          plan_type: p.plan_type ?? null,
        }));
    },
  });

  // Sincroniza o total local com o store global se o modal estiver aberto
  useEffect(() => {
    if (enabled && query.data !== undefined) {
      setCount(query.data.length);
    }
  }, [enabled, query.data, setCount]);

  return query;
}

export function LiveOnlineUsersDialog({ open, onOpenChange }: Props) {
  const navigate = useNavigate();
  const { data: users = [], isLoading } = useOnlineUsersList(open);
  const total = useMemo(() => users.length, [users]);

  const goToProfile = (u: OnlineProfile) => {
    if (!u.username) return;
    onOpenChange(false);
    navigate(`/u/${encodeURIComponent(u.username)}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-1rem)] sm:w-full max-w-md max-h-[90dvh] sm:max-h-[85dvh] flex flex-col p-3 sm:p-6 gap-3 overflow-hidden">
        <DialogHeader className="pr-8 shrink-0 min-w-0">
          <DialogTitle className="flex flex-wrap items-center gap-2 text-base sm:text-lg min-w-0">
            <Wifi className="h-5 w-5 text-emerald-500 shrink-0" />
            <span className="truncate min-w-0">Usuários online · {total}</span>
            <span className="ml-auto flex items-center gap-1 text-[10px] font-normal text-muted-foreground shrink-0">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              ao vivo
            </span>
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm">
            Toque em alguém para visitar o perfil. Atualização em tempo real.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 -mx-3 sm:-mx-6 px-3 sm:px-6 min-h-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : total === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground gap-2">
              <Users className="h-8 w-8 opacity-50" />
              <p className="text-sm">Ninguém online no momento.</p>
            </div>
          ) : (
            <ul className="divide-y divide-border/40">
              {users.map((u) => {
                const handle = u.username ? `@${u.username}` : "Misterioso(a)";
                const initial = (u.username || "U").slice(0, 1).toUpperCase();
                const disabled = !u.username;
                return (
                  <li key={u.id}>
                    <button
                      type="button"
                      onClick={() => goToProfile(u)}
                      disabled={disabled}
                      className="w-full flex items-center gap-3 py-2.5 text-left hover:bg-muted/40 rounded-md px-2 -mx-2 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      <div className="relative shrink-0">
                        <Avatar className="h-10 w-10">
                          <AvatarImage src={buildSupabaseImageThumb(u.avatar_url, { width: 96, quality: 70 }) || u.avatar_url || undefined} loading="lazy" />
                          <AvatarFallback className="text-xs">{initial}</AvatarFallback>
                        </Avatar>
                        <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-background" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{handle}</p>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          <PlanBadge profile={u} />
                          <GenderBadge profile={u} />
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

export default LiveOnlineUsersDialog;

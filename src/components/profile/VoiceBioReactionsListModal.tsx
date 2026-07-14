/**
 * VoiceBioReactionsListModal — exibe a lista de quem reagiu (only owner).
 * Mostra avatar + @username. Não exibe nome real.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ThumbsUp, ThumbsDown, User2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { fetchVoiceBioReactors, type VoiceBioReactor } from "@/hooks/useVoiceBioReactions";
import { supabase } from "@/lib/supabaseExternal";
import { subscribeTable } from "@/lib/realtimeBus";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ownerId: string;
  initialTab?: "like" | "dislike";
  counts?: { like: number; dislike: number };
}

export function VoiceBioReactionsListModal({ open, onOpenChange, ownerId, initialTab = "like", counts }: Props) {
  const navigate = useNavigate();
  const [tab, setTab] = useState<"like" | "dislike">(initialTab);
  const [items, setItems] = useState<VoiceBioReactor[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => { setTab(initialTab); }, [initialTab, open]);

  const reload = () => {
    if (!open) return;
    setLoading(true);
    fetchVoiceBioReactors(ownerId, tab)
      .then((rows) => setItems(rows))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    fetchVoiceBioReactors(ownerId, tab).then((rows) => {
      if (!cancelled) setItems(rows);
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, ownerId, tab]);

  // Realtime: atualiza a lista automaticamente quando alguém reagir.
  useEffect(() => {
    if (!open) return;
    const unsub = subscribeTable('oculto_voice_bio_reactions', (payload: any) => {
      const row = payload?.new ?? payload?.old;
      if (row?.owner_id !== ownerId) return;
      reload();
    });
    return () => { unsub(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ownerId, tab]);


  const go = (username: string | null) => {
    if (!username) return;
    onOpenChange(false);
    navigate(`/u/${encodeURIComponent(username)}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] sm:max-w-md max-h-[85dvh] p-0 overflow-hidden flex flex-col">
        <DialogHeader className="px-4 pt-4 pb-2">
          <DialogTitle className="text-base">Reações à sua bio de áudio</DialogTitle>
          <DialogDescription className="text-xs">Apenas você vê esta lista.</DialogDescription>
        </DialogHeader>

        <div className="px-4 pb-2 flex gap-2">
          <button
            onClick={() => setTab("like")}
            className={cn(
              "flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold",
              tab === "like" ? "border-emerald-500/60 bg-emerald-500/15 text-emerald-400" : "border-border/60 text-muted-foreground"
            )}
          >
            <ThumbsUp className="h-3.5 w-3.5" /> Likes {counts ? `(${counts.like})` : ""}
          </button>
          <button
            onClick={() => setTab("dislike")}
            className={cn(
              "flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold",
              tab === "dislike" ? "border-rose-500/60 bg-rose-500/15 text-rose-400" : "border-border/60 text-muted-foreground"
            )}
          >
            <ThumbsDown className="h-3.5 w-3.5" /> Deslikes {counts ? `(${counts.dislike})` : ""}
          </button>
        </div>

        <div
          className="flex-1 min-h-0 overflow-y-auto px-2 pb-3 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {loading && (
            <div className="text-center text-xs text-muted-foreground py-8">Carregando…</div>
          )}
          {!loading && items.length === 0 && (
            <div className="text-center text-xs text-muted-foreground py-8">
              Ninguém {tab === "like" ? "curtiu" : "desmarcou"} ainda.
            </div>
          )}
          {!loading && items.map((u) => (
            <button
              key={u.user_id}
              onClick={() => go(u.username)}
              className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-muted/40 text-left"
            >
              <Avatar className="h-10 w-10">
                <AvatarImage src={u.avatar_url || undefined} alt={u.username || "u"} />
                <AvatarFallback><User2 className="h-4 w-4 opacity-50" /></AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold truncate">@{u.username || "membro"}</p>
                <p className="text-[10px] text-muted-foreground">
                  {tab === "like" ? "Curtiu" : "Não curtiu"} em {new Date(u.reacted_at).toLocaleDateString("pt-BR")}
                </p>
              </div>
              {tab === "like"
                ? <ThumbsUp className="h-3.5 w-3.5 text-emerald-400" />
                : <ThumbsDown className="h-3.5 w-3.5 text-rose-400" />}
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default VoiceBioReactionsListModal;

/**
 * GiftSendersModal — Lista quem enviou presentes XP para um perfil.
 * Usa RPC pública `aura_xp_gifts_senders_for_profile`.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Gift, Zap, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabaseExternal";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";

export type GiftSender = {
  sender_profile_id: string;
  sender_user_id: string | null;
  username: string | null;
  name: string | null;
  avatar_url: string | null;
  total_xp: number;
  gifts_count: number;
  last_sent_at: string | null;
};

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  profileId: string | null;
  username?: string | null;
}

export function GiftSendersModal({ open, onOpenChange, profileId, username }: Props) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [senders, setSenders] = useState<GiftSender[]>([]);

  useEffect(() => {
    if (!open || !profileId) return;
    let alive = true;
    setLoading(true);
    (async () => {
      try {
        const { data, error } = await (supabase as any).rpc(
          "aura_xp_gifts_senders_for_profile",
          { p_profile_id: profileId, p_limit: 200 }
        );
        if (!alive) return;
        if (error) {
          console.warn("[GiftSendersModal]", error.message);
          setSenders([]);
        } else {
          setSenders((data || []) as GiftSender[]);
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [open, profileId]);

  const totalGifts = senders.reduce((acc, s) => acc + (s.gifts_count || 0), 0);
  const totalXp = senders.reduce((acc, s) => acc + (s.total_xp || 0), 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="
          w-[calc(100vw-1.5rem)] max-w-md
          p-4 sm:p-6
          gap-3 sm:gap-4
          max-h-[90dvh] flex flex-col
          rounded-2xl
        "
      >
        <DialogHeader className="space-y-1 pr-6">
          <DialogTitle className="flex items-start gap-2 text-sm sm:text-base leading-tight">
            <Gift className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
            <span className="min-w-0 break-all">
              Presentes recebidos{username ? (
                <>
                  {" por "}
                  <span className="font-semibold">@{username}</span>
                </>
              ) : ""}
            </span>
          </DialogTitle>
        </DialogHeader>

        {!loading && senders.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg bg-muted/40 px-3 py-2 text-[11px] sm:text-xs">
            <span className="font-semibold">{senders.length} remetente{senders.length === 1 ? "" : "s"}</span>
            <span className="inline-flex items-center gap-2 sm:gap-3">
              <span className="inline-flex items-center gap-1">
                <Gift className="h-3 w-3 text-amber-400" /> {totalGifts}
              </span>
              <span className="inline-flex items-center gap-1 text-amber-300">
                <Zap className="h-3 w-3" /> {totalXp} XP
              </span>
            </span>
          </div>
        )}

        <ScrollArea className="flex-1 min-h-0 -mr-2 pr-2 sm:pr-3">
          {loading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : senders.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              Ninguém enviou presentes ainda.
              <br />
              Seja a primeira pessoa a enviar um presente XP!
            </div>
          ) : (
            <ul className="divide-y divide-border/50">
              {senders.map((s) => {
                const initial = (s.username || s.name || "?").slice(0, 1).toUpperCase();
                const clickable = !!s.username;
                return (
                  <li key={s.sender_profile_id}>
                    <button
                      type="button"
                      onClick={() => {
                        if (!clickable) return;
                        onOpenChange(false);
                        navigate(`/u/${encodeURIComponent(s.username!)}`);
                      }}
                      className="w-full flex items-center gap-3 py-2.5 px-1 hover:bg-muted/40 rounded-md transition-colors text-left disabled:opacity-60 active:bg-muted/60"
                      disabled={!clickable}
                    >
                      <Avatar className="h-9 w-9 sm:h-10 sm:w-10 shrink-0">
                        <AvatarImage src={s.avatar_url || undefined} alt={s.username || "?"} />
                        <AvatarFallback>{initial}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold truncate">
                          {s.username ? `@${s.username}` : (s.name || "Usuário")}
                        </div>
                        <div className="text-[11px] text-muted-foreground inline-flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          <span className="inline-flex items-center gap-1">
                            <Gift className="h-3 w-3 text-amber-400" />
                            {s.gifts_count} presente{s.gifts_count === 1 ? "" : "s"}
                          </span>
                          <span className="inline-flex items-center gap-1 text-amber-300">
                            <Zap className="h-3 w-3" /> {s.total_xp} XP
                          </span>
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

export default GiftSendersModal;

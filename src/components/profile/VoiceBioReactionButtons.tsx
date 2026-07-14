/**
 * VoiceBioReactionButtons — botões 👍 / 👎 com contadores em tempo real.
 * Um clique por usuário (toggle/troca). O dono da bio vê um botão extra
 * "Ver quem" que abre a VoiceBioReactionsListModal.
 */
import { useState } from "react";
import { ThumbsUp, ThumbsDown, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useVoiceBioReactions } from "@/hooks/useVoiceBioReactions";
import { VoiceBioReactionsListModal } from "./VoiceBioReactionsListModal";
import { toast } from "sonner";

interface Props {
  ownerId: string;
  size?: "sm" | "md";
  className?: string;
}

export function VoiceBioReactionButtons({ ownerId, size = "sm", className }: Props) {
  const { user } = useAuth();
  const { likes, dislikes, my_reaction, busy, react } = useVoiceBioReactions(ownerId);
  const [listOpen, setListOpen] = useState(false);
  const [tab, setTab] = useState<"like" | "dislike">("like");
  const isOwner = !!user && user.id === ownerId;

  const handle = (r: "like" | "dislike") => {
    if (!user) { toast.error("Entre para reagir."); return; }
    if (isOwner) { toast.info("Você não pode reagir à sua própria bio."); return; }
    react(r);
  };

  const open = (r: "like" | "dislike") => { setTab(r); setListOpen(true); };

  const px = size === "md" ? "h-4 w-4" : "h-3.5 w-3.5";

  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <button
        type="button"
        disabled={busy}
        onClick={() => handle("like")}
        className={cn(
          "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold transition",
          my_reaction === "like"
            ? "border-emerald-500/60 bg-emerald-500/15 text-emerald-400"
            : "border-border/60 bg-background/60 text-muted-foreground hover:text-foreground"
        )}
        aria-label="Curtir bio de áudio"
      >
        <ThumbsUp className={px} /> {likes}
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => handle("dislike")}
        className={cn(
          "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold transition",
          my_reaction === "dislike"
            ? "border-rose-500/60 bg-rose-500/15 text-rose-400"
            : "border-border/60 bg-background/60 text-muted-foreground hover:text-foreground"
        )}
        aria-label="Não curtir bio de áudio"
      >
        <ThumbsDown className={px} /> {dislikes}
      </button>

      {isOwner && (likes + dislikes > 0) && (
        <button
          type="button"
          onClick={() => open("like")}
          className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary hover:bg-primary/20"
        >
          <Users className="h-3 w-3" /> Ver quem
        </button>
      )}

      {isOwner && (
        <VoiceBioReactionsListModal
          open={listOpen}
          onOpenChange={setListOpen}
          ownerId={ownerId}
          initialTab={tab}
          counts={{ like: likes, dislike: dislikes }}
        />
      )}
    </div>
  );
}

export default VoiceBioReactionButtons;

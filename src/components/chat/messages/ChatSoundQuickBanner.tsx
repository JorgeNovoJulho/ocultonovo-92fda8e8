import { useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  isChatSoundMuted,
  setChatSoundMuted,
  getChatVolume,
  playTestSound,
} from "@/lib/messageSound";

/**
 * Banner fixo (sticky) abaixo da busca do chat. Permite ao usuário ativar
 * ou desativar rapidamente o som de notificação de novas mensagens.
 */
export function ChatSoundQuickBanner() {
  const [muted, setMuted] = useState<boolean>(() => isChatSoundMuted());

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (!e.key || e.key !== "oculto.chat.mute") return;
      setMuted(isChatSoundMuted());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const toggle = () => {
    const next = !muted;
    setMuted(next);
    setChatSoundMuted(next);
    if (!next) playTestSound(getChatVolume());
  };

  return (
    <div
      className={cn(
        "sticky top-0 z-20 flex items-center justify-between gap-3 px-3 py-2",
        "border-b border-fuchsia-300/20",
        muted
          ? "bg-gradient-to-r from-amber-950/40 via-orange-950/30 to-background"
          : "bg-gradient-to-r from-fuchsia-950/40 via-pink-950/30 to-background",
      )}
      role="region"
      aria-label="Som de mensagens"
    >
      <div className="flex min-w-0 items-center gap-2">
        {muted ? (
          <BellOff className="h-4 w-4 shrink-0 text-amber-300" />
        ) : (
          <Bell className="h-4 w-4 shrink-0 text-fuchsia-200" />
        )}
        <div className="min-w-0">
          <p className="truncate text-[12px] font-bold leading-tight text-foreground">
            {muted ? "Som de mensagens desativado" : "Som de mensagens ativado"}
          </p>
          <p className="truncate text-[10.5px] text-muted-foreground">
            {muted
              ? "Você não receberá alertas sonoros de novas mensagens."
              : "Você ouvirá um aviso ao receber novas mensagens."}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={toggle}
        aria-pressed={!muted}
        className={cn(
          "shrink-0 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider transition-colors",
          muted
            ? "bg-amber-400/90 text-amber-950 hover:bg-amber-300"
            : "bg-fuchsia-500/90 text-white hover:bg-fuchsia-400",
        )}
      >
        {muted ? (
          <>
            <Bell className="h-3.5 w-3.5" />
            Ativar
          </>
        ) : (
          <>
            <BellOff className="h-3.5 w-3.5" />
            Desativar
          </>
        )}
      </button>
    </div>
  );
}

export default ChatSoundQuickBanner;

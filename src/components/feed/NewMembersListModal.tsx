import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { OnlineDot } from "@/components/ui/OnlineDot";
import { MapPin, User2, Sparkles, Gift } from "lucide-react";
import type { NewestMember } from "@/hooks/useNewestMembers";
import { AuraXpGiftModal } from "@/components/aura-match/AuraXpGiftModal";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

const GENDER_LABEL: Record<string, string> = {
  man: "Homem",
  woman: "Mulher",
  couple: "Casal",
  trans: "Trans",
  non_binary: "Não-binário",
  other: "Outro",
};

const TYPE_LABEL: Record<string, string> = {
  single: "Solteiro(a)",
  couple: "Casal",
  creator: "Criador(a)",
  vip: "VIP",
  premium: "Premium",
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  members: NewestMember[];
}

export function NewMembersListModal({ open, onOpenChange, members }: Props) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [giftOpen, setGiftOpen] = useState(false);
  const [giftTarget, setGiftTarget] = useState<NewestMember | null>(null);

  const go = (username: string) => {
    onOpenChange(false);
    navigate(`/u/${encodeURIComponent(username)}`);
  };

  const openGift = (m: NewestMember) => {
    setGiftTarget(m);
    setGiftOpen(true);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="
          p-0 overflow-hidden gap-0
          w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)]
          sm:w-full sm:max-w-lg
          max-h-[92dvh] sm:max-h-[85vh]
          flex flex-col
        "
      >
        <DialogHeader className="px-4 pt-4 pb-2 shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Sparkles className="w-4 h-4 text-primary" />
            Novos Misteriosos(as) do OCULTO
          </DialogTitle>
          <DialogDescription className="text-xs">
            Os {members.length} cadastros mais recentes. Dê as boas-vindas!
          </DialogDescription>
        </DialogHeader>

        <div
          className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-2 pb-3 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          <div className="flex flex-col gap-1.5">
            {members.map((m) => {
              const genderLbl = m.gender ? GENDER_LABEL[m.gender] || null : null;
              const typeLbl = m.profile_type ? TYPE_LABEL[m.profile_type] || null : null;
              const meta = [typeLbl, genderLbl].filter(Boolean).join(" • ");
              const isMe = user?.id === m.user_id;

              return (
                <div
                  key={m.id}
                  className="flex items-center gap-2 sm:gap-3 p-2 rounded-lg hover:bg-muted/40 transition-colors"
                >
                  <button
                    onClick={() => go(m.username)}
                    className="shrink-0 relative"
                    aria-label={`Abrir perfil de @${m.username}`}
                  >
                    <Avatar className="w-11 h-11 sm:w-12 sm:h-12 ring-2 ring-primary/40">
                      <AvatarImage src={m.avatar_url || undefined} alt={m.username} />
                      <AvatarFallback>
                        <User2 className="w-5 h-5 opacity-50" />
                      </AvatarFallback>
                    </Avatar>
                    <OnlineDot
                      user={{
                        is_online: m.is_online,
                        last_seen: m.last_seen,
                        show_online_status: m.show_online_status,
                      }}
                      size="sm"
                      positionClassName="absolute bottom-0 right-0"
                    />
                  </button>
                  <button
                    onClick={() => go(m.username)}
                    className="flex-1 min-w-0 text-left"
                  >
                    <div className="text-sm font-semibold truncate flex items-center gap-1.5">
                      @{m.username}
                      {/* Badge do contador persistente */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (isMe) {
                            onOpenChange(false);
                            navigate('/my-gifts');
                          }
                        }}
                        className={cn(
                          "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-muted border border-border text-[9px] font-bold transition-all",
                          isMe && "bg-amber-500/10 border-amber-500/30 text-amber-500 hover:scale-105"
                        )}
                        title={isMe ? "Ver meus presentes" : `@${m.username} recebeu ${m.gifts_received_count || 0} presentes`}
                      >
                        <Gift className="w-2.5 h-2.5" />
                        {m.gifts_received_count || 0}
                      </button>
                    </div>
                    {meta && (
                      <div className="text-[11px] text-muted-foreground truncate">{meta}</div>
                    )}
                    {m.address_city && (
                      <div className="text-[11px] text-muted-foreground truncate flex items-center gap-1">
                        <MapPin className="w-3 h-3 shrink-0" /> {m.address_city}
                      </div>
                    )}
                  </button>
                  <div className="flex items-center gap-1 shrink-0">
                    {!isMe && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 px-2 text-[11px] sm:text-xs border-amber-500/40 text-amber-300 hover:bg-amber-500/10"
                        onClick={() => openGift(m)}
                        aria-label={`Enviar presente para @${m.username}`}
                        title="Enviar presente de boas-vindas"
                      >
                        <Gift className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-8 px-2.5 text-[11px] sm:text-xs"
                      onClick={() => go(m.username)}
                    >
                      Abrir perfil
                    </Button>
                  </div>
                </div>
              );
            })}
            {members.length === 0 && (
              <div className="text-center text-sm text-muted-foreground py-8">
                Nenhum novo cadastro recente.
              </div>
            )}
          </div>
        </div>
      </DialogContent>

      {giftTarget && (
        <AuraXpGiftModal
          open={giftOpen}
          onOpenChange={(v) => { setGiftOpen(v); if (!v) setGiftTarget(null); }}
          lockedReceiver={{
            id: giftTarget.id,
            user_id: giftTarget.user_id,
            username: giftTarget.username,
            name: null,
            avatar_url: giftTarget.avatar_url,
          }}
          title="Presente de boas-vindas"
          contextLabel={`para @${giftTarget.username}`}
        />
      )}
    </Dialog>
  );
}

export default NewMembersListModal;

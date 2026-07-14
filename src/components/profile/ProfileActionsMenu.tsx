import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  MoreVertical,
  Star,
  MessageSquarePlus,
  ShieldCheck,
  StickyNote,
  Ban,
  ShieldOff,
  Flag,
  LifeBuoy,
  Loader2,
  Gift,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  useBlockContact,
  useUnblockContact,
  useIsBlocked,
} from "@/hooks/useBlockedContacts";
import { useQueryClient } from "@tanstack/react-query";
import { useProfile } from "@/hooks/useProfile";
import { supabase } from "@/lib/supabaseExternal";
import { ReportButton } from "@/components/safety/ReportButton";
import { RateProfileModal } from "@/components/profile/RateProfileModal";
import { WriteTestimonialModal } from "@/components/profile/WriteTestimonialModal";
import { AuraXpGiftModal } from "@/components/aura-match/AuraXpGiftModal";
import { useUserNotes } from "@/hooks/useUserNotes";
import { cn } from "@/lib/utils";

interface ProfileActionsMenuProps {
  profileId: string;
  username?: string | null;
  displayName: string;
  /** Visual: usar destaque grande (botão ao lado da foto) */
  highlighted?: boolean;
}

export function ProfileActionsMenu({
  profileId,
  username,
  displayName,
  highlighted,
}: ProfileActionsMenuProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { profile: me } = useProfile();
  const { isBlocked } = useIsBlocked(profileId);
  const blockContact = useBlockContact();
  const unblockContact = useUnblockContact();
  const blockingLoading = blockContact.isPending || unblockContact.isPending;
  const notes = useUserNotes();

  const [showBlockConfirm, setShowBlockConfirm] = useState(false);
  const [showRate, setShowRate] = useState(false);
  const [showWrite, setShowWrite] = useState(false);
  const [showGift, setShowGift] = useState(false);
  const [recommending, setRecommending] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const reportTriggerRef = useRef<HTMLButtonElement | null>(null);

  const handle = username ? `@${username}` : `@${displayName}`;
  const profileUrl = `${window.location.origin}/creator/${username || profileId}`;

  const handleBlockAction = async () => {
    try {
      if (isBlocked) {
        await unblockContact.mutateAsync(profileId);
        toast.success(`${handle} foi desbloqueado(a).`);
      } else {
        await blockContact.mutateAsync({ blockedUserId: profileId, blockType: "blocked" });
        queryClient.invalidateQueries({ queryKey: ["posts"] });
        queryClient.invalidateQueries({ queryKey: ["conversations"] });
        queryClient.invalidateQueries({ queryKey: ["creator-posts"] });
        queryClient.invalidateQueries({ queryKey: ["profile-testimonials", profileId] });
        toast.success(`${handle} foi bloqueado(a).`);
      }
    } catch {
      toast.error("Não foi possível concluir a ação. Tente novamente.");
    } finally {
      setShowBlockConfirm(false);
    }
  };

  const triggerReport = () => {
    window.setTimeout(() => reportTriggerRef.current?.click(), 50);
  };

  const handleRecommendReal = async () => {
    if (!me?.id) {
      toast.error("Faça login para recomendar.");
      return;
    }
    if (me.id === profileId) {
      toast.error("Você não pode se recomendar.");
      return;
    }
    setRecommending(true);
    try {
      const { error } = await (supabase as any)
        .from("oculto_real_recommendations")
        .insert({ recommender_profile_id: me.id, target_profile_id: profileId });
      if (error && (error as any).code !== "23505") throw error;
      queryClient.invalidateQueries({ queryKey: ["profile-recommendations", profileId] });
      toast.success(`Você marcou ${handle} como pessoa real.`);
    } catch (e: any) {
      const rawMessage = String(e?.message || "");
      if (/actor_id/i.test(rawMessage) && /notifications/i.test(rawMessage)) {
        toast.error("Não foi possível concluir a notificação agora. Tente novamente em alguns instantes.");
      } else {
        toast.error(rawMessage || "Erro ao marcar como pessoa real.");
      }
    } finally {
      setRecommending(false);
    }
  };

  const handleSendToNotepad = async () => {
    if (!me?.id) {
      toast.error("Faça login para salvar no bloco de notas.");
      return;
    }
    setSavingNote(true);
    try {
      await notes.create.mutateAsync({
        title: `Perfil ${handle}`,
        content: profileUrl,
        color_tag: "blue",
      });
      toast.success("Perfil salvo no bloco de notas!", {
        action: {
          label: "Abrir",
          onClick: () => window.dispatchEvent(new CustomEvent("oculto:open-notepad")),
        },
      });
    } catch {
      /* toast no hook */
    } finally {
      setSavingNote(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Mais ações do perfil"
            className={cn(
              "relative isolate transition-transform active:scale-95",
              highlighted
                ? [
                    "h-11 w-11 rounded-full",
                    "bg-gradient-to-br from-fuchsia-500 via-pink-500 to-amber-400",
                    "text-white ring-2 ring-pink-400/70 ring-offset-2 ring-offset-background",
                    "shadow-[0_0_24px_-2px_rgba(236,72,153,0.85)]",
                    "hover:brightness-110 hover:scale-105",
                    "before:absolute before:inset-0 before:rounded-full before:bg-pink-500/40 before:animate-ping before:-z-10",
                  ].join(" ")
                : "h-8 w-8 text-muted-foreground hover:text-primary",
            )}
          >
            <MoreVertical className={cn("drop-shadow", highlighted ? "h-6 w-6" : "h-4 w-4")} strokeWidth={highlighted ? 2.75 : 2} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setShowRate(true); }}>
            <Star className="h-4 w-4 mr-2 text-amber-400" /> Avaliar o perfil
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setShowWrite(true); }}>
            <MessageSquarePlus className="h-4 w-4 mr-2" /> Escrever depoimento
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setShowGift(true); }}>
            <Gift className="h-4 w-4 mr-2 text-amber-400" /> Enviar presente
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={(e) => { e.preventDefault(); handleRecommendReal(); }}
            disabled={recommending}
          >
            {recommending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <ShieldCheck className="h-4 w-4 mr-2 text-emerald-400" />
            )}
            Marcar como pessoa real
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={(e) => { e.preventDefault(); handleSendToNotepad(); }}
            disabled={savingNote}
          >
            {savingNote ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <StickyNote className="h-4 w-4 mr-2" />
            )}
            Enviar perfil para o bloco de notas
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem
            onSelect={(e) => { e.preventDefault(); setShowBlockConfirm(true); }}
            disabled={blockingLoading}
            className={isBlocked ? "" : "text-destructive focus:text-destructive"}
          >
            {blockingLoading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : isBlocked ? (
              <ShieldOff className="h-4 w-4 mr-2" />
            ) : (
              <Ban className="h-4 w-4 mr-2" />
            )}
            {isBlocked ? "Desbloquear usuário" : "Bloquear usuário"}
          </DropdownMenuItem>

          <DropdownMenuItem
            onSelect={(e) => { e.preventDefault(); triggerReport(); }}
            className="text-destructive focus:text-destructive"
          >
            <Flag className="h-4 w-4 mr-2" /> Denunciar usuário
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem onSelect={(e) => { e.preventDefault(); navigate("/support"); }}>
            <LifeBuoy className="h-4 w-4 mr-2" /> Feedback
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Modais */}
      <RateProfileModal
        open={showRate}
        onClose={() => setShowRate(false)}
        targetProfileId={profileId}
        displayHandle={handle}
      />
      <WriteTestimonialModal
        open={showWrite}
        onClose={() => setShowWrite(false)}
        targetProfileId={profileId}
        displayHandle={handle}
      />
      <AuraXpGiftModal
        open={showGift}
        onOpenChange={setShowGift}
        lockedReceiver={{
          id: profileId,
          user_id: null,
          username: username ?? null,
          name: null,
          avatar_url: null,
        }}
        title={`Enviar presente para ${handle}`}
      />

      {/* Block / Unblock confirm */}
      <AlertDialog open={showBlockConfirm} onOpenChange={setShowBlockConfirm}>
        <AlertDialogContent className="w-[calc(100vw-1rem)] sm:w-auto max-w-sm rounded-2xl p-4 sm:p-6">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {isBlocked ? "Desbloquear" : "Bloquear"} {handle}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {isBlocked
                ? `${handle} poderá ver seu perfil, enviar mensagens e te seguir novamente.`
                : `${handle} não poderá ver seu perfil, enviar mensagens ou te seguir. Você também deixará de ver o conteúdo dele.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBlockAction}
              className={
                isBlocked
                  ? ""
                  : "bg-destructive text-destructive-foreground hover:bg-destructive/90"
              }
            >
              {isBlocked ? "Desbloquear" : "Bloquear"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ReportButton oculto — abrimos via ref ao clicar no item do menu */}
      <div className="sr-only" aria-hidden>
        <button
          ref={reportTriggerRef}
          type="button"
          onClick={(e) => {
            const span = (e.currentTarget.nextElementSibling as HTMLElement) || null;
            const inner = span?.querySelector<HTMLElement>("button");
            inner?.click();
          }}
        />
        <span>
          <ReportButton targetType="user" targetUserId={profileId} variant="icon" />
        </span>
      </div>
    </>
  );
}

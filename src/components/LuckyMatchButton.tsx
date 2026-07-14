import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useLuckyMatch, type LuckyCandidate } from "@/hooks/useChatEnhancements";
import { Sparkles, Loader2, Heart, User, Play, Pause, Mic } from "lucide-react";
import { cn } from "@/lib/utils";
import confetti from "canvas-confetti";
import { motion, AnimatePresence } from "framer-motion";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { buildSupabaseImageThumb } from "@/lib/imageTransform";
import { useNavigate } from "react-router-dom";
import { OnlineDot } from "@/components/ui/OnlineDot";
import { getGenderLabel } from "@/lib/profileFormat";
import { supabase } from "@/lib/supabaseExternal";


interface LuckyMatchButtonProps {
  variant?: "default" | "compact" | "floating";
  className?: string;
  /** Pool of candidates already filtered by the current radar radius. */
  candidates?: LuckyCandidate[];
}

export function LuckyMatchButton({ variant = "default", className, candidates }: LuckyMatchButtonProps) {
  const [showResult, setShowResult] = useState(false);
  const [matchedProfile, setMatchedProfile] = useState<any>(null);
  const luckyMatch = useLuckyMatch();
  const navigate = useNavigate();

  const triggerConfetti = () => {
    const duration = 3000;
    const end = Date.now() + duration;

    const colors = ['#FF007F', '#FFD700', '#00D4FF', '#FF6B6B'];

    (function frame() {
      confetti({
        particleCount: 4,
        angle: 60,
        spread: 55,
        origin: { x: 0, y: 0.8 },
        colors: colors,
      });
      confetti({
        particleCount: 4,
        angle: 120,
        spread: 55,
        origin: { x: 1, y: 0.8 },
        colors: colors,
      });

      if (Date.now() < end) {
        requestAnimationFrame(frame);
      }
    })();
  };

  const handleClick = async () => {
    try {
      const result = await luckyMatch.mutateAsync({ candidates });
      if (result) {
        setMatchedProfile(result);
        setShowResult(true);
        triggerConfetti();
      }
    } catch (error) {
      // Error handled by mutation
    }
  };

  const handleViewProfile = () => {
    if (matchedProfile) {
      navigate(`/creator/${matchedProfile.id}`);
      setShowResult(false);
    }
  };

  const handleSendMessage = () => {
    if (matchedProfile) {
      navigate(`/messages?to=${matchedProfile.id}`);
      setShowResult(false);
    }
  };

  if (variant === "floating") {
    return (
      <>
        <motion.div
          className={cn("fixed bottom-24 right-4 z-40", className)}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.95 }}
        >
          <Button
            onClick={handleClick}
            disabled={luckyMatch.isPending}
            className="h-14 w-14 rounded-full bg-gradient-to-r from-[#FF007F] via-[#FFD700] to-[#FF007F] shadow-lg shadow-primary/30 hover:shadow-xl hover:shadow-primary/40 transition-all"
          >
            {luckyMatch.isPending ? (
              <Loader2 className="h-6 w-6 animate-spin text-white" />
            ) : (
              <Sparkles className="h-6 w-6 text-white" />
            )}
          </Button>
        </motion.div>

        <MatchResultDialog
          open={showResult}
          onOpenChange={setShowResult}
          profile={matchedProfile}
          onViewProfile={handleViewProfile}
          onSendMessage={handleSendMessage}
        />
      </>
    );
  }

  if (variant === "compact") {
    return (
      <>
        <Button
          onClick={handleClick}
          disabled={luckyMatch.isPending}
          variant="outline"
          size="sm"
          className={cn(
            "gap-2 border-[#FFD700]/50 text-[#FFD700] hover:bg-[#FFD700]/10",
            className
          )}
        >
          {luckyMatch.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          Sorte
        </Button>

        <MatchResultDialog
          open={showResult}
          onOpenChange={setShowResult}
          profile={matchedProfile}
          onViewProfile={handleViewProfile}
          onSendMessage={handleSendMessage}
        />
      </>
    );
  }

  return (
    <>
      <motion.div
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        className={className}
      >
        <Button
          onClick={handleClick}
          disabled={luckyMatch.isPending}
          className="w-full gap-3 py-6 text-lg font-bold bg-gradient-to-r from-[#FF007F] via-[#FFD700] to-[#FF007F] bg-[length:200%_100%] animate-gradient-x hover:opacity-90 transition-opacity"
        >
          {luckyMatch.isPending ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              Procurando...
            </>
          ) : (
            <>
              <Sparkles className="h-5 w-5" />
              Estou com Sorte!
            </>
          )}
        </Button>
      </motion.div>

      <MatchResultDialog
        open={showResult}
        onOpenChange={setShowResult}
        profile={matchedProfile}
        onViewProfile={handleViewProfile}
        onSendMessage={handleSendMessage}
      />
    </>
  );
}

interface MatchResultDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile: any;
  onViewProfile: () => void;
  onSendMessage: () => void;
}

function MatchResultDialog({
  open,
  onOpenChange,
  profile,
  onViewProfile,
  onSendMessage
}: MatchResultDialogProps) {
  const [voiceBio, setVoiceBio] = useState<{ url: string | null; duration: number | null }>({ url: null, duration: null });
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Busca a bio de áudio do perfil sorteado (quando o modal abre).
  useEffect(() => {
    let cancelled = false;
    setVoiceBio({ url: null, duration: null });
    setPlaying(false);
    setProgress(0);
    if (!open || !profile?.id) return;
    (async () => {
      try {
        const { data } = await (supabase as any)
          .from('profiles')
          .select('voice_bio_url, voice_bio_duration')
          .or(`id.eq.${profile.id},user_id.eq.${profile.id}`)
          .limit(1)
          .maybeSingle();
        if (cancelled || !data?.voice_bio_url) return;
        setVoiceBio({ url: data.voice_bio_url, duration: data.voice_bio_duration ?? null });
      } catch { /* silencioso */ }
    })();
    return () => { cancelled = true; };
  }, [open, profile?.id]);

  // Limpa o áudio quando fecha o modal.
  useEffect(() => {
    if (!open && audioRef.current) {
      try { audioRef.current.pause(); } catch { /* noop */ }
      setPlaying(false);
      setProgress(0);
    }
  }, [open]);

  const togglePlay = () => {
    const el = audioRef.current;
    if (!el) return;
    if (playing) { el.pause(); setPlaying(false); }
    else { el.play().then(() => setPlaying(true)).catch(() => setPlaying(false)); }
  };

  if (!profile) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="
          w-[calc(100vw-0.75rem)] sm:w-full max-w-[96vw] sm:max-w-md
          max-h-[92dvh] sm:max-h-[90vh] overflow-y-auto
          p-4 sm:p-6 rounded-2xl z-[700]
          [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden
        "
      >
        <DialogHeader>
          <DialogTitle className="text-center flex items-center justify-center gap-2 text-base sm:text-lg">
            <Sparkles className="h-5 w-5 text-[#FFD700]" />
            Match Encontrado!
          </DialogTitle>
        </DialogHeader>

        <AnimatePresence>
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: "spring", duration: 0.5 }}
            className="flex flex-col items-center gap-3 sm:gap-4 pt-3 sm:pt-4"
          >
            {/* Avatar with glow effect */}
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-[#FF007F] to-[#FFD700] rounded-full blur-xl opacity-50 animate-pulse" />
              <Avatar className="h-20 w-20 sm:h-24 sm:w-24 border-4 border-background relative z-10">
                <AvatarImage src={buildSupabaseImageThumb(profile.avatar_url, { width: 256, quality: 75 }) || profile.avatar_url} alt={profile.username ? `@${profile.username}` : 'Perfil'} />
                <AvatarFallback className="text-xl sm:text-2xl bg-gradient-to-br from-primary to-secondary text-white">
                  {(profile.username || 'U').charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <OnlineDot
                user={profile as any}
                size="xl"
                positionClassName="absolute bottom-1 right-1 z-20"
                className="border-4"
              />
            </div>

            {/* Profile Info */}
            <div className="text-center px-2">
              <h3 className="text-lg sm:text-xl font-bold truncate max-w-[80vw] sm:max-w-[320px]">
                {profile.username ? `@${profile.username}` : 'Misterioso(a)'}
              </h3>
              {profile.bio && (
                <p className="text-xs sm:text-sm text-muted-foreground mt-1 line-clamp-2 max-w-[80vw] sm:max-w-[280px]">
                  {profile.bio}
                </p>
              )}
            </div>

            {/* Voice bio player — só renderiza quando existe gravação */}
            {voiceBio.url && (
              <div className="w-full max-w-sm rounded-xl border border-primary/30 bg-gradient-to-br from-primary/10 to-secondary/10 p-2.5 sm:p-3 flex items-center gap-2.5 sm:gap-3">
                <button
                  type="button"
                  onClick={togglePlay}
                  className="h-10 w-10 rounded-full flex items-center justify-center shrink-0 bg-primary text-primary-foreground hover:bg-primary/90 transition"
                  aria-label={playing ? "Pausar bio em áudio" : "Reproduzir bio em áudio"}
                >
                  {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-[10px] sm:text-[11px] text-primary font-semibold uppercase tracking-wider">
                    <Mic className="h-3 w-3" /> Bio em áudio
                    {voiceBio.duration ? (
                      <span className="text-muted-foreground font-normal">· {voiceBio.duration}s</span>
                    ) : null}
                  </div>
                  <div className="mt-1.5 h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-primary transition-[width] duration-150"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
                <audio
                  ref={audioRef}
                  src={voiceBio.url}
                  preload="metadata"
                  onTimeUpdate={(e) => {
                    const a = e.currentTarget;
                    if (a.duration > 0) setProgress((a.currentTime / a.duration) * 100);
                  }}
                  onEnded={() => { setPlaying(false); setProgress(0); }}
                />
              </div>
            )}

            {/* Compatibility + gender */}
            <div className="flex flex-wrap items-center justify-center gap-2 w-full">
              <div className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full bg-[#FF007F]/10 border border-[#FF007F]/20">
                <Heart className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-[#FF007F] fill-[#FF007F]" />
                <span className="text-xs sm:text-sm font-semibold text-[#FF007F]">
                  {profile.compatibility_score ?? 0}% de afinidade
                </span>
              </div>
              {(() => {
                const label = getGenderLabel(profile.gender, profile.profile_type);
                if (!label) return null;
                return (
                  <div className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full bg-primary/10 border border-primary/20">
                    <User className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary" />
                    <span className="text-xs sm:text-sm font-semibold text-primary">{label}</span>
                  </div>
                );
              })()}
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col-reverse sm:flex-row gap-2 w-full mt-1">
              <Button
                variant="outline"
                onClick={onViewProfile}
                className="flex-1 h-10"
              >
                Ver Perfil
              </Button>
              <Button
                onClick={onSendMessage}
                className="flex-1 h-10 bg-gradient-to-r from-primary to-secondary text-white font-semibold"
              >
                Enviar Mensagem
              </Button>
            </div>
          </motion.div>
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}

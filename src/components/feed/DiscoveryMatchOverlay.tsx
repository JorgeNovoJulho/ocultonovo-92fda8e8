/**
 * DiscoveryMatchOverlay — celebração de match recíproco vindo da sessão
 * "Explorar misteriosos(as)". Flat, sem box-shadow pesado.
 */
import { memo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Sparkles, MessageCircle, UserPlus, X } from 'lucide-react';
import { supabase } from '@/lib/supabaseExternal';
import { useNavigate } from 'react-router-dom';
import { useToggleFollow, useIsFollowing } from '@/hooks/useFollows';
import { useAuth } from '@/hooks/useAuth';
import { useMatchNotification } from '@/hooks/useMatchNotification';
import { toast } from 'sonner';

interface DiscoveryMatchOverlayProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  myAvatar: string | null;
  myName: string | null;
  other: {
    profileId: string;
    userId: string | null;
    name: string;
    username: string | null;
    avatar: string | null;
  } | null;
  matchId: string | null;
}

const MATCH_MESSAGES = [
  '💜 Nossa energia se cruzou no Oculto… quero saber mais sobre você.',
  '⚡ Vocês sentiram a mesma energia. Bora trocar uma ideia?',
  '🔥 Match! Comecei a curiosidade — me conta um pouco de você.',
];

function DiscoveryMatchOverlayBase({
  open, onOpenChange, myAvatar, myName, other, matchId,
}: DiscoveryMatchOverlayProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data: isFollowing } = useIsFollowing(other?.profileId ?? '');
  const toggleFollow = useToggleFollow();
  const { playMatchAlert } = useMatchNotification();

  // Dispara som + vibração quando o overlay abre
  useEffect(() => {
    if (open && other) {
      playMatchAlert();
    }
  }, [open, other?.profileId, playMatchAlert]);

  if (!other) return null;

  const handleFollow = () => {
    if (!other.profileId) return;
    toggleFollow.mutate({ targetProfileId: other.profileId, isFollowing: !!isFollowing });
  };

  const handleMessage = async () => {
    if (!user?.id || !other.userId) {
      toast.error('Não foi possível abrir o chat agora.');
      return;
    }
    try {
      const { data: convId, error } = await (supabase as any).rpc('get_or_create_conversation', {
        p_user1_id: user.id,
        p_user2_id: other.userId,
      });
      if (error || !convId) throw error || new Error('no_conv');
      const text = MATCH_MESSAGES[Math.floor(Math.random() * MATCH_MESSAGES.length)];
      // Insere mensagem inicial com tag de contexto
      await (supabase as any).from('messages').insert({
        conversation_id: convId,
        sender_id: user.id,
        content: text,
      });
      onOpenChange(false);
      navigate(`/chat/${convId}`);
    } catch (e: any) {
      toast.error('Não foi possível abrir o chat agora.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm overflow-hidden border-0 p-0 bg-transparent shadow-none">
        {/* Camada de brilho de fundo */}
        <div className="relative overflow-hidden rounded-2xl border border-violet-400/30 bg-[radial-gradient(ellipse_at_top,_rgba(168,85,247,0.35),_transparent_60%),linear-gradient(180deg,#1a0a2e_0%,#0b0420_100%)]">
          {/* orbes decorativos */}
          <div className="pointer-events-none absolute -top-16 -left-16 h-48 w-48 rounded-full bg-violet-500/25 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 -right-16 h-56 w-56 rounded-full bg-fuchsia-500/20 blur-3xl" />
          {/* grão sutil */}
          <div className="pointer-events-none absolute inset-0 opacity-[0.04] mix-blend-overlay [background-image:radial-gradient(rgba(255,255,255,0.6)_1px,transparent_1px)] [background-size:3px_3px]" />

          <button
            onClick={() => onOpenChange(false)}
            className="absolute right-3 top-3 z-10 rounded-full p-1.5 text-foreground/60 backdrop-blur-sm transition-colors hover:bg-white/10 hover:text-foreground"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="relative flex flex-col items-center gap-3 px-6 pb-6 pt-7">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-violet-300/30 bg-violet-500/15 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-violet-100 backdrop-blur-sm">
              <Sparkles className="h-3 w-3" />
              Nova conexão detectada
            </div>

            <DialogTitle className="bg-gradient-to-r from-violet-200 via-fuchsia-200 to-violet-200 bg-clip-text text-center text-xl font-bold leading-tight text-transparent">
              Vocês sentiram a mesma energia
            </DialogTitle>
            <DialogDescription className="max-w-[260px] text-center text-xs leading-relaxed text-foreground/65">
              Descoberto em <strong className="text-violet-200">Explorar misteriosos(as)</strong>. Comece a conversa antes que a chama esfrie.
            </DialogDescription>

            {/* Dois avatares com chama central */}
            <div className="relative flex items-center justify-center py-3">
              {/* halo pulsante */}
              <div className="absolute inset-0 -m-2 rounded-full bg-violet-500/10 blur-2xl animate-pulse" />

              <div className="relative -mr-4">
                <div className="absolute inset-0 -m-0.5 rounded-full bg-gradient-to-br from-violet-400 to-violet-600 blur-[2px]" />
                <Avatar className="relative h-24 w-24 ring-2 ring-violet-300/70 ring-offset-2 ring-offset-[#1a0a2e]">
                  <AvatarImage src={myAvatar ?? undefined} alt={myName ?? ''} className="object-cover" />
                  <AvatarFallback className="bg-violet-900 text-violet-100">{(myName ?? 'V')[0]}</AvatarFallback>
                </Avatar>
              </div>

              <div className="relative z-10 -mx-2 rounded-full border border-violet-200/30 bg-gradient-to-br from-violet-400 to-fuchsia-500 p-2 shadow-[0_0_20px_rgba(217,70,239,0.6)]">
                <Sparkles className="h-4 w-4 text-white" />
              </div>

              <div className="relative -ml-4">
                <div className="absolute inset-0 -m-0.5 rounded-full bg-gradient-to-br from-fuchsia-400 to-fuchsia-600 blur-[2px]" />
                <Avatar className="relative h-24 w-24 ring-2 ring-fuchsia-300/70 ring-offset-2 ring-offset-[#1a0a2e]">
                  <AvatarImage src={other.avatar ?? undefined} alt={other.username ? `@${other.username}` : 'usuário'} className="object-cover" />
                  <AvatarFallback className="bg-fuchsia-900 text-fuchsia-100">{(other.username || '?')[0]?.toUpperCase()}</AvatarFallback>
                </Avatar>
              </div>
            </div>

            <p className="text-base font-bold tracking-tight text-foreground">
              @{other.username ?? 'misterioso'}
            </p>

            <div className="mt-1 grid w-full grid-cols-2 gap-2.5">
              <Button
                onClick={handleFollow}
                disabled={toggleFollow.isPending}
                className={
                  isFollowing
                    ? 'gap-1.5 h-11 rounded-xl border border-violet-300/40 bg-white/5 font-semibold text-violet-100 backdrop-blur-sm hover:bg-white/10'
                    : 'gap-1.5 h-11 rounded-xl border border-violet-300/40 bg-white/5 font-semibold text-violet-100 backdrop-blur-sm hover:bg-violet-500/20'
                }
              >
                <UserPlus className="h-4 w-4" />
                {isFollowing ? 'Seguindo' : 'Adicionar'}
              </Button>
              <Button
                onClick={handleMessage}
                className="gap-1.5 h-11 rounded-xl bg-gradient-to-r from-violet-500 via-fuchsia-500 to-pink-500 font-semibold text-white shadow-[0_8px_24px_-8px_rgba(217,70,239,0.7)] transition-transform hover:scale-[1.02] hover:from-violet-600 hover:via-fuchsia-600 hover:to-pink-600"
              >
                <MessageCircle className="h-4 w-4" />
                Mensagem
              </Button>
            </div>

            <Link
              to="/matches"
              onClick={() => onOpenChange(false)}
              className="pt-2 text-[11px] font-medium text-foreground/55 underline-offset-4 transition-colors hover:text-violet-200 hover:underline"
            >
              Ver todos os matches
            </Link>
          </div>
        </div>
      </DialogContent>

    </Dialog>
  );
}

export const DiscoveryMatchOverlay = memo(DiscoveryMatchOverlayBase);

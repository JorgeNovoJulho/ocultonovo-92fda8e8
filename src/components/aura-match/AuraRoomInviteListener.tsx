import { memo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import * as VisuallyHidden from '@radix-ui/react-visually-hidden';
import { Check, X, User, Sparkles } from 'lucide-react';
import { useAuraRoomInvites } from '@/hooks/useAuraRoomInvites';
import { toast } from 'sonner';

/**
 * Listener GLOBAL — montado uma vez (ex: no DashboardLayout).
 * Mostra o convite mais recente como modal flutuante e empilha os próximos.
 */
function AuraRoomInviteListenerImpl() {
  const navigate = useNavigate();
  const { invites, respond } = useAuraRoomInvites();
  const [busyId, setBusyId] = useState<string | null>(null);
  const top = invites[0];

  if (!top) return null;

  const planTone =
    (top.from_plan || '').toLowerCase().includes('vip')
      ? 'from-amber-400/30 to-fuchsia-500/30'
      : 'from-fuchsia-500/20 to-violet-500/20';

  const handleAccept = async () => {
    setBusyId(top.id);
    const r = await respond(top.id, 'accept');
    setBusyId(null);
    if (r?.ok && r.slug) {
      toast.success('Você entrou na sala');
      navigate('/aura-match');
    } else {
      toast.error('Convite expirado');
    }
  };
  const handleIgnore = async () => {
    setBusyId(top.id);
    await respond(top.id, 'ignore');
    setBusyId(null);
  };
  const handleProfile = () => {
    navigate(`/profile/${top.from_user}`);
  };

  return (
    <Dialog open={!!top} onOpenChange={(v) => { if (!v) handleIgnore(); }}>
      <DialogContent
        className={`max-w-sm overflow-hidden border-white/10 bg-gradient-to-br ${planTone} backdrop-blur-xl`}
      >
        <VisuallyHidden.Root><DialogTitle>Conteúdo</DialogTitle><DialogDescription>Diálogo</DialogDescription></VisuallyHidden.Root>
        <div className="absolute inset-0 -z-10 bg-[#0b0420]/80" />
        <div className="flex flex-col items-center gap-3 p-1 text-center">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] text-fuchsia-200">
            <Sparkles className="h-3 w-3" /> Convite para sala
          </div>

          <div className="relative">
            <span className="absolute inset-0 -m-2 rounded-full bg-fuchsia-500/30 blur-xl" />
            <Avatar className="relative h-20 w-20 ring-2 ring-fuchsia-400/60">
              <AvatarImage src={top.from_avatar || undefined} alt={top.from_name || ''} />
              <AvatarFallback>{(top.from_name || top.from_username || '?').slice(0, 1)}</AvatarFallback>
            </Avatar>
          </div>

          <div>
            <p className="text-sm font-semibold text-foreground">
              {top.from_name || 'Alguém'}{' '}
              <span className="text-fuchsia-300/80 font-normal">
                @{top.from_username || '—'}
              </span>
            </p>
            <p className="text-[11px] text-muted-foreground">te chamou para entrar em</p>
            <p className="mt-0.5 text-base font-bold text-fuchsia-200">{top.room_name || top.room_slug}</p>
          </div>

          {top.reason && (
            <p className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-[11.5px] italic text-foreground/80">
              "{top.reason}"
            </p>
          )}

          <div className="grid w-full grid-cols-3 gap-2 pt-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={handleProfile}
              disabled={busyId === top.id}
              className="flex h-auto flex-col gap-0.5 py-2 text-[10px]"
            >
              <User className="h-4 w-4" /> Ver perfil
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleIgnore}
              disabled={busyId === top.id}
              className="flex h-auto flex-col gap-0.5 py-2 text-[10px] text-muted-foreground"
            >
              <X className="h-4 w-4" /> Ignorar
            </Button>
            <Button
              size="sm"
              onClick={handleAccept}
              disabled={busyId === top.id}
              className="flex h-auto flex-col gap-0.5 bg-fuchsia-500 py-2 text-[10px] hover:bg-fuchsia-400"
            >
              <Check className="h-4 w-4" /> Aceitar
            </Button>
          </div>

          {invites.length > 1 && (
            <p className="text-[10px] text-muted-foreground">
              +{invites.length - 1} outro{invites.length > 2 ? 's' : ''} convite{invites.length > 2 ? 's' : ''} aguardando
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export const AuraRoomInviteListener = memo(AuraRoomInviteListenerImpl);

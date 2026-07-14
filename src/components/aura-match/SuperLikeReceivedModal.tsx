import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Heart, X, Sparkles, User } from 'lucide-react';
import { supabase } from '@/lib/supabaseExternal';
import { subscribeTable } from '@/lib/realtimeBus';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

interface IncomingSuper {
  notificationId: string;
  senderProfileId: string;
  senderName: string | null;
  senderAvatar: string | null;
}

/**
 * Escuta notificações `super_like_received` e abre um modal pedindo
 * confirmação. Aceitar = curte de volta (cria match). Ignorar = nada.
 */
export function SuperLikeReceivedListener() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [incoming, setIncoming] = useState<IncomingSuper | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    const unsub = subscribeTable('notifications', (payload: any) => {
      if (payload?.eventType !== 'INSERT') return;
      const n = payload.new;
      if (!n || n.user_id !== user.id) return;
      if (n?.type !== 'super_like_received') return;
      const data = n.data || {};
      setIncoming({
        notificationId: n.id,
        senderProfileId: data.sender_profile_id,
        senderName: data.sender_name || null,
        senderAvatar: data.sender_avatar || null,
      });
    }, { events: ['INSERT'] });
    return () => { unsub(); };
  }, [user?.id]);


  const close = () => setIncoming(null);

  const accept = async () => {
    if (!incoming || !user?.id) return;
    setLoading(true);
    try {
      // Resolve my profile id
      const { data: me } = await supabase
        .from('profiles')
        .select('id')
        .or(`user_id.eq.${user.id},id.eq.${user.id}`)
        .maybeSingle();
      if (!me?.id) throw new Error('Perfil não encontrado');

      // Curtir de volta — vai disparar a lógica de match mútuo no backend
      await (supabase as any).from('profile_likes').upsert(
        { sender_id: me.id, receiver_id: incoming.senderProfileId },
        { onConflict: 'sender_id,receiver_id' },
      );
      await (supabase as any).from('perfect_pair_actions').upsert(
        {
          user_id: me.id,
          target_id: incoming.senderProfileId,
          action_type: 'like',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,target_id' },
      );

      toast.success('💕 Match confirmado! Vá para Matches.');
      close();
      navigate('/matches');
    } catch (e: any) {
      toast.error(e.message || 'Erro ao confirmar');
    } finally {
      setLoading(false);
    }
  };

  if (!incoming) return null;

  return (
    <Dialog open={!!incoming} onOpenChange={(v) => !v && close()}>
      <DialogContent className="max-w-sm rounded-2xl border-amber-400/30 bg-[#0b0420] text-foreground">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-amber-400" /> Você recebeu um Super DM!
          </DialogTitle>
          <DialogDescription>
            Alguém pagou para destacar o interesse em você. Quer confirmar o match?
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center gap-3 py-2">
          <Avatar className="h-24 w-24 ring-4 ring-amber-400/40">
            <AvatarImage src={incoming.senderAvatar || undefined} />
            <AvatarFallback>{incoming.senderName?.slice(0, 1) || '?'}</AvatarFallback>
          </Avatar>
          <div className="text-center">
            <div className="text-lg font-semibold">{incoming.senderName || 'Alguém especial'}</div>
            <div className="text-xs text-muted-foreground">Te mandou um Super DM 💎</div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Button variant="outline" onClick={close} disabled={loading}>
            <X className="mr-1 h-4 w-4" /> Ignorar
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              navigate(`/profile/${incoming.senderProfileId}`);
              close();
            }}
            disabled={loading}
          >
            <User className="mr-1 h-4 w-4" /> Ver perfil
          </Button>
          <Button onClick={accept} disabled={loading} className="bg-gradient-to-br from-fuchsia-500 to-pink-500">
            <Heart className="mr-1 h-4 w-4" /> Aceitar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

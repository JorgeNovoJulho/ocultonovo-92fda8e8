import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, LogIn, X } from 'lucide-react';
import { supabase } from '@/lib/supabaseExternal';
import { subscribeTable } from '@/lib/realtimeBus';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

interface SlotOffer {
  id: string;
  room_slug: string;
  room_name: string;
  hue: number;
  offered_at: string;
  expires_at: string;
}

/**
 * Escuta `oculto_aura_room_slot_offers` em realtime.
 * Quando aparece uma oferta para o usuário atual, abre modal central:
 * "Vaga disponível na sala X — Entrar / Ignorar".
 */
export function AuraRoomWaitlistListener() {
  const { user } = useAuth();
  const [offer, setOffer] = useState<SlotOffer | null>(null);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!user?.id) return;
    let cancel = false;

    // Carga inicial: oferta pendente?
    (async () => {
      const { data } = await (supabase as any)
        .rpc('aura_room_waitlist_pending_offer');
      if (!cancel && data?.id) setOffer(data as SlotOffer);
    })();

    const unsub = subscribeTable('oculto_aura_room_slot_offers', (payload: any) => {
      if (payload?.eventType !== 'INSERT') return;
      const row = payload.new;
      if (!row || row.user_id !== user.id) return;
      setOffer({
        id: row.id,
        room_slug: row.room_slug,
        room_name: row.room_name || row.room_slug,
        hue: row.hue ?? 280,
        offered_at: row.offered_at,
        expires_at: row.expires_at,
      });
    }, { events: ['INSERT'] });

    return () => { cancel = true; unsub(); };
  }, [user?.id]);


  const enter = async () => {
    if (!offer) return;
    setBusy(true);
    const { data } = await (supabase as any).rpc('aura_room_waitlist_accept', { p_offer_id: offer.id });
    setBusy(false);
    if ((data as any)?.ok) {
      setOffer(null);
      toast.success(`Entrando em ${offer.room_name}…`);
      navigate(`/aura-match?room=${offer.room_slug}`);
    } else {
      toast.error('A vaga expirou. Você foi removido da fila.');
      setOffer(null);
    }
  };

  const ignore = async () => {
    if (!offer) return;
    setBusy(true);
    await (supabase as any).rpc('aura_room_waitlist_ignore', { p_offer_id: offer.id });
    setBusy(false);
    setOffer(null);
    toast('Você saiu da fila desta sala.');
  };

  if (!offer) return null;

  return (
    <Dialog open onOpenChange={(v) => !v && ignore()}>
      <DialogContent className="max-w-sm border-white/10 bg-[#0b0420] text-foreground">
        <DialogHeader>
          <DialogTitle className="text-base" style={{ color: `hsl(${offer.hue}, 80%, 80%)` }}>
            ✨ Vaga liberada em {offer.room_name}
          </DialogTitle>
          <DialogDescription className="text-[12px]">
            Sua vez chegou. Entre agora antes que outra aura ocupe o lugar.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-2 pt-1">
          <Button variant="outline" onClick={ignore} disabled={busy} className="gap-1">
            <X className="h-4 w-4" /> Ignorar
          </Button>
          <Button onClick={enter} disabled={busy} className="gap-1 bg-fuchsia-500 hover:bg-fuchsia-600 text-white">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
            Entrar
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground">
          A oferta expira automaticamente — se ignorar você sai da fila.
        </p>
      </DialogContent>
    </Dialog>
  );
}

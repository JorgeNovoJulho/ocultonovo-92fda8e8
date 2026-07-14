/**
 * WatchPartyHostButton — Etapa 39
 *
 * Cria uma Watch Party para o item atual e copia o link para compartilhar.
 * Enquanto a sala está ativa, sincroniza estado (item/pos/playing) com guests.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Users2, Copy, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useWatchPartyActions } from '@/hooks/useWatchParty';
import { toast } from 'sonner';

interface Props {
  itemId: string | null | undefined;
  videoRef?: React.RefObject<HTMLVideoElement | null>;
  isPlaying: boolean;
  title?: string | null;
}

export function WatchPartyHostButton({ itemId, videoRef, isPlaying, title }: Props) {
  const [partyId, setPartyId] = useState<string | null>(null);
  const { create, updateState, end } = useWatchPartyActions();
  const lastSentRef = useRef<number>(0);

  const start = useCallback(async () => {
    if (!itemId) return;
    const id = await create(itemId, title ?? null);
    if (!id) {
      toast.error('Não foi possível criar a sala.');
      return;
    }
    setPartyId(id);
    const url = `${window.location.origin}/play/party/${id}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Sala criada — link copiado para compartilhar.');
    } catch {
      toast.success('Sala criada. Copie o link na barra de endereço.');
    }
  }, [create, itemId, title]);

  const stop = useCallback(async () => {
    if (!partyId) return;
    await end(partyId);
    setPartyId(null);
    toast.message('Sala finalizada.');
  }, [end, partyId]);

  // Sincroniza estado ao ritmo de 2s e em troca de item / play / pause
  useEffect(() => {
    if (!partyId || !itemId) return;
    const tick = () => {
      const now = Date.now();
      if (now - lastSentRef.current < 1500) return;
      lastSentRef.current = now;
      const pos = videoRef?.current ? videoRef.current.currentTime : 0;
      updateState(partyId, itemId, pos, isPlaying);
    };
    tick();
    const interval = window.setInterval(tick, 2000);
    return () => window.clearInterval(interval);
  }, [partyId, itemId, isPlaying, videoRef, updateState]);

  const copy = useCallback(() => {
    if (!partyId) return;
    const url = `${window.location.origin}/play/party/${partyId}`;
    navigator.clipboard.writeText(url).then(
      () => toast.success('Link copiado.'),
      () => toast.error('Não foi possível copiar.'),
    );
  }, [partyId]);

  if (!partyId) {
    return (
      <Button
        variant="ghost"
        size="icon"
        className="text-white hover:bg-white/10"
        onClick={start}
        disabled={!itemId}
        title="Assistir junto (Watch Party)"
       aria-label="Ação">
        <Users2 className="h-5 w-5" />
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="icon"
        className={cn('text-white hover:bg-white/10 bg-fuchsia-500/30')}
        onClick={copy}
        title="Copiar link da sala"
       aria-label="Copiar">
        <Copy className="h-5 w-5" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="text-white hover:bg-white/10"
        onClick={stop}
        title="Encerrar sala"
       aria-label="Fechar">
        <X className="h-5 w-5" />
      </Button>
    </div>
  );
}

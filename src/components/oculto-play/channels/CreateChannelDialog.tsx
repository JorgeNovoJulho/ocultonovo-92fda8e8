/**
 * Criar canal — 1 canal de vídeo e 1 de áudio por usuário (gratuitos).
 * O banco valida limite, endereço único e formato; aqui só ajudamos a
 * preencher (endereço sugerido a partir do nome).
 */
import { useEffect, useMemo, useState } from 'react';
import { Clapperboard, Headphones, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import {
  channelErrorMessage,
  slugifyChannel,
  useCreatePlayChannel,
  useMyPlayChannels,
  type PlayChannel,
  type PlayChannelKind,
} from '@/hooks/usePlayChannels';
import { useIsMasterAdmin } from '@/hooks/useUserRoles';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultKind?: PlayChannelKind;
  onCreated?: (channel: PlayChannel) => void;
}

export function CreateChannelDialog({ open, onOpenChange, defaultKind, onCreated }: Props) {
  const { data: mine } = useMyPlayChannels();
  const { data: isMaster } = useIsMasterAdmin();
  const create = useCreatePlayChannel();

  const hasKind = useMemo(() => {
    const set = new Set<PlayChannelKind>();
    (mine ?? []).forEach((c) => set.add(c.kind));
    return set;
  }, [mine]);
  const canCreate = (k: PlayChannelKind) => isMaster === true || !hasKind.has(k);

  const [kind, setKind] = useState<PlayChannelKind>(defaultKind ?? 'video');
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (!open) return;
    const preferred = defaultKind ?? 'video';
    setKind(canCreate(preferred) ? preferred : (canCreate('video') ? 'video' : 'audio'));
    setName(''); setSlug(''); setSlugTouched(false); setDescription('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!slugTouched) setSlug(slugifyChannel(name));
  }, [name, slugTouched]);

  const blocked = !canCreate(kind);
  const slugOk = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(slug) && !slug.includes('--');
  const nameOk = name.trim().length >= 2 && name.trim().length <= 60;

  const submit = async () => {
    if (blocked || !nameOk || !slugOk || create.isPending) return;
    try {
      const ch = await create.mutateAsync({ kind, name: name.trim(), slug, description: description.trim() });
      toast.success(`Canal "${ch.name}" criado!`);
      onOpenChange(false);
      onCreated?.(ch);
    } catch (e) {
      toast.error(channelErrorMessage(e));
    }
  };

  const kindButton = (k: PlayChannelKind, label: string, Icon: typeof Clapperboard, hint: string) => {
    const disabled = !canCreate(k);
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => setKind(k)}
        className={cn(
          'flex flex-1 flex-col items-start gap-1 rounded-xl border p-3 text-left transition',
          kind === k && !disabled ? 'border-primary bg-primary/10' : 'border-border/60 bg-muted/20',
          disabled && 'opacity-45 cursor-not-allowed',
        )}
      >
        <span className="flex items-center gap-1.5 text-sm font-bold"><Icon className="h-4 w-4" /> {label}</span>
        <span className="text-[11px] leading-snug text-muted-foreground">{disabled ? 'Você já tem este canal' : hint}</span>
      </button>
    );
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!create.isPending) onOpenChange(v); }}>
      <DialogContent className="w-[calc(100vw-1rem)] max-w-md">
        <DialogHeader>
          <DialogTitle>Criar canal</DialogTitle>
          <DialogDescription>
            Cada perfil pode ter 1 canal de vídeo e 1 de áudio gratuitamente. Vídeos e áudios nunca se misturam.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex gap-2">
            {kindButton('video', 'Vídeo', Clapperboard, 'Shorts, filmes, links e memes')}
            {kindButton('audio', 'Áudio', Headphones, 'Músicas, podcasts e áudios')}
          </div>

          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Nome do canal</label>
            <Input value={name} onChange={(e) => setName(e.target.value.slice(0, 60))} placeholder="Ex.: Noites Sintéticas" />
          </div>

          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Endereço</label>
            <div className="flex items-center rounded-md border border-input bg-background pl-3 text-sm">
              <span className="shrink-0 text-muted-foreground">/play/c/</span>
              <input
                value={slug}
                onChange={(e) => { setSlugTouched(true); setSlug(slugifyChannel(e.target.value)); }}
                className="h-10 min-w-0 flex-1 bg-transparent px-1 outline-none"
                placeholder="noites-sinteticas"
                aria-label="Endereço do canal"
              />
            </div>
            <p className={cn('mt-1 text-[11px]', slug && !slugOk ? 'text-destructive' : 'text-muted-foreground')}>
              {slug && !slugOk
                ? 'Use de 3 a 40 letras, números ou hífens.'
                : 'É o link do canal. Pode ser trocado depois, no máximo a cada 30 dias.'}
            </p>
          </div>

          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Descrição (opcional)</label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value.slice(0, 1000))} rows={3} placeholder="Sobre o que é o seu canal?" />
          </div>

          <Button className="w-full" onClick={submit} disabled={blocked || !nameOk || !slugOk || create.isPending}>
            {create.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Criar canal
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

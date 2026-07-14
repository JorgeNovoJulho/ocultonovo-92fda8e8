/**
 * CreateEventModal — owner/mod cria ou edita um evento da comunidade
 * (encontro presencial, live online, call, festa, etc.) com RSVP.
 */
import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Loader2, CalendarPlus, Hash } from 'lucide-react';
import {
  useUpsertCommunityEvent,
  useCommunityChannels,
  type CommunityEvent,
} from '@/hooks/useCommunities';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  communityId: string;
  defaultChannelId?: string | null;
  event?: CommunityEvent | null;
}

const KINDS: Array<{ k: CommunityEvent['event_kind']; label: string }> = [
  { k: 'meetup', label: 'Encontro' },
  { k: 'live', label: 'Live' },
  { k: 'call', label: 'Call' },
  { k: 'party', label: 'Festa' },
  { k: 'other', label: 'Outro' },
];

function toLocalInput(dt: string | null | undefined) {
  if (!dt) return '';
  const d = new Date(dt);
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 16);
}

export function CreateEventModal({ open, onOpenChange, communityId, defaultChannelId, event }: Props) {
  const upsert = useUpsertCommunityEvent(communityId);
  const { data: channels = [] } = useCommunityChannels(communityId);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [kind, setKind] = useState<CommunityEvent['event_kind']>('meetup');
  const [isOnline, setIsOnline] = useState(false);
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [capacity, setCapacity] = useState<string>('');
  const [isAdult, setIsAdult] = useState(false);
  const [channelId, setChannelId] = useState<string | null>(defaultChannelId ?? null);

  useEffect(() => {
    if (!open) return;
    if (event) {
      setTitle(event.title);
      setDescription(event.description ?? '');
      setLocation(event.location ?? '');
      setKind(event.event_kind);
      setIsOnline(event.is_online);
      setStartsAt(toLocalInput(event.starts_at));
      setEndsAt(toLocalInput(event.ends_at));
      setCapacity(event.capacity != null ? String(event.capacity) : '');
      setIsAdult(event.is_adult);
      setChannelId(event.channel_id ?? null);
    } else {
      setTitle(''); setDescription(''); setLocation(''); setKind('meetup');
      setIsOnline(false); setStartsAt(''); setEndsAt(''); setCapacity('');
      setIsAdult(false); setChannelId(defaultChannelId ?? null);
    }
  }, [open, event, defaultChannelId]);

  const submit = async () => {
    if (!title.trim() || !startsAt) return;
    await upsert.mutateAsync({
      id: event?.id ?? null,
      title: title.trim(),
      description: description.trim() || null,
      cover_url: event?.cover_url ?? null,
      location: location.trim() || null,
      event_kind: kind,
      is_online: isOnline,
      starts_at: new Date(startsAt).toISOString(),
      ends_at: endsAt ? new Date(endsAt).toISOString() : null,
      capacity: capacity ? Math.max(1, parseInt(capacity, 10)) : null,
      is_adult: isAdult,
      channel_id: channelId,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarPlus className="h-4 w-4 text-fuchsia-400" />
            {event ? 'Editar evento' : 'Novo evento'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 mt-2">
          <div>
            <Label className="text-xs">Título *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder="Ex.: Encontro na praia, Live de Q&A…" />
          </div>

          <div>
            <Label className="text-xs">Descrição</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={500}
              rows={3}
              placeholder="Detalhes, agenda, o que levar, dress code, etc."
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Início *</Label>
              <Input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Fim</Label>
              <Input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
            <div>
              <p className="text-xs font-medium">Online?</p>
              <p className="text-[10px] text-muted-foreground">Marque se o encontro acontecerá por link/vídeo.</p>
            </div>
            <Switch checked={isOnline} onCheckedChange={setIsOnline} />
          </div>

          <div>
            <Label className="text-xs">{isOnline ? 'Link / plataforma' : 'Local / cidade'}</Label>
            <Input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              maxLength={200}
              placeholder={isOnline ? 'https://meet…  ou nome da plataforma' : 'Cidade, bairro, endereço aproximado'}
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Tipo</Label>
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as any)}
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                {KINDS.map((k) => <option key={k.k} value={k.k}>{k.label}</option>)}
              </select>
            </div>
            <div>
              <Label className="text-xs">Capacidade</Label>
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                placeholder="Ilimitada"
                value={capacity}
                onChange={(e) => setCapacity(e.target.value.replace(/[^0-9]/g, ''))}
              />
            </div>
          </div>

          {channels.length > 0 && (
            <div>
              <Label className="text-xs">Canal (opcional)</Label>
              <select
                value={channelId ?? ''}
                onChange={(e) => setChannelId(e.target.value || null)}
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Sem canal</option>
                {channels.filter((c) => !c.is_archived).map((c) => (
                  <option key={c.id} value={c.id}>#{c.name}</option>
                ))}
              </select>
            </div>
          )}

          <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
            <div>
              <p className="text-xs font-medium">Conteúdo +18</p>
              <p className="text-[10px] text-muted-foreground">Sinaliza para o seu público que o evento é adulto.</p>
            </div>
            <Switch checked={isAdult} onCheckedChange={setIsAdult} />
          </div>

          <Button
            onClick={submit}
            disabled={upsert.isPending || !title.trim() || !startsAt}
            className="w-full gap-1"
          >
            {upsert.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarPlus className="h-4 w-4" />}
            {event ? 'Salvar alterações' : 'Criar evento'}
          </Button>
          {channelId && (
            <p className="text-[10px] text-muted-foreground flex items-center gap-1 justify-center">
              <Hash className="h-3 w-3" />
              {channels.find((c) => c.id === channelId)?.name}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * CommunityEventsTab — lista de eventos da comunidade com RSVP (Vou / Interesse).
 * Owners/moderadores podem criar, editar, cancelar e remover.
 */
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  CalendarDays, MapPin, Globe, Users, Plus, MoreVertical, Pencil, Trash2, Ban, Undo2, Clock, Hash,
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  useCommunityEvents,
  useMyCommunityEventRsvps,
  useRsvpCommunityEvent,
  useCancelCommunityEvent,
  useDeleteCommunityEvent,
  useCommunityChannels,
  type CommunityEvent,
} from '@/hooks/useCommunities';
import { CreateEventModal } from './CreateEventModal';

interface Props {
  communityId: string;
  isMod: boolean;
  isMember: boolean;
  defaultChannelId?: string | null;
}

const KIND_LABEL: Record<CommunityEvent['event_kind'], string> = {
  meetup: 'Encontro',
  live: 'Live',
  call: 'Call',
  party: 'Festa',
  other: 'Outro',
};

const KIND_COLOR: Record<CommunityEvent['event_kind'], string> = {
  meetup: 'bg-emerald-600/30 text-emerald-200',
  live: 'bg-rose-600/30 text-rose-200',
  call: 'bg-blue-600/30 text-blue-200',
  party: 'bg-fuchsia-600/30 text-fuchsia-200',
  other: 'bg-muted text-muted-foreground',
};

export function CommunityEventsTab({ communityId, isMod, isMember, defaultChannelId }: Props) {
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<CommunityEvent | null>(null);
  const [showPast, setShowPast] = useState(false);

  const { data: events = [], isLoading } = useCommunityEvents(communityId, { includePast: showPast });
  const { data: myRsvps = {} } = useMyCommunityEventRsvps(communityId);
  const { data: channels = [] } = useCommunityChannels(communityId);
  const rsvp = useRsvpCommunityEvent(communityId);
  const cancel = useCancelCommunityEvent(communityId);
  const del = useDeleteCommunityEvent(communityId);

  const channelName = (id: string | null) =>
    id ? channels.find((c) => c.id === id)?.name : null;

  return (
    <div className="mt-3 space-y-2.5">
      <div className="flex items-center gap-2">
        {isMod && (
          <Button size="sm" className="gap-1" onClick={() => { setEditing(null); setShowCreate(true); }}>
            <Plus className="h-3.5 w-3.5" />
            Novo evento
          </Button>
        )}
        <button
          onClick={() => setShowPast((v) => !v)}
          className="ml-auto text-[11px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
        >
          {showPast ? 'Ocultar passados' : 'Mostrar passados'}
        </button>
      </div>

      {isLoading && <p className="text-xs text-muted-foreground py-6 text-center">Carregando eventos…</p>}

      {!isLoading && events.length === 0 && (
        <div className="text-center py-10 text-sm text-muted-foreground">
          <CalendarDays className="h-8 w-8 mx-auto mb-2 opacity-50" />
          {isMod ? 'Nenhum evento agendado. Crie o primeiro!' : 'Ainda não há eventos por aqui.'}
        </div>
      )}

      {events.map((e) => {
        const myStatus = myRsvps[e.id];
        const starts = new Date(e.starts_at);
        const ends = e.ends_at ? new Date(e.ends_at) : null;
        const isPast = starts.getTime() < Date.now() - 60 * 60 * 1000;
        const isFull = e.capacity != null && e.going_count >= e.capacity;
        const ch = channelName(e.channel_id);

        return (
          <div
            key={e.id}
            className={`rounded-xl border p-3 transition-opacity ${
              e.is_cancelled ? 'border-destructive/40 bg-destructive/[0.04] opacity-70'
              : isPast ? 'border-border bg-card/40 opacity-80'
              : 'border-border bg-card'
            }`}
          >
            <div className="flex items-start gap-2">
              {/* Date block */}
              <div className="shrink-0 w-12 rounded-md bg-fuchsia-600/15 border border-fuchsia-500/30 text-center py-1">
                <p className="text-[9px] uppercase font-semibold text-fuchsia-300 leading-none">
                  {format(starts, 'MMM', { locale: ptBR })}
                </p>
                <p className="text-lg font-bold text-foreground leading-tight">
                  {format(starts, 'dd')}
                </p>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Badge className={`${KIND_COLOR[e.event_kind]} text-[9px] h-4 px-1.5`}>
                    {KIND_LABEL[e.event_kind]}
                  </Badge>
                  {e.is_online && (
                    <Badge className="bg-blue-600/30 text-blue-200 text-[9px] h-4 px-1.5 gap-0.5">
                      <Globe className="h-2.5 w-2.5" /> Online
                    </Badge>
                  )}
                  {e.is_adult && <Badge className="bg-rose-700/30 text-rose-200 text-[9px] h-4 px-1.5">+18</Badge>}
                  {e.is_cancelled && <Badge className="bg-destructive/30 text-destructive text-[9px] h-4 px-1.5">Cancelado</Badge>}
                  {ch && (
                    <Badge variant="outline" className="text-[9px] h-4 px-1.5 gap-0.5">
                      <Hash className="h-2.5 w-2.5" /> {ch}
                    </Badge>
                  )}
                </div>

                <h3 className="text-sm font-semibold mt-1 leading-snug">{e.title}</h3>

                <div className="flex items-center gap-2 mt-1 text-[11px] text-muted-foreground flex-wrap">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {format(starts, "EEE dd/MM 'às' HH:mm", { locale: ptBR })}
                    {ends && ` — ${format(ends, 'HH:mm', { locale: ptBR })}`}
                  </span>
                  {e.location && (
                    <span className="inline-flex items-center gap-1 truncate max-w-[55%]">
                      <MapPin className="h-3 w-3 shrink-0" />
                      <span className="truncate">{e.location}</span>
                    </span>
                  )}
                </div>

                {e.description && (
                  <p className="text-xs text-foreground/85 mt-1.5 whitespace-pre-wrap line-clamp-3">{e.description}</p>
                )}

                <div className="flex items-center gap-2 mt-2 text-[11px] text-muted-foreground">
                  <Users className="h-3 w-3" />
                  <span><b className="text-foreground">{e.going_count}</b> vão</span>
                  <span>·</span>
                  <span><b className="text-foreground">{e.interested_count}</b> interessados</span>
                  {e.capacity != null && (
                    <>
                      <span>·</span>
                      <span>{e.capacity - e.going_count > 0 ? `${e.capacity - e.going_count} vagas` : 'lotado'}</span>
                    </>
                  )}
                </div>
              </div>

              {isMod && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="h-7 w-7 rounded-md hover:bg-accent flex items-center justify-center text-muted-foreground shrink-0">
                      <MoreVertical className="h-3.5 w-3.5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuItem onClick={() => { setEditing(e); setShowCreate(true); }}>
                      <Pencil className="h-3.5 w-3.5 mr-2" /> Editar
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => cancel.mutate({ id: e.id, cancel: !e.is_cancelled })}>
                      {e.is_cancelled
                        ? <><Undo2 className="h-3.5 w-3.5 mr-2" /> Reativar</>
                        : <><Ban className="h-3.5 w-3.5 mr-2" /> Cancelar</>}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => {
                        if (window.confirm(`Remover o evento "${e.title}"?`)) del.mutate(e.id);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-2" /> Remover
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>

            {/* RSVP */}
            {!e.is_cancelled && !isPast && isMember && (
              <div className="flex items-center gap-1.5 mt-2.5 pt-2.5 border-t border-border/60">
                <Button
                  size="sm"
                  variant={myStatus === 'going' ? 'default' : 'outline'}
                  className={`flex-1 h-8 text-xs ${myStatus === 'going' ? 'bg-emerald-600 hover:bg-emerald-600/90' : ''}`}
                  disabled={rsvp.isPending || (isFull && myStatus !== 'going')}
                  onClick={() => rsvp.mutate({ event_id: e.id, status: myStatus === 'going' ? 'none' : 'going' })}
                >
                  {myStatus === 'going' ? '✓ Vou' : isFull ? 'Lotado' : 'Vou'}
                </Button>
                <Button
                  size="sm"
                  variant={myStatus === 'interested' ? 'default' : 'outline'}
                  className={`flex-1 h-8 text-xs ${myStatus === 'interested' ? 'bg-fuchsia-600 hover:bg-fuchsia-600/90' : ''}`}
                  disabled={rsvp.isPending}
                  onClick={() => rsvp.mutate({ event_id: e.id, status: myStatus === 'interested' ? 'none' : 'interested' })}
                >
                  {myStatus === 'interested' ? '✓ Interesse' : 'Interesse'}
                </Button>
              </div>
            )}
          </div>
        );
      })}

      <CreateEventModal
        open={showCreate}
        onOpenChange={(v) => { setShowCreate(v); if (!v) setEditing(null); }}
        communityId={communityId}
        defaultChannelId={defaultChannelId}
        event={editing}
      />
    </div>
  );
}

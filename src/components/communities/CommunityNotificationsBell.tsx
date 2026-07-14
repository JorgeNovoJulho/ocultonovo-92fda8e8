/**
 * Sino de notificações de comunidade (replies em tópicos do usuário,
 * aprovações de entrada, etc). Filtra por type LIKE 'community_%'.
 */
import { useState } from 'react';
import { Bell } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import {
  useCommunityNotifications,
  useMarkCommunityNotificationsRead,
} from '@/hooks/useCommunities';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export function CommunityNotificationsBell() {
  const [open, setOpen] = useState(false);
  const { data: notifs = [] } = useCommunityNotifications(20);
  const markRead = useMarkCommunityNotificationsRead();

  const unread = notifs.filter((n) => !n.is_read).length;

  const handleOpen = (v: boolean) => {
    setOpen(v);
    if (v && unread > 0) markRead.mutate();
  };

  const buildHref = (n: any): string => {
    const d = n.data || {};
    if (d.community_slug && d.topic_id) return `/comunidades/${d.community_slug}/topico/${d.topic_id}`;
    if (d.community_slug) return `/comunidades/${d.community_slug}`;
    return '/comunidades';
  };

  return (
    <Popover open={open} onOpenChange={handleOpen}>
      <PopoverTrigger asChild>
        <button
          className="relative h-9 w-9 rounded-full hover:bg-accent flex items-center justify-center"
          aria-label="Notificações de comunidade"
        >
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <Badge className="absolute -top-1 -right-1 h-4 min-w-[16px] px-1 text-[9px] bg-fuchsia-600 text-white">
              {unread > 9 ? '9+' : unread}
            </Badge>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="p-3 border-b border-border">
          <p className="text-sm font-semibold">Notificações</p>
        </div>
        <div className="max-h-80 overflow-y-auto">
          {notifs.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">Sem novidades por aqui.</p>
          ) : (
            notifs.map((n) => (
              <Link
                key={n.id}
                to={buildHref(n)}
                onClick={() => setOpen(false)}
                className={`block px-3 py-2 hover:bg-accent/40 border-b border-border/40 ${
                  !n.is_read ? 'bg-fuchsia-500/5' : ''
                }`}
              >
                <p className="text-xs font-medium truncate">{n.title}</p>
                {n.body && <p className="text-[11px] text-muted-foreground line-clamp-2">{n.body}</p>}
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: ptBR })}
                </p>
              </Link>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

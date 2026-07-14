import { useState } from 'react';
import { Bell, Check, AlertCircle, UserPlus, MessageSquare, Shield, Clock, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useAdminNotifications, AdminNotification } from '@/hooks/useAdminNotifications';

const getNotificationIcon = (type: string) => {
  switch (type) {
    case 'new_user':
      return <UserPlus className="h-4 w-4 text-green-500" />;
    case 'new_ticket':
      return <MessageSquare className="h-4 w-4 text-blue-500" />;
    case 'critical_report':
      return <AlertCircle className="h-4 w-4 text-destructive" />;
    case 'verification':
      return <Shield className="h-4 w-4 text-[#FF007F]" />;
    default:
      return <Bell className="h-4 w-4 text-muted-foreground" />;
  }
};

const getNotificationBg = (type: string, isRead: boolean) => {
  if (isRead) return 'bg-muted/30';
  switch (type) {
    case 'critical_impersonation':
      return 'bg-red-600/20 border-l-4 border-l-red-600 animate-pulse';
    case 'critical_report':
      return 'bg-destructive/10 border-l-2 border-l-destructive';
    case 'verification':
      return 'bg-[#FF007F]/10 border-l-2 border-l-[#FF007F]';
    case 'new_ticket':
      return 'bg-blue-500/10 border-l-2 border-l-blue-500';
    default:
      return 'bg-card';
  }
};

export function AdminNotificationBell() {
  const { notifications, isLoading, unreadCount, markAsRead, markAllAsRead, clearAll } = useAdminNotifications();
  const [open, setOpen] = useState(false);

  const handleMarkAsRead = (notification: AdminNotification) => {
    if (!notification.is_read) {
      markAsRead(notification.id);
    }
  };

  const handleMarkAllAsRead = (e: React.MouseEvent) => {
    e.stopPropagation();
    markAllAsRead();
  };

  const handleClearAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    clearAll();
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-destructive text-destructive-foreground text-xs rounded-full flex items-center justify-center font-bold">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 sm:w-96 p-0" align="end">
        <div className="flex items-center justify-between p-3 border-b border-border/50">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-[#FF007F]" />
            <span className="font-semibold text-sm">Notificações Admin</span>
            {unreadCount > 0 && (
              <Badge variant="secondary" className="text-xs">
                {unreadCount} novas
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1">
            {unreadCount > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="text-xs h-7 px-2 gap-1"
                onClick={handleMarkAllAsRead}
              >
                <Check className="h-3 w-3" />
                Marcar todas
              </Button>
            )}
            {notifications.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="text-xs h-7 px-2 gap-1 text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
                onClick={handleClearAll}
              >
                <Trash2 className="h-3 w-3" />
                Limpar
              </Button>
            )}
          </div>
        </div>

        <ScrollArea className="h-[300px] sm:h-[400px]">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground text-sm">Carregando...</div>
          ) : notifications.length === 0 ? (
            <div className="p-8 text-center">
              <Bell className="h-8 w-8 text-muted-foreground/50 mx-auto mb-2" />
              <p className="text-muted-foreground text-sm">Nenhuma notificação</p>
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={cn(
                    "p-4 hover:bg-muted/50 transition-colors cursor-pointer",
                    getNotificationBg(notification.type, notification.is_read)
                  )}
                  onClick={() => handleMarkAsRead(notification)}
                >
                  <div className="flex gap-3">
                    <div className="flex-shrink-0 mt-0.5">
                      {getNotificationIcon(notification.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={cn("text-sm", !notification.is_read && "font-medium")}>
                        {notification.title}
                      </p>
                      {notification.body && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                          {notification.body}
                        </p>
                      )}
                      <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {formatDistanceToNow(new Date(notification.created_at), {
                          addSuffix: true,
                          locale: ptBR,
                        })}
                      </div>
                    </div>
                    {!notification.is_read && (
                      <div className="w-2 h-2 rounded-full bg-[#FF007F] flex-shrink-0 mt-1.5" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

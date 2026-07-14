import { useState } from "react";
import { Bell, AlertTriangle, ShieldAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useAdminAlerts, type AdminAlert } from "@/hooks/useAdminAlerts";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

const SEV_COLOR: Record<string, string> = {
  info: "bg-muted text-muted-foreground",
  low: "bg-muted text-foreground",
  medium: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400",
  high: "bg-orange-500/15 text-orange-700 dark:text-orange-400",
  critical: "bg-destructive/15 text-destructive",
};

/**
 * Bell de alertas admin (fraude, financeiro, sistema).
 * Lê admin_alerts em realtime. Visível só para admins (use junto a is_admin).
 */
export default function AdminAlertsBell() {
  const [open, setOpen] = useState(false);
  const { alerts, unreadCount, markRead } = useAdminAlerts(80);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Alertas admin">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-md p-0 flex flex-col">
        <SheetHeader className="px-4 py-3 border-b">
          <SheetTitle className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4" />
            Alertas Admin
            {unreadCount > 0 && <Badge variant="secondary">{unreadCount} novos</Badge>}
          </SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto">
          {alerts.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Nenhum alerta no momento.
            </div>
          ) : (
            <ul className="divide-y">
              {alerts.map((a: AdminAlert) => (
                <li
                  key={a.id}
                  className={`p-3 flex gap-3 ${!a.read ? "bg-accent/30" : ""}`}
                >
                  <div className="mt-0.5">
                    <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm truncate">{a.title}</span>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded ${SEV_COLOR[a.severity] || SEV_COLOR.info}`}
                      >
                        {a.severity}
                      </span>
                    </div>
                    {a.body && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{a.body}</p>
                    )}
                    <p className="text-[11px] text-muted-foreground mt-1">
                      {formatDistanceToNow(new Date(a.created_at), {
                        addSuffix: true,
                        locale: ptBR,
                      })}
                    </p>
                  </div>
                  {!a.read && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => markRead(a.id)}
                      aria-label="Marcar como lido"
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

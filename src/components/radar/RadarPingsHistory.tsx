import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Hand, Inbox, Send, MessageCircle, User as UserIcon, X } from "lucide-react";
import { useRadarPings } from "@/hooks/useRadarPings";

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return "agora";
  if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

/**
 * Popover com histórico de Acenos (últimas 24h):
 * - "Recebidos": quem acenou para mim (badge se não-vistos).
 * - "Enviados": para quem acenei.
 * Reaproveita os dados de useRadarPings — sem fetch extra.
 */
export function RadarPingsHistory() {
  const navigate = useNavigate();
  const { enrichedPings, markSeen } = useRadarPings();
  const [open, setOpen] = useState(false);

  const received = enrichedPings.received;
  const sent = enrichedPings.sent;
  const unseen = useMemo(
    () => received.filter((p) => p.status === "sent").length,
    [received]
  );

  const openProfile = (p: any) => {
    const handle = p.profile?.username || p.profile?.user_id;
    if (handle) {
      setOpen(false);
      navigate(`/u/${handle}`);
    }
  };
  const openChat = (p: any) => {
    if (p.profile?.user_id) {
      setOpen(false);
      navigate(`/messages?to=${p.profile.user_id}`);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="bg-card/80 h-8 w-8 relative"
          title="Histórico de Acenos"
          aria-label="Histórico de Acenos"
        >
          <Hand className="h-4 w-4" />
          {unseen > 0 && (
            <span className="absolute -top-1 -right-1 h-3.5 min-w-[14px] px-0.5 rounded-full bg-primary text-[9px] text-primary-foreground flex items-center justify-center">
              {unseen}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="px-3 py-2 border-b border-border flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold">
            <Hand className="h-3.5 w-3.5" /> Histórico de Acenos
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => { setOpen(false); navigate("/radar/pings"); }}
              className="text-[10px] font-medium text-primary hover:underline"
            >
              Ver tudo
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="h-6 w-6 inline-flex items-center justify-center rounded-md hover:bg-accent text-muted-foreground"
              aria-label="Fechar histórico"
              title="Fechar"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        <Tabs defaultValue="received" className="w-full">
          <TabsList className="grid w-full grid-cols-2 rounded-none border-b">
            <TabsTrigger value="received" className="text-[11px] gap-1.5">
              <Inbox className="h-3 w-3" /> Recebidos
              {received.length > 0 && (
                <span className="ml-1 text-[10px] text-muted-foreground">({received.length})</span>
              )}
            </TabsTrigger>
            <TabsTrigger value="sent" className="text-[11px] gap-1.5">
              <Send className="h-3 w-3" /> Enviados
              {sent.length > 0 && (
                <span className="ml-1 text-[10px] text-muted-foreground">({sent.length})</span>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="received" className="m-0">
            {received.length === 0 ? (
              <EmptyState text="Ninguém acenou para você ainda." />
            ) : (
              <ul className="max-h-72 overflow-y-auto divide-y divide-border">
                {received.map((p) => (
                  <PingRow
                    key={p.id}
                    name={p.profile?.name || p.profile?.username || "Alguém"}
                    avatar={p.profile?.avatar_url}
                    when={timeAgo(p.created_at)}
                    unseen={p.status === "sent"}
                    onProfile={() => openProfile(p)}
                    onChat={() => {
                      openChat(p);
                      if (p.status === "sent") markSeen(p.sender_id);
                    }}
                  />
                ))}
              </ul>
            )}
          </TabsContent>

          <TabsContent value="sent" className="m-0">
            {sent.length === 0 ? (
              <EmptyState text="Você ainda não acenou para ninguém." />
            ) : (
              <ul className="max-h-72 overflow-y-auto divide-y divide-border">
                {sent.map((p) => (
                  <PingRow
                    key={p.id}
                    name={p.profile?.name || p.profile?.username || "Perfil"}
                    avatar={p.profile?.avatar_url}
                    when={timeAgo(p.created_at)}
                    status={p.status === "seen" ? "Visto" : "Enviado"}
                    onProfile={() => openProfile(p)}
                    onChat={() => openChat(p)}
                  />
                ))}
              </ul>
            )}
          </TabsContent>
        </Tabs>
      </PopoverContent>
    </Popover>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="px-3 py-6 text-[11px] text-muted-foreground text-center">
      {text}
    </div>
  );
}

function PingRow({
  name,
  avatar,
  when,
  unseen,
  status,
  onProfile,
  onChat,
}: {
  name: string;
  avatar?: string | null;
  when: string;
  unseen?: boolean;
  status?: string;
  onProfile: () => void;
  onChat: () => void;
}) {
  return (
    <li className="px-3 py-2 flex items-center gap-2.5">
      <Avatar className="h-8 w-8 shrink-0">
        <AvatarImage src={avatar || undefined} alt={name} loading="lazy" />
        <AvatarFallback className="text-[10px]">{name.slice(0, 1)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[12px] font-medium leading-tight">{name}</p>
        <p className="text-[10px] text-muted-foreground leading-tight">
          {when}
          {status && <span className="ml-1 text-foreground/60">· {status}</span>}
          {unseen && <span className="ml-1 text-primary font-semibold">· novo</span>}
        </p>
      </div>
      <button
        type="button"
        onClick={onProfile}
        className="h-7 w-7 inline-flex items-center justify-center rounded-md border border-border/50 hover:bg-accent text-foreground/80"
        title="Ver perfil"
        aria-label="Ver perfil"
      >
        <UserIcon className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={onChat}
        className="h-7 w-7 inline-flex items-center justify-center rounded-md border border-primary/40 bg-primary/10 hover:bg-primary/20 text-primary"
        title="Abrir chat"
        aria-label="Abrir chat"
      >
        <MessageCircle className="h-3.5 w-3.5" />
      </button>
    </li>
  );
}

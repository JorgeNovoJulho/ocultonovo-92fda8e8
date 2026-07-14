import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Hand,
  Inbox,
  Send,
  MessageCircle,
  User as UserIcon,
  RotateCw,
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
  CheckCheck,
} from "lucide-react";
import { useRadarPings } from "@/hooks/useRadarPings";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 10;

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return "agora";
  if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export default function RadarPingsHistoryPage() {
  const navigate = useNavigate();
  const { enrichedPings, markSeen, markAllSeen, sendPing, isPingSending } = useRadarPings();
  const [tab, setTab] = useState<"received" | "sent">("received");
  const [pageReceived, setPageReceived] = useState(1);
  const [pageSent, setPageSent] = useState(1);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);

  const received = enrichedPings.received;
  const sent = enrichedPings.sent;

  const pagedReceived = useMemo(
    () => received.slice((pageReceived - 1) * PAGE_SIZE, pageReceived * PAGE_SIZE),
    [received, pageReceived]
  );
  const pagedSent = useMemo(
    () => sent.slice((pageSent - 1) * PAGE_SIZE, pageSent * PAGE_SIZE),
    [sent, pageSent]
  );

  const totalReceivedPages = Math.max(1, Math.ceil(received.length / PAGE_SIZE));
  const totalSentPages = Math.max(1, Math.ceil(sent.length / PAGE_SIZE));

  const openProfile = (p: any) => {
    const handle = p.profile?.username || p.profile?.user_id;
    if (handle) navigate(`/u/${handle}`);
  };

  const openChatFromReceived = (p: any) => {
    if (!p.profile?.user_id) return;
    if (p.status === "sent") {
      // Sincroniza visto imediatamente, sem reload
      markSeen(p.sender_id);
    }
    navigate(`/messages?to=${p.profile.user_id}`);
  };

  const openChatFromSent = (p: any) => {
    if (!p.profile?.user_id) return;
    navigate(`/messages?to=${p.profile.user_id}`);
  };

  const resend = async (targetId: string | undefined) => {
    if (!targetId) return;
    setResendingId(targetId);
    try {
      await sendPing.mutateAsync(targetId);
    } catch (err: any) {
      // Toast já é mostrado no hook; este catch é só p/ feedback local consistente
      if (!err?.message) toast.error("Falha ao reenviar aceno");
    } finally {
      setResendingId(null);
    }
  };

  const unseenReceivedCount = useMemo(
    () => received.filter((p) => p.status === "sent").length,
    [received]
  );

  const handleMarkAllSeen = async () => {
    if (markingAll || unseenReceivedCount === 0) return;
    setMarkingAll(true);
    try {
      const res = await markAllSeen();
      if (res.error) toast.error(res.error);
      else if (res.updated > 0) toast.success(`${res.updated} aceno(s) marcados como vistos`);
      else toast("Nada para marcar");
    } catch (e: any) {
      toast.error(e?.message || "Falha ao marcar tudo como visto");
    } finally {
      setMarkingAll(false);
    }
  };
  return (
    <div className="min-h-dvh bg-background text-foreground pb-24">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-border bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-2xl items-center gap-3 px-3 py-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            onClick={() => navigate(-1)}
            aria-label="Voltar"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex flex-1 items-center gap-2">
            <Hand className="h-4 w-4 text-primary" />
            <div className="min-w-0">
              <h1 className="truncate text-sm font-semibold leading-tight">
                Histórico de Acenos
              </h1>
              <p className="text-[11px] text-muted-foreground leading-tight">
                últimas 24h · {received.length} recebidos · {sent.length} enviados
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl px-3 pt-3">
        <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="received" className="gap-1.5 text-xs">
              <Inbox className="h-3.5 w-3.5" /> Recebidos
              <span className="ml-1 text-[10px] text-muted-foreground">
                ({received.length})
              </span>
            </TabsTrigger>
            <TabsTrigger value="sent" className="gap-1.5 text-xs">
              <Send className="h-3.5 w-3.5" /> Enviados
              <span className="ml-1 text-[10px] text-muted-foreground">
                ({sent.length})
              </span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="received" className="mt-3">
            {received.length === 0 ? (
              <Empty text="Ninguém acenou para você ainda." />
            ) : (
              <>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-[11px] text-muted-foreground">
                    {unseenReceivedCount > 0
                      ? `${unseenReceivedCount} novo(s) aceno(s)`
                      : "Tudo em dia"}
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5 text-xs"
                    onClick={handleMarkAllSeen}
                    disabled={markingAll || unseenReceivedCount === 0}
                  >
                    <CheckCheck className={cn("h-3.5 w-3.5", markingAll && "animate-pulse")} />
                    {markingAll ? "Marcando..." : "Marcar tudo como visto"}
                  </Button>
                </div>
                <ul className="divide-y divide-border rounded-lg border border-border/50 bg-card/40 overflow-hidden">
                  {pagedReceived.map((p) => (
                    <PingRow
                      key={p.id}
                      name={p.profile?.name || p.profile?.username || "Alguém"}
                      avatar={p.profile?.avatar_url}
                      when={timeAgo(p.created_at)}
                      unseen={p.status === "sent"}
                      onProfile={() => openProfile(p)}
                      onChat={() => openChatFromReceived(p)}
                      onResend={() => resend(p.sender_id)}
                      resending={
                        (isPingSending && resendingId === p.sender_id) ||
                        resendingId === p.sender_id
                      }
                    />
                  ))}
                </ul>
                <Pager
                  page={pageReceived}
                  total={totalReceivedPages}
                  onChange={setPageReceived}
                />
              </>
            )}
          </TabsContent>

          <TabsContent value="sent" className="mt-3">
            {sent.length === 0 ? (
              <Empty text="Você ainda não acenou para ninguém." />
            ) : (
              <>
                <ul className="divide-y divide-border rounded-lg border border-border/50 bg-card/40 overflow-hidden">
                  {pagedSent.map((p) => (
                    <PingRow
                      key={p.id}
                      name={p.profile?.name || p.profile?.username || "Perfil"}
                      avatar={p.profile?.avatar_url}
                      when={timeAgo(p.created_at)}
                      status={p.status === "seen" ? "Visto" : "Enviado"}
                      onProfile={() => openProfile(p)}
                      onChat={() => openChatFromSent(p)}
                      onResend={() => resend(p.receiver_id)}
                      resending={
                        (isPingSending && resendingId === p.receiver_id) ||
                        resendingId === p.receiver_id
                      }
                    />
                  ))}
                </ul>
                <Pager
                  page={pageSent}
                  total={totalSentPages}
                  onChange={setPageSent}
                />
              </>
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border/60 bg-card/30 px-4 py-10 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}

function Pager({
  page,
  total,
  onChange,
}: {
  page: number;
  total: number;
  onChange: (p: number) => void;
}) {
  if (total <= 1) return null;
  return (
    <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
      <Button
        variant="outline"
        size="sm"
        className="h-8 gap-1"
        onClick={() => onChange(Math.max(1, page - 1))}
        disabled={page === 1}
      >
        <ChevronLeft className="h-3.5 w-3.5" /> Anterior
      </Button>
      <span>
        Página {page} de {total}
      </span>
      <Button
        variant="outline"
        size="sm"
        className="h-8 gap-1"
        onClick={() => onChange(Math.min(total, page + 1))}
        disabled={page === total}
      >
        Próxima <ChevronRight className="h-3.5 w-3.5" />
      </Button>
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
  onResend,
  resending,
}: {
  name: string;
  avatar?: string | null;
  when: string;
  unseen?: boolean;
  status?: string;
  onProfile: () => void;
  onChat: () => void;
  onResend: () => void;
  resending?: boolean;
}) {
  return (
    <li className="flex items-center gap-2.5 px-3 py-2.5">
      <Avatar className="h-9 w-9 shrink-0">
        <AvatarImage src={avatar || undefined} alt={name} loading="lazy" />
        <AvatarFallback className="text-[10px]">{name.slice(0, 1)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium leading-tight">{name}</p>
        <p className="text-[11px] text-muted-foreground leading-tight">
          {when}
          {status && <span className="ml-1 text-foreground/60">· {status}</span>}
          {unseen && (
            <span className="ml-1 font-semibold text-primary">· novo</span>
          )}
        </p>
      </div>
      <button
        type="button"
        onClick={onProfile}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border/50 text-foreground/80 hover:bg-accent"
        title="Ver perfil"
        aria-label="Ver perfil"
      >
        <UserIcon className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={onResend}
        disabled={resending}
        className={cn(
          "inline-flex h-8 w-8 items-center justify-center rounded-md border border-amber-400/40 bg-amber-400/10 text-amber-300 hover:bg-amber-400/20 disabled:opacity-50",
          resending && "animate-pulse"
        )}
        title="Reenviar Aceno"
        aria-label="Reenviar Aceno"
      >
        <RotateCw className={cn("h-3.5 w-3.5", resending && "animate-spin")} />
      </button>
      <button
        type="button"
        onClick={onChat}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-primary/40 bg-primary/10 text-primary hover:bg-primary/20"
        title="Abrir chat"
        aria-label="Abrir chat"
      >
        <MessageCircle className="h-3.5 w-3.5" />
      </button>
    </li>
  );
}

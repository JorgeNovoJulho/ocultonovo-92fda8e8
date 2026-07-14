import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Loader2, UserRound, CheckCircle2, Send, Trash2, Clock } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabaseExternal";
import { cn } from "@/lib/utils";

export type AdminUsersListMode = "active" | "new_today" | "deleted" | "inactive";

interface Props {
  open: boolean;
  onClose: () => void;
  mode: AdminUsersListMode;
}

interface Row {
  id: string;
  user_id: string | null;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  created_at: string | null;
  deleted_at?: string | null;
  last_seen?: string | null;
}

type WelcomeStatusMap = Record<string, string | null>;

const TITLES: Record<AdminUsersListMode, { title: string; description: string }> = {
  active: {
    title: "Usuários Ativos",
    description: "Lista de usuários reais ativos na plataforma. Clique no nome para abrir o perfil.",
  },
  new_today: {
    title: "Novos Hoje",
    description: "Usuários reais cadastrados desde a meia-noite local até 23:59 do dia atual.",
  },
  deleted: {
    title: "Contas Excluídas",
    description: "Perfis enviados ao Cemitério. Cada item exibe a data em que a conta foi excluída.",
  },
  inactive: {
    title: "Contas Inativas",
    description: "Usuários reais sem acesso há mais de 15, 30 ou 90 dias. Cada item exibe a data do último acesso.",
  },
};

const INACTIVE_OPTIONS = [
  { days: 15, label: "15 dias" },
  { days: 30, label: "30 dias" },
  { days: 90, label: "90 dias" },
];

function isoDaysAgo(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

export function AdminUsersListModal({ open, onClose, mode }: Props) {
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [welcomeStatus, setWelcomeStatus] = useState<WelcomeStatusMap>({});
  const [statusLoaded, setStatusLoaded] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [inactiveDays, setInactiveDays] = useState<number>(15);

  useEffect(() => {
    if (!open) return;
    let cancel = false;
    (async () => {
      setLoading(true);
      setWelcomeStatus({});
      setStatusLoaded(mode !== "new_today");
      try {
        let list: Row[] = [];

        if (mode === "deleted") {
          const { data, error } = await (supabase as any)
            .from("vw_account_cemetery")
            .select("id,user_id,username,name,avatar_url,deleted_at,created_at")
            .order("deleted_at", { ascending: false })
            .limit(500);
          if (error) throw error;
          list = (data || []).map((r: any) => ({
            id: r.id,
            user_id: r.user_id,
            username: r.username,
            full_name: r.name,
            avatar_url: r.avatar_url,
            created_at: r.created_at,
            deleted_at: r.deleted_at,
          }));
        } else if (mode === "inactive") {
          const threshold = isoDaysAgo(inactiveDays);
          const { data, error } = await (supabase as any)
            .from("profiles")
            .select("id,user_id,username,full_name,avatar_url,created_at,last_seen")
            .or("is_seed.eq.false,is_seed.is.null")
            .or("is_deleted.is.null,is_deleted.eq.false")
            .lt("last_seen", threshold)
            .order("last_seen", { ascending: true })
            .limit(500);
          if (error) throw error;
          list = (data as Row[]) || [];
        } else {
          let q = (supabase as any)
            .from("profiles")
            .select("id,user_id,username,full_name,avatar_url,created_at")
            .or("is_seed.eq.false,is_seed.is.null")
            .or("is_deleted.is.null,is_deleted.eq.false")
            .order("created_at", { ascending: false })
            .limit(500);
          if (mode === "new_today") {
            const start = new Date();
            start.setHours(0, 0, 0, 0);
            const end = new Date();
            end.setHours(23, 59, 59, 999);
            q = q.gte("created_at", start.toISOString()).lte("created_at", end.toISOString());
          }
          const { data, error } = await q;
          if (error) throw error;
          list = (data as Row[]) || [];
        }

        if (cancel) return;
        setRows(list);

        if (mode === "new_today") {
          const ids = list.map((r) => r.user_id).filter(Boolean) as string[];
          if (ids.length > 0) {
            const { data: statusRows, error: statusErr } = await (supabase as any).rpc(
              "admin_welcome_status_for_users",
              { p_user_ids: ids },
            );
            if (!statusErr && Array.isArray(statusRows) && !cancel) {
              const map: WelcomeStatusMap = {};
              for (const s of statusRows as Array<{ user_id: string; sent_at: string | null }>) {
                map[s.user_id] = s.sent_at;
              }
              setWelcomeStatus(map);
            } else if (statusErr) {
              console.warn("[AdminUsersListModal] welcome status erro:", statusErr.message);
            }
          }
          if (!cancel) setStatusLoaded(true);
        }
      } catch (e) {
        console.warn("[AdminUsersListModal] erro:", e);
        if (!cancel) setRows([]);
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [open, mode, inactiveDays]);

  const goToProfile = (r: Row) => {
    const slug = r.username || r.user_id || r.id;
    if (!slug) return;
    onClose();
    navigate(`/u/${slug}`);
  };

  const handleSendWelcome = async (r: Row) => {
    if (!r.user_id) {
      toast.error("Usuário sem user_id válido.");
      return;
    }
    if (welcomeStatus[r.user_id]) {
      toast.info("Esta mensagem já foi enviada.");
      return;
    }
    const tid = `welcome-${r.user_id}`;
    setSendingId(r.user_id);
    toast.loading("Enviando mensagem de boas-vindas…", { id: tid });
    try {
      const { data, error } = await (supabase as any).rpc("admin_send_welcome_to_user_id", {
        p_user_id: r.user_id,
      });
      if (error) throw error;
      if (!data) throw new Error("RPC retornou vazio.");
      setWelcomeStatus((prev) => ({ ...prev, [r.user_id as string]: new Date().toISOString() }));
      toast.success(`Mensagem enviada para @${r.username || "usuário"}.`, { id: tid });
    } catch (e: any) {
      const msg = e?.message || "Falha ao enviar.";
      toast.error(`Falha: ${msg}`, { id: tid });
    } finally {
      setSendingId(null);
    }
  };

  const meta = TITLES[mode];

  const sortedRows = useMemo(() => {
    if (!rows) return rows;
    if (mode !== "new_today") return rows;
    const nameOf = (r: Row) => (r.full_name || r.username || "").toLocaleLowerCase("pt-BR");
    return [...rows].sort((a, b) => {
      const aSent = a.user_id && welcomeStatus[a.user_id] ? 1 : 0;
      const bSent = b.user_id && welcomeStatus[b.user_id] ? 1 : 0;
      if (aSent !== bSent) return aSent - bSent;
      return nameOf(a).localeCompare(nameOf(b), "pt-BR");
    });
  }, [rows, welcomeStatus, mode]);

  const formatDateTime = (iso: string | null | undefined) => {
    if (!iso) return null;
    try {
      return new Date(iso).toLocaleString("pt-BR", {
        day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit",
      });
    } catch { return null; }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="
          w-[calc(100vw-0.5rem)] sm:w-full max-w-[96vw] sm:max-w-lg
          max-h-[90dvh] sm:max-h-[85vh]
          overflow-hidden overflow-x-hidden flex flex-col
          p-3 sm:p-6 rounded-2xl
        "
      >
        <DialogHeader className="pr-8 space-y-1">
          <DialogTitle className="text-base sm:text-lg leading-tight flex items-center gap-2">
            {mode === "deleted" && <Trash2 className="h-4 w-4 text-destructive" />}
            {mode === "inactive" && <Clock className="h-4 w-4 text-amber-500" />}
            {meta.title}
          </DialogTitle>
          <DialogDescription className="text-[11.5px] sm:text-sm leading-snug">
            {meta.description}
          </DialogDescription>
        </DialogHeader>

        {mode === "inactive" && (
          <div className="flex gap-1.5 pt-1">
            {INACTIVE_OPTIONS.map((opt) => (
              <Button
                key={opt.days}
                size="sm"
                variant={inactiveDays === opt.days ? "default" : "outline"}
                onClick={() => setInactiveDays(opt.days)}
                className="h-7 px-2.5 text-[11px]"
              >
                {opt.label}
              </Button>
            ))}
          </div>
        )}

        <div className="flex-1 overflow-y-auto overflow-x-hidden -mx-2 px-2 mt-2">
          {loading && (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          )}
          {!loading && rows && rows.length === 0 && (
            <p className="text-sm text-muted-foreground py-8 text-center">
              Nenhum usuário encontrado.
            </p>
          )}
          {!loading && sortedRows && sortedRows.length > 0 && (
            <ul className="divide-y divide-border/40">
              {sortedRows.map((r) => {
                const sentAt = r.user_id ? welcomeStatus[r.user_id] : null;
                const isSending = sendingId === r.user_id;

                // Data exibida conforme o modo
                let dateLabel: string | null = null;
                let dateTooltip: string | null = null;
                if (mode === "deleted") {
                  dateLabel = formatDateTime(r.deleted_at);
                  dateTooltip = r.deleted_at ? `Excluída em ${dateLabel}` : null;
                } else if (mode === "inactive") {
                  dateLabel = formatDateTime(r.last_seen);
                  dateTooltip = r.last_seen ? `Último acesso ${dateLabel}` : "Sem acesso registrado";
                } else if (r.created_at) {
                  const d = new Date(r.created_at);
                  dateLabel = d.toLocaleDateString("pt-BR");
                  dateTooltip = dateLabel;
                }

                return (
                  <li key={r.id} className="flex items-center gap-2 py-2 px-0.5 min-w-0">
                    <button
                      onClick={() => goToProfile(r)}
                      className="flex-1 min-w-0 flex items-center gap-2 sm:gap-3 rounded-md hover:bg-muted/60 transition text-left py-1.5 px-1"
                    >
                      <Avatar className="h-9 w-9 shrink-0">
                        <AvatarImage src={r.avatar_url || undefined} />
                        <AvatarFallback>
                          <UserRound className="h-4 w-4 text-muted-foreground" />
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {r.full_name || r.username || "Sem nome"}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {r.username ? `@${r.username}` : r.user_id || r.id}
                        </p>
                      </div>
                    </button>

                    <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                      {dateLabel && (
                        <span
                          title={dateTooltip || undefined}
                          className={cn(
                            "text-[10.5px] sm:text-[11px] whitespace-nowrap tabular-nums",
                            mode === "deleted" ? "text-destructive" :
                            mode === "inactive" ? "text-amber-500" :
                            "text-muted-foreground",
                          )}
                        >
                          {dateLabel}
                        </span>
                      )}

                      {mode === "new_today" && r.user_id && !statusLoaded && (
                        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                          <Loader2 className="h-3 w-3 animate-spin" />
                        </span>
                      )}
                      {mode === "new_today" && r.user_id && statusLoaded && (
                        sentAt ? (
                          <span
                            title={`Enviada em ${new Date(sentAt).toLocaleString("pt-BR")}`}
                            className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 text-emerald-500 px-1.5 sm:px-2 py-1 text-[10.5px] sm:text-[11px] font-medium border border-emerald-500/30 whitespace-nowrap"
                          >
                            <CheckCircle2 className="h-3 w-3" />
                            <span className="hidden sm:inline">Enviada</span>
                          </span>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-[10.5px] sm:text-[11px] gap-1"
                            onClick={() => handleSendWelcome(r)}
                            disabled={isSending}
                          >
                            {isSending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                            <span className="hidden sm:inline">Enviar</span>
                          </Button>
                        )
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

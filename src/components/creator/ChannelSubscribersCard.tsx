import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseExternal";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Users, Loader2, Calendar, Crown } from "lucide-react";
import { cn } from "@/lib/utils";

type Row = {
  subscription_id: string;
  subscriber_id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  status: string | null;
  price: number | null;
  started_at: string | null;
  expires_at: string | null;
  cycle: "mensal" | "anual" | "lifetime" | string | null;
};

const fmtDate = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—";

const cycleStyles: Record<string, string> = {
  mensal: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  anual: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  lifetime: "bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30",
};

interface Props {
  creatorProfileId: string;
}

export default function ChannelSubscribersCard({ creatorProfileId }: Props) {
  const [open, setOpen] = useState(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["channel-subscribers-list", creatorProfileId],
    enabled: !!creatorProfileId && open,
    staleTime: 30_000,
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await (supabase as any).rpc("get_channel_subscribers_list", {
        p_creator: creatorProfileId,
      });
      if (error) throw error;
      return (data || []) as Row[];
    },
  });

  const total = data?.length ?? 0;
  const ativos = (data || []).filter((r) => {
    if (r.status && r.status !== "active") return false;
    if (!r.expires_at) return true;
    return new Date(r.expires_at).getTime() > Date.now();
  }).length;

  return (
    <>
      <Card className="p-4 space-y-2 border-amber-400/30 bg-gradient-to-br from-amber-500/5 to-transparent">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-semibold flex items-center gap-2 text-sm">
            <Users className="h-4 w-4 text-amber-400" /> Meus assinantes
          </h3>
          <Badge variant="outline" className="border-amber-400/40 text-amber-300 text-[10px]">
            só você vê
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          Acompanhe quem assina seu canal, o tipo de plano e quando renova.
        </p>
        <Button
          onClick={() => setOpen(true)}
          className="w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-black font-semibold h-9"
          size="sm"
        >
          <Users className="h-4 w-4 mr-1.5" />
          Ver lista de assinantes
        </Button>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Crown className="h-5 w-5 text-amber-400" />
              Assinantes do canal
            </DialogTitle>
            <DialogDescription>
              {isLoading ? "Carregando…" : `${total} assinante(s) · ${ativos} ativo(s)`}
            </DialogDescription>
          </DialogHeader>

          <div className="overflow-y-auto flex-1 -mx-6 px-6">
            {isLoading && (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            )}

            {error && (
              <div className="text-center py-10 space-y-2">
                <p className="text-sm text-destructive">Não foi possível carregar os assinantes.</p>
                <p className="text-xs text-muted-foreground">{(error as Error).message}</p>
                <Button size="sm" variant="outline" onClick={() => refetch()}>Tentar novamente</Button>
              </div>
            )}

            {!isLoading && !error && total === 0 && (
              <div className="text-center py-10 text-sm text-muted-foreground">
                Ainda não há assinantes neste canal.
              </div>
            )}

            {!isLoading && !error && total > 0 && (
              <ul className="divide-y divide-border/40">
                {data!.map((r) => {
                  const cycle = (r.cycle || "mensal").toLowerCase();
                  const cycleLabel = cycle === "anual" ? "Anual" : cycle === "lifetime" ? "Vitalício" : "Mensal";
                  const active = (!r.status || r.status === "active") && (!r.expires_at || new Date(r.expires_at).getTime() > Date.now());
                  return (
                    <li key={r.subscription_id} className="py-3 flex items-center gap-3">
                      <Avatar className="h-10 w-10 shrink-0">
                        <AvatarImage src={r.avatar_url || undefined} />
                        <AvatarFallback>{(r.username || "?")[0]?.toUpperCase()}</AvatarFallback>
                      </Avatar>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          {/* Privacidade: exibir apenas @username (sem display_name/nome real). */}
                          <p className="text-sm font-medium truncate">{r.username ? `@${r.username}` : "—"}</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-0.5 text-[11px] text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            Início {fmtDate(r.started_at)}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {r.expires_at ? `Termina ${fmtDate(r.expires_at)}` : "Sem expiração"}
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <Badge
                          variant="outline"
                          className={cn("text-[10px] capitalize", cycleStyles[cycle] || cycleStyles.mensal)}
                        >
                          {cycleLabel}
                        </Badge>
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px]",
                            active
                              ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                              : "bg-muted text-muted-foreground border-border"
                          )}
                        >
                          {active ? "ativo" : (r.status || "encerrado")}
                        </Badge>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

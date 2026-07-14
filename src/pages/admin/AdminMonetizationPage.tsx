import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseExternal";
import { useIsMasterAdmin } from "@/hooks/useUserRoles";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { CheckCircle2, XCircle, Pause, Snowflake, Search, ShieldAlert } from "lucide-react";

type Row = {
  id: string;
  creator_id: string;
  full_name: string | null;
  document_number: string | null;
  person_type: string | null;
  pix_key_type: string | null;
  pix_key: string | null;
  monetization_status: string;
  kyc_status: string;
  created_at: string;
};

const STATUS_FILTERS = ["pending_review", "approved", "rejected", "suspended", "frozen", "blocked"] as const;

export default function AdminMonetizationPage() {
  const { data: isMasterAdmin, isLoading } = useIsMasterAdmin();
  const [rows, setRows] = useState<Row[]>([]);
  const [filter, setFilter] = useState<string>("pending_review");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [profilesMap, setProfilesMap] = useState<Record<string, { username?: string; name?: string }>>({});

  async function load() {
    setLoading(true);
    let q = supabase.from("creator_payout_profiles" as any).select("*").order("created_at", { ascending: false }).limit(100);
    if (filter !== "all") q = q.eq("monetization_status", filter);
    const { data, error } = await q;
    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }
    const list = (data || []) as any as Row[];
    setRows(list);

    const ids = Array.from(new Set(list.map((r) => r.creator_id)));
    if (ids.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, username, name")
        .in("id", ids);
      const map: Record<string, any> = {};
      (profs || []).forEach((p: any) => { map[p.id] = { username: p.username, name: p.name }; });
      setProfilesMap(map);
    }
    setLoading(false);
  }

  useEffect(() => { if (isMasterAdmin) load(); /* eslint-disable-next-line */ }, [isMasterAdmin, filter]);

  async function changeStatus(creator_id: string, new_status: string, reason?: string) {
    const patch: any = { monetization_status: new_status };
    if (new_status === "frozen" || new_status === "suspended" || new_status === "blocked") {
      patch.kyc_status = patch.kyc_status; // no-op
    }
    const { error } = await supabase
      .from("creator_payout_profiles" as any)
      .update(patch)
      .eq("creator_id", creator_id);
    if (error) { toast.error(error.message); return; }

    // Mirror payout_frozen on profile if frozen/suspended
    const frozen = new_status === "frozen" || new_status === "suspended" || new_status === "blocked";
    await supabase
      .from("profiles")
      .update({ payout_frozen: frozen, payout_frozen_reason: frozen ? (reason || new_status) : null } as any)
      .eq("id", creator_id);

    toast.success(`Status atualizado: ${new_status}`);
    load();
  }

  if (isLoading) return <div className="p-6 text-muted-foreground">Carregando...</div>;
  if (!isMasterAdmin) {
    return (
      <div className="p-6 max-w-md mx-auto">
        <Card className="p-6 flex gap-3 items-start border-destructive/30 bg-destructive/10">
          <ShieldAlert className="w-5 h-5 text-destructive mt-0.5" />
          <div>
            <p className="font-semibold">Acesso restrito</p>
            <p className="text-sm text-muted-foreground">Apenas o Admin Master pode gerenciar monetização.</p>
          </div>
        </Card>
      </div>
    );
  }

  const filtered = rows.filter((r) => {
    if (!search.trim()) return true;
    const s = search.toLowerCase();
    const p = profilesMap[r.creator_id] || {};
    return (
      r.full_name?.toLowerCase().includes(s) ||
      r.document_number?.toLowerCase().includes(s) ||
      r.pix_key?.toLowerCase().includes(s) ||
      p.username?.toLowerCase().includes(s) ||
      p.name?.toLowerCase().includes(s)
    );
  });

  return (
    <div className="max-w-6xl mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Monetização — Admin Master</h1>
        <Badge variant="secondary">{filtered.length} criadores</Badge>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant={filter === "all" ? "default" : "outline"} onClick={() => setFilter("all")}>Todos</Button>
        {STATUS_FILTERS.map((s) => (
          <Button key={s} size="sm" variant={filter === s ? "default" : "outline"} onClick={() => setFilter(s)}>
            {s.replace("_", " ")}
          </Button>
        ))}
      </div>

      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" />
        <Input className="pl-9" placeholder="Buscar por nome, CPF/CNPJ, chave PIX, @user…"
          value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {loading ? (
        <div className="text-muted-foreground">Carregando…</div>
      ) : (
        <div className="space-y-2">
          {filtered.map((r) => {
            const p = profilesMap[r.creator_id] || {};
            return (
              <Card key={r.id} className="p-4 space-y-3">
                <div className="flex justify-between flex-wrap gap-2">
                  <div>
                    <p className="font-semibold">
                      {p.name || r.full_name || "—"}{" "}
                      {p.username && <span className="text-muted-foreground text-sm">@{p.username}</span>}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {r.person_type} · {r.document_number || "sem doc"} · PIX {r.pix_key_type}: {r.pix_key || "—"}
                    </p>
                    <p className="text-xs text-muted-foreground">Solicitado em {new Date(r.created_at).toLocaleString("pt-BR")}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge>{r.monetization_status}</Badge>
                    <span className="text-xs text-muted-foreground">KYC: {r.kyc_status}</span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="default" onClick={() => changeStatus(r.creator_id, "approved")}>
                    <CheckCircle2 className="w-4 h-4 mr-1" /> Aprovar
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => {
                    const reason = prompt("Motivo da rejeição:") || "";
                    if (reason) changeStatus(r.creator_id, "rejected", reason);
                  }}>
                    <XCircle className="w-4 h-4 mr-1" /> Rejeitar
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => {
                    const reason = prompt("Motivo da suspensão:") || "";
                    if (reason) changeStatus(r.creator_id, "suspended", reason);
                  }}>
                    <Pause className="w-4 h-4 mr-1" /> Suspender
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => {
                    const reason = prompt("Motivo do congelamento de saldo:") || "";
                    if (reason) changeStatus(r.creator_id, "frozen", reason);
                  }}>
                    <Snowflake className="w-4 h-4 mr-1" /> Congelar saldo
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => changeStatus(r.creator_id, "pending_review")}>
                    Reabrir análise
                  </Button>
                </div>
              </Card>
            );
          })}
          {filtered.length === 0 && <p className="text-muted-foreground text-sm py-8 text-center">Nenhum criador encontrado.</p>}
        </div>
      )}
    </div>
  );
}

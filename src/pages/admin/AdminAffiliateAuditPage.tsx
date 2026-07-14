import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseExternal";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Download, Search, ShieldAlert, ShieldCheck } from "lucide-react";
import { exportToCSV } from "@/hooks/useFinanceReports";

type AuditRow = {
  id: string;
  transaction_id: string;
  payment_external_id: string | null;
  referred_user_id: string | null;
  affiliate_id_input: string | null;
  affiliate_id_applied: string | null;
  is_valid: boolean;
  rejection_reason: string | null;
  affiliate_amount: number;
  creator_amount: number;
  created_at: string;
};

const REJECTION_REASONS = [
  "self_referral",
  "affiliate_not_found",
  "affiliate_banned",
  "affiliate_shadowbanned",
  "affiliate_fraud_flagged",
  "referred_banned",
  "no_affiliate",
  "valid",
];

const fmt = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(n) || 0);

export default function AdminAffiliateAuditPage() {
  const today = new Date();
  const past = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
  const [start, setStart] = useState(past.toISOString().slice(0, 10));
  const [end, setEnd] = useState(today.toISOString().slice(0, 10));
  const [validity, setValidity] = useState<"all" | "valid" | "invalid">("all");
  const [reason, setReason] = useState<string>("all");
  const [affiliateId, setAffiliateId] = useState("");
  const [txQuery, setTxQuery] = useState("");

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["affiliate-audit", start, end, validity, reason, affiliateId, txQuery],
    queryFn: async (): Promise<AuditRow[]> => {
      let q = (supabase as any)
        .from("affiliate_split_audit")
        .select("*")
        .gte("created_at", new Date(`${start}T00:00:00`).toISOString())
        .lte("created_at", new Date(`${end}T23:59:59`).toISOString())
        .order("created_at", { ascending: false })
        .limit(1000);
      if (validity === "valid") q = q.eq("is_valid", true);
      if (validity === "invalid") q = q.eq("is_valid", false);
      if (reason !== "all") q = q.eq("rejection_reason", reason);
      if (affiliateId.trim()) q = q.eq("affiliate_id_applied", affiliateId.trim());
      if (txQuery.trim()) {
        q = q.or(
          `transaction_id.ilike.%${txQuery.trim()}%,payment_external_id.ilike.%${txQuery.trim()}%`
        );
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as AuditRow[];
    },
  });

  const totals = useMemo(() => {
    const rows = data || [];
    return {
      total: rows.length,
      valid: rows.filter((r) => r.is_valid).length,
      invalid: rows.filter((r) => !r.is_valid).length,
      affiliate_paid: rows.reduce((s, r) => s + Number(r.affiliate_amount || 0), 0),
      creator_paid: rows.reduce((s, r) => s + Number(r.creator_amount || 0), 0),
    };
  }, [data]);

  const handleExport = () => {
    if (!data?.length) return;
    exportToCSV(
      data.map((r) => ({
        criado_em: new Date(r.created_at).toISOString(),
        transaction_id: r.transaction_id,
        payment_external_id: r.payment_external_id ?? "",
        referred_user_id: r.referred_user_id ?? "",
        affiliate_id_input: r.affiliate_id_input ?? "",
        affiliate_id_applied: r.affiliate_id_applied ?? "",
        is_valid: r.is_valid ? "sim" : "nao",
        rejection_reason: r.rejection_reason ?? "",
        affiliate_amount: Number(r.affiliate_amount || 0).toFixed(2),
        creator_amount: Number(r.creator_amount || 0).toFixed(2),
      })),
      `affiliate-audit-${start}_a_${end}.csv`
    );
  };

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-primary" />
          Auditoria de Split Afiliado
        </h1>
        <p className="text-muted-foreground text-sm">
          Decisão registrada para cada transação: afiliado validado, rejeitado e motivo.
        </p>
      </div>

      <Card>
        <CardContent className="pt-6 grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3 items-end">
          <div>
            <Label>Início</Label>
            <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div>
            <Label>Fim</Label>
            <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
          <div>
            <Label>Validade</Label>
            <Select value={validity} onValueChange={(v: any) => setValidity(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="valid">Apenas válidas</SelectItem>
                <SelectItem value="invalid">Apenas inválidas</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Motivo</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {REJECTION_REASONS.map((r) => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Afiliado aplicado (UUID)</Label>
            <Input
              placeholder="profile.id"
              value={affiliateId}
              onChange={(e) => setAffiliateId(e.target.value)}
            />
          </div>
          <div>
            <Label>Transação</Label>
            <Input
              placeholder="id ou external_id"
              value={txQuery}
              onChange={(e) => setTxQuery(e.target.value)}
            />
          </div>
          <div className="md:col-span-3 lg:col-span-6 flex flex-wrap gap-2 justify-end">
            <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
              <Search className="h-4 w-4 mr-2" /> Buscar
            </Button>
            <Button onClick={handleExport} disabled={!data?.length}>
              <Download className="h-4 w-4 mr-2" /> Exportar CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Kpi label="Registros" value={String(totals.total)} loading={isLoading} />
        <Kpi label="Válidas" value={String(totals.valid)} loading={isLoading} accent="text-emerald-500" />
        <Kpi label="Rejeitadas" value={String(totals.invalid)} loading={isLoading} accent="text-destructive" />
        <Kpi label="Afiliado pago" value={fmt(totals.affiliate_paid)} loading={isLoading} accent="text-primary" />
        <Kpi label="Criador absorveu" value={fmt(totals.creator_paid)} loading={isLoading} accent="text-amber-500" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Resultados (máx 1000)</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : !data?.length ? (
            <div className="py-12 text-center text-muted-foreground text-sm">
              Nenhum registro encontrado para o filtro atual.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs md:text-sm">
                <thead className="text-left text-muted-foreground border-b">
                  <tr>
                    <th className="py-2 pr-2">Data</th>
                    <th className="pr-2">Transação</th>
                    <th className="pr-2">Afiliado aplicado</th>
                    <th className="pr-2">Status</th>
                    <th className="pr-2">Motivo</th>
                    <th className="pr-2 text-right">Afiliado</th>
                    <th className="pr-2 text-right">Criador</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((r) => (
                    <tr key={r.id} className="border-b border-border/40 hover:bg-muted/30">
                      <td className="py-2 pr-2 whitespace-nowrap">
                        {new Date(r.created_at).toLocaleString("pt-BR")}
                      </td>
                      <td className="pr-2 font-mono text-[11px]">
                        <div className="truncate max-w-[180px]" title={r.transaction_id}>
                          {r.transaction_id}
                        </div>
                        {r.payment_external_id && (
                          <div className="truncate max-w-[180px] text-muted-foreground" title={r.payment_external_id}>
                            ext: {r.payment_external_id}
                          </div>
                        )}
                      </td>
                      <td className="pr-2 font-mono text-[11px]">
                        <div className="truncate max-w-[180px]" title={r.affiliate_id_applied ?? ""}>
                          {r.affiliate_id_applied ?? "—"}
                        </div>
                        {r.affiliate_id_input && r.affiliate_id_input !== r.affiliate_id_applied && (
                          <div className="truncate max-w-[180px] text-muted-foreground" title={r.affiliate_id_input}>
                            in: {r.affiliate_id_input}
                          </div>
                        )}
                      </td>
                      <td className="pr-2">
                        {r.is_valid ? (
                          <Badge className="bg-emerald-500/15 text-emerald-500 border-emerald-500/30">
                            <ShieldCheck className="h-3 w-3 mr-1" /> válida
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-destructive border-destructive/40">
                            <ShieldAlert className="h-3 w-3 mr-1" /> rejeitada
                          </Badge>
                        )}
                      </td>
                      <td className="pr-2 text-muted-foreground">{r.rejection_reason ?? "—"}</td>
                      <td className="pr-2 text-right font-semibold text-primary">
                        {fmt(r.affiliate_amount)}
                      </td>
                      <td className="pr-2 text-right">{fmt(r.creator_amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({ label, value, loading, accent }: { label: string; value: string; loading?: boolean; accent?: string }) {
  return (
    <Card>
      <CardContent className="pt-4 pb-3">
        <div className="text-xs text-muted-foreground">{label}</div>
        {loading ? (
          <Skeleton className="h-7 w-20 mt-2" />
        ) : (
          <div className={`text-xl font-bold mt-1 ${accent ?? ""}`}>{value}</div>
        )}
      </CardContent>
    </Card>
  );
}

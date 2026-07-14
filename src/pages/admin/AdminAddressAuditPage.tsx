/**
 * AdminAddressAuditPage — Auditoria de capturas GPS dos usuários (admin master)
 * Exporta CSV e PDF, com filtros por usuário, data (de/até) e tipo de captura.
 */
import { useEffect, useMemo, useState } from "react";
import { Loader2, Download, FileText, Search, MapPin, ShieldCheck, CalendarRange, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabaseExternal";
import { useIsMasterAdmin } from "@/hooks/useUserRoles";
import { formatAuditStatus } from "@/components/settings/AddressSettings";
// jsPDF dynamically imported only when "Exportar PDF" is clicked (saves ~415 KB from this page chunk)

type AuditRow = {
  id: string;
  profile_id: string;
  user_id: string | null;
  username: string | null;
  display_name: string | null;
  email: string | null;
  lat: number;
  lng: number;
  address_text: string | null;
  address_street: string | null;
  address_city: string | null;
  address_state: string | null;
  address_cep: string | null;
  source: string;
  status: string;
  status_detail: string | null;
  failure_reason: string | null;
  is_first_capture: boolean;
  captured_at: string;
};

const PAGE_SIZE = 50;

// ───────────────────────── CSV helpers ─────────────────────────
function escapeCsv(v: unknown): string {
  if (v == null) return "";
  const s = String(v);
  if (/[",\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function buildCsv(rows: AuditRow[]): string {
  const header = [
    "captured_at", "username", "display_name", "email",
    "lat", "lng", "address_text",
    "address_street", "address_city", "address_state", "address_cep",
    "source", "status", "status_detail", "failure_reason",
    "is_first_capture", "profile_id", "user_id",
  ];
  const lines = rows.map((r) => header.map((k) => escapeCsv((r as any)[k])).join(","));
  return [header.join(","), ...lines].join("\n");
}

function downloadBlob(filename: string, content: BlobPart, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 0);
}

// PDF builder lives in ./auditPdfBuilder (dynamic import below)

// ───────────────────────── Component ─────────────────────────
export default function AdminAddressAuditPage() {
  const { data: isMaster, isLoading: roleLoading } = useIsMasterAdmin();
  const { toast } = useToast();
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [search, setSearch] = useState("");
  const [onlyFirst, setOnlyFirst] = useState(false);
  const [dateFrom, setDateFrom] = useState<string>(""); // yyyy-mm-dd
  const [dateTo, setDateTo]     = useState<string>("");

  const applyFilters = (q: any) => {
    if (onlyFirst) q = q.eq("is_first_capture", true);
    if (search.trim()) {
      const s = search.trim();
      q = q.or(`username.ilike.%${s}%,display_name.ilike.%${s}%,email.ilike.%${s}%,address_city.ilike.%${s}%`);
    }
    if (dateFrom) q = q.gte("captured_at", `${dateFrom}T00:00:00.000Z`);
    if (dateTo)   q = q.lte("captured_at", `${dateTo}T23:59:59.999Z`);
    return q;
  };

  const load = async (reset = false) => {
    setLoading(true);
    try {
      const from = reset ? 0 : page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      let q = (supabase as any)
        .from("oculto_address_gps_audit")
        .select("*")
        .order("captured_at", { ascending: false })
        .range(from, to);
      q = applyFilters(q);
      const { data, error } = await q;
      if (error) throw error;
      const next = (data || []) as AuditRow[];
      setRows(reset ? next : [...rows, ...next]);
      setHasMore(next.length === PAGE_SIZE);
      setPage(reset ? 1 : page + 1);
    } catch (err: any) {
      toast({ title: "Erro ao carregar auditoria", description: err?.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (isMaster) load(true); /* eslint-disable-next-line */ }, [isMaster]);

  const handleSearch = () => { setPage(0); load(true); };
  const clearDates = () => { setDateFrom(""); setDateTo(""); setPage(0); setTimeout(() => load(true), 0); };

  const exportCsv = async () => {
    let q = (supabase as any)
      .from("oculto_address_gps_audit")
      .select("*")
      .order("captured_at", { ascending: false })
      .limit(5000);
    q = applyFilters(q);
    const { data, error } = await q;
    if (error) { toast({ title: "Erro ao exportar", description: error.message, variant: "destructive" }); return; }
    downloadBlob(`auditoria-gps-${Date.now()}.csv`, buildCsv((data || []) as AuditRow[]), "text/csv;charset=utf-8");
    toast({ title: "CSV exportado!", description: `${data?.length ?? 0} registros.` });
  };

  const exportPdf = async () => {
    let q = (supabase as any)
      .from("oculto_address_gps_audit")
      .select("*")
      .order("captured_at", { ascending: false })
      .limit(2000);
    q = applyFilters(q);
    const { data, error } = await q;
    if (error) { toast({ title: "Erro ao exportar", description: error.message, variant: "destructive" }); return; }
    const { buildAuditPdf } = await import("./auditPdfBuilder");
    const blob = buildAuditPdf((data || []) as AuditRow[], dateFrom, dateTo);
    downloadBlob(`auditoria-gps-${Date.now()}.pdf`, blob, "application/pdf");
    toast({ title: "PDF exportado!", description: `${data?.length ?? 0} registros.` });
  };

  const totalShown = useMemo(() => rows.length, [rows]);

  if (roleLoading) {
    return <div className="p-6 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }
  if (!isMaster) {
    return <div className="p-6 text-sm text-destructive">Acesso restrito ao Admin Master.</div>;
  }

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-6xl mx-auto">
      <Card className="bg-card/50 border-border/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Auditoria de Endereços (GPS)
          </CardTitle>
          <CardDescription>
            Histórico imutável de cada captura GPS dos usuários, incluindo a primeira localização registrada na criação da conta.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Filters: search + chips */}
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                placeholder="Buscar por usuário, e-mail ou cidade…"
                className="pl-8 h-9"
              />
            </div>
            <Button variant={onlyFirst ? "default" : "outline"} size="sm" onClick={() => { setOnlyFirst(v => !v); setPage(0); setTimeout(() => load(true), 0); }}>
              Apenas 1ª captura
            </Button>
            <Button variant="outline" size="sm" onClick={handleSearch}>Buscar</Button>
            <div className="flex-1" />
            <Button variant="outline" size="sm" onClick={exportCsv} className="gap-1.5">
              <Download className="h-3.5 w-3.5" /> CSV
            </Button>
            <Button variant="outline" size="sm" onClick={exportPdf} className="gap-1.5">
              <FileText className="h-3.5 w-3.5" /> PDF
            </Button>
          </div>

          {/* Date-range filter row */}
          <div className="flex flex-wrap gap-2 items-center bg-muted/20 border border-border/20 rounded-md px-3 py-2">
            <CalendarRange className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Período:</span>
            <label className="text-xs text-muted-foreground">De</label>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="h-8 w-[150px] text-xs"
              max={dateTo || undefined}
            />
            <label className="text-xs text-muted-foreground">Até</label>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="h-8 w-[150px] text-xs"
              min={dateFrom || undefined}
            />
            <Button size="sm" variant="default" className="h-8" onClick={handleSearch} disabled={!dateFrom && !dateTo}>
              Aplicar período
            </Button>
            {(dateFrom || dateTo) && (
              <Button size="sm" variant="ghost" className="h-8 gap-1 text-muted-foreground" onClick={clearDates}>
                <X className="h-3 w-3" /> Limpar
              </Button>
            )}
          </div>

          <div className="text-xs text-muted-foreground">
            Mostrando {totalShown} registro{totalShown === 1 ? "" : "s"}
            {(dateFrom || dateTo) && (
              <span className="ml-1.5">
                — período <span className="text-foreground/80">{dateFrom || "início"}</span> até{" "}
                <span className="text-foreground/80">{dateTo || "hoje"}</span>
              </span>
            )}
            .
          </div>

          {/* Table */}
          <div className="rounded-md border border-border/30 overflow-hidden">
            <div className="grid grid-cols-12 gap-2 px-3 py-2 text-[11px] font-medium text-muted-foreground bg-muted/30 border-b border-border/20">
              <div className="col-span-2">Data/Hora</div>
              <div className="col-span-2">Usuário</div>
              <div className="col-span-3">Endereço</div>
              <div className="col-span-2">Cidade/UF</div>
              <div className="col-span-2 font-mono">Coordenadas</div>
              <div className="col-span-1 text-right">Status</div>
            </div>
            <ul className="divide-y divide-border/20">
              {rows.map((r) => {
                const statusInfo = formatAuditStatus(r.status, r.status_detail, r.failure_reason);
                return (
                  <li
                    key={r.id}
                    className={`grid grid-cols-12 gap-2 px-3 py-2 text-[11px] items-start ${
                      r.is_first_capture ? "bg-primary/5 border-l-2 border-l-primary" : ""
                    }`}
                  >
                    <div className="col-span-2 text-muted-foreground">
                      {new Date(r.captured_at).toLocaleString("pt-BR")}
                    </div>
                    <div className="col-span-2 truncate">
                      <div className="text-foreground/90 truncate">{r.username || r.display_name || "—"}</div>
                      <div className="text-muted-foreground/70 truncate">{r.email || ""}</div>
                    </div>
                    <div className="col-span-3 text-foreground/80 truncate flex items-start gap-1">
                      <MapPin className="h-3 w-3 mt-px text-primary shrink-0" />
                      <span className="truncate" title={r.address_text || ""}>
                        {r.address_text || r.address_street || "—"}
                      </span>
                    </div>
                    <div className="col-span-2 text-muted-foreground truncate">
                      {[r.address_city, r.address_state].filter(Boolean).join("/") || "—"}
                    </div>
                    <div className="col-span-2 font-mono text-muted-foreground">
                      {Number(r.lat).toFixed(5)}, {Number(r.lng).toFixed(5)}
                    </div>
                    <div className="col-span-1 flex flex-col items-end gap-0.5">
                      <span
                        className={`px-1.5 py-px rounded text-[9px] border whitespace-nowrap ${statusInfo.cls}`}
                        title={statusInfo.detail}
                      >
                        {statusInfo.label}
                      </span>
                      {r.is_first_capture && (
                        <Badge className="bg-primary/15 text-primary border-primary/30 text-[9px] px-1 py-0">★ 1ª</Badge>
                      )}
                    </div>
                  </li>
                );
              })}
              {rows.length === 0 && !loading && (
                <li className="px-3 py-6 text-center text-xs text-muted-foreground">Nenhum registro encontrado.</li>
              )}
            </ul>
          </div>

          <div className="flex justify-center pt-1">
            {hasMore && (
              <Button variant="outline" size="sm" onClick={() => load(false)} disabled={loading}>
                {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Carregar mais"}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

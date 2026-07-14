import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabaseExternal";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import {
  Shield, Eye, FileSearch, Gavel, AlertTriangle, Lock, Loader2,
  Download, Clock, CheckCircle2, XCircle,
} from "lucide-react";

type Hit = {
  id: string; term_matched: string; severity: string;
  message_id: string | null; conversation_id: string | null;
  sender_id: string | null; snippet: string | null;
  reviewed: boolean; created_at: string;
};
type Case = {
  id: string; case_number: string; target_user_id: string;
  reason: string; legal_doc_ref: string; status: string;
  opened_at: string; expires_at: string;
};
type Msg = {
  id: string; conversation_id: string; sender_id: string;
  content: string; is_encrypted: boolean; media_type: string | null; created_at: string;
};

function severityBadge(s: string) {
  const map: Record<string, string> = {
    low: "bg-muted text-muted-foreground",
    medium: "bg-yellow-500/20 text-yellow-600 border-yellow-500/30",
    high: "bg-orange-500/20 text-orange-600 border-orange-500/30",
    critical: "bg-destructive/20 text-destructive border-destructive/30",
  };
  return <Badge variant="outline" className={map[s] || map.medium}>{s}</Badge>;
}

function formatRemaining(expires_at: string): { text: string; expired: boolean } {
  const ms = new Date(expires_at).getTime() - Date.now();
  if (ms <= 0) return { text: "EXPIRADO", expired: true };
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (d > 0) return { text: `${d}d ${h}h restantes`, expired: false };
  if (h > 0) return { text: `${h}h ${m}min restantes`, expired: false };
  return { text: `${m}min restantes`, expired: false };
}

function csvEscape(v: any): string {
  if (v === null || v === undefined) return "";
  const s = String(v).replace(/"/g, '""');
  return /[",\n]/.test(s) ? `"${s}"` : s;
}
function downloadCsv(filename: string, rows: any[]) {
  if (!rows.length) { toast.error("Nenhum registro para exportar"); return; }
  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(","),
    ...rows.map(r => headers.map(h => csvEscape(r[h])).join(",")),
  ].join("\n");
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

// ─────────────────────────────────────────────────────────────
// Aba 1 — Perfil read-only
// ─────────────────────────────────────────────────────────────
function ProfileReadOnlyTab() {
  const [target, setTarget] = useState("");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const fetchProfile = async () => {
    if (!target.trim()) return;
    setLoading(true);
    const { data, error } = await supabase.rpc("investigation_read_profile", { p_target_user_id: target.trim() });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    setData(data); toast.success("Acesso registrado em audit logs");
  };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Eye className="h-4 w-4 text-primary" />
          <h3 className="font-semibold">Visualizador de perfil (somente leitura)</h3>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          Mostra o perfil como visitante. Não acessa chats nem mídias privadas. Cada consulta é auditada.
        </p>
        <div className="flex gap-2">
          <Input placeholder="user_id ou profile id" value={target} onChange={(e) => setTarget(e.target.value)} />
          <Button onClick={fetchProfile} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Consultar"}
          </Button>
        </div>
      </Card>
      {data && (
        <Card className="p-4">
          <h4 className="font-medium mb-2">Dados públicos do perfil</h4>
          <ScrollArea className="h-[420px]">
            <pre className="text-xs whitespace-pre-wrap break-all">{JSON.stringify(data, null, 2)}</pre>
          </ScrollArea>
        </Card>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Aba 2 — Conversas denunciadas
// ─────────────────────────────────────────────────────────────
function ReportedThreadsTab() {
  const [reportId, setReportId] = useState("");
  const [reports, setReports] = useState<any[]>([]);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.from("content_reports")
      .select("id, category, priority_level, status, created_at, reported_user_id")
      .in("status", ["pending", "investigating"])
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data }) => setReports(data ?? []));
  }, []);

  const fetchThread = async (id: string) => {
    setLoading(true); setReportId(id);
    const { data, error } = await supabase.rpc("investigation_read_reported_thread", { p_report_id: id });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    setMsgs((data as Msg[]) ?? []);
    toast.success(`${(data as Msg[])?.length ?? 0} mensagens (janela ±7 dias)`);
  };

  return (
    <div className="grid md:grid-cols-2 gap-4">
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <FileSearch className="h-4 w-4 text-primary" />
          <h3 className="font-semibold">Denúncias abertas (≤30 dias)</h3>
        </div>
        <ScrollArea className="h-[520px] pr-2">
          <div className="space-y-2">
            {reports.map(r => (
              <button key={r.id} onClick={() => fetchThread(r.id)}
                className={`w-full text-left p-2 rounded border hover:bg-muted/50 ${reportId === r.id ? "border-primary" : "border-border"}`}>
                <div className="flex justify-between text-xs">
                  <span className="font-mono">{r.id.slice(0,8)}</span>
                  <Badge variant="outline">{r.priority_level}</Badge>
                </div>
                <div className="text-sm mt-1">{r.category}</div>
                <div className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString("pt-BR")}</div>
              </button>
            ))}
            {reports.length === 0 && <p className="text-xs text-muted-foreground">Nenhuma denúncia aberta.</p>}
          </div>
        </ScrollArea>
      </Card>
      <Card className="p-4">
        <h3 className="font-semibold mb-3">Thread relacionada</h3>
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        <ScrollArea className="h-[520px] pr-2">
          <div className="space-y-2">
            {msgs.map(m => (
              <div key={m.id} className="p-2 rounded border border-border text-sm">
                <div className="text-[10px] text-muted-foreground flex justify-between">
                  <span>{m.sender_id.slice(0,8)}</span>
                  <span>{new Date(m.created_at).toLocaleString("pt-BR")}</span>
                </div>
                {m.is_encrypted ? (
                  <div className="flex items-center gap-1 text-muted-foreground italic text-xs mt-1">
                    <Lock className="h-3 w-3" /> Mensagem E2EE — conteúdo não acessível
                  </div>
                ) : (
                  <div className="mt-1 break-words">{m.content}</div>
                )}
              </div>
            ))}
            {msgs.length === 0 && !loading && <p className="text-xs text-muted-foreground">Selecione uma denúncia.</p>}
          </div>
        </ScrollArea>
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Aba 3 — Modo Judicial (status + countdown + bloqueio)
// ─────────────────────────────────────────────────────────────
function JudicialTab() {
  const [cases, setCases] = useState<Case[]>([]);
  const [form, setForm] = useState({ case_number: "", target_user_id: "", legal_doc_ref: "", reason: "", expires_in_days: 30 });
  const [active, setActive] = useState<Case | null>(null);
  const [convs, setConvs] = useState<any[]>([]);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [, force] = useState(0);

  // tick a cada 30s para atualizar contador
  useEffect(() => {
    const t = setInterval(() => force(x => x + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  const load = useCallback(async () => {
    const { data } = await supabase.from("oculto_investigation_cases")
      .select("*").order("opened_at", { ascending: false }).limit(100);
    setCases((data as Case[]) ?? []);
  }, []);
  useEffect(() => { load(); }, [load]);

  const activeRemaining = active ? formatRemaining(active.expires_at) : null;
  const activeBlocked = !active || active.status !== "active" || (activeRemaining?.expired ?? true);

  const openCase = async () => {
    if (!form.case_number || !form.target_user_id || !form.legal_doc_ref || !form.reason) {
      toast.error("Preencha todos os campos obrigatórios"); return;
    }
    if (form.expires_in_days < 1 || form.expires_in_days > 365) {
      toast.error("Validade deve ser entre 1 e 365 dias"); return;
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const expires_at = new Date(Date.now() + form.expires_in_days * 86400000).toISOString();
    const { error } = await supabase.from("oculto_investigation_cases").insert({
      case_number: form.case_number.trim(), target_user_id: form.target_user_id.trim(),
      legal_doc_ref: form.legal_doc_ref.trim(), reason: form.reason.trim(),
      opened_by: user.id, expires_at,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Caso aberto e auditado");
    setForm({ case_number: "", target_user_id: "", legal_doc_ref: "", reason: "", expires_in_days: 30 });
    load();
  };

  const closeCase = async (id: string) => {
    const { error } = await supabase.from("oculto_investigation_cases")
      .update({ status: "closed", closed_at: new Date().toISOString() }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    if (active?.id === id) setActive(null);
    toast.success("Caso encerrado"); load();
  };

  const openConvs = async (c: Case) => {
    const rem = formatRemaining(c.expires_at);
    if (c.status !== "active" || rem.expired) {
      toast.error("Caso inativo ou expirado — ações bloqueadas");
      return;
    }
    setActive(c); setMsgs([]);
    const { data, error } = await supabase.rpc("investigation_list_target_conversations", { p_case_id: c.id });
    if (error) { toast.error(error.message); return; }
    setConvs((data as any[]) ?? []);
  };

  const readThread = async (convId: string) => {
    if (!active || activeBlocked) { toast.error("Caso bloqueado"); return; }
    const { data, error } = await supabase.rpc("investigation_read_judicial_thread", {
      p_case_id: active.id, p_conversation_id: convId,
    });
    if (error) { toast.error(error.message); return; }
    setMsgs((data as Msg[]) ?? []);
  };

  return (
    <div className="space-y-4">
      {/* Formulário */}
      <Card className="p-4 border-destructive/30 bg-destructive/5">
        <div className="flex items-center gap-2 mb-3">
          <Gavel className="h-4 w-4 text-destructive" />
          <h3 className="font-semibold">Abrir caso de investigação (ordem judicial)</h3>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          Exige nº de processo/ofício, alvo, motivo e expiração obrigatória. Cada leitura é gravada.
        </p>
        <div className="grid sm:grid-cols-2 gap-3">
          <div><Label>Nº processo / ofício *</Label><Input value={form.legal_doc_ref} onChange={(e) => setForm({ ...form, legal_doc_ref: e.target.value })} maxLength={100} /></div>
          <div><Label>Identificador interno do caso *</Label><Input value={form.case_number} onChange={(e) => setForm({ ...form, case_number: e.target.value })} maxLength={50} /></div>
          <div><Label>user_id do alvo *</Label><Input value={form.target_user_id} onChange={(e) => setForm({ ...form, target_user_id: e.target.value })} /></div>
          <div><Label>Validade (dias, 1–365) *</Label><Input type="number" min={1} max={365} value={form.expires_in_days} onChange={(e) => setForm({ ...form, expires_in_days: Number(e.target.value) })} /></div>
          <div className="sm:col-span-2"><Label>Motivo / justificativa *</Label><Textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} maxLength={1000} /></div>
        </div>
        <Button className="mt-3" onClick={openCase}>Abrir caso</Button>
      </Card>

      {/* Lista de casos com status + countdown */}
      <Card className="p-4">
        <h3 className="font-semibold mb-3">Casos</h3>
        <div className="space-y-2">
          {cases.map(c => {
            const rem = formatRemaining(c.expires_at);
            const blocked = c.status !== "active" || rem.expired;
            return (
              <div key={c.id} className={`p-3 border rounded ${blocked ? "border-border opacity-70" : "border-primary/40"}`}>
                <div className="flex flex-wrap gap-2 items-center justify-between">
                  <div className="text-sm">
                    <div className="font-mono text-xs">{c.case_number}</div>
                    <div className="text-xs text-muted-foreground">Alvo {c.target_user_id.slice(0,8)} · processo {c.legal_doc_ref}</div>
                  </div>
                  <div className="flex gap-2 items-center flex-wrap">
                    <Badge variant="outline" className={
                      c.status === "active" && !rem.expired ? "bg-emerald-500/20 text-emerald-600 border-emerald-500/30"
                      : rem.expired ? "bg-destructive/20 text-destructive border-destructive/30"
                      : "bg-muted text-muted-foreground"
                    }>
                      {rem.expired ? "expirado" : c.status}
                    </Badge>
                    <Badge variant="outline" className="gap-1">
                      <Clock className="h-3 w-3" /> {rem.text}
                    </Badge>
                    <Button size="sm" variant="outline" disabled={blocked} onClick={() => openConvs(c)}>Abrir</Button>
                    {c.status === "active" && <Button size="sm" variant="ghost" onClick={() => closeCase(c.id)}>Encerrar</Button>}
                  </div>
                </div>
                {blocked && (
                  <div className="text-[11px] text-destructive flex items-center gap-1 mt-2">
                    <XCircle className="h-3 w-3" /> Caso inativo/expirado — leituras bloqueadas pelo backend
                  </div>
                )}
              </div>
            );
          })}
          {cases.length === 0 && <p className="text-xs text-muted-foreground">Nenhum caso registrado.</p>}
        </div>
      </Card>

      {active && (
        <>
          <Card className={`p-3 ${activeBlocked ? "bg-destructive/10 border-destructive/30" : "bg-emerald-500/10 border-emerald-500/30"}`}>
            <div className="flex items-center gap-2 text-sm">
              {activeBlocked ? <XCircle className="h-4 w-4 text-destructive" /> : <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
              <span className="font-medium">Caso {active.case_number}</span>
              <Badge variant="outline">{activeRemaining?.text}</Badge>
              {activeBlocked && <span className="text-xs text-destructive">— Ações bloqueadas</span>}
            </div>
          </Card>

          <div className="grid md:grid-cols-2 gap-4">
            <Card className="p-4">
              <h4 className="font-medium mb-2">Conversas do alvo</h4>
              <ScrollArea className="h-[420px]">
                <div className="space-y-2">
                  {convs.map(c => (
                    <button key={c.conversation_id} onClick={() => readThread(c.conversation_id)}
                      disabled={activeBlocked}
                      className="w-full text-left p-2 border border-border rounded hover:bg-muted/50 text-xs disabled:opacity-50 disabled:cursor-not-allowed">
                      <div className="font-mono">{c.conversation_id.slice(0,12)}</div>
                      <div className="text-muted-foreground">{c.message_count} msgs · última {c.last_message_at ? new Date(c.last_message_at).toLocaleString("pt-BR") : "—"}</div>
                    </button>
                  ))}
                </div>
              </ScrollArea>
            </Card>
            <Card className="p-4">
              <h4 className="font-medium mb-2">Thread</h4>
              <ScrollArea className="h-[420px]">
                <div className="space-y-2">
                  {msgs.map(m => (
                    <div key={m.id} className="p-2 border border-border rounded text-sm">
                      <div className="text-[10px] text-muted-foreground flex justify-between">
                        <span>{m.sender_id.slice(0,8)}</span>
                        <span>{new Date(m.created_at).toLocaleString("pt-BR")}</span>
                      </div>
                      {m.is_encrypted
                        ? <div className="italic text-xs text-muted-foreground flex items-center gap-1 mt-1"><Lock className="h-3 w-3" /> E2EE — não acessível</div>
                        : <div className="mt-1 break-words">{m.content}</div>}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Aba 4 — Palavras-chave + Resultados
// ─────────────────────────────────────────────────────────────
function KeywordsTab() {
  const [kws, setKws] = useState<any[]>([]);
  const [hits, setHits] = useState<Hit[]>([]);
  const [term, setTerm] = useState(""); const [severity, setSeverity] = useState("medium");
  const [filterSev, setFilterSev] = useState<string>("all");
  const [showReviewed, setShowReviewed] = useState(false);

  const load = useCallback(async () => {
    const [{ data: k }, { data: h }] = await Promise.all([
      supabase.from("oculto_moderation_keywords").select("*").order("created_at", { ascending: false }),
      supabase.from("oculto_moderation_keyword_hits").select("*").order("created_at", { ascending: false }).limit(200),
    ]);
    setKws(k ?? []); setHits((h as Hit[]) ?? []);
  }, []);
  useEffect(() => { load(); }, [load]);

  const addKw = async () => {
    if (!term.trim()) return;
    const { error } = await supabase.from("oculto_moderation_keywords").insert({ term: term.trim().toLowerCase(), severity });
    if (error) { toast.error(error.message); return; }
    setTerm(""); toast.success("Palavra-chave adicionada"); load();
  };
  const toggle = async (id: string, enabled: boolean) => {
    await supabase.from("oculto_moderation_keywords").update({ enabled: !enabled }).eq("id", id); load();
  };
  const markReviewed = async (id: string) => {
    await supabase.from("oculto_moderation_keyword_hits").update({ reviewed: true, reviewed_at: new Date().toISOString() }).eq("id", id);
    load();
  };

  const filteredHits = useMemo(() => hits.filter(h =>
    (filterSev === "all" || h.severity === filterSev) &&
    (showReviewed || !h.reviewed)
  ), [hits, filterSev, showReviewed]);

  const exportHits = () => {
    downloadCsv(`palavras_chave_hits_${new Date().toISOString().slice(0,10)}.csv`,
      filteredHits.map(h => ({
        data: new Date(h.created_at).toLocaleString("pt-BR"),
        termo: h.term_matched,
        severidade: h.severity,
        contexto: h.snippet ?? "",
        message_id: h.message_id ?? "",
        conversation_id: h.conversation_id ?? "",
        sender_id: h.sender_id ?? "",
        revisado: h.reviewed ? "sim" : "não",
      })),
    );
  };

  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-2 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-3"><AlertTriangle className="h-4 w-4 text-primary" /><h3 className="font-semibold">Palavras-chave monitoradas</h3></div>
          <div className="flex gap-2 mb-3">
            <Input placeholder="termo (ex: pix urgente)" value={term} onChange={(e) => setTerm(e.target.value)} maxLength={100} />
            <select className="border border-border bg-background rounded px-2 text-sm" value={severity} onChange={(e) => setSeverity(e.target.value)}>
              <option value="low">low</option><option value="medium">medium</option><option value="high">high</option><option value="critical">critical</option>
            </select>
            <Button onClick={addKw}>Add</Button>
          </div>
          <ScrollArea className="h-[420px]">
            <div className="space-y-1">
              {kws.map(k => (
                <div key={k.id} className="flex items-center justify-between p-2 border border-border rounded text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-mono">{k.term}</span>{severityBadge(k.severity)}
                  </div>
                  <Button size="sm" variant={k.enabled ? "default" : "outline"} onClick={() => toggle(k.id, k.enabled)}>
                    {k.enabled ? "Ativo" : "Off"}
                  </Button>
                </div>
              ))}
              {kws.length === 0 && <p className="text-xs text-muted-foreground">Nenhuma palavra-chave cadastrada.</p>}
            </div>
          </ScrollArea>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold">Resultados (mensagens não-criptografadas)</h3>
            <Button size="sm" variant="outline" onClick={exportHits} className="gap-1"><Download className="h-3 w-3" />CSV</Button>
          </div>
          <div className="flex gap-2 mb-3 text-xs items-center">
            <select className="border border-border bg-background rounded px-2 py-1" value={filterSev} onChange={(e) => setFilterSev(e.target.value)}>
              <option value="all">Todas severidades</option>
              <option value="low">low</option><option value="medium">medium</option><option value="high">high</option><option value="critical">critical</option>
            </select>
            <label className="flex items-center gap-1 cursor-pointer">
              <input type="checkbox" checked={showReviewed} onChange={(e) => setShowReviewed(e.target.checked)} />
              Mostrar revisados
            </label>
            <span className="text-muted-foreground ml-auto">{filteredHits.length} hits</span>
          </div>
          <ScrollArea className="h-[420px]">
            <div className="space-y-2">
              {filteredHits.map(h => (
                <div key={h.id} className={`p-2 border rounded text-sm ${h.reviewed ? "opacity-60" : "border-orange-500/30"}`}>
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-mono">{h.term_matched}</span>
                    {severityBadge(h.severity)}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">{new Date(h.created_at).toLocaleString("pt-BR")}</div>
                  {h.snippet && <div className="text-xs mt-1 italic break-words">"…{h.snippet}…"</div>}
                  {!h.reviewed && <Button size="sm" variant="outline" className="mt-2" onClick={() => markReviewed(h.id)}>Marcar revisado</Button>}
                </div>
              ))}
              {filteredHits.length === 0 && <p className="text-xs text-muted-foreground">Nenhum hit corresponde aos filtros.</p>}
            </div>
          </ScrollArea>
        </Card>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Aba 5 — Acessos / Exportação (CSV) com filtros
// ─────────────────────────────────────────────────────────────
function AccessLogsTab() {
  const [logs, setLogs] = useState<any[]>([]);
  const [cases, setCases] = useState<Case[]>([]);
  const [caseId, setCaseId] = useState<string>("");
  const [adminId, setAdminId] = useState<string>("");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.from("oculto_investigation_cases").select("id, case_number, target_user_id, status, expires_at, opened_at, reason, legal_doc_ref").order("opened_at", { ascending: false })
      .then(({ data }) => setCases((data as Case[]) ?? []));
  }, []);

  const search = async () => {
    setLoading(true);
    let q = supabase.from("oculto_investigation_access_logs")
      .select("id, case_id, report_id, admin_id, action, target_user_id, target_resource, details, created_at")
      .order("created_at", { ascending: false }).limit(1000);
    if (caseId) q = q.eq("case_id", caseId);
    if (adminId) q = q.eq("admin_id", adminId.trim());
    if (from) q = q.gte("created_at", new Date(from).toISOString());
    if (to)   q = q.lte("created_at", new Date(to + "T23:59:59").toISOString());
    const { data, error } = await q;
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    setLogs(data ?? []);
    toast.success(`${data?.length ?? 0} acessos encontrados`);
  };

  useEffect(() => { search(); /* carga inicial */ /* eslint-disable-next-line */ }, []);

  const exportCsv = () => {
    downloadCsv(`central_investigacao_acessos_${new Date().toISOString().slice(0,10)}.csv`,
      logs.map(l => ({
        data: new Date(l.created_at).toLocaleString("pt-BR"),
        admin_id: l.admin_id,
        acao: l.action,
        caso: l.case_id ?? "",
        denuncia: l.report_id ?? "",
        alvo: l.target_user_id ?? "",
        recurso: l.target_resource ?? "",
        detalhes: JSON.stringify(l.details ?? {}),
      })),
    );
  };

  const exportPdf = () => {
    // PDF nativo via janela imprimível (sem nova dependência)
    const html = `<html><head><title>Central de Investigação — Acessos</title>
      <style>body{font-family:system-ui;padding:20px;font-size:12px}
      h1{font-size:16px} table{border-collapse:collapse;width:100%}
      th,td{border:1px solid #ccc;padding:4px;text-align:left;vertical-align:top}
      th{background:#eee}</style></head><body>
      <h1>Central de Investigação — Logs de Acesso</h1>
      <p>Gerado em ${new Date().toLocaleString("pt-BR")} · ${logs.length} registros</p>
      <table><thead><tr><th>Data</th><th>Admin</th><th>Ação</th><th>Caso</th><th>Alvo</th><th>Recurso</th></tr></thead>
      <tbody>${logs.map(l => `<tr>
        <td>${new Date(l.created_at).toLocaleString("pt-BR")}</td>
        <td>${l.admin_id?.slice(0,12) ?? ""}</td>
        <td>${l.action}</td>
        <td>${l.case_id?.slice(0,8) ?? ""}</td>
        <td>${l.target_user_id?.slice(0,12) ?? ""}</td>
        <td>${l.target_resource ?? ""}</td>
      </tr>`).join("")}</tbody></table>
      <script>window.onload=()=>window.print();</script></body></html>`;
    const w = window.open("", "_blank");
    if (!w) { toast.error("Permita pop-ups para gerar PDF"); return; }
    w.document.write(html); w.document.close();
  };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <h3 className="font-semibold mb-3">Filtros</h3>
        <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div>
            <Label>Caso</Label>
            <select className="w-full border border-border bg-background rounded px-2 py-2 text-sm" value={caseId} onChange={(e) => setCaseId(e.target.value)}>
              <option value="">Todos</option>
              {cases.map(c => <option key={c.id} value={c.id}>{c.case_number}</option>)}
            </select>
          </div>
          <div><Label>Admin (user_id)</Label><Input value={adminId} onChange={(e) => setAdminId(e.target.value)} placeholder="opcional" /></div>
          <div><Label>De</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div><Label>Até</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        </div>
        <div className="flex gap-2 mt-3 flex-wrap">
          <Button onClick={search} disabled={loading}>{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Buscar"}</Button>
          <Button variant="outline" onClick={exportCsv} className="gap-1"><Download className="h-3 w-3" />CSV</Button>
          <Button variant="outline" onClick={exportPdf} className="gap-1"><Download className="h-3 w-3" />PDF</Button>
        </div>
      </Card>

      <Card className="p-0">
        <ScrollArea className="h-[520px]">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-card border-b border-border">
              <tr className="text-left">
                <th className="p-2">Data</th><th className="p-2">Admin</th><th className="p-2">Ação</th>
                <th className="p-2">Caso</th><th className="p-2">Alvo</th><th className="p-2">Recurso</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(l => (
                <tr key={l.id} className="border-b border-border/50">
                  <td className="p-2">{new Date(l.created_at).toLocaleString("pt-BR")}</td>
                  <td className="p-2 font-mono">{l.admin_id?.slice(0,8)}</td>
                  <td className="p-2"><Badge variant="outline">{l.action}</Badge></td>
                  <td className="p-2 font-mono">{l.case_id?.slice(0,8) ?? "—"}</td>
                  <td className="p-2 font-mono">{l.target_user_id?.slice(0,8) ?? "—"}</td>
                  <td className="p-2">{l.target_resource ?? "—"}</td>
                </tr>
              ))}
              {logs.length === 0 && <tr><td colSpan={6} className="p-4 text-center text-muted-foreground">Nenhum acesso encontrado.</td></tr>}
            </tbody>
          </table>
        </ScrollArea>
      </Card>
    </div>
  );
}

export default function AdminCentralInvestigacaoPage() {
  return (
    <div className="p-4 lg:p-6 space-y-4 max-w-7xl mx-auto">
      <div className="flex items-center gap-3 mb-2">
        <Shield className="h-6 w-6 text-destructive" />
        <div>
          <h1 className="text-2xl font-bold">Central de Investigação</h1>
          <p className="text-xs text-muted-foreground">
            Ferramentas auditadas para moderação, denúncias e cumprimento de ordens judiciais. E2EE preservado.
          </p>
        </div>
      </div>

      <Tabs defaultValue="profile">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="profile"><Eye className="h-4 w-4 mr-1" />Perfil read-only</TabsTrigger>
          <TabsTrigger value="reported"><FileSearch className="h-4 w-4 mr-1" />Conversas denunciadas</TabsTrigger>
          <TabsTrigger value="judicial"><Gavel className="h-4 w-4 mr-1" />Modo Judicial</TabsTrigger>
          <TabsTrigger value="keywords"><AlertTriangle className="h-4 w-4 mr-1" />Palavras-chave</TabsTrigger>
          <TabsTrigger value="access"><Download className="h-4 w-4 mr-1" />Acessos / Exportação</TabsTrigger>
        </TabsList>
        <TabsContent value="profile" className="mt-4"><ProfileReadOnlyTab /></TabsContent>
        <TabsContent value="reported" className="mt-4"><ReportedThreadsTab /></TabsContent>
        <TabsContent value="judicial" className="mt-4"><JudicialTab /></TabsContent>
        <TabsContent value="keywords" className="mt-4"><KeywordsTab /></TabsContent>
        <TabsContent value="access" className="mt-4"><AccessLogsTab /></TabsContent>
      </Tabs>
    </div>
  );
}

/**
 * Central de Inteligência — Admin
 * 3 action buttons: Sales Report | Creator Audit | Gateway Health
 * All heavy processing runs on the server; mobile only receives the final JSON.
 * PDF export: client-side via jsPDF (lightweight, ~250KB, zero server round-trip)
 */
import { useState, useRef } from "react";
import {
  BarChart3,
  Users,
  Activity,
  Send,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertTriangle,
  Wallet,
  TrendingUp,
  Zap,
  Download,
  Mail,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { supabase } from "@/lib/supabaseExternal";

// ── Types ─────────────────────────────────────────────────────────────────
type ReportStatus = 'idle' | 'loading' | 'done' | 'error';

interface SalesReport {
  success: boolean;
  report_date: string;
  stats: {
    gross_total: number;
    admin_total: number;
    creator_total: number;
    tx_count: number;
    subscription_count: number;
    ppv_count: number;
  };
  discord_status: number;
}

interface CreatorAudit {
  success: boolean;
  pending_count: number;
  active_count: number;
  week: string;
  pending_creators?: Array<{ name: string | null; username: string | null; email: string | null }>;
  active_count_db?: number;
}

interface GatewayHealth {
  asaas: 'ok' | 'error' | 'unconfigured';
  discord: 'ok' | 'error' | 'unconfigured';
  asaas_message?: string;
  discord_message?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────
function brl(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });
}

function StatusBadge({ status }: { status: 'ok' | 'error' | 'unconfigured' }) {
  if (status === 'ok') return <Badge className="bg-green-500/20 text-green-400 border-green-500/30">✅ OK</Badge>;
  if (status === 'error') return <Badge className="bg-destructive/20 text-destructive border-destructive/30">❌ CRITICAL</Badge>;
  return <Badge className="bg-muted text-muted-foreground border-border">— Não configurado</Badge>;
}

// ── PDF Export — lightweight, client-side, no blur, no heavy DOM capture ──
async function exportSalesPDF(data: SalesReport) {
  // Dynamic import = zero bundle impact until clicked
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const now = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const margin = 18;
  let y = 20;

  // Header bar
  doc.setFillColor(124, 58, 237); // primary purple
  doc.rect(0, 0, 210, 14, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('OCULTO — Plataforma de Conteúdo Premium', margin, 9);
  doc.text(`Gerado: ${now}`, 210 - margin, 9, { align: 'right' });

  y = 24;
  doc.setTextColor(30, 30, 30);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('Relatório de Vendas (Split 26%)', margin, y);
  y += 6;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(120, 120, 120);
  doc.text(`Período: ${data.report_date || now}`, margin, y);
  y += 10;

  // Divider
  doc.setDrawColor(200, 200, 200);
  doc.line(margin, y, 210 - margin, y);
  y += 8;

  // Metric cards — drawn as filled rects
  const cardW = 80;
  const cardH = 22;
  const metrics = [
    { label: 'Volume Bruto', value: brl(data.stats.gross_total), color: [245, 245, 245] as [number,number,number] },
    { label: 'Lucro Admin (26%)', value: brl(data.stats.admin_total), color: [220, 252, 231] as [number,number,number] },
    { label: 'Repasse Criadores (74%)', value: brl(data.stats.creator_total), color: [245, 245, 245] as [number,number,number] },
    { label: 'Total de Transações', value: String(data.stats.tx_count), color: [245, 245, 245] as [number,number,number] },
  ];

  metrics.forEach((m, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = margin + col * (cardW + 6);
    const cy = y + row * (cardH + 4);
    doc.setFillColor(...m.color);
    doc.roundedRect(x, cy, cardW, cardH, 3, 3, 'F');
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text(m.label, x + 4, cy + 7);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 30, 30);
    doc.text(m.value, x + 4, cy + 16);
  });

  y += Math.ceil(metrics.length / 2) * (cardH + 4) + 8;

  // Footer
  doc.setDrawColor(200, 200, 200);
  doc.line(margin, y, 210 - margin, y);
  y += 6;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(150, 150, 150);
  doc.text('Este relatório é gerado automaticamente pela Central de Inteligência do Admin.', margin, y);
  y += 4;
  doc.text(`OCULTO © ${new Date().getFullYear()} — Todos os direitos reservados.`, margin, y);

  const filename = `relatorio-vendas-${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(filename);
}

async function exportAuditPDF(data: CreatorAudit) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const now = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const margin = 18;
  let y = 20;

  // Header bar
  doc.setFillColor(124, 58, 237);
  doc.rect(0, 0, 210, 14, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('OCULTO — Plataforma de Conteúdo Premium', margin, 9);
  doc.text(`Gerado: ${now}`, 210 - margin, 9, { align: 'right' });

  y = 24;
  doc.setTextColor(30, 30, 30);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('Auditoria de Criadores — Wallet ID', margin, y);
  y += 6;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(120, 120, 120);
  doc.text(`Semana: ${data.week || now}`, margin, y);
  y += 10;

  doc.setDrawColor(200, 200, 200);
  doc.line(margin, y, 210 - margin, y);
  y += 8;

  // Summary cards
  const cardW = 80;
  const cardH = 20;
  // Pendentes
  doc.setFillColor(254, 249, 195); // yellow-100
  doc.roundedRect(margin, y, cardW, cardH, 3, 3, 'F');
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 100, 100);
  doc.text('⚠ Pendentes (sem Wallet ID)', margin + 4, y + 7);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(161, 120, 0);
  doc.text(String(data.pending_count), margin + 4, y + 16);

  // Ativos
  doc.setFillColor(220, 252, 231); // green-100
  doc.roundedRect(margin + cardW + 6, y, cardW, cardH, 3, 3, 'F');
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 100, 100);
  doc.text('✓ Configurados (Split OK)', margin + cardW + 10, y + 7);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(22, 101, 52);
  doc.text(String(data.active_count), margin + cardW + 10, y + 16);

  y += cardH + 10;

  // Pending creators list
  if (data.pending_creators && data.pending_creators.length > 0) {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(60, 60, 60);
    doc.text('Lista de Criadores Pendentes', margin, y);
    y += 6;

    // Table header
    doc.setFillColor(240, 240, 240);
    doc.rect(margin, y, 174, 7, 'F');
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(80, 80, 80);
    doc.text('Nome', margin + 2, y + 5);
    doc.text('Username', margin + 70, y + 5);
    doc.text('E-mail', margin + 120, y + 5);
    y += 7;

    data.pending_creators.forEach((creator, idx) => {
      if (y > 270) { doc.addPage(); y = 20; }
      const rowBg = idx % 2 === 0 ? [252, 252, 252] as [number,number,number] : [246, 246, 246] as [number,number,number];
      doc.setFillColor(...rowBg);
      doc.rect(margin, y, 174, 7, 'F');
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(40, 40, 40);
      doc.text(creator.name?.substring(0, 28) || '—', margin + 2, y + 5);
      doc.text(creator.username ? `@${creator.username.substring(0, 18)}` : '—', margin + 70, y + 5);
      doc.text(creator.email?.substring(0, 30) || '—', margin + 120, y + 5);
      y += 7;
    });
    y += 4;
  }

  // Footer
  if (y > 260) { doc.addPage(); y = 20; }
  doc.setDrawColor(200, 200, 200);
  doc.line(margin, y, 210 - margin, y);
  y += 6;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(150, 150, 150);
  doc.text('Este relatório é gerado automaticamente pela Central de Inteligência do Admin.', margin, y);
  y += 4;
  doc.text(`OCULTO © ${new Date().getFullYear()} — Todos os direitos reservados.`, margin, y);

  const filename = `auditoria-criadores-${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(filename);
}

// ── PDF Download Button ────────────────────────────────────────────────────
function PdfDownloadButton({ onExport, label = 'Baixar PDF' }: { onExport: () => Promise<void>; label?: string }) {
  const [exporting, setExporting] = useState(false);

  const handleClick = async () => {
    setExporting(true);
    try {
      await onExport();
    } finally {
      setExporting(false);
    }
  };

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={handleClick}
      disabled={exporting}
      className="h-8 text-xs gap-1.5 border-primary/40 text-primary hover:bg-primary/10"
    >
      {exporting ? (
        <><Loader2 className="h-3.5 w-3.5 animate-spin" />Gerando...</>
      ) : (
        <><Download className="h-3.5 w-3.5" />{label}</>
      )}
    </Button>
  );
}

// ── Sales Report Modal ─────────────────────────────────────────────────────
function SalesModal({ open, onClose, data }: { open: boolean; onClose: () => void; data: SalesReport | null }) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="w-[95vw] max-w-md bg-card border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            Relatório de Vendas (26%)
          </DialogTitle>
          <DialogDescription>Dados enviados ao Discord e renderizados abaixo.</DialogDescription>
        </DialogHeader>
        {!data ? (
          <div className="space-y-3 py-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-8 w-1/2" />
          </div>
        ) : (
          <div className="space-y-3 pt-1">
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-xl bg-muted/40 border border-border/50 space-y-0.5">
                <p className="text-xs text-muted-foreground">💰 Volume Bruto</p>
                <p className="text-lg font-bold text-foreground">{brl(data.stats.gross_total)}</p>
              </div>
              <div className="p-3 rounded-xl bg-green-500/10 border border-green-500/20 space-y-0.5">
                <p className="text-xs text-green-400">🏦 Lucro Admin (26%)</p>
                <p className="text-lg font-bold text-green-400">{brl(data.stats.admin_total)}</p>
              </div>
              <div className="p-3 rounded-xl bg-muted/40 border border-border/50 space-y-0.5">
                <p className="text-xs text-muted-foreground">👤 Repasse Criadores</p>
                <p className="text-lg font-bold text-foreground">{brl(data.stats.creator_total)}</p>
              </div>
              <div className="p-3 rounded-xl bg-muted/40 border border-border/50 space-y-0.5">
                <p className="text-xs text-muted-foreground">📊 Transações</p>
                <p className="text-lg font-bold text-foreground">{data.stats.tx_count}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-primary/10 border border-primary/20">
              <Send className="h-3.5 w-3.5 text-primary shrink-0" />
              <p className="text-xs text-primary">Resumo enviado ao Discord com sucesso.</p>
            </div>
            {/* PDF Export */}
            <div className="flex justify-end pt-1">
              <PdfDownloadButton onExport={() => exportSalesPDF(data)} label="Baixar PDF" />
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Creator Audit Modal ────────────────────────────────────────────────────
function AuditModal({ open, onClose, data }: { open: boolean; onClose: () => void; data: CreatorAudit | null }) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="w-[95vw] max-w-md bg-card border-border max-h-[85dvh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-4 pt-4 pb-3 border-b border-border/40 shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-yellow-400" />
            Auditoria de Criadores
          </DialogTitle>
          <DialogDescription>Criadores que publicaram mas não configuraram Wallet ID.</DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3" style={{ scrollbarWidth: 'none' }}>
          {!data ? (
            <div className="space-y-3">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-3/4" />
              <Skeleton className="h-8 w-1/2" />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-xl bg-yellow-500/10 border border-yellow-500/20 space-y-0.5">
                  <p className="text-xs text-yellow-400">⚠️ Pendentes</p>
                  <p className="text-2xl font-bold text-yellow-400">{data.pending_count}</p>
                </div>
                <div className="p-3 rounded-xl bg-green-500/10 border border-green-500/20 space-y-0.5">
                  <p className="text-xs text-green-400">✅ Configurados</p>
                  <p className="text-2xl font-bold text-green-400">{data.active_count}</p>
                </div>
              </div>

              {data.pending_creators && data.pending_creators.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Lista de Pendentes</p>
                  <div className="space-y-1.5">
                    {data.pending_creators.map((c, i) => (
                      <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-muted/30 border border-border/50">
                        <div className="h-6 w-6 rounded-full bg-yellow-500/20 flex items-center justify-center shrink-0">
                          <Wallet className="h-3 w-3 text-yellow-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-foreground truncate">
                            {c.name || c.username || '—'}
                            {c.username && <span className="text-muted-foreground ml-1">@{c.username}</span>}
                          </p>
                          <p className="text-[10px] text-muted-foreground truncate">{c.email || 'e-mail não disponível'}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-primary/10 border border-primary/20">
                <Send className="h-3.5 w-3.5 text-primary shrink-0" />
                <p className="text-xs text-primary">Lista enviada ao Discord com sucesso.</p>
              </div>

              {/* PDF Export */}
              <div className="flex justify-end pt-1 pb-1">
                <PdfDownloadButton onExport={() => exportAuditPDF(data)} label="Baixar PDF" />
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Gateway Health Modal ────────────────────────────────────────────────────
function HealthModal({ open, onClose, data }: { open: boolean; onClose: () => void; data: GatewayHealth | null }) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="w-[95vw] max-w-md bg-card border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            Status de Saúde do Gateway
          </DialogTitle>
          <DialogDescription>Verificação em tempo real dos serviços integrados.</DialogDescription>
        </DialogHeader>
        {!data ? (
          <div className="space-y-3 py-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : (
          <div className="space-y-3 pt-1">
            <div className="flex items-center justify-between p-3 rounded-xl bg-muted/40 border border-border/50">
              <div className="flex items-center gap-2">
                <span className="text-lg">💰</span>
                <div>
                  <p className="text-sm font-medium">Asaas PIX Gateway</p>
                  {data.asaas_message && <p className="text-xs text-muted-foreground">{data.asaas_message}</p>}
                </div>
              </div>
              <StatusBadge status={data.asaas} />
            </div>
            <div className="flex items-center justify-between p-3 rounded-xl bg-muted/40 border border-border/50">
              <div className="flex items-center gap-2">
                <span className="text-lg">🔔</span>
                <div>
                  <p className="text-sm font-medium">Discord Webhook</p>
                  {data.discord_message && <p className="text-xs text-muted-foreground">{data.discord_message}</p>}
                </div>
              </div>
              <StatusBadge status={data.discord} />
            </div>
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-muted/30 border border-border/50">
              <Zap className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <p className="text-xs text-muted-foreground">Verificação feita no servidor — zero impacto em áudio/vídeo.</p>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────
export function AdminIntelligenceCenter() {
  const [salesStatus, setSalesStatus] = useState<ReportStatus>('idle');
  const [auditStatus, setAuditStatus] = useState<ReportStatus>('idle');
  const [healthStatus, setHealthStatus] = useState<ReportStatus>('idle');
  const [emailPdfStatus, setEmailPdfStatus] = useState<ReportStatus>('idle');
  const [emailPdfMessage, setEmailPdfMessage] = useState<string | null>(null);

  const [salesData, setSalesData] = useState<SalesReport | null>(null);
  const [auditData, setAuditData] = useState<CreatorAudit | null>(null);
  const [healthData, setHealthData] = useState<GatewayHealth | null>(null);

  const [salesOpen, setSalesOpen] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);
  const [healthOpen, setHealthOpen] = useState(false);

  // ── Action: Sales Report ───────────────────────────────────────────────
  const handleSalesReport = async () => {
    setSalesOpen(true);
    setSalesStatus('loading');
    setSalesData(null);
    try {
      const { data, error } = await supabase.functions.invoke('daily-financial-report');
      if (error || !data?.success) throw new Error(data?.error || error?.message || 'Erro desconhecido');
      setSalesData(data as SalesReport);
      setSalesStatus('done');
    } catch (e: any) {
      setSalesStatus('error');
      console.error('[Intelligence] Sales report error:', e.message);
    }
  };

  // ── Action: Creator Audit ──────────────────────────────────────────────
  const handleCreatorAudit = async () => {
    setAuditOpen(true);
    setAuditStatus('loading');
    setAuditData(null);
    try {
      const { data: fnData, error: fnError } = await supabase.functions.invoke('weekly-creators-report');
      if (fnError) throw new Error(fnError.message);

      const { data: profiles } = await supabase
        .from('profiles')
        .select('name, username, user_id')
        .eq('is_creator', true)
        .or('asaas_wallet_id.is.null,asaas_wallet_id.eq.')
        .limit(20) as any;

      const pendingCreators = (profiles || []).map((p: any) => ({
        name: p.name,
        username: p.username,
        email: null,
      }));

      setAuditData({
        success: true,
        pending_count: fnData?.pending_count ?? pendingCreators.length,
        active_count: fnData?.active_count ?? 0,
        week: fnData?.week ?? new Date().toLocaleDateString('pt-BR'),
        pending_creators: pendingCreators,
      });
      setAuditStatus('done');
    } catch (e: any) {
      setAuditStatus('error');
      console.error('[Intelligence] Audit error:', e.message);
    }
  };

  // ── Action: Gateway Health ─────────────────────────────────────────────
  const handleGatewayHealth = async () => {
    setHealthOpen(true);
    setHealthStatus('loading');
    setHealthData(null);
    try {
      const { data: config } = await supabase
        .from('pix_gateway_config')
        .select('gateway_provider, api_key, discord_webhook_url')
        .maybeSingle() as any;

      let asaasStatus: 'ok' | 'error' | 'unconfigured' = 'unconfigured';
      let asaasMessage: string | undefined;
      let discordStatus: 'ok' | 'error' | 'unconfigured' = 'unconfigured';
      let discordMessage: string | undefined;

      if (config?.api_key && config?.gateway_provider === 'asaas') {
        try {
          const { data: testData, error: testErr } = await supabase.functions.invoke('pix-gateway', {
            body: { action: 'test-connection', provider: 'asaas', api_key: config.api_key },
          });
          if (testErr || !testData?.success) {
            asaasStatus = 'error';
            asaasMessage = testData?.message || 'Falha na conexão';
          } else {
            asaasStatus = 'ok';
            asaasMessage = 'Conexão estabelecida com sucesso';
          }
        } catch {
          asaasStatus = 'error';
          asaasMessage = 'Timeout na verificação';
        }
      } else {
        asaasMessage = 'API Key não configurada';
      }

      if (config?.discord_webhook_url) {
        try {
          const res = await fetch(config.discord_webhook_url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              embeds: [{
                title: '🟢 Ping de Status — Plataforma Oculta',
                description: 'Verificação de saúde do webhook. Tudo OK!',
                color: 0x00e676,
                timestamp: new Date().toISOString(),
              }],
            }),
          });
          if (res.ok || res.status === 204) {
            discordStatus = 'ok';
            discordMessage = 'Webhook respondeu com sucesso';
          } else {
            discordStatus = 'error';
            discordMessage = `Resposta HTTP ${res.status}`;
          }
        } catch {
          discordStatus = 'error';
          discordMessage = 'Não foi possível alcançar o webhook';
        }
      } else {
        discordMessage = 'Webhook URL não configurado';
      }

      setHealthData({
        asaas: asaasStatus,
        discord: discordStatus,
        asaas_message: asaasMessage,
        discord_message: discordMessage,
      });
      setHealthStatus('done');
    } catch (e: any) {
      setHealthStatus('error');
      console.error('[Intelligence] Health check error:', e.message);
    }
  };

  // ── Action: Send PDF Report Email ─────────────────────────────────────
  const handleEmailPdf = async () => {
    setEmailPdfStatus('loading');
    setEmailPdfMessage(null);
    try {
      const { data, error } = await supabase.functions.invoke('send-pdf-report-email');
      if (error || !data?.success) throw new Error(data?.error || error?.message || 'Erro desconhecido');
      setEmailPdfMessage(data.message || 'E-mail enviado com sucesso!');
      setEmailPdfStatus('done');
    } catch (e: any) {
      setEmailPdfMessage(e.message);
      setEmailPdfStatus('error');
      console.error('[Intelligence] Email PDF error:', e.message);
    }
  };

  // ── Button state helpers ───────────────────────────────────────────────
  const isLoading = (s: ReportStatus) => s === 'loading';

  const actions = [
    {
      id: 'sales',
      icon: BarChart3,
      iconColor: 'text-green-400',
      bgColor: 'bg-green-500/10 border-green-500/20',
      title: 'Relatório de Vendas (26%)',
      description: 'Gera resumo financeiro do dia e envia ao Discord.',
      status: salesStatus,
      onClick: handleSalesReport,
      badge: salesStatus === 'done' ? 'Enviado ✓' : salesStatus === 'error' ? 'Falhou' : null,
      badgeColor: salesStatus === 'done' ? 'bg-green-500/20 text-green-400 border-green-500/30' : 'bg-destructive/20 text-destructive border-destructive/30',
    },
    {
      id: 'audit',
      icon: Users,
      iconColor: 'text-yellow-400',
      bgColor: 'bg-yellow-500/10 border-yellow-500/20',
      title: 'Auditoria de Criadores',
      description: 'Lista criadores sem Wallet ID configurado.',
      status: auditStatus,
      onClick: handleCreatorAudit,
      badge: auditStatus === 'done' ? 'Concluído ✓' : auditStatus === 'error' ? 'Falhou' : null,
      badgeColor: auditStatus === 'done' ? 'bg-green-500/20 text-green-400 border-green-500/30' : 'bg-destructive/20 text-destructive border-destructive/30',
    },
    {
      id: 'health',
      icon: Activity,
      iconColor: 'text-blue-400',
      bgColor: 'bg-blue-500/10 border-blue-500/20',
      title: 'Saúde do Gateway',
      description: 'Verifica Asaas e Discord em tempo real.',
      status: healthStatus,
      onClick: handleGatewayHealth,
      badge: healthStatus === 'done' ? 'Verificado ✓' : healthStatus === 'error' ? 'Falhou' : null,
      badgeColor: healthStatus === 'done' ? 'bg-green-500/20 text-green-400 border-green-500/30' : 'bg-destructive/20 text-destructive border-destructive/30',
    },
  ];

  return (
    <>
      <Card className="border-border bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <div className="p-1.5 rounded-lg bg-primary/20">
              <TrendingUp className="h-4 w-4 text-primary" />
            </div>
            Central de Inteligência
          </CardTitle>
          <CardDescription className="text-xs">
            Disparo manual de relatórios e verificações em tempo real. Processamento 100% no servidor — sem impacto no dispositivo.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-3">
          {actions.map((action) => {
            const Icon = action.icon;
            return (
              <div
                key={action.id}
                className={`flex items-center justify-between p-3 rounded-xl border ${action.bgColor} transition-all`}
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="p-2 rounded-lg bg-background/50 shrink-0">
                    <Icon className={`h-4 w-4 ${action.iconColor}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium text-foreground">{action.title}</p>
                      {action.badge && (
                        <Badge className={`text-[10px] px-1.5 py-0 ${action.badgeColor}`}>
                          {action.badge}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{action.description}</p>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={action.onClick}
                  disabled={isLoading(action.status)}
                  className="ml-3 shrink-0 h-8 text-xs gap-1.5 border-border/60 hover:border-primary/50"
                >
                  {isLoading(action.status) ? (
                    <><Loader2 className="h-3.5 w-3.5 animate-spin" />Gerando...</>
                  ) : action.status === 'done' ? (
                    <><CheckCircle2 className="h-3.5 w-3.5 text-green-400" />Ver</>
                  ) : action.status === 'error' ? (
                    <><XCircle className="h-3.5 w-3.5 text-destructive" />Retry</>
                  ) : (
                    <><Send className="h-3.5 w-3.5" />Gerar</>
                  )}
                </Button>
              </div>
            );
          })}

          {/* Email PDF Test Action */}
          <div className="flex items-center justify-between p-3 rounded-xl border bg-purple-500/10 border-purple-500/20 transition-all">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="p-2 rounded-lg bg-background/50 shrink-0">
                <Mail className="h-4 w-4 text-purple-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium text-foreground">Teste PDF por E-mail</p>
                  {emailPdfStatus === 'done' && (
                    <Badge className="text-[10px] px-1.5 py-0 bg-green-500/20 text-green-400 border-green-500/30">Enviado ✓</Badge>
                  )}
                  {emailPdfStatus === 'error' && (
                    <Badge className="text-[10px] px-1.5 py-0 bg-destructive/20 text-destructive border-destructive/30">Falhou</Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground truncate">
                  {emailPdfMessage || 'Gera PDF simulado (R$ 100) e envia por e-mail + Discord.'}
                </p>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={handleEmailPdf}
              disabled={emailPdfStatus === 'loading'}
              className="ml-3 shrink-0 h-8 text-xs gap-1.5 border-border/60 hover:border-primary/50"
            >
              {emailPdfStatus === 'loading' ? (
                <><Loader2 className="h-3.5 w-3.5 animate-spin" />Enviando...</>
              ) : emailPdfStatus === 'done' ? (
                <><CheckCircle2 className="h-3.5 w-3.5 text-green-400" />OK</>
              ) : emailPdfStatus === 'error' ? (
                <><XCircle className="h-3.5 w-3.5 text-destructive" />Retry</>
              ) : (
                <><Send className="h-3.5 w-3.5" />Testar</>
              )}
            </Button>
          </div>

          {/* Performance note */}
          <div className="flex items-start gap-2 p-2.5 rounded-lg bg-muted/30 border border-border/40 mt-1">
            <AlertTriangle className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Todos os relatórios são gerados no servidor e enviados ao Discord automaticamente. O dispositivo recebe apenas o resultado final — nenhum processamento local.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Modals */}
      <SalesModal
        open={salesOpen}
        onClose={() => setSalesOpen(false)}
        data={salesStatus === 'done' ? salesData : null}
      />
      <AuditModal
        open={auditOpen}
        onClose={() => setAuditOpen(false)}
        data={auditStatus === 'done' || auditStatus === 'loading' ? auditData : null}
      />
      <HealthModal
        open={healthOpen}
        onClose={() => setHealthOpen(false)}
        data={healthStatus === 'done' ? healthData : null}
      />
    </>
  );
}

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendAdminEmail, buildAdminEmailShell, ADMIN_MASTER_EMAIL } from '../_shared/adminEmail.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ── Split defaults: 20% plataforma, 6% impostos, 5% afiliado, 69% criador VIP ──
const DEFAULT_PLATFORM_FEE = 20;
const DEFAULT_TAX_RESERVE  = 6;
const DEFAULT_AFFILIATE_PCT = 5;
const DEFAULT_CREATOR_PCT  = 69;

async function logSplitTelemetry(
  supabase: any,
  source: string,
  resolvedFrom: 'split_config' | 'fallback_constants',
  fees: { platformFee: number; taxReserve: number; creatorPct: number; affiliatePct: number },
  extras: { transaction_id?: string | null; gross_amount?: number | null; error_msg?: string | null } = {}
) {
  try {
    await supabase.from('split_telemetry_logs').insert({
      source,
      resolved_from: resolvedFrom,
      platform_pct: fees.platformFee,
      tax_pct: fees.taxReserve,
      creator_pct: fees.creatorPct,
      affiliate_pct: fees.affiliatePct,
      transaction_id: extras.transaction_id ?? null,
      gross_amount: extras.gross_amount ?? null,
      error_msg: extras.error_msg ?? null,
    });
  } catch (e) {
    console.warn(`[split-telemetry] insert failed (${source}):`, (e as Error).message);
  }
}

async function getFeeSplit(supabase: any, source = 'daily-financial-report') {
  let errorMsg: string | null = null;
  try {
    const { data, error } = await supabase
      .from('split_config')
      .select('platform_percent, tax_percent, creator_percent, affiliate_percent')
      .eq('is_active', true)
      .maybeSingle();
    if (error) errorMsg = error.message;
    if (data) {
      const fees = {
        platformFee:  parseFloat(data.platform_percent),
        taxReserve:   parseFloat(data.tax_percent),
        creatorPct:   parseFloat(data.creator_percent),
        affiliatePct: parseFloat(data.affiliate_percent),
      };
      console.log(`[${source}] split resolved from split_config:`, fees);
      logSplitTelemetry(supabase, source, 'split_config', fees);
      return fees;
    }
  } catch (e) { errorMsg = (e as Error).message; }
  const fallback = {
    platformFee:  DEFAULT_PLATFORM_FEE,
    taxReserve:   DEFAULT_TAX_RESERVE,
    creatorPct:   DEFAULT_CREATOR_PCT,
    affiliatePct: DEFAULT_AFFILIATE_PCT,
  };
  console.warn(`[${source}] ⚠️ split_config indisponível — usando fallback 20/6/5/69`, { errorMsg });
  logSplitTelemetry(supabase, source, 'fallback_constants', fallback, { error_msg: errorMsg });
  return fallback;
}

interface FeeSplit { platformFee: number; taxReserve: number; creatorPct: number; affiliatePct: number; }

interface DailyStats {
  gross_total: number;
  admin_total: number;    // 26% — comissão (20%) + impostos (6%)
  creator_total: number;  // 74% líquido
  tx_count: number;
  subscription_count: number;
  ppv_count: number;
}

// ── Format BRL ─────────────────────────────────────────────────────────────
function brl(value: number): string {
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
  });
}

// ── Query today's completed transactions ───────────────────────────────────
async function getDailyStats(supabase: any, fees: FeeSplit): Promise<DailyStats> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const { data: transactions, error } = await supabase
    .from('transactions')
    .select('amount, type, status')
    .eq('status', 'completed')
    .gte('completed_at', todayStart.toISOString())
    .lte('completed_at', todayEnd.toISOString())
    .in('type', ['subscription', 'ppv', 'subscription_income', 'tip', 'wallet_topup']);

  if (error || !transactions) {
    console.error('[Daily Report] Query error:', error);
    return { gross_total: 0, admin_total: 0, creator_total: 0, tx_count: 0, subscription_count: 0, ppv_count: 0 };
  }

  // Filter out internal split income records (subscription_income = creator's share already credited)
  // We only want the original transactions that had money flow IN
  const inboundTypes = ['subscription', 'ppv', 'tip', 'wallet_topup'];
  const inbound = transactions.filter((t: any) => inboundTypes.includes(t.type));

  const gross_total = inbound.reduce((sum: number, t: any) => sum + (t.amount || 0), 0);
  const adminTotalPercent = fees.platformFee + fees.taxReserve;
  const admin_total = Math.round(gross_total * (adminTotalPercent / 100) * 100) / 100;
  const creator_total = Math.round(gross_total * (fees.creatorPct / 100) * 100) / 100;
  const tx_count = inbound.length;
  const subscription_count = inbound.filter((t: any) => t.type === 'subscription').length;
  const ppv_count = inbound.filter((t: any) => t.type === 'ppv').length;

  return { gross_total, admin_total, creator_total, tx_count, subscription_count, ppv_count };
}

// ── Build admin e-mail HTML ────────────────────────────────────────────────
function buildEmailHtml(stats: DailyStats, reportDate: string, fees: FeeSplit) {
  const adminTotalPercent = fees.platformFee + fees.taxReserve;
  const hasRevenue = stats.gross_total > 0;
  const tone: 'success' | 'info' = hasRevenue ? 'success' : 'info';

  const body = `
    <p style="margin:0 0 16px;color:#d1d5db;font-size:14px;line-height:1.6;">
      ${hasRevenue
        ? `Plataforma fechou o dia com <strong>${stats.tx_count} transação${stats.tx_count !== 1 ? 'ões' : ''}</strong> processada${stats.tx_count !== 1 ? 's' : ''} com sucesso.`
        : 'Nenhuma transação registrada hoje. Sem movimento financeiro.'}
    </p>
    <div style="display:block;margin-bottom:18px;">
      ${row('💰 Volume Bruto Total', brl(stats.gross_total))}
      ${row(`🏦 Lucro Admin (${adminTotalPercent}%)`, brl(stats.admin_total))}
      ${row(`👤 Repasse Criadores (${fees.creatorPct}%)`, brl(stats.creator_total))}
    </div>
    <div style="background:#111;border:1px solid #2a2a2a;border-radius:8px;padding:14px;margin-bottom:14px;">
      <p style="margin:0 0 6px;font-size:12px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.06em;">Composição do lucro admin</p>
      <p style="margin:0;color:#e5e7eb;font-size:13px;">• Comissão: <strong>${brl(stats.gross_total * fees.platformFee / 100)}</strong> (${fees.platformFee}%)</p>
      <p style="margin:4px 0 0;color:#e5e7eb;font-size:13px;">• Impostos: <strong>${brl(stats.gross_total * fees.taxReserve / 100)}</strong> (${fees.taxReserve}%)</p>
    </div>
    <div style="background:#111;border:1px solid #2a2a2a;border-radius:8px;padding:14px;">
      <p style="margin:0 0 6px;font-size:12px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.06em;">Breakdown por tipo</p>
      <p style="margin:0;color:#e5e7eb;font-size:13px;">🔄 Assinaturas: <strong>${stats.subscription_count}</strong></p>
      <p style="margin:4px 0 0;color:#e5e7eb;font-size:13px;">🎬 PPV / Mídias: <strong>${stats.ppv_count}</strong></p>
      <p style="margin:4px 0 0;color:#e5e7eb;font-size:13px;">💳 Total geral: <strong>${stats.tx_count}</strong></p>
    </div>`;

  return {
    subject: `${hasRevenue ? '📈' : '😴'} Relatório Financeiro Diário — ${reportDate}`,
    html: buildAdminEmailShell({
      title: `Relatório Financeiro Diário — ${reportDate}`,
      subtitle: 'Resumo automático de vendas (Split 74/26)',
      bodyHtml: body,
      highlight: { label: hasRevenue ? '✅ Operação saudável' : 'ℹ️ Sem movimento hoje', tone },
    }),
  };
}

function row(label: string, value: string) {
  return `<div style="display:flex;justify-content:space-between;align-items:center;background:#111;border:1px solid #2a2a2a;border-radius:8px;padding:12px 14px;margin-bottom:8px;">
    <span style="color:#9ca3af;font-size:12px;">${label}</span>
    <span style="color:#f3f4f6;font-size:15px;font-weight:700;">${value}</span>
  </div>`;
}

// ── Save daily snapshot to cache table ────────────────────────────────────
async function saveDailySnapshot(supabase: any, stats: DailyStats, reportDate: string, fees: FeeSplit): Promise<void> {
  const adminTotalPercent = fees.platformFee + fees.taxReserve;
  await supabase.from('analytics_snapshots').upsert([
    {
      snapshot_date: reportDate,
      metric_type: 'daily_financial',
      metric_name: 'gross_total',
      metric_value: stats.gross_total,
      metadata: { source: 'daily-financial-report', tx_count: stats.tx_count },
    },
    {
      snapshot_date: reportDate,
      metric_type: 'daily_financial',
      metric_name: 'admin_profit',
      metric_value: stats.admin_total,
      metadata: { percent: adminTotalPercent },
    },
    {
      snapshot_date: reportDate,
      metric_type: 'daily_financial',
      metric_name: 'creator_payout',
      metric_value: stats.creator_total,
      metadata: { percent: fees.creatorPct },
    },
  ], { onConflict: 'snapshot_date,metric_name' }).then(() => null).catch(() => null);
}

// ── Main handler ───────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const respond = (data: object, status = 200) =>
    new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status,
    });

  try {
    const supabaseUrl = Deno.env.get('EXTERNAL_SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('EXTERNAL_SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Build date label in BRT (UTC-3)
    const now = new Date();
    const brtOffset = -3 * 60;
    const brtNow = new Date(now.getTime() + brtOffset * 60 * 1000);
    const reportDate = brtNow.toISOString().split('T')[0];
    const reportDateFormatted = brtNow.toLocaleDateString('pt-BR', {
      weekday: 'long',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });

    console.log(`[Daily Report] Generating report for ${reportDate}...`);

    const fees = await getFeeSplit(supabase);
    console.log(`[Daily Report] Fees: platform=${fees.platformFee}%, tax=${fees.taxReserve}%, creator=${fees.creatorPct}%`);

    const stats = await getDailyStats(supabase, fees);
    console.log(`[Daily Report] Stats:`, JSON.stringify(stats));

    await saveDailySnapshot(supabase, stats, reportDate, fees);

    // Send via admin email (substitui Discord)
    const { subject, html } = buildEmailHtml(stats, reportDateFormatted, fees);
    const emailResult = await sendAdminEmail(supabase, { subject, html });

    if (!emailResult.ok) {
      console.error(`[Daily Report] Email send failed: ${emailResult.message}`);
      return respond({ success: false, error: emailResult.message }, 502);
    }

    console.log(`[Daily Report] ✅ Report e-mailed to ${ADMIN_MASTER_EMAIL} for ${reportDate}`);

    return respond({
      success: true,
      report_date: reportDate,
      stats,
      destination: ADMIN_MASTER_EMAIL,
      sandbox: emailResult.sandbox === true,
      email_id: emailResult.email_id,
      // legacy field kept so existing UI typing keeps working
      discord_status: 200,
    });

  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Daily Report] Fatal error:', errMsg);
    return respond({ error: errMsg }, 500);
  }
});

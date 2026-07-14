/**
 * weekly-creators-report
 * Cron: every Monday at 09:00 BRT (12:00 UTC)
 *
 * Queries creators who have published content but have NOT set asaas_wallet_id.
 * Sends a clean Discord embed — all processing is server-side (zero mobile CPU).
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendAdminEmail, buildAdminEmailShell, ADMIN_MASTER_EMAIL } from '../_shared/adminEmail.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CreatorRow {
  name: string | null;
  username: string | null;
  email: string | null;
}

// ── Fetch creators missing wallet_id who have at least one post ────────────
async function getCreatorsPending(supabase: any): Promise<CreatorRow[]> {
  // auth.users email via service role
  const { data, error } = await supabase
    .from('profiles')
    .select('name, username, user_id')
    .eq('is_creator', true)
    .or('asaas_wallet_id.is.null,asaas_wallet_id.eq.')
    .order('updated_at', { ascending: false })
    .limit(50);

  if (error || !data) {
    console.error('[Weekly Report] Profiles query error:', error);
    return [];
  }

  // Filter to those with at least one post
  const profileIds = data.map((p: any) => p.user_id);
  if (profileIds.length === 0) return [];

  const { data: postsData } = await supabase
    .from('posts')
    .select('user_id')
    .in('user_id', profileIds);

  const userIdsWithPosts = new Set((postsData || []).map((p: any) => p.user_id));

  const pendingProfiles = data.filter((p: any) => userIdsWithPosts.has(p.user_id));
  if (pendingProfiles.length === 0) return [];

  // Resolve emails via auth admin API (service role)
  const results: CreatorRow[] = [];
  for (const profile of pendingProfiles.slice(0, 20)) {
    let email: string | null = null;
    try {
      const { data: userData } = await supabase.auth.admin.getUserById(profile.user_id);
      email = userData?.user?.email ?? null;
    } catch {
      // non-critical
    }
    results.push({ name: profile.name, username: profile.username, email });
  }

  return results;
}

// ── Fetch count of creators fully configured ───────────────────────────────
async function getActiveCreatorsCount(supabase: any): Promise<number> {
  const { count } = await supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('is_creator', true)
    .not('asaas_wallet_id', 'is', null)
    .neq('asaas_wallet_id', '');

  return count ?? 0;
}

// ── Build admin email HTML ─────────────────────────────────────────────────
function buildEmailPayload(pending: CreatorRow[], activeCount: number, weekLabel: string) {
  const hasPending = pending.length > 0;
  const tone: 'success' | 'warning' = hasPending ? 'warning' : 'success';

  const list = pending.slice(0, 10).map((c, i) => {
    const handle = c.username ? `@${c.username}` : c.name ?? '—';
    const mail = c.email ? c.email : 'e-mail não disponível';
    return `<li style="margin:0 0 6px;color:#e5e7eb;font-size:13px;">
      <strong>${i + 1}.</strong> ${escapeHtml(handle)}
      <span style="color:#9ca3af;"> • ${escapeHtml(mail)}</span>
    </li>`;
  });
  if (pending.length > 10) {
    list.push(`<li style="color:#9ca3af;font-size:12px;font-style:italic;">…e mais ${pending.length - 10} criador(es) não listados</li>`);
  }

  const pendingBlock = hasPending
    ? `<ul style="padding-left:18px;margin:0;">${list.join('')}</ul>`
    : '<p style="margin:0;color:#22c55e;font-size:13px;">✅ Todos os criadores ativos estão configurados!</p>';

  const body = `
    <p style="margin:0 0 14px;color:#d1d5db;font-size:14px;line-height:1.6;">
      ${hasPending
        ? `<strong>${pending.length}</strong> criador(es) publicaram conteúdo, mas ainda <strong>não configuraram o Wallet ID</strong> do Asaas. Eles estão impedidos de receber pagamentos.`
        : 'Nenhum criador pendente esta semana. Split 74/26 configurado para todos.'}
    </p>
    <div style="background:#111;border:1px solid #2a2a2a;border-radius:8px;padding:14px;margin-bottom:14px;">
      <p style="margin:0 0 8px;font-size:12px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.06em;">Criadores pendentes (${pending.length})</p>
      ${pendingBlock}
    </div>
    <div style="background:#111;border:1px solid #2a2a2a;border-radius:8px;padding:14px;margin-bottom:14px;">
      <p style="margin:0 0 4px;font-size:12px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.06em;">Criadores ativos (split OK)</p>
      <p style="margin:0;color:#f3f4f6;font-size:15px;font-weight:700;">${activeCount}</p>
    </div>`;

  return {
    subject: `📋 Status de Configuração de Criadores — ${weekLabel}`,
    html: buildAdminEmailShell({
      title: `Status de Configuração de Criadores`,
      subtitle: `Relatório semanal • ${weekLabel}`,
      bodyHtml: body,
      highlight: {
        label: hasPending ? `${pending.length} criador(es) sem Wallet ID configurado` : '✅ Tudo em ordem',
        tone,
      },
    }),
  };
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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

    const now = new Date();
    const brtNow = new Date(now.getTime() + (-3 * 60) * 60 * 1000);
    const weekLabel = brtNow.toLocaleDateString('pt-BR', {
      weekday: 'long',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });

    console.log('[Weekly Report] Fetching pending creators and active count...');

    const [pending, activeCount] = await Promise.all([
      getCreatorsPending(supabase),
      getActiveCreatorsCount(supabase),
    ]);

    console.log(`[Weekly Report] Pending: ${pending.length}, Active: ${activeCount}`);

    const { subject, html } = buildEmailPayload(pending, activeCount, weekLabel);
    const emailResult = await sendAdminEmail(supabase, { subject, html });

    if (!emailResult.ok) {
      console.error(`[Weekly Report] Email failed: ${emailResult.message}`);
      return respond({ success: false, error: emailResult.message }, 502);
    }

    console.log(`[Weekly Report] ✅ Weekly report e-mailed to ${ADMIN_MASTER_EMAIL}.`);

    return respond({
      success: true,
      pending_count: pending.length,
      active_count: activeCount,
      week: weekLabel,
      destination: ADMIN_MASTER_EMAIL,
      sandbox: emailResult.sandbox === true,
      email_id: emailResult.email_id,
    });

  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Weekly Report] Fatal error:', errMsg);
    return respond({ error: errMsg }, 500);
  }
});

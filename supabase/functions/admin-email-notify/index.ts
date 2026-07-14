/**
 * admin-email-notify
 * Generic admin-only notifier — sends a branded e-mail to the master admin
 * inbox (faleconosco@ocultoswing.com.br) using the project's Resend configuration.
 * Replaces the old Discord-webhook pings used by the admin tooling.
 *
 * Body: { type: string, subject?: string, summary?: string, fields?: Array<{ name: string; value: string }>, tone?: 'success'|'warning'|'danger'|'info' }
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  ADMIN_MASTER_EMAIL,
  buildAdminEmailShell,
  sendAdminEmail,
} from '../_shared/adminEmail.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AdminEmailNotifyPayload {
  type?: string;
  subject?: string;
  summary?: string;
  tone?: 'success' | 'warning' | 'danger' | 'info';
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
  highlight?: string;
}

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

    // Auth: require a valid user (admin gate is handled by the calling UI; we still
    // require an authenticated session so anonymous traffic cannot trigger e-mails).
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace('Bearer ', '');
    if (!token) return respond({ success: false, error: 'Sessão expirada. Faça login novamente.' }, 401);

    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData?.user) {
      return respond({ success: false, error: 'Token inválido ou expirado.' }, 401);
    }

    const { data: roles } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userData.user.id);

    const isAdmin = (roles ?? []).some((r: { role: string }) =>
      ['admin_master', 'admin_regional', 'admin_marketing', 'moderator'].includes(r.role),
    );
    if (!isAdmin) return respond({ success: false, error: 'Apenas administradores podem disparar este teste.' }, 403);

    const payload: AdminEmailNotifyPayload = await req.json().catch(() => ({}));
    const subject = (payload.subject || `[OCULTO] ${payload.type || 'Notificação Admin'}`).slice(0, 180);
    const tone = payload.tone || 'info';

    const fieldsHtml = (payload.fields || [])
      .map(
        (f) => `
        <div style="background:#111;border:1px solid #2a2a2a;border-radius:8px;padding:12px 14px;margin-bottom:8px;">
          <p style="margin:0 0 4px;font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.06em;">${escapeHtml(f.name)}</p>
          <p style="margin:0;font-size:14px;color:#f3f4f6;font-weight:600;">${escapeHtml(f.value)}</p>
        </div>`,
      )
      .join('');

    const summaryHtml = payload.summary
      ? `<p style="margin:0 0 16px;color:#d1d5db;font-size:14px;line-height:1.6;">${escapeHtml(payload.summary)}</p>`
      : '';

    const html = buildAdminEmailShell({
      title: subject.replace(/^\[OCULTO\]\s*/i, ''),
      subtitle: `Notificação automática • ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`,
      bodyHtml: summaryHtml + fieldsHtml,
      highlight: payload.highlight ? { label: payload.highlight, tone } : undefined,
    });

    const result = await sendAdminEmail(supabase, { subject, html });

    if (!result.ok) {
      console.error('[admin-email-notify] send failed:', result.message);
      return respond({ success: false, error: result.message, status: result.status }, result.status >= 400 ? 502 : 500);
    }

    return respond({
      success: true,
      sandbox: result.sandbox === true,
      message: result.message,
      destination: ADMIN_MASTER_EMAIL,
      email_id: result.email_id,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro desconhecido';
    console.error('[admin-email-notify] fatal:', msg);
    return respond({ success: false, error: msg }, 500);
  }
});

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

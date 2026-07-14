/**
 * Shared helper: sends a server-side e-mail to the master admin inbox via Resend.
 * Replaces the legacy Discord-webhook notifier across the admin tooling.
 *
 * Usage from any edge function:
 *   import { sendAdminEmail } from '../_shared/adminEmail.ts';
 *   const r = await sendAdminEmail(supabase, { subject, html });
 *   if (!r.ok) ...
 */

export const ADMIN_MASTER_EMAIL = 'faleconosco@ocultoswing.com.br';

export interface AdminEmailResult {
  ok: boolean;
  status: number;
  message: string;
  email_id?: string;
  sandbox?: boolean;
}

interface SendAdminEmailParams {
  subject: string;
  html: string;
  to?: string;            // override destination, defaults to ADMIN_MASTER_EMAIL
  attachments?: Array<{ filename: string; content: string }>;
}

export async function sendAdminEmail(
  supabase: any,
  { subject, html, to, attachments }: SendAdminEmailParams,
): Promise<AdminEmailResult> {
  const destination = to || ADMIN_MASTER_EMAIL;

  const { data: cfg, error: cfgErr } = await supabase
    .from('resend_config')
    .select('api_key_encrypted, from_email, from_name, is_active, sandbox_mode')
    .maybeSingle();

  if (cfgErr) {
    return {
      ok: false,
      status: 500,
      message: `Falha ao ler configuração de e-mail: ${cfgErr.message}`,
    };
  }

  if (!cfg?.api_key_encrypted) {
    return {
      ok: false,
      status: 400,
      message: 'Resend não configurado. Acesse /admin/resend para cadastrar a API Key.',
    };
  }

  if (!cfg.is_active) {
    return {
      ok: false,
      status: 400,
      message: 'Resend está desativado. Ative em /admin/resend antes de enviar e-mails.',
    };
  }

  if (cfg.sandbox_mode) {
    console.log(`[adminEmail] SANDBOX — would send "${subject}" to ${destination}`);
    return {
      ok: true,
      status: 200,
      sandbox: true,
      message: `Modo sandbox: e-mail "${subject}" seria enviado para ${destination}.`,
    };
  }

  const fromName = cfg.from_name || 'OCULTO Admin';
  const fromEmail = cfg.from_email || 'noreply@ocultoswing.com.br';

  const payload: Record<string, unknown> = {
    from: `${fromName} <${fromEmail}>`,
    to: [destination],
    subject,
    html,
  };
  if (attachments?.length) payload.attachments = attachments;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.api_key_encrypted}`,
      },
      body: JSON.stringify(payload),
    });

    const body = await res.json().catch(() => ({}));

    if (!res.ok) {
      const reason = body?.message || body?.error || `HTTP ${res.status}`;
      return {
        ok: false,
        status: res.status,
        message: `Resend recusou o envio: ${reason}`,
      };
    }

    return {
      ok: true,
      status: res.status,
      email_id: body?.id,
      message: `E-mail enviado para ${destination}.`,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro desconhecido';
    return {
      ok: false,
      status: 500,
      message: `Falha de rede ao enviar e-mail: ${msg}`,
    };
  }
}

/**
 * Wraps inner HTML in a branded dark email shell consistent with OCULTO branding.
 */
export function buildAdminEmailShell(opts: {
  title: string;
  subtitle?: string;
  bodyHtml: string;
  highlight?: { label: string; tone?: 'success' | 'warning' | 'danger' | 'info' };
}): string {
  const { title, subtitle, bodyHtml, highlight } = opts;
  const toneColor: Record<string, string> = {
    success: '#22c55e',
    warning: '#f59e0b',
    danger: '#ef4444',
    info: '#a855f7',
  };
  const accent = highlight ? toneColor[highlight.tone || 'info'] : '#a855f7';
  const highlightBlock = highlight
    ? `<div style="background:${accent}22;border:1px solid ${accent}55;border-radius:8px;padding:12px 14px;margin-bottom:18px;">
         <p style="margin:0;font-size:13px;font-weight:600;color:${accent};">${highlight.label}</p>
       </div>`
    : '';

  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#0f0f0f;font-family:'Segoe UI',Arial,sans-serif;">
  <div style="max-width:580px;margin:32px auto;background:#1a1a1a;border-radius:12px;overflow:hidden;border:1px solid #2a2a2a;">
    <div style="background:linear-gradient(135deg,#7c3aed,#ec4899);padding:24px 26px;">
      <p style="margin:0;font-size:22px;font-weight:700;color:#fff;letter-spacing:0.18em;">OCULTO</p>
      <p style="margin:4px 0 0;font-size:12px;color:rgba(255,255,255,0.85);">${subtitle || 'Central de Inteligência — Admin'}</p>
    </div>
    <div style="padding:26px;">
      <h2 style="margin:0 0 14px;color:#f3f4f6;font-size:18px;">${title}</h2>
      ${highlightBlock}
      <div style="color:#d1d5db;font-size:14px;line-height:1.6;">${bodyHtml}</div>
    </div>
    <div style="background:#111;padding:14px 26px;text-align:center;">
      <p style="margin:0;font-size:11px;color:#6b7280;">OCULTO © ${new Date().getFullYear()} • E-mail automático — não responda.</p>
    </div>
  </div>
</body></html>`;
}

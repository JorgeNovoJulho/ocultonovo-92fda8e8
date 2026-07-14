/**
 * send-pdf-report-email
 * Gera um PDF de "Resumo Semanal" simulado (base64) e envia por e-mail via Resend.
 * Após envio bem-sucedido, notifica o Discord.
 * 100% server-side — zero impacto em CPU/RAM do dispositivo.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ── Tiny PDF builder (pure binary, no external lib) ──────────────────────
// Generates a minimal valid PDF containing text lines — ~3KB, instant generation.
function buildSimulatedPdf(reportDate: string): Uint8Array {
  const title = 'OCULTO - Resumo Semanal de Auditoria';
  const lines = [
    `Plataforma: OCULTO - Conteudo Premium`,
    `Data do Relatorio: ${reportDate}`,
    `Tipo: Teste de Automacao - Backup Fiscal`,
    ``,
    `--- SIMULACAO DE TRANSACAO ---`,
    `Transacao #SIM-001`,
    `Descricao: Assinatura Premium - Teste`,
    `Valor Bruto: R$ 100,00`,
    `Retencao Admin (26%): R$ 26,00`,
    `  - Comissao Plataforma (20%): R$ 20,00`,
    `  - Reserva Impostos (6%): R$ 6,00`,
    `Repasse Criador (74%): R$ 74,00`,
    `Status: CONCLUIDO (simulado)`,
    ``,
    `--- RESUMO FINANCEIRO ---`,
    `Total de Transacoes: 1`,
    `Volume Bruto: R$ 100,00`,
    `Lucro Admin Total: R$ 26,00`,
    `Total Criadores: R$ 74,00`,
    ``,
    `Este relatorio foi gerado automaticamente pela`,
    `Central de Inteligencia do Admin - OCULTO.`,
    `OCULTO (C) ${new Date().getFullYear()} - Todos os direitos reservados.`,
  ];

  // Build minimal PDF structure
  const encoder = new TextEncoder();
  const page_content = lines.map((l, i) => `BT /F1 11 Tf 40 ${720 - i * 18} Td (${l.replace(/[()\\]/g, '\\$&')}) Tj ET`).join('\n');

  const objects: string[] = [];
  // Object 1: catalog
  objects.push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj');
  // Object 2: pages
  objects.push('2 0 obj\n<< /Type /Pages /Kids [4 0 R] /Count 1 >>\nendobj');
  // Object 3: font
  objects.push('3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj');
  // Object 4: page
  objects.push(`4 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 5 0 R /Resources << /Font << /F1 3 0 R >> >> >>\nendobj`);
  // Object 5: content stream
  const streamBytes = encoder.encode(page_content);
  objects.push(`5 0 obj\n<< /Length ${streamBytes.length} >>\nstream\n${page_content}\nendstream\nendobj`);

  const header = '%PDF-1.4\n';
  let pdf = header;
  const offsets: number[] = [];

  for (const obj of objects) {
    offsets.push(encoder.encode(pdf).length);
    pdf += obj + '\n';
  }

  const xrefOffset = encoder.encode(pdf).length;
  pdf += 'xref\n';
  pdf += `0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (const off of offsets) {
    pdf += String(off).padStart(10, '0') + ' 00000 n \n';
  }
  pdf += 'trailer\n<< /Size 6 /Root 1 0 R >>\n';
  pdf += `startxref\n${xrefOffset}\n%%EOF`;

  return encoder.encode(pdf);
}

// ── Convert bytes to base64 ────────────────────────────────────────────────
function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
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

    // ── Auth check ─────────────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return respond({ error: 'Unauthorized' }, 401);

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return respond({ error: 'Invalid token' }, 401);

    // Admin check
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .in('role', ['admin', 'admin_master'])
      .single();
    if (!roleData) return respond({ error: 'Admin access required' }, 403);

    // ── Fetch Resend config ────────────────────────────────────────────────
    const { data: resendConfig } = await supabase
      .from('resend_config')
      .select('api_key_encrypted, from_email, from_name, is_active, sandbox_mode')
      .maybeSingle() as any;

    if (!resendConfig?.api_key_encrypted || !resendConfig?.is_active) {
      return respond({ error: 'Resend não configurado. Acesse /admin/resend para configurar.' }, 400);
    }

    // ── Resolve destination email ──────────────────────────────────────────
    const body = await req.json().catch(() => ({}));
    const destination = body.test_email || 'faleconosco@ocultoswing.com.br';
    if (!destination) return respond({ error: 'E-mail de destino não encontrado.' }, 400);

    // ── Generate PDF (server-side, ~2ms, zero mobile CPU) ─────────────────
    const now = new Date();
    const brtNow = new Date(now.getTime() - 3 * 60 * 60 * 1000);
    const reportDate = brtNow.toLocaleDateString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });

    const pdfBytes = buildSimulatedPdf(reportDate);
    const pdfBase64 = uint8ToBase64(pdfBytes);
    const filename = `relatorio-semanal-oculto-${brtNow.toISOString().split('T')[0]}.pdf`;

    console.log(`[PDF Email] PDF generated (${pdfBytes.length} bytes). Sending to ${destination}...`);

    // ── Build email HTML ───────────────────────────────────────────────────
    const emailHtml = `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Relatório de Auditoria — OCULTO</title></head>
<body style="margin:0;padding:0;background:#0f0f0f;font-family:'Segoe UI',Arial,sans-serif;">
  <div style="max-width:560px;margin:40px auto;background:#1a1a1a;border-radius:12px;overflow:hidden;border:1px solid #333;">
    <!-- Header -->
    <div style="background:linear-gradient(135deg,#7c3aed,#ec4899);padding:32px 28px;">
      <p style="margin:0;font-size:24px;font-weight:700;color:#fff;letter-spacing:0.2em;">OCULTO</p>
      <p style="margin:4px 0 0;font-size:12px;color:rgba(255,255,255,0.8);">Plataforma de Conteúdo Premium</p>
    </div>
    <!-- Body -->
    <div style="padding:28px;">
      <div style="background:#22c55e22;border:1px solid #22c55e44;border-radius:8px;padding:14px 16px;margin-bottom:20px;">
        <p style="margin:0;font-size:14px;color:#22c55e;font-weight:600;">✅ Teste de Automação: Relatório de Backup Fiscal</p>
      </div>
      <p style="color:#d1d5db;font-size:14px;margin:0 0 16px;">Olá, Admin Master.</p>
      <p style="color:#9ca3af;font-size:13px;line-height:1.6;margin:0 0 20px;">
        Este é um e-mail de teste automático disparado pela <strong style="color:#d1d5db;">Central de Inteligência</strong> do painel administrativo. 
        O PDF em anexo contém um <strong style="color:#d1d5db;">Resumo Semanal simulado</strong> com os dados de split 74/26.
      </p>
      <!-- Metrics -->
      <div style="display:grid;gap:10px;margin-bottom:20px;">
        <div style="background:#111;border:1px solid #333;border-radius:8px;padding:14px 16px;display:flex;justify-content:space-between;align-items:center;">
          <span style="color:#9ca3af;font-size:12px;">💰 Volume Bruto (Simulado)</span>
          <span style="color:#f3f4f6;font-size:16px;font-weight:700;">R$ 100,00</span>
        </div>
        <div style="background:#22c55e11;border:1px solid #22c55e33;border-radius:8px;padding:14px 16px;display:flex;justify-content:space-between;align-items:center;">
          <span style="color:#86efac;font-size:12px;">🏦 Retenção Admin (26%)</span>
          <span style="color:#4ade80;font-size:16px;font-weight:700;">R$ 26,00</span>
        </div>
        <div style="background:#111;border:1px solid #333;border-radius:8px;padding:14px 16px;display:flex;justify-content:space-between;align-items:center;">
          <span style="color:#9ca3af;font-size:12px;">👤 Repasse Criadores (74%)</span>
          <span style="color:#f3f4f6;font-size:16px;font-weight:700;">R$ 74,00</span>
        </div>
      </div>
      <p style="color:#6b7280;font-size:12px;margin:0 0 4px;">📎 PDF de auditoria em anexo neste e-mail.</p>
      <p style="color:#6b7280;font-size:11px;margin:0;">Gerado em: ${reportDate} (BRT)</p>
    </div>
    <!-- Footer -->
    <div style="background:#111;padding:16px 28px;text-align:center;">
      <p style="margin:0;font-size:11px;color:#4b5563;">OCULTO © ${now.getFullYear()} — Gerado automaticamente pela Central de Inteligência.</p>
    </div>
  </div>
</body>
</html>`;

    // ── Send via Resend REST API (with attachment) ─────────────────────────
    if (resendConfig.sandbox_mode) {
      console.log(`[PDF Email] SANDBOX MODE — would send to ${destination}`);
      return respond({ success: true, sandbox: true, message: `Modo sandbox. Email seria enviado para ${destination}.` });
    }

    const fromName = resendConfig.from_name || 'OCULTO Admin';
    const fromEmail = resendConfig.from_email || 'noreply@oculto.app';

    const resendPayload = {
      from: `${fromName} <${fromEmail}>`,
      to: [destination],
      subject: '✅ [TESTE] Relatório de Backup Fiscal — OCULTO',
      html: emailHtml,
      attachments: [
        {
          filename,
          content: pdfBase64,
        },
      ],
    };

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${resendConfig.api_key_encrypted}`,
      },
      body: JSON.stringify(resendPayload),
    });

    const resendBody = await resendRes.json();

    if (!resendRes.ok) {
      console.error('[PDF Email] Resend error:', JSON.stringify(resendBody));
      return respond({ error: `Resend error: ${resendBody?.message || resendRes.status}` }, 500);
    }

    console.log(`[PDF Email] ✅ E-mail enviado para ${destination}. ID: ${resendBody?.id}`);

    // ── Discord notification ───────────────────────────────────────────────
    const { data: config } = await supabase
      .from('pix_gateway_config')
      .select('discord_webhook_url')
      .maybeSingle() as any;

    const discordUrl = config?.discord_webhook_url || Deno.env.get('DISCORD_WEBHOOK_URL');

    if (discordUrl) {
      const discordPayload = {
        embeds: [{
          title: '📧 E-mail de Teste Enviado com PDF de Auditoria',
          description: `E-mail de **Backup Fiscal** enviado com sucesso para \`${destination}\` às ${reportDate}.`,
          color: 0x22c55e,
          fields: [
            { name: '📎 Anexo', value: filename, inline: true },
            { name: '💰 Valor Simulado', value: 'R$ 100,00', inline: true },
            { name: '🏦 Retenção (26%)', value: 'R$ 26,00', inline: true },
          ],
          footer: { text: 'OCULTO — Central de Inteligência Admin' },
          timestamp: new Date().toISOString(),
        }],
      };
      fetch(discordUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(discordPayload),
      }).then(r => r.text()).catch(() => null); // fire-and-forget
    }

    return respond({
      success: true,
      message: `E-mail com PDF enviado para ${destination}`,
      email_id: resendBody?.id,
      pdf_filename: filename,
    });

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[PDF Email] Fatal:', msg);
    return respond({ error: msg }, 500);
  }
});

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.91.0";
// @ts-ignore - Deno npm import
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface PaymentStatusPayload {
  user_id: string;
  profile_id: string;
  new_status: 'overdue' | 'suspended' | 'paid';
  amount?: number;
  name?: string;
}

interface EmailTemplate {
  subject: string;
  html_content: string;
  is_active: boolean;
}

// Fetch email template from database
async function fetchEmailTemplate(
  supabase: any,
  templateKey: string
): Promise<EmailTemplate | null> {
  const { data, error } = await supabase
    .from('email_templates')
    .select('subject, html_content, is_active')
    .eq('template_key', templateKey)
    .eq('is_active', true)
    .single();

  if (error || !data) {
    console.log(`⚠️ Template '${templateKey}' not found or inactive:`, error?.message);
    return null;
  }
  return data as EmailTemplate;
}

// Replace template variables with actual values
function replaceTemplateVariables(
  html: string,
  subject: string,
  variables: Record<string, string>
): { html: string; subject: string } {
  let resultHtml = html;
  let resultSubject = subject;
  
  Object.entries(variables).forEach(([key, value]) => {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    resultHtml = resultHtml.replace(regex, value);
    resultSubject = resultSubject.replace(regex, value);
  });
  
  return { html: resultHtml, subject: resultSubject };
}

// Map payment status to template key
function getTemplateKeyForStatus(status: string): string {
  const mapping: Record<string, string> = {
    'overdue': 'payment_reminder_day1',
    'suspended': 'account_suspended',
    'paid': 'payment_confirmed',
  };
  return mapping[status] || 'payment_reminder_day1';
}

// Fallback templates when database templates are not available
function getFallbackTemplate(status: string, userName: string, amount: number): { subject: string; html: string } {
  const formattedAmount = `R$ ${amount?.toFixed(2) || '0,00'}`;
  
  const templates: Record<string, { subject: string; html: string }> = {
    overdue: {
      subject: '💳 Lembrete: Pagamento Pendente - Oculto',
      html: `
        <!DOCTYPE html>
        <html><head><meta charset="utf-8"></head>
        <body style="font-family: sans-serif; padding: 20px;">
          <h1>💳 Lembrete de Pagamento</h1>
          <p>Olá, <strong>${userName}</strong>!</p>
          <p>Seu pagamento de <strong>${formattedAmount}</strong> está pendente.</p>
          <p><a href="${Deno.env.get('APP_URL') || 'https://ocultoswing.com.br'}/checkout/retry" style="background: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">Pagar Agora</a></p>
        </body></html>
      `,
    },
    suspended: {
      subject: '🚫 Sua conta foi suspensa - Oculto',
      html: `
        <!DOCTYPE html>
        <html><head><meta charset="utf-8"></head>
        <body style="font-family: sans-serif; padding: 20px;">
          <h1>🚫 Conta Suspensa</h1>
          <p>Olá, <strong>${userName}</strong>!</p>
          <p>Sua conta foi suspensa devido ao pagamento de <strong>${formattedAmount}</strong> pendente há mais de 7 dias.</p>
          <p><a href="${Deno.env.get('APP_URL') || 'https://ocultoswing.com.br'}/checkout/retry" style="background: #7c3aed; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">Regularizar e Voltar</a></p>
        </body></html>
      `,
    },
    paid: {
      subject: '✅ Pagamento Confirmado! - Oculto',
      html: `
        <!DOCTYPE html>
        <html><head><meta charset="utf-8"></head>
        <body style="font-family: sans-serif; padding: 20px;">
          <h1>✅ Pagamento Confirmado!</h1>
          <p>Olá, <strong>${userName}</strong>!</p>
          <p>Seu pagamento foi confirmado e sua conta está totalmente regularizada.</p>
          <p><a href="${Deno.env.get('APP_URL') || 'https://ocultoswing.com.br'}/feed" style="background: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">Acessar Plataforma</a></p>
        </body></html>
      `,
    },
  };

  return templates[status] || templates.overdue;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('EXTERNAL_SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('EXTERNAL_SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const payload: PaymentStatusPayload = await req.json();
    const { user_id, profile_id, new_status, amount = 0, name = 'Usuário' } = payload;

    console.log(`📬 Payment status webhook triggered: ${new_status} for user ${user_id}`);

    // Fetch Resend configuration
    const { data: resendConfig } = await supabase
      .from("resend_config")
      .select("*")
      .single();

    let resend: Resend | null = null;
    if (resendConfig?.api_key_encrypted && resendConfig?.is_active) {
      resend = new Resend(resendConfig.api_key_encrypted);
      console.log("📧 Resend configured and active");
    } else {
      console.log("📧 Resend not configured or inactive - emails will be skipped");
    }

    // Get user email from auth
    let userEmail: string | null = null;
    try {
      const { data: authData } = await supabase.auth.admin.getUserById(user_id);
      userEmail = authData?.user?.email || null;
    } catch (e) {
      console.log("Could not fetch user email:", e);
    }

    // Send push notification
    try {
      let pushTitle = '';
      let pushBody = '';

      switch (new_status) {
        case 'overdue':
          pushTitle = '💳 Pagamento Atrasado';
          pushBody = `Seu pagamento de R$ ${amount.toFixed(2)} está atrasado. Regularize para continuar acessando.`;
          break;
        case 'suspended':
          pushTitle = '🚫 Conta Suspensa';
          pushBody = 'Sua conta foi suspensa por falta de pagamento. Regularize para recuperar o acesso.';
          break;
        case 'paid':
          pushTitle = '✅ Pagamento Confirmado';
          pushBody = 'Seu pagamento foi confirmado e sua conta está regularizada!';
          break;
      }

      await supabase.functions.invoke("send-push-notification", {
        body: {
          user_id,
          title: pushTitle,
          body: pushBody,
          data: { action: new_status === 'paid' ? 'payment_confirmed' : 'payment_required' },
        },
      });
      console.log("📱 Push notification sent");
    } catch (pushError) {
      console.log("Push notification failed:", pushError);
    }

    // Send email if Resend is configured
    if (resend && userEmail) {
      try {
        // Fetch template from database
        const templateKey = getTemplateKeyForStatus(new_status);
        const template = await fetchEmailTemplate(supabase, templateKey);
        
        let emailSubject: string;
        let emailHtml: string;

        if (template) {
          // Use database template with variable replacement
          const formattedAmount = `R$ ${amount?.toFixed(2) || '0,00'}`;
          const variables: Record<string, string> = {
            user_name: name || 'Usuário',
            amount: formattedAmount,
            payment_url: (Deno.env.get('APP_URL') || 'https://ocultoswing.com.br') + '/checkout/retry',
            platform_url: (Deno.env.get('APP_URL') || 'https://ocultoswing.com.br') + '/feed',
            platform_name: 'Oculto Swing',
            support_email: 'suporte@oculto.app',
          };
          
          const result = replaceTemplateVariables(template.html_content, template.subject, variables);
          emailSubject = result.subject;
          emailHtml = result.html;
          console.log(`📧 Using database template: ${templateKey}`);
        } else {
          // Fallback to hardcoded template
          const fallback = getFallbackTemplate(new_status, name, amount);
          emailSubject = fallback.subject;
          emailHtml = fallback.html;
          console.log(`📧 Using fallback template for status: ${new_status}`);
        }

        if (resendConfig?.sandbox_mode) {
          console.log(`📧 [SANDBOX] Would send email to ${userEmail}: ${emailSubject}`);
        } else {
          await resend.emails.send({
            from: `${resendConfig?.from_name || 'Oculto'} <${resendConfig?.from_email || 'noreply@oculto.app'}>`,
            to: [userEmail],
            subject: emailSubject,
            html: emailHtml,
          });
          console.log(`📧 Email sent to ${userEmail}`);
        }
      } catch (emailError) {
        console.error("📧 Error sending email:", emailError);
      }
    }

    // Record in payment_reminders table for tracking
    if (new_status === 'overdue') {
      const { error: reminderError } = await supabase
        .from("payment_reminders")
        .insert({
          user_id: profile_id,
          reminder_day: 1,
          sent_via: resend && userEmail ? "both" : "push",
        });

      if (reminderError) {
        console.error("Error recording reminder:", reminderError);
      }
    }

    console.log("✅ Payment status webhook completed");

    return new Response(
      JSON.stringify({
        success: true,
        status: new_status,
        email_sent: resend && userEmail,
        push_sent: true,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("❌ Error in payment-status-webhook:", error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});

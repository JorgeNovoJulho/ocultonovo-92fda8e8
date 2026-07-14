import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.91.0";
// @ts-ignore - Deno npm import
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface OverdueUser {
  id: string;
  user_id: string;
  name: string;
  email?: string;
  payment_status: string;
  payment_due_date: string;
  payment_reminder_count: number;
  last_payment_reminder_at: string | null;
  subscription_amount: number;
}

interface ResendConfig {
  api_key_encrypted: string | null;
  from_email: string;
  from_name: string;
  is_active: boolean;
  sandbox_mode: boolean;
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

// Fallback template when database template is not available
function getFallbackEmailTemplate(userName: string, amount: number, reminderDay: number): { subject: string; html: string } {
  const formattedAmount = `R$ ${amount?.toFixed(2) || '0,00'}`;
  
  const subjects: Record<number, string> = {
    1: '💳 Lembrete: Pagamento Pendente',
    3: '⏰ Lembrete de Pagamento Pendente',
    7: '⚠️ Última Chance - Sua conta será suspensa',
  };

  const html = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="font-family: sans-serif; padding: 20px;">
      <h1>${reminderDay === 7 ? '⚠️ Última Chance' : '💳 Lembrete de Pagamento'}</h1>
      <p>Olá, <strong>${userName}</strong>!</p>
      <p>Seu pagamento de <strong>${formattedAmount}</strong> está pendente${reminderDay > 1 ? ` há ${reminderDay} dias` : ''}.</p>
      <p><a href="${Deno.env.get('APP_URL') || 'https://ocultoswing.com.br'}/checkout/retry" style="background: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">Pagar Agora</a></p>
    </body>
    </html>
  `;

  return { subject: subjects[reminderDay] || subjects[1], html };
}

// Map reminder day to template key
function getTemplateKeyForDay(reminderDay: number): string {
  const mapping: Record<number, string> = {
    1: 'payment_reminder_day1',
    3: 'payment_reminder_day3',
    7: 'payment_reminder_day7',
  };
  return mapping[reminderDay] || 'payment_reminder_day1';
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

    console.log("🔍 Checking for overdue users...");

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

    // Fetch users with overdue payments
    const { data: overdueUsers, error: fetchError } = await supabase
      .from("profiles")
      .select("id, user_id, name, payment_status, payment_due_date, payment_reminder_count, last_payment_reminder_at, subscription_amount")
      .eq("payment_status", "overdue")
      .not("payment_due_date", "is", null);

    if (fetchError) {
      console.error("Error fetching overdue users:", fetchError);
      throw fetchError;
    }

    console.log(`Found ${overdueUsers?.length || 0} overdue users`);

    const now = new Date();
    const remindersToSend: { user: OverdueUser; reminderDay: number }[] = [];

    // Process each overdue user
    for (const user of (overdueUsers as OverdueUser[]) || []) {
      const dueDate = new Date(user.payment_due_date);
      const daysSinceOverdue = Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
      
      // Determine which reminder to send (1, 3, or 7 days)
      let reminderDay = 0;
      
      if (daysSinceOverdue >= 7 && user.payment_reminder_count < 3) {
        reminderDay = 7;
      } else if (daysSinceOverdue >= 3 && user.payment_reminder_count < 2) {
        reminderDay = 3;
      } else if (daysSinceOverdue >= 1 && user.payment_reminder_count < 1) {
        reminderDay = 1;
      }

      // Check if we should send a reminder today
      const lastReminder = user.last_payment_reminder_at ? new Date(user.last_payment_reminder_at) : null;
      const hoursSinceLastReminder = lastReminder 
        ? (now.getTime() - lastReminder.getTime()) / (1000 * 60 * 60)
        : 999;

      // Only send if reminder is due and at least 12 hours since last reminder
      if (reminderDay > 0 && hoursSinceLastReminder > 12) {
        remindersToSend.push({ user, reminderDay });
      }
    }

    console.log(`Sending ${remindersToSend.length} reminders...`);

    const results = [];

    for (const { user, reminderDay } of remindersToSend) {
      try {
        // Create in-app notification
        const notificationTitle = reminderDay === 7 
          ? "⚠️ Última Chance - Conta será suspensa"
          : reminderDay === 3
          ? "⏰ Lembrete de Pagamento Pendente"
          : "💳 Pagamento Atrasado";

        const notificationBody = reminderDay === 7
          ? `Sua conta será suspensa em breve. Regularize seu pagamento de R$ ${user.subscription_amount?.toFixed(2) || '0,00'} para evitar perda de acesso.`
          : reminderDay === 3
          ? `Seu pagamento de R$ ${user.subscription_amount?.toFixed(2) || '0,00'} está pendente há 3 dias. Regularize para continuar acessando.`
          : `Seu pagamento de R$ ${user.subscription_amount?.toFixed(2) || '0,00'} está atrasado. Clique para regularizar.`;

        // Insert notification
        const { error: notifError } = await supabase
          .from("notifications")
          .insert({
            user_id: user.user_id,
            type: "payment_reminder",
            title: notificationTitle,
            body: notificationBody,
            data: {
              action: "payment_required",
              reminder_day: reminderDay,
              amount: user.subscription_amount,
            },
          });

        if (notifError) {
          console.error(`Error creating notification for user ${user.id}:`, notifError);
        }

        // Try to send push notification
        try {
          await supabase.functions.invoke("send-push-notification", {
            body: {
              user_id: user.user_id,
              title: notificationTitle,
              body: notificationBody,
              data: { action: "payment_required" },
            },
          });
        } catch (pushError) {
          console.log(`Push notification skipped for user ${user.id}:`, pushError);
        }

        // Send email if Resend is configured
        if (resend) {
          try {
            // Get user email from auth
            const { data: authData } = await supabase.auth.admin.getUserById(user.user_id);
            const userEmail = authData?.user?.email;

            if (userEmail) {
              // Fetch template from database
              const templateKey = getTemplateKeyForDay(reminderDay);
              const template = await fetchEmailTemplate(supabase, templateKey);
              
              let emailSubject: string;
              let emailHtml: string;

              if (template) {
                // Use database template with variable replacement
                const formattedAmount = `R$ ${user.subscription_amount?.toFixed(2) || '0,00'}`;
                const variables: Record<string, string> = {
                  user_name: user.name || 'Usuário',
                  amount: formattedAmount,
                  payment_url: (Deno.env.get('APP_URL') || 'https://ocultoswing.com.br') + '/checkout/retry',
                  platform_name: 'Oculto Swing',
                  support_email: 'suporte@oculto.app',
                };
                
                const result = replaceTemplateVariables(template.html_content, template.subject, variables);
                emailSubject = result.subject;
                emailHtml = result.html;
                console.log(`📧 Using database template: ${templateKey}`);
              } else {
                // Fallback to hardcoded template
                const fallback = getFallbackEmailTemplate(user.name, user.subscription_amount, reminderDay);
                emailSubject = fallback.subject;
                emailHtml = fallback.html;
                console.log(`📧 Using fallback template for day ${reminderDay}`);
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
                console.log(`📧 Email sent to ${userEmail} (Day ${reminderDay})`);
              }
            } else {
              console.log(`📧 No email found for user ${user.id}`);
            }
          } catch (emailError) {
            console.error(`📧 Error sending email to user ${user.id}:`, emailError);
          }
        }

        // Record the reminder
        const { error: reminderError } = await supabase
          .from("payment_reminders")
          .insert({
            user_id: user.id,
            reminder_day: reminderDay,
            sent_via: "both", // push + in-app
          });

        if (reminderError) {
          console.error(`Error recording reminder for user ${user.id}:`, reminderError);
        }

        // Update user's reminder count
        const { error: updateError } = await supabase
          .from("profiles")
          .update({
            payment_reminder_count: user.payment_reminder_count + 1,
            last_payment_reminder_at: now.toISOString(),
          })
          .eq("id", user.id);

        if (updateError) {
          console.error(`Error updating reminder count for user ${user.id}:`, updateError);
        }

        // If 7 days passed and still not paid, suspend account
        if (reminderDay === 7) {
          const { error: suspendError } = await supabase
            .from("profiles")
            .update({ payment_status: "suspended" })
            .eq("id", user.id);

          if (suspendError) {
            console.error(`Error suspending user ${user.id}:`, suspendError);
          } else {
            console.log(`User ${user.id} suspended due to 7+ days overdue`);
          }
        }

        results.push({
          user_id: user.id,
          reminder_day: reminderDay,
          status: "sent",
        });

      } catch (err) {
        console.error(`Error processing reminder for user ${user.id}:`, err);
        results.push({
          user_id: user.id,
          reminder_day: reminderDay,
          status: "error",
          error: String(err),
        });
      }
    }

    console.log("✅ Payment reminders check complete:", results);

    return new Response(
      JSON.stringify({
        success: true,
        processed: remindersToSend.length,
        results,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("❌ Error in check-payment-reminders:", error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});

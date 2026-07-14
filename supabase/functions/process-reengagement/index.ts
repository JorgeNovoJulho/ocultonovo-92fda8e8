import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('EXTERNAL_SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('EXTERNAL_SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log("[Reengagement] Starting check...");

    // Get users that match reengagement triggers
    const { data: triggers, error: triggerError } = await supabase.rpc(
      "check_reengagement_triggers"
    );

    if (triggerError) {
      console.error("[Reengagement] Error checking triggers:", triggerError);
      throw triggerError;
    }

    console.log(`[Reengagement] Found ${triggers?.length || 0} triggers`);

    let processed = 0;
    let sent = 0;

    for (const trigger of triggers || []) {
      try {
        // Fetch the full rule
        const { data: rule } = await supabase
          .from("reengagement_rules")
          .select("*")
          .eq("id", trigger.rule_id)
          .single();

        if (!rule) continue;

        // Retention gate: respeita horário + max_per_day por usuário.
        // Se a rule definir retention_alert_key, valida via RPC antes de prosseguir.
        const retentionKey = (rule as any).retention_alert_key as string | undefined;
        if (retentionKey) {
          const { data: canSend } = await supabase.rpc("retention_alert_can_send", {
            p_user_id: trigger.user_id,
            p_key: retentionKey,
          });
          if (!canSend) {
            console.log(`[Reengagement] Blocked by retention gate (${retentionKey}) for ${trigger.user_id}`);
            continue;
          }
          // Log do envio para o anti-spam
          await supabase.from("oculto_retention_alerts_log").insert({
            user_id: trigger.user_id,
            alert_key: retentionKey,
          });
        }

        // Get user profile
        const { data: profile } = await supabase
          .from("profiles")
          .select("email, username")
          .eq("id", trigger.user_id)
          .single();

        if (!profile) continue;

        // Record the trigger in history
        await supabase.from("user_reengagement_history").insert({
          user_id: trigger.user_id,
          rule_id: trigger.rule_id,
          triggered_at: new Date().toISOString(),
          channel: rule.action_type,
        });

        // Send push notification
        if (rule.action_type === "push" || rule.action_type === "both") {
          try {
            await fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${supabaseServiceKey}`,
              },
              body: JSON.stringify({
                user_id: trigger.user_id,
                title: rule.push_title || "Sentimos sua falta! 💜",
                body: rule.push_body || "Volte e veja as novidades que preparamos para você.",
                url: "/feed",
                type: "reengagement",
              }),
            });
            sent++;
          } catch (pushError) {
            console.error(`[Reengagement] Push failed for ${trigger.user_id}:`, pushError);
          }
        }

        // Send email
        if ((rule.action_type === "email" || rule.action_type === "both") && profile.email) {
          try {
            // Get Resend config
            const { data: resendConfig } = await supabase
              .from("resend_config")
              .select("*")
              .single();

            if (resendConfig?.api_key_encrypted && resendConfig.is_active && !resendConfig.sandbox_mode) {
              const Resend = (await import("https://esm.sh/resend@2.0.0")).Resend;
              const resend = new Resend(resendConfig.api_key_encrypted);

              // Get email template if configured
              let html = `
                <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
                  <h1 style="color: #9333ea;">Sentimos sua falta, ${profile.username || "amigo(a)"}! 💜</h1>
                  <p>Faz um tempo que não te vemos por aqui. Volte e confira as novidades!</p>
                  <a href="${Deno.env.get('APP_URL') || 'https://ocultoswing.com.br'}/feed" 
                     style="display: inline-block; background: linear-gradient(135deg, #9333ea, #db2777); 
                            color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; 
                            margin-top: 16px;">
                    Voltar para o Oculto
                  </a>
                </div>
              `;
              let subject = "Sentimos sua falta! 💜";

              if (rule.email_template_id) {
                const { data: template } = await supabase
                  .from("email_templates")
                  .select("*")
                  .eq("id", rule.email_template_id)
                  .single();

                if (template) {
                  html = template.html_content.replace(/\{\{user_name\}\}/g, profile.username || "Usuário");
                  subject = template.subject.replace(/\{\{user_name\}\}/g, profile.username || "Usuário");
                }
              }

              await resend.emails.send({
                from: `${resendConfig.from_name} <${resendConfig.from_email}>`,
                to: [profile.email],
                subject,
                html,
              });
              sent++;
            }
          } catch (emailError) {
            console.error(`[Reengagement] Email failed for ${trigger.user_id}:`, emailError);
          }
        }

        // Generate coupon if needed
        if (rule.action_type === "coupon" && rule.coupon_discount) {
          const couponCode = `VOLTA${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
          const expiresAt = new Date();
          expiresAt.setDate(expiresAt.getDate() + (rule.coupon_valid_days || 7));

          await supabase.from("coupons").insert({
            code: couponCode,
            discount_type: "percentage",
            discount_value: rule.coupon_discount,
            max_uses: 1,
            expires_at: expiresAt.toISOString(),
            is_active: true,
          });

          // Update history with coupon code
          await supabase
            .from("user_reengagement_history")
            .update({ coupon_code: couponCode })
            .eq("user_id", trigger.user_id)
            .eq("rule_id", trigger.rule_id)
            .order("triggered_at", { ascending: false })
            .limit(1);
        }

        // Update rule stats
        const newStats = {
          triggered: (rule.stats?.triggered || 0) + 1,
          sent: (rule.stats?.sent || 0) + 1,
          converted: rule.stats?.converted || 0,
        };

        await supabase
          .from("reengagement_rules")
          .update({ stats: newStats })
          .eq("id", rule.id);

        processed++;
      } catch (userError) {
        console.error(`[Reengagement] Error processing trigger:`, userError);
      }
    }

    console.log(`[Reengagement] Completed: ${processed} processed, ${sent} sent`);

    return new Response(
      JSON.stringify({
        success: true,
        processed,
        sent,
        triggers_found: triggers?.length || 0,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("[Reengagement] Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

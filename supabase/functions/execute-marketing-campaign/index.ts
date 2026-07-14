import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ExecutePayload {
  campaign_id: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('EXTERNAL_SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('EXTERNAL_SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify admin access
    const authHeader = req.headers.get("Authorization");
    if (authHeader) {
      const token = authHeader.replace("Bearer ", "");
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);
      
      if (authError || !user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Check admin role
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .in("role", ["admin_master", "admin_marketing"]);

      if (!roles || roles.length === 0) {
        return new Response(JSON.stringify({ error: "Admin access required" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const { campaign_id }: ExecutePayload = await req.json();

    if (!campaign_id) {
      return new Response(JSON.stringify({ error: "campaign_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch campaign
    const { data: campaign, error: campaignError } = await supabase
      .from("marketing_campaigns")
      .select("*")
      .eq("id", campaign_id)
      .single();

    if (campaignError || !campaign) {
      return new Response(JSON.stringify({ error: "Campaign not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[Campaign] Executing campaign: ${campaign.name}`);

    // Get target users using the database function
    const { data: targetUsers, error: targetError } = await supabase.rpc(
      "get_campaign_target_users",
      { p_audience: campaign.target_audience, p_filter: campaign.target_filter || {} }
    );

    if (targetError) {
      console.error("[Campaign] Error getting targets:", targetError);
      throw targetError;
    }

    console.log(`[Campaign] Found ${targetUsers?.length || 0} target users`);

    // Update campaign status
    await supabase
      .from("marketing_campaigns")
      .update({
        status: "active",
        started_at: new Date().toISOString(),
      })
      .eq("id", campaign_id);

    let sentCount = 0;
    let failedCount = 0;

    // Fetch email template if needed
    let emailTemplate = null;
    if ((campaign.type === "email" || campaign.type === "both") && campaign.email_template_id) {
      const { data: template } = await supabase
        .from("email_templates")
        .select("*")
        .eq("id", campaign.email_template_id)
        .single();
      emailTemplate = template;
    }

    // Process each target user
    for (const target of targetUsers || []) {
      try {
        // Create execution record
        const executions = [];

        if (campaign.type === "email" || campaign.type === "both") {
          executions.push({
            campaign_id,
            user_id: target.user_id,
            channel: "email",
            status: "pending",
          });
        }

        if (campaign.type === "push" || campaign.type === "both") {
          executions.push({
            campaign_id,
            user_id: target.user_id,
            channel: "push",
            status: "pending",
          });
        }

        // Insert execution records
        const { data: insertedExecs } = await supabase
          .from("campaign_executions")
          .insert(executions)
          .select();

        // Send push notification
        if (campaign.type === "push" || campaign.type === "both") {
          try {
            await fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${supabaseServiceKey}`,
              },
              body: JSON.stringify({
                user_id: target.user_id,
                title: campaign.push_title || campaign.name,
                body: campaign.push_body || campaign.description || "",
                url: campaign.push_url || "/",
                type: "marketing",
              }),
            });

            // Update execution status
            const pushExec = insertedExecs?.find((e: any) => e.channel === "push");
            if (pushExec) {
              await supabase
                .from("campaign_executions")
                .update({ status: "sent", sent_at: new Date().toISOString() })
                .eq("id", pushExec.id);
            }
          } catch (pushError) {
            console.error(`[Campaign] Push failed for ${target.user_id}:`, pushError);
          }
        }

        // Send email
        if ((campaign.type === "email" || campaign.type === "both") && emailTemplate && target.email) {
          try {
            // Get Resend config
            const { data: resendConfig } = await supabase
              .from("resend_config")
              .select("*")
              .single();

            if (resendConfig?.api_key_encrypted && resendConfig.is_active) {
              // Dynamic import for Resend
              const Resend = (await import("https://esm.sh/resend@2.0.0")).Resend;
              const resend = new Resend(resendConfig.api_key_encrypted);

              // Replace template variables
              let html = emailTemplate.html_content;
              let subject = emailTemplate.subject;
              const variables: Record<string, string> = {
                user_name: target.username || "Usuário",
                platform_url: Deno.env.get('APP_URL') || "https://ocultoswing.com.br",
                platform_name: "Oculto Swing",
              };

              Object.entries(variables).forEach(([key, value]) => {
                const regex = new RegExp(`\\{\\{${key}\\}\\}`, "g");
                html = html.replace(regex, value);
                subject = subject.replace(regex, value);
              });

              if (!resendConfig.sandbox_mode) {
                await resend.emails.send({
                  from: `${resendConfig.from_name} <${resendConfig.from_email}>`,
                  to: [target.email],
                  subject,
                  html,
                });
              }

              // Update execution status
              const emailExec = insertedExecs?.find((e: any) => e.channel === "email");
              if (emailExec) {
                await supabase
                  .from("campaign_executions")
                  .update({ status: "sent", sent_at: new Date().toISOString() })
                  .eq("id", emailExec.id);
              }
            }
          } catch (emailError) {
            console.error(`[Campaign] Email failed for ${target.user_id}:`, emailError);
          }
        }

        sentCount++;
      } catch (userError) {
        console.error(`[Campaign] Error processing user ${target.user_id}:`, userError);
        failedCount++;
      }
    }

    // Update campaign stats
    const newStats = {
      sent: sentCount,
      delivered: sentCount,
      opened: 0,
      clicked: 0,
      converted: 0,
    };

    await supabase
      .from("marketing_campaigns")
      .update({
        stats: newStats,
        status: "completed",
        completed_at: new Date().toISOString(),
      })
      .eq("id", campaign_id);

    console.log(`[Campaign] Completed: ${sentCount} sent, ${failedCount} failed`);

    return new Response(
      JSON.stringify({
        success: true,
        target_count: targetUsers?.length || 0,
        sent: sentCount,
        failed: failedCount,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("[Campaign] Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

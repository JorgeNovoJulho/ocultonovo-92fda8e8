import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, svix-id, svix-timestamp, svix-signature',
};

interface ResendWebhookEvent {
  type: string;
  created_at: string;
  data: {
    email_id: string;
    from: string;
    to: string[];
    subject: string;
    created_at: string;
    // For bounce events
    bounce?: {
      message: string;
    };
    // For click events  
    click?: {
      link: string;
      timestamp: string;
    };
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('EXTERNAL_SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('EXTERNAL_SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Parse webhook payload
    const payload: ResendWebhookEvent = await req.json();
    
    console.log('[Resend Webhook] Received event:', payload.type);
    console.log('[Resend Webhook] Email ID:', payload.data.email_id);

    const emailId = payload.data.email_id;
    const now = new Date().toISOString();

    // Find the email log by resend_message_id
    const { data: existingLog, error: findError } = await supabase
      .from('email_logs')
      .select('id, status')
      .eq('resend_message_id', emailId)
      .single();

    if (findError && findError.code !== 'PGRST116') {
      console.error('[Resend Webhook] Error finding log:', findError);
    }

    // Prepare update based on event type
    let updateData: Record<string, any> = {};

    switch (payload.type) {
      case 'email.delivered':
        updateData = {
          status: 'delivered',
          metadata: { delivered_at: now }
        };
        break;

      case 'email.opened':
        updateData = {
          status: 'opened',
          opened_at: now
        };
        break;

      case 'email.clicked':
        updateData = {
          status: 'clicked',
          clicked_at: now,
          metadata: { 
            clicked_link: payload.data.click?.link 
          }
        };
        break;

      case 'email.bounced':
        updateData = {
          status: 'bounced',
          bounced_at: now,
          bounce_reason: payload.data.bounce?.message || 'Unknown bounce reason'
        };
        break;

      case 'email.delivery_delayed':
        updateData = {
          metadata: { delivery_delayed_at: now }
        };
        break;

      case 'email.complained':
        updateData = {
          status: 'bounced',
          bounced_at: now,
          bounce_reason: 'Spam complaint'
        };
        break;

      default:
        console.log('[Resend Webhook] Unhandled event type:', payload.type);
    }

    // Update the log if we found it
    if (existingLog && Object.keys(updateData).length > 0) {
      const { error: updateError } = await supabase
        .from('email_logs')
        .update(updateData)
        .eq('id', existingLog.id);

      if (updateError) {
        console.error('[Resend Webhook] Error updating log:', updateError);
      } else {
        console.log('[Resend Webhook] Updated log:', existingLog.id, 'to status:', updateData.status);
      }
    } else if (!existingLog) {
      // Log not found - might be from before we started tracking
      console.log('[Resend Webhook] No matching log found for email_id:', emailId);
      
      // Create a new log entry for tracking purposes
      const recipient = payload.data.to?.[0] || 'unknown';
      
      await supabase.from('email_logs').insert({
        template_key: 'unknown',
        recipient_email: recipient,
        subject: payload.data.subject,
        status: updateData.status || 'sent',
        resend_message_id: emailId,
        opened_at: updateData.opened_at,
        clicked_at: updateData.clicked_at,
        bounced_at: updateData.bounced_at,
        bounce_reason: updateData.bounce_reason,
        metadata: { retroactive: true, original_event: payload.type }
      });
    }

    return new Response(
      JSON.stringify({ success: true, event: payload.type }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[Resend Webhook] Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});

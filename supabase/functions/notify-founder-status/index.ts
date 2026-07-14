import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface FounderNotificationPayload {
  type: 'status_change' | 'expiration_warning';
  application_id?: string;
  new_status?: string;
  old_status?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('EXTERNAL_SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('EXTERNAL_SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const payload: FounderNotificationPayload = await req.json();

    if (payload.type === 'status_change') {
      await handleStatusChange(supabase, payload);
    } else if (payload.type === 'expiration_warning') {
      await handleExpirationWarnings(supabase);
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[notify-founder-status] Error:', msg);
    return new Response(JSON.stringify({ success: false, error: msg }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});

async function handleStatusChange(
  supabase: any,
  payload: FounderNotificationPayload
) {
  const { application_id, new_status } = payload;
  if (!application_id || !new_status) return;

  // Fetch application details
  const { data: app, error: appErr } = await supabase
    .from('creator_founder_applications')
    .select('*')
    .eq('id', application_id)
    .single();

  if (appErr || !app) {
    console.error('[notify-founder-status] Application not found:', appErr);
    return;
  }

  // Fetch user profile for name
  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, username')
    .eq('id', app.user_id)
    .single();

  const userName = profile?.display_name || profile?.username || 'Criador(a)';

  if (new_status === 'approved') {
    await sendApprovedNotification(supabase, app.user_id, userName);
  } else if (new_status === 'rejected') {
    const reason = app.rejection_reason || 'Não especificado';
    await sendRejectedNotification(supabase, app.user_id, userName, reason);
  }
}

async function sendApprovedNotification(
  supabase: any,
  userId: string,
  userName: string
) {
  const title = '🎉 Parabéns, Creator Founder!';
  const body = `${userName}, sua candidatura foi aprovada! Você agora faz parte dos Creator Founders com 1 ano de isenção no Plano VIP.`;

  // In-app notification
  await supabase.from('notifications').insert({
    user_id: userId,
    type: 'creator_founder_approved',
    title,
    body,
    data: { action: 'founder_approved' },
  });

  // Push notification (non-blocking)
  try {
    await supabase.functions.invoke('send-push-notification', {
      body: { user_id: userId, title, body, url: '/profile', tag: 'founder-status' },
    });
  } catch (e) {
    console.log('[notify-founder-status] Push failed (non-critical):', e);
  }

  // Try email via template
  await sendEmailFromTemplate(supabase, userId, 'founder_approved', { user_name: userName });

  console.log(`[notify-founder-status] Approved notification sent to ${userId}`);
}

async function sendRejectedNotification(
  supabase: any,
  userId: string,
  userName: string,
  reason: string
) {
  const title = 'Resultado da sua Candidatura Creator Founder';
  const body = `${userName}, infelizmente sua candidatura não foi aprovada. Motivo: ${reason}. Você pode tentar novamente após as correções.`;

  // In-app notification
  await supabase.from('notifications').insert({
    user_id: userId,
    type: 'creator_founder_rejected',
    title,
    body,
    data: { action: 'founder_rejected', rejection_reason: reason },
  });

  // Push notification (non-blocking)
  try {
    await supabase.functions.invoke('send-push-notification', {
      body: { user_id: userId, title, body, url: '/creator-founder', tag: 'founder-status' },
    });
  } catch (e) {
    console.log('[notify-founder-status] Push failed (non-critical):', e);
  }

  // Try email via template
  await sendEmailFromTemplate(supabase, userId, 'founder_rejected', {
    user_name: userName,
    rejection_reason: reason,
  });

  console.log(`[notify-founder-status] Rejected notification sent to ${userId}`);
}

async function handleExpirationWarnings(supabase: any) {
  // Find founders whose free period ends in exactly 7 days
  const sevenDaysFromNow = new Date();
  sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
  const targetDate = sevenDaysFromNow.toISOString().split('T')[0];

  const { data: expiring, error } = await supabase
    .from('creator_founders')
    .select('user_id, free_period_ends')
    .eq('is_active', true)
    .gte('free_period_ends', `${targetDate}T00:00:00`)
    .lte('free_period_ends', `${targetDate}T23:59:59`);

  if (error) {
    console.error('[notify-founder-status] Expiration query error:', error);
    return;
  }

  if (!expiring || expiring.length === 0) {
    console.log('[notify-founder-status] No founders expiring in 7 days');
    return;
  }

  console.log(`[notify-founder-status] Found ${expiring.length} founders expiring in 7 days`);

  for (const founder of expiring) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('display_name, username')
      .eq('id', founder.user_id)
      .single();

    const userName = profile?.display_name || profile?.username || 'Criador(a)';
    const title = '⚠️ Seu período Creator Founder expira em 7 dias';
    const body = `${userName}, seu período gratuito de Creator Founder termina em 7 dias. Assine o Plano VIP para manter suas ferramentas de criação ativas.`;

    await supabase.from('notifications').insert({
      user_id: founder.user_id,
      type: 'founder_expiration_warning',
      title,
      body,
      data: { action: 'founder_expiring', free_period_ends: founder.free_period_ends },
    });

    try {
      await supabase.functions.invoke('send-push-notification', {
        body: { user_id: founder.user_id, title, body, url: '/pricing', tag: 'founder-expiration' },
      });
    } catch (e) {
      console.log('[notify-founder-status] Push failed (non-critical):', e);
    }

    await sendEmailFromTemplate(supabase, founder.user_id, 'founder_expiring', {
      user_name: userName,
      expiration_date: new Date(founder.free_period_ends).toLocaleDateString('pt-BR'),
    });
  }
}

async function sendEmailFromTemplate(
  supabase: any,
  userId: string,
  templateSlug: string,
  variables: Record<string, string>
) {
  try {
    // Get user email
    const { data: authUser } = await supabase.auth.admin.getUserById(userId);
    const email = authUser?.user?.email;
    if (!email) return;

    // Try to find email template
    const { data: template } = await supabase
      .from('email_templates')
      .select('subject, html_body')
      .eq('slug', templateSlug)
      .eq('is_active', true)
      .single();

    if (!template) {
      console.log(`[notify-founder-status] No email template for ${templateSlug}`);
      return;
    }

    let subject = template.subject;
    let htmlBody = template.html_body;

    // Replace variables
    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`{{${key}}}`, 'g');
      subject = subject.replace(regex, value);
      htmlBody = htmlBody.replace(regex, value);
    }

    // Send via Resend (using send-test-email function as relay)
    await supabase.functions.invoke('send-test-email', {
      body: { to: email, subject, html: htmlBody },
    });

    console.log(`[notify-founder-status] Email sent to ${email} (${templateSlug})`);
  } catch (e) {
    console.log(`[notify-founder-status] Email failed (non-critical):`, e);
  }
}

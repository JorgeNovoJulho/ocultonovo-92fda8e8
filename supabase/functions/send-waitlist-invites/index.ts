import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface InvitePayload {
  ids?: string[];
  count?: number;
}

interface WaitlistEntry {
  id: string;
  email: string;
  name: string | null;
}

const getInviteEmailHtml = (name: string) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #0a0a0a;">
  <div style="max-width: 600px; margin: 0 auto; background: linear-gradient(180deg, #1a1a2e 0%, #0a0a0a 100%); border-radius: 16px; overflow: hidden; border: 1px solid rgba(255,215,0,0.2);">
    
    <!-- Header -->
    <div style="text-align: center; padding: 40px 20px 20px; background: linear-gradient(135deg, rgba(147,51,234,0.3) 0%, rgba(236,72,153,0.2) 50%, rgba(255,215,0,0.2) 100%);">
      <h1 style="margin: 0; font-size: 48px; font-weight: 900; color: #fff; text-shadow: 0 0 40px rgba(255,215,0,0.5);">
        OCULTO
      </h1>
      <p style="margin: 10px 0 0; color: rgba(255,255,255,0.7); font-size: 14px; letter-spacing: 2px;">
        CONVITE EXCLUSIVO
      </p>
    </div>
    
    <!-- Content -->
    <div style="padding: 40px 30px;">
      <h2 style="margin: 0 0 20px; color: #fbbf24; font-size: 24px; text-align: center;">
        🎉 Sua vez chegou, ${name || 'Curioso(a)'}!
      </h2>
      
      <p style="color: rgba(255,255,255,0.85); font-size: 16px; line-height: 1.6; text-align: center; margin: 0 0 30px;">
        Você estava na nossa lista de espera e agora tem acesso para criar sua conta na plataforma mais exclusiva do Brasil.
      </p>
      
      <!-- CTA Button -->
      <div style="text-align: center; margin: 30px 0;">
        <a href="${Deno.env.get('APP_URL') || 'https://ocultoswing.com.br'}/signup" 
           style="display: inline-block; background: linear-gradient(90deg, #fbbf24 0%, #f59e0b 100%); 
                  color: #000; text-decoration: none; padding: 18px 40px; border-radius: 8px; 
                  font-weight: 800; font-size: 16px; letter-spacing: 1px;
                  box-shadow: 0 0 30px rgba(251,191,36,0.4);">
          CRIAR MINHA CONTA
        </a>
      </div>
      
      <!-- Features -->
      <div style="margin: 40px 0; padding: 20px; background: rgba(255,255,255,0.05); border-radius: 12px; border: 1px solid rgba(255,255,255,0.1);">
        <p style="color: #fff; font-weight: 600; margin: 0 0 15px; font-size: 14px;">O que você vai encontrar:</p>
        <ul style="color: rgba(255,255,255,0.75); margin: 0; padding-left: 20px; line-height: 2;">
          <li>Conteúdo exclusivo +18</li>
          <li>Encontros reais na sua cidade</li>
          <li>Comunidade 100% anônima e verificada</li>
          <li>Radar de pessoas próximas</li>
        </ul>
      </div>
      
      <!-- Urgency -->
      <p style="color: #f87171; font-size: 13px; text-align: center; margin: 20px 0 0;">
        ⏰ Este convite expira em 7 dias. Não perca sua vaga!
      </p>
    </div>
    
    <!-- Footer -->
    <div style="padding: 20px 30px; background: rgba(0,0,0,0.3); text-align: center; border-top: 1px solid rgba(255,255,255,0.1);">
      <p style="color: rgba(255,255,255,0.4); font-size: 12px; margin: 0;">
        © 2025 OCULTO. Todos os direitos reservados.
      </p>
    </div>
    
  </div>
</body>
</html>
`;

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('EXTERNAL_SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('EXTERNAL_SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check admin authorization
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify admin role
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    if (!roleData || !['admin_master', 'admin_moderator', 'admin_analyst'].includes(roleData.role)) {
      return new Response(
        JSON.stringify({ error: 'Admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse payload
    const payload: InvitePayload = await req.json();
    const { ids, count } = payload;

    // Get Resend configuration
    const { data: resendConfig, error: configError } = await supabase
      .from('resend_config')
      .select('*')
      .single();

    if (configError || !resendConfig) {
      console.error('Resend config not found:', configError);
      return new Response(
        JSON.stringify({ 
          error: 'Resend não configurado',
          details: 'Configure a API Key do Resend em Admin > Resend Config'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!resendConfig.is_active) {
      return new Response(
        JSON.stringify({ 
          error: 'Resend desativado',
          details: 'Ative o Resend em Admin > Resend Config'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const apiKey = resendConfig.api_key_encrypted;
    if (!apiKey) {
      return new Response(
        JSON.stringify({ 
          error: 'API Key do Resend não configurada',
          details: 'Adicione a API Key em Admin > Resend Config'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get waitlist entries to invite
    let entriesToInvite: WaitlistEntry[] = [];

    if (ids && ids.length > 0) {
      // Invite specific IDs
      const { data, error } = await supabase
        .from('waitlist')
        .select('id, email, name')
        .in('id', ids)
        .eq('status', 'waiting');

      if (error) throw error;
      entriesToInvite = data || [];
    } else if (count && count > 0) {
      // Invite next N from queue
      const { data, error } = await supabase
        .from('waitlist')
        .select('id, email, name')
        .eq('status', 'waiting')
        .order('priority_score', { ascending: false })
        .order('created_at', { ascending: true })
        .limit(Math.min(count, 100)); // Max 100 per batch

      if (error) throw error;
      entriesToInvite = data || [];
    }

    if (entriesToInvite.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Nenhum usuário para convidar',
          sent_count: 0,
          failed_count: 0
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Sending invites to ${entriesToInvite.length} users`);

    // Send emails via Resend
    const results: { success: string[]; failed: { email: string; error: string }[] } = {
      success: [],
      failed: []
    };

    for (const entry of entriesToInvite) {
      try {
        // Check sandbox mode
        if (resendConfig.sandbox_mode) {
          console.log(`[SANDBOX] Would send invite to: ${entry.email}`);
          results.success.push(entry.id);
          continue;
        }

        // Send email via Resend API
        const emailResponse = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: `${resendConfig.from_name} <${resendConfig.from_email}>`,
            to: [entry.email],
            subject: '🎉 Sua vez chegou! Convite para o OCULTO',
            html: getInviteEmailHtml(entry.name || ''),
          }),
        });

        if (!emailResponse.ok) {
          const errorData = await emailResponse.json();
          throw new Error(errorData.message || 'Failed to send email');
        }

        results.success.push(entry.id);
        console.log(`Email sent to: ${entry.email}`);
      } catch (emailError) {
        console.error(`Failed to send to ${entry.email}:`, emailError);
        results.failed.push({
          email: entry.email,
          error: emailError instanceof Error ? emailError.message : 'Unknown error'
        });
      }
    }

    // Update status to 'invited' for successful sends
    if (results.success.length > 0) {
      const { error: updateError } = await supabase
        .from('waitlist')
        .update({
          status: 'invited',
          invited_at: new Date().toISOString(),
        })
        .in('id', results.success);

      if (updateError) {
        console.error('Failed to update waitlist status:', updateError);
      }
    }

    console.log(`Invites complete: ${results.success.length} sent, ${results.failed.length} failed`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `${results.success.length} convites enviados com sucesso`,
        sent_count: results.success.length,
        failed_count: results.failed.length,
        failed_emails: results.failed,
        sandbox_mode: resendConfig.sandbox_mode
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in send-waitlist-invites:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

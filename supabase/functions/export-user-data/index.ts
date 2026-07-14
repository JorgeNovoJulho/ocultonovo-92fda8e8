import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ExportRequest {
  format: 'json' | 'csv';
  email: string;
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('EXTERNAL_SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('EXTERNAL_SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Obter token do usuário autenticado
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Não autorizado: Token ausente');
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      throw new Error('Não autorizado: Token inválido');
    }

    const { format = 'json', email }: ExportRequest = await req.json();
    const targetEmail = email || user.email;

    console.log(`[LGPD Export] Iniciando exportação para usuário ${user.id} em formato ${format}`);

    // Buscar profile do usuário
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (!profile) {
      throw new Error('Perfil não encontrado');
    }

    // Coletar todos os dados do usuário
    const [
      postsResult,
      likesResult,
      savedPostsResult,
      subscriptionsResult,
      transactionsResult,
      notificationsResult,
      conversationParticipantsResult,
      storyViewsResult,
      cookieConsentsResult
    ] = await Promise.all([
      supabase.from('posts').select('*').eq('user_id', profile.id),
      supabase.from('post_likes').select('*').eq('user_id', profile.id),
      supabase.from('saved_posts').select('*').eq('user_id', profile.id),
      supabase.from('subscriptions').select('*').or(`subscriber_id.eq.${profile.id},creator_id.eq.${profile.id}`),
      supabase.from('transactions').select('*').eq('user_id', profile.id),
      supabase.from('notifications').select('*').eq('user_id', user.id),
      supabase.from('conversation_participants').select('*').eq('user_id', user.id),
      supabase.from('story_views').select('*').eq('viewer_id', user.id),
      supabase.from('cookie_consents').select('*').eq('user_id', user.id)
    ]);

    const userData = {
      exportDate: new Date().toISOString(),
      lgpdCompliance: 'Lei Geral de Proteção de Dados (Lei nº 13.709/2018)',
      user: {
        id: user.id,
        email: user.email,
        createdAt: user.created_at,
        lastSignIn: user.last_sign_in_at,
      },
      profile: profile,
      posts: postsResult.data || [],
      likes: likesResult.data || [],
      savedPosts: savedPostsResult.data || [],
      subscriptions: subscriptionsResult.data || [],
      transactions: transactionsResult.data || [],
      notifications: notificationsResult.data || [],
      conversations: conversationParticipantsResult.data || [],
      storyViews: storyViewsResult.data || [],
      cookieConsents: cookieConsentsResult.data || [],
    };

    console.log(`[LGPD Export] Dados coletados:`, {
      posts: userData.posts.length,
      likes: userData.likes.length,
      transactions: userData.transactions.length,
    });

    // Buscar configuração do Resend
    const { data: resendConfig } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'resend_api_key')
      .single();

    const resendApiKey = resendConfig?.value as string;
    const isResendConfigured = resendApiKey && 
      resendApiKey !== 'placeholder' && 
      resendApiKey !== 're_placeholder_configure_in_admin' &&
      resendApiKey.startsWith('re_');

    let exportContent: string;
    let contentType: string;
    let fileName: string;

    if (format === 'csv') {
      // Converter para CSV simplificado
      const csvLines: string[] = [];
      csvLines.push('Categoria,Campo,Valor');
      
      // Dados básicos do usuário
      csvLines.push(`Usuario,Email,${user.email}`);
      csvLines.push(`Usuario,ID,${user.id}`);
      csvLines.push(`Usuario,Criado em,${user.created_at}`);
      
      // Perfil
      Object.entries(profile).forEach(([key, value]) => {
        csvLines.push(`Perfil,${key},"${String(value || '').replace(/"/g, '""')}"`);
      });
      
      // Contadores
      csvLines.push(`Estatisticas,Posts,${userData.posts.length}`);
      csvLines.push(`Estatisticas,Curtidas,${userData.likes.length}`);
      csvLines.push(`Estatisticas,Salvos,${userData.savedPosts.length}`);
      csvLines.push(`Estatisticas,Transacoes,${userData.transactions.length}`);
      csvLines.push(`Estatisticas,Notificacoes,${userData.notifications.length}`);

      exportContent = csvLines.join('\n');
      contentType = 'text/csv';
      fileName = `dados_lgpd_${user.id.slice(0, 8)}.csv`;
    } else {
      exportContent = JSON.stringify(userData, null, 2);
      contentType = 'application/json';
      fileName = `dados_lgpd_${user.id.slice(0, 8)}.json`;
    }

    // Se Resend está configurado, enviar por email
    if (isResendConfigured && targetEmail) {
      try {
        const resendModule = await import("https://esm.sh/resend@2.0.0");
        const Resend = resendModule.Resend;
        const resend = new Resend(resendApiKey);

        // Converter para base64 usando TextEncoder
        const encoder = new TextEncoder();
        const bytes = encoder.encode(exportContent);
        const base64Content = btoa(String.fromCharCode(...bytes));

        await resend.emails.send({
          from: 'OCULTO <noreply@ocultoswing.com.br>',
          to: [targetEmail],
          subject: '📦 Seus dados LGPD - OCULTO',
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #09090b; color: #fff; padding: 20px; border-radius: 8px;">
              <h1 style="color: #FF007F;">Seus Dados LGPD</h1>
              <p>Olá,</p>
              <p>Conforme sua solicitação e em cumprimento à Lei Geral de Proteção de Dados (Lei nº 13.709/2018), 
              segue em anexo a exportação completa dos seus dados pessoais armazenados na plataforma OCULTO.</p>
              
              <h3 style="color: #FF007F;">Resumo dos dados exportados:</h3>
              <ul>
                <li>📝 ${userData.posts.length} posts</li>
                <li>❤️ ${userData.likes.length} curtidas</li>
                <li>🔖 ${userData.savedPosts.length} posts salvos</li>
                <li>💳 ${userData.transactions.length} transações</li>
                <li>🔔 ${userData.notifications.length} notificações</li>
              </ul>
              
              <p style="color: #888; font-size: 12px; margin-top: 30px;">
                Este email foi enviado automaticamente. Não responda a este email.
                <br>© ${new Date().getFullYear()} OCULTO - Todos os direitos reservados.
              </p>
            </div>
          `,
          attachments: [{
            filename: fileName,
            content: base64Content,
          }],
        });

        console.log(`[LGPD Export] Email enviado com sucesso para ${targetEmail}`);

        return new Response(
          JSON.stringify({ 
            success: true, 
            message: `Dados exportados e enviados para ${targetEmail}`,
            emailSent: true
          }),
          { 
            status: 200, 
            headers: { 'Content-Type': 'application/json', ...corsHeaders } 
          }
        );
      } catch (emailError: unknown) {
        const errorMessage = emailError instanceof Error ? emailError.message : 'Erro desconhecido';
        console.error('[LGPD Export] Erro ao enviar email:', errorMessage);
        // Continuar e retornar os dados diretamente
      }
    }

    // Se não tem Resend configurado ou falhou, retornar dados diretamente
    console.log('[LGPD Export] Resend não configurado, retornando dados diretamente');

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Dados exportados com sucesso',
        emailSent: false,
        data: userData,
        downloadContent: exportContent,
        contentType,
        fileName
      }),
      { 
        status: 200, 
        headers: { 'Content-Type': 'application/json', ...corsHeaders } 
      }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error('[LGPD Export] Erro:', errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        status: 500, 
        headers: { 'Content-Type': 'application/json', ...corsHeaders } 
      }
    );
  }
});

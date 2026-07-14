import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Configuração: dias de inatividade antes da anonimização
const INACTIVITY_DAYS = 90;

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('EXTERNAL_SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('EXTERNAL_SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('[LGPD Anonymize] Iniciando processo de anonimização...');

    // Calcular data limite (90 dias atrás)
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - INACTIVITY_DAYS);
    const cutoffDateISO = cutoffDate.toISOString();

    console.log(`[LGPD Anonymize] Data de corte: ${cutoffDateISO}`);

    // Buscar usuários inativos que ainda não foram anonimizados
    const { data: inactiveProfiles, error: fetchError } = await supabase
      .from('profiles')
      .select('id, user_id, name, username, avatar_url, bio, last_activity_at')
      .lt('last_activity_at', cutoffDateISO)
      .eq('is_anonymized', false)
      .eq('is_seed', false) // Não anonimizar dados seed
      .limit(100); // Processar em lotes de 100

    if (fetchError) {
      throw new Error(`Erro ao buscar perfis inativos: ${fetchError.message}`);
    }

    if (!inactiveProfiles || inactiveProfiles.length === 0) {
      console.log('[LGPD Anonymize] Nenhum usuário inativo encontrado para anonimização');
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Nenhum usuário para anonimizar',
          anonymizedCount: 0 
        }),
        { 
          status: 200, 
          headers: { 'Content-Type': 'application/json', ...corsHeaders } 
        }
      );
    }

    console.log(`[LGPD Anonymize] Encontrados ${inactiveProfiles.length} usuários para anonimizar`);

    let anonymizedCount = 0;
    const errors: string[] = [];

    // Processar cada perfil
    for (const profile of inactiveProfiles) {
      try {
        const anonymizedName = `Usuário Removido ${profile.id.slice(0, 6)}`;
        
        // Anonimizar perfil
        const { error: updateError } = await supabase
          .from('profiles')
          .update({
            name: anonymizedName,
            username: null,
            avatar_url: null,
            bio: null,
            location_lat: null,
            location_lng: null,
            gender: null,
            gender_other: null,
            partner1_name: null,
            partner2_name: null,
            birth_date: null,
            is_anonymized: true,
            is_looking_now: false,
            looking_now_since: null,
          })
          .eq('id', profile.id);

        if (updateError) {
          errors.push(`Perfil ${profile.id}: ${updateError.message}`);
          continue;
        }

        // Anonimizar posts do usuário (remover conteúdo mas manter estrutura)
        await supabase
          .from('posts')
          .update({
            content_text: '[Conteúdo removido por inatividade - LGPD]',
            media_url: null,
          })
          .eq('user_id', profile.id);

        // Remover notificações
        await supabase
          .from('notifications')
          .delete()
          .eq('user_id', profile.user_id);

        // Nota: Transações financeiras são mantidas para compliance fiscal
        // Nota: Mensagens em conversas podem precisar de tratamento especial

        anonymizedCount++;
        console.log(`[LGPD Anonymize] Perfil ${profile.id} anonimizado com sucesso`);

      } catch (profileError: unknown) {
        const errorMessage = profileError instanceof Error ? profileError.message : 'Erro desconhecido';
        errors.push(`Perfil ${profile.id}: ${errorMessage}`);
      }
    }

    // Registrar no log de admin
    if (anonymizedCount > 0) {
      await supabase
        .from('admin_notifications')
        .insert({
          type: 'lgpd_anonymization',
          title: '🔒 Anonimização LGPD Executada',
          body: `${anonymizedCount} perfis foram anonimizados por inatividade superior a ${INACTIVITY_DAYS} dias.`,
          data: {
            anonymizedCount,
            cutoffDate: cutoffDateISO,
            errors: errors.length > 0 ? errors : undefined,
          }
        });
    }

    console.log(`[LGPD Anonymize] Processo concluído: ${anonymizedCount} usuários anonimizados`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `${anonymizedCount} usuários anonimizados`,
        anonymizedCount,
        totalFound: inactiveProfiles.length,
        errors: errors.length > 0 ? errors : undefined
      }),
      { 
        status: 200, 
        headers: { 'Content-Type': 'application/json', ...corsHeaders } 
      }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error('[LGPD Anonymize] Erro:', errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        status: 500, 
        headers: { 'Content-Type': 'application/json', ...corsHeaders } 
      }
    );
  }
});

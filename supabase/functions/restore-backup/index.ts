import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Ordem de restauração respeitando foreign keys
const RESTORE_ORDER = [
  'profiles',
  'user_roles',
  'system_settings',
  'pix_gateway_config',
  'backup_schedules',
  'posts',
  'post_likes',
  'saved_posts',
  'subscriptions',
  'transactions',
  'conversations',
  'conversation_participants',
  'messages',
  'typing_indicators',
  'notifications',
  'admin_notifications',
  'cookie_consents',
  'couple_verification_docs',
  'coupons',
  'creator_goals',
  'goal_contributions',
  'looking_now_matches',
  'media_unlocks',
  'referrals',
  'story_views',
  'support_tickets',
  'user_feedback',
  'audit_logs',
];

interface RestoreOptions {
  backup_id: string;
  dry_run?: boolean;
  tables_to_restore?: string[];
  create_pre_restore_backup?: boolean;
  confirmation_code: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('EXTERNAL_SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('EXTERNAL_SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verificar autenticação
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Não autorizado' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Token inválido' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verificar se é admin_master
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin_master')
      .maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: 'Acesso negado: requer admin_master' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Parse das opções
    const body = await req.json();
    const options: RestoreOptions = {
      backup_id: body.backup_id,
      dry_run: body.dry_run === true,
      tables_to_restore: body.tables_to_restore,
      create_pre_restore_backup: body.create_pre_restore_backup !== false,
      confirmation_code: body.confirmation_code,
    };

    // Validar código de confirmação
    if (!options.dry_run && options.confirmation_code !== 'RESTAURAR') {
      return new Response(
        JSON.stringify({ error: 'Código de confirmação inválido. Digite "RESTAURAR" para confirmar.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[restore-backup] Iniciando restauração:', options);

    // Buscar o backup
    const { data: backupRecord, error: backupError } = await supabase
      .from('backup_history')
      .select('*')
      .eq('id', options.backup_id)
      .single();

    if (backupError || !backupRecord) {
      return new Response(
        JSON.stringify({ error: 'Backup não encontrado' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (backupRecord.status !== 'completed') {
      return new Response(
        JSON.stringify({ error: 'Este backup não foi concluído com sucesso' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Baixar o arquivo de backup
    const { data: backupFile, error: downloadError } = await supabase
      .storage
      .from('platform-backups')
      .download(backupRecord.storage_path);

    if (downloadError || !backupFile) {
      return new Response(
        JSON.stringify({ error: 'Falha ao baixar arquivo de backup' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const backupText = await backupFile.text();
    const backupData = JSON.parse(backupText);

    console.log('[restore-backup] Backup carregado:', backupData.metadata);

    // Se for dry_run, apenas retornar informações
    if (options.dry_run) {
      return new Response(
        JSON.stringify({
          success: true,
          dry_run: true,
          backup_info: backupData.metadata,
          tables_available: Object.keys(backupData.tables),
          total_records: backupData.metadata.total_records,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Criar backup pré-restauração
    if (options.create_pre_restore_backup) {
      console.log('[restore-backup] Criando backup pré-restauração...');
      
      // Chamar a função de backup (internamente)
      const preBackupResponse = await fetch(`${supabaseUrl}/functions/v1/create-full-backup`, {
        method: 'POST',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          backup_type: 'pre_restore',
          include_media: false,
          include_messages: true,
        }),
      });

      if (!preBackupResponse.ok) {
        const error = await preBackupResponse.json();
        console.error('[restore-backup] Falha no backup pré-restauração:', error);
        return new Response(
          JSON.stringify({ error: 'Falha ao criar backup de segurança antes da restauração' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Iniciar restauração
    const restoredTables: Record<string, { deleted: number; inserted: number; errors: string[] }> = {};
    const tablesToRestore = options.tables_to_restore || RESTORE_ORDER;

    for (const tableName of RESTORE_ORDER) {
      // Pular se não está na lista para restaurar
      if (!tablesToRestore.includes(tableName)) {
        continue;
      }

      // Pular tabelas que não existem no backup
      if (!backupData.tables[tableName] || backupData.tables[tableName].error) {
        console.log(`[restore-backup] Pulando tabela ${tableName} (não disponível no backup)`);
        continue;
      }

      // Pular backup_history para não perder o histórico
      if (tableName === 'backup_history') {
        console.log('[restore-backup] Pulando backup_history (preservar histórico)');
        continue;
      }

      const tableData = backupData.tables[tableName];
      console.log(`[restore-backup] Restaurando ${tableName}: ${tableData.length} registros`);

      const result = { deleted: 0, inserted: 0, errors: [] as string[] };

      try {
        // Deletar dados existentes
        const { error: deleteError, count } = await supabase
          .from(tableName)
          .delete()
          .neq('id', '00000000-0000-0000-0000-000000000000'); // Dummy condition to delete all

        if (deleteError) {
          result.errors.push(`Delete: ${deleteError.message}`);
        } else {
          result.deleted = count || 0;
        }

        // Inserir dados do backup em lotes
        if (tableData.length > 0) {
          const batchSize = 100;
          for (let i = 0; i < tableData.length; i += batchSize) {
            const batch = tableData.slice(i, i + batchSize);
            
            const { error: insertError } = await supabase
              .from(tableName)
              .insert(batch);

            if (insertError) {
              result.errors.push(`Insert batch ${i}: ${insertError.message}`);
            } else {
              result.inserted += batch.length;
            }
          }
        }
      } catch (error) {
        result.errors.push(`Exception: ${error instanceof Error ? error.message : 'Unknown'}`);
      }

      restoredTables[tableName] = result;
    }

    // Registrar no audit log
    await supabase
      .from('audit_logs')
      .insert({
        admin_id: user.id,
        action_type: 'backup_restored',
        target_resource: 'backup_history',
        target_id: options.backup_id,
        details: {
          backup_id: options.backup_id,
          backup_created_at: backupData.metadata.created_at,
          tables_restored: Object.keys(restoredTables),
          results: restoredTables,
        },
      });

    console.log('[restore-backup] Restauração concluída!');

    const totalInserted = Object.values(restoredTables).reduce((a, b) => a + b.inserted, 0);
    const totalErrors = Object.values(restoredTables).reduce((a, b) => a + b.errors.length, 0);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Restauração concluída',
        backup_id: options.backup_id,
        tables_restored: Object.keys(restoredTables).length,
        total_records_inserted: totalInserted,
        total_errors: totalErrors,
        details: restoredTables,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[restore-backup] Erro:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Erro interno do servidor' 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});

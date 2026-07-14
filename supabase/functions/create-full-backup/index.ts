import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const MASTER_EMAIL = 'ocultomaster@ocultoswing.com.br';
const BACKUP_BUCKET = 'platform-backups';
const MEDIA_BUCKETS = ['post-media', 'media-vault', 'chat-media', 'kyc-documents', 'support_attachments', 'site-assets'];

const BACKUP_TABLES = [
  'profiles', 'user_roles', 'admin_staff', 'audit_logs', 'admin_notifications', 'admin_impersonation_sessions', 'impersonation_access_logs',
  'posts', 'post_likes', 'post_dislikes', 'post_comments', 'saved_posts', 'follows', 'profile_likes', 'profile_visits', 'blocked_contacts',
  'conversations', 'conversation_participants', 'messages', 'message_translations', 'message_unsend_logs', 'notifications', 'user_notification_preferences',
  'transactions', 'payment_logs', 'payments_log', 'payment_splits', 'subscriptions', 'subscription_plans', 'subscription_coupons', 'user_credits', 'user_payment_cards',
  'pix_gateway_config', 'resend_config', 'addon_configs', 'platform_addons', 'marketplace_items', 'marketplace_purchases', 'marketplace_categories',
  'media', 'media_vault', 'media_access', 'media_unlocks', 'vault_access_logs', 'couple_verification_docs', 'anonymous_reports', 'content_reports',
  'support_tickets', 'support_attachments', 'events', 'event_rsvps', 'event_invites', 'event_messages', 'event_photos', 'event_ratings', 'event_checkins',
  'stories', 'story_views', 'story_likes', 'story_dislikes', 'broadcasts', 'broadcast_deliveries', 'system_broadcasts', 'marketing_campaigns', 'campaign_executions',
  'promotions', 'promotion_analytics', 'promotion_events', 'promotion_period_stats', 'promotion_whatsapp_logs', 'waitlist', 'landing_settings', 'site_sections', 'site_images',
  'backup_schedules', 'backup_history', 'backup_restorations', 'backup_settings', 'system_settings', 'feed_settings', 'cookie_consents', 'webhook_logs', 'webhook_events',
  'withdrawal_requests', 'withdrawal_exceptions', 'creator_goals', 'goal_contributions', 'creator_founders', 'creator_founder_applications', 'creator_referrals',
  'creator_referral_commissions', 'referrals', 'referral_affiliates', 'referral_clicks', 'referral_commissions', 'referral_programs', 'referral_payouts', 'referral_tree',
  'looking_now_matches', 'perfect_pairs', 'perfect_pair_actions', 'pings', 'safety_checkins', 'safety_alerts', 'auctions', 'auction_bids', 'bidder_cards',
  'push_tokens', 'push_campaigns', 'push_templates', 'notification_dispatch_logs', 'email_templates', 'email_logs', 'generated_invoices', 'invoice_settings', 'invoice_templates',
  'ab_test_configs', 'ab_test_assignments', 'ab_experiments', 'ab_variants', 'ab_experiment_results', 'feedback_forms', 'feedback_responses', 'nps_surveys', 'nps_responses',
  'badges', 'user_badges', 'achievements', 'user_achievements', 'user_levels', 'level_definitions', 'xp_transactions', 'rewards', 'reward_redemptions',
];

interface BackupOptions {
  backup_type: 'scheduled' | 'manual' | 'pre_restore' | 'pre_migration' | 'full' | 'incremental';
  include_media: boolean;
  include_messages: boolean;
  schedule_id?: string;
  triggered_by: string | null;
}

async function getAuthenticatedUser(req: Request, supabaseUrl: string, anonKey: string, serviceKey: string) {
  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');
  if (!token) return { error: 'Não autorizado', user: null, isInternal: false };
  if (token === serviceKey) return { error: null, user: { id: null, email: MASTER_EMAIL }, isInternal: true };

  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: { user }, error } = await userClient.auth.getUser(token);
  return { error: error ? 'Token inválido' : null, user, isInternal: false };
}

async function ensureMasterAccess(supabase: any, user: any, isInternal: boolean) {
  if (isInternal || user?.email === MASTER_EMAIL) return true;
  const { data, error } = await supabase.from('user_roles').select('role').eq('user_id', user.id).eq('role', 'admin_master').maybeSingle();
  if (error) console.warn('[create-full-backup] role check fallback:', error.message);
  return !!data;
}

async function insertBackupRecord(supabase: any, options: BackupOptions) {
  const base = {
    schedule_id: options.schedule_id || null,
    backup_type: options.backup_type === 'full' || options.backup_type === 'incremental' ? 'manual' : options.backup_type,
    status: 'in_progress',
    media_included: options.include_media,
    created_by: options.triggered_by || null,
    metadata: { version: '2.0', options },
  };

  let { data, error } = await supabase.from('backup_history').insert(base).select().single();
  if (!error) return data;

  if (/violates check constraint|invalid input value/i.test(error.message || '')) {
    const retry = { ...base, status: 'running', backup_type: base.backup_type === 'scheduled' ? 'manual' : base.backup_type === 'pre_restore' ? 'pre_migration' : base.backup_type };
    const second = await supabase.from('backup_history').insert(retry).select().single();
    if (!second.error) return second.data;
    error = second.error;
  }

  if (error?.code === 'PGRST205') {
    console.warn('[create-full-backup] backup_history ausente; backup seguirá sem histórico persistido.');
    return null;
  }

  throw new Error(`Falha ao iniciar backup: ${error.message}`);
}

async function updateBackupRecord(supabase: any, backupId: string | null, values: Record<string, unknown>) {
  if (!backupId) return;
  const { error } = await supabase.from('backup_history').update(values).eq('id', backupId);
  if (error) console.warn('[create-full-backup] Falha ao atualizar histórico:', error.message);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('EXTERNAL_SUPABASE_URL')!;
    const serviceKey = Deno.env.get('EXTERNAL_SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('EXTERNAL_SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const auth = await getAuthenticatedUser(req, supabaseUrl, anonKey, serviceKey);
    if (auth.error || !auth.user) return new Response(JSON.stringify({ error: auth.error }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const isMaster = await ensureMasterAccess(supabase, auth.user, auth.isInternal);
    if (!isMaster) return new Response(JSON.stringify({ error: 'Acesso negado: requer admin_master' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const body = await req.json().catch(() => ({}));
    const options: BackupOptions = {
      backup_type: body.backup_type || 'manual',
      include_media: body.include_media !== false,
      include_messages: body.include_messages !== false,
      schedule_id: body.schedule_id,
      triggered_by: auth.user.id || body.triggered_by || null,
    };

    const backupRecord = await insertBackupRecord(supabase, options);
    const backupId = backupRecord?.id || crypto.randomUUID();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const storagePath = `backups/backup_${options.backup_type}_${timestamp}.json`;

    try {
      const tablesData: Record<string, unknown> = {};
      const tableCounts: Record<string, number> = {};

      for (const tableName of BACKUP_TABLES) {
        if (!options.include_messages && ['messages', 'conversations', 'conversation_participants', 'message_translations', 'message_unsend_logs'].includes(tableName)) continue;
        const { data, error } = await supabase.from(tableName).select('*');
        if (error) {
          tablesData[tableName] = { skipped: true, error: error.message, code: error.code };
          tableCounts[tableName] = 0;
        } else {
          tablesData[tableName] = data || [];
          tableCounts[tableName] = (data || []).length;
        }
      }

      const mediaManifest: unknown[] = [];
      let mediaCount = 0;
      if (options.include_media) {
        for (const bucket of MEDIA_BUCKETS) {
          const { data: files, error } = await supabase.storage.from(bucket).list('', { limit: 1000 });
          if (error || !files) continue;
          mediaCount += files.length;
          mediaManifest.push(...files.map((file: any) => ({ bucket, name: file.name, size: file.metadata?.size, created_at: file.created_at })));
        }
      }

      const totalRecords = Object.values(tableCounts).reduce((a, b) => a + b, 0);
      const backupData = {
        metadata: { version: '2.0', created_at: new Date().toISOString(), created_by: options.triggered_by, backup_type: options.backup_type, include_media: options.include_media, include_messages: options.include_messages, table_counts: tableCounts, media_count: mediaCount, total_records: totalRecords },
        tables: tablesData,
        media_manifest: mediaManifest,
      };

      const backupJson = JSON.stringify(backupData, null, 2);
      const backupBuffer = await new Blob([backupJson], { type: 'application/json' }).arrayBuffer();

      let upload = await supabase.storage.from(BACKUP_BUCKET).upload(storagePath, backupBuffer, { contentType: 'application/json', upsert: false });
      if (upload.error && /not found|does not exist|bucket/i.test(upload.error.message || '')) {
        await supabase.storage.createBucket(BACKUP_BUCKET, { public: false });
        upload = await supabase.storage.from(BACKUP_BUCKET).upload(storagePath, backupBuffer, { contentType: 'application/json', upsert: false });
      }
      if (upload.error) throw new Error(`Falha no upload: ${upload.error.message}`);

      await updateBackupRecord(supabase, backupRecord?.id || null, { status: 'completed', storage_path: storagePath, file_size_bytes: backupBuffer.byteLength, tables_included: tableCounts, media_count: mediaCount, completed_at: new Date().toISOString() });

      if (auth.user.id || options.triggered_by) {
        await supabase.from('audit_logs').insert({ admin_id: auth.user.id || options.triggered_by, action: 'backup_created', action_type: 'backup_created', target_resource: 'backup_history', target_id: backupRecord?.id || null, details: { backup_type: options.backup_type, file_size: backupBuffer.byteLength, tables: Object.keys(tableCounts).length, records: totalRecords, media_count: mediaCount } });
      }

      return new Response(JSON.stringify({ success: true, backup_id: backupRecord?.id || backupId, storage_path: storagePath, file_size_bytes: backupBuffer.byteLength, tables_count: Object.keys(tableCounts).length, total_records: totalRecords, media_count: mediaCount }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    } catch (error) {
      await updateBackupRecord(supabase, backupRecord?.id || null, { status: 'failed', error_message: error instanceof Error ? error.message : 'Erro desconhecido', completed_at: new Date().toISOString() });
      throw error;
    }
  } catch (error) {
    console.error('[create-full-backup] Erro:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Erro interno do servidor' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});

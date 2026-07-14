import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const isMissingTable = (error: any) => error?.code === 'PGRST205' || /Could not find the table|schema cache/i.test(error?.message || '');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('EXTERNAL_SUPABASE_URL')!;
    const serviceKey = Deno.env.get('EXTERNAL_SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    console.log('[run-scheduled-backup] Verificando agendamentos pendentes...');

    const { data: pendingSchedules, error: scheduleError } = await supabase
      .from('backup_schedules')
      .select('*')
      .eq('is_active', true)
      .lte('next_run_at', new Date().toISOString());

    if (scheduleError) {
      if (isMissingTable(scheduleError)) {
        console.warn('[run-scheduled-backup] Infraestrutura de agendamento ausente; rotina encerrada sem falha.');
        return new Response(JSON.stringify({ success: true, processed: 0, results: [], skipped: 'backup_schedules_missing' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      throw scheduleError;
    }

    const results: Array<{ schedule_id: string; name: string; status: string; error?: string }> = [];

    for (const schedule of pendingSchedules || []) {
      try {
        const backupResponse = await fetch(`${supabaseUrl}/functions/v1/create-full-backup`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${serviceKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            backup_type: 'scheduled',
            include_media: schedule.include_media,
            include_messages: schedule.include_messages,
            schedule_id: schedule.id,
            triggered_by: schedule.created_by,
          }),
        });

        const backupResult = await backupResponse.json().catch(() => ({}));
        if (!backupResponse.ok || !backupResult.success) {
          results.push({ schedule_id: schedule.id, name: schedule.name, status: 'failed', error: backupResult.error || 'Erro desconhecido' });
          continue;
        }

        const { data: nextRunData } = await supabase.rpc('calculate_next_backup_run', {
          p_frequency: schedule.frequency,
          p_day_of_week: schedule.day_of_week,
          p_day_of_month: schedule.day_of_month,
          p_time_of_day: schedule.time_of_day,
        });

        await supabase.from('backup_schedules').update({ last_run_at: new Date().toISOString(), next_run_at: nextRunData }).eq('id', schedule.id);
        results.push({ schedule_id: schedule.id, name: schedule.name, status: 'success' });
      } catch (error) {
        results.push({ schedule_id: schedule.id, name: schedule.name, status: 'failed', error: error instanceof Error ? error.message : 'Erro desconhecido' });
      }
    }

    const { data: schedules, error: cleanupScheduleError } = await supabase.from('backup_schedules').select('id, retention_days');
    if (!cleanupScheduleError) {
      for (const schedule of schedules || []) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - (schedule.retention_days || 30));
        const { data: oldBackups } = await supabase.from('backup_history').select('id, storage_path').eq('schedule_id', schedule.id).eq('status', 'completed').lt('completed_at', cutoffDate.toISOString());
        for (const backup of oldBackups || []) {
          if (backup.storage_path) await supabase.storage.from('platform-backups').remove([backup.storage_path]);
          await supabase.from('backup_history').delete().eq('id', backup.id);
        }
      }
    }

    const failures = results.filter(r => r.status === 'failed');
    if (failures.length > 0) {
      await supabase.from('admin_notifications').insert({ type: 'backup_failed', title: 'Falha em Backups Agendados', body: `${failures.length} backup(s) falharam.`, data: { failures } });
    }

    return new Response(JSON.stringify({ success: true, processed: results.length, results }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('[run-scheduled-backup] Erro:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Erro interno do servidor' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});

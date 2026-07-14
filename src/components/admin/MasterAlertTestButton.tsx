import { useState } from 'react';
import { Zap, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import {
  useMasterAlertSettings,
  MASTER_OPEN_ONLINE_GIFT_EVENT,
  type MasterAlertSettings,
} from './MasterOnlineAlertProvider';
import { playMasterAlert, primeAudio } from '@/lib/masterAlertSound';

/**
 * Botão de teste do alerta master (card "Online Agora").
 * Faz fetch direto se o cache do React Query ainda não estiver populado,
 * evitando o falso aviso "Configurações ainda não carregadas".
 */
export function MasterAlertTestButton() {
  const { data: settings } = useMasterAlertSettings();
  const qc = useQueryClient();
  const [firing, setFiring] = useState(false);

  const ensureSettings = async (): Promise<MasterAlertSettings | null> => {
    // SEMPRE busca a versão mais recente do banco para garantir que o
    // teste use exatamente o som/volume/preset salvos no popover de config —
    // mesmo que o cache do React Query ainda esteja com a versão antiga.
    try {
      const { data, error } = await (supabase as any)
        .from('oculto_master_alert_settings')
        .select('*')
        .eq('id', 'singleton')
        .maybeSingle();
      if (error) throw error;
      if (data) {
        qc.setQueryData(['master-alert-settings'], data);
        return data as MasterAlertSettings;
      }
      const defaults: MasterAlertSettings = {
        id: 'singleton',
        enabled: true,
        sound_preset: 'bell',
        sound_url: null,
        volume: 0.8,
        recurrence_seconds: 60,
        auto_open_modal: true,
        last_triggered_at: null,
        updated_at: new Date().toISOString(),
      };
      await (supabase as any)
        .from('oculto_master_alert_settings')
        .upsert(defaults, { onConflict: 'id' });
      qc.setQueryData(['master-alert-settings'], defaults);
      return defaults;
    } catch (err: any) {
      console.warn('[MasterAlertTest] fallback fetch fail', err?.message);
      return settings ?? null;
    }
  };


  const handleTest = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();

    setFiring(true);
    try {
      primeAudio();
      const cfg = await ensureSettings();
      if (!cfg) {
        toast.error('Não foi possível carregar as configurações de alerta.');
        return;
      }
      if (!cfg.enabled) {
        toast.warning('Ative o alerta primeiro (toggle "Ativar alerta").');
        return;
      }

      await playMasterAlert({
        preset: cfg.sound_preset,
        volume: cfg.volume,
        customUrl: cfg.sound_url,
      });

      if (cfg.auto_open_modal) {
        window.dispatchEvent(new CustomEvent(MASTER_OPEN_ONLINE_GIFT_EVENT));
        toast.success('Teste disparado · som + modal');
      } else {
        toast.success('Teste de som disparado (modal auto. desativado)');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Falha ao testar alerta');
    } finally {
      setTimeout(() => setFiring(false), 400);
    }
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-7 w-7 text-amber-500 hover:text-amber-400 hover:bg-amber-500/10"
      onClick={handleTest}
      disabled={firing}
      aria-label="Testar alerta sonoro e abertura do modal"
      title="Testar alerta agora"
    >
      {firing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
    </Button>
  );
}

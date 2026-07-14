import { useEffect, useRef, useState } from 'react';
import { Settings2, Upload, Volume2, Bell, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/lib/supabaseExternal';
import { useMasterAlertSettings } from './MasterOnlineAlertProvider';
import { playMasterAlert, type MasterAlertPreset } from '@/lib/masterAlertSound';
import { useAuth } from '@/hooks/useAuth';

export function MasterAlertSettingsPopover() {
  const { data: settings } = useMasterAlertSettings();
  const { user } = useAuth();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [enabled, setEnabled] = useState(true);
  const [preset, setPreset] = useState<MasterAlertPreset>('bell');
  const [soundUrl, setSoundUrl] = useState<string | null>(null);
  const [soundName, setSoundName] = useState<string | null>(null);
  const [volume, setVolume] = useState(0.8);
  const [recurrence, setRecurrence] = useState(60);
  const [autoOpen, setAutoOpen] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!settings) return;
    setEnabled(settings.enabled);
    setPreset(settings.sound_preset);
    setSoundUrl(settings.sound_url);
    setVolume(settings.volume);
    setRecurrence(settings.recurrence_seconds);
    setAutoOpen(settings.auto_open_modal);
    if (settings.sound_url && !soundName) {
      try {
        const path = new URL(settings.sound_url).pathname;
        const fname = decodeURIComponent(path.split('/').pop() || '');
        if (fname) setSoundName(fname);
      } catch { /* noop */ }
    }
  }, [settings]);

  const handleSaveAll = async () => {
    await save({});
    toast.success('Configurações salvas.');
  };

  const save = async (patch: Partial<{
    enabled: boolean; sound_preset: MasterAlertPreset; sound_url: string | null;
    volume: number; recurrence_seconds: number; auto_open_modal: boolean;
  }>) => {
    setSaving(true);
    try {
      const next = {
        enabled,
        sound_preset: preset,
        sound_url: soundUrl,
        volume,
        recurrence_seconds: recurrence,
        auto_open_modal: autoOpen,
        ...patch,
        updated_at: new Date().toISOString(),
      };
      const { data, error } = await (supabase as any)
        .from('oculto_master_alert_settings')
        .upsert({ id: 'singleton', ...next }, { onConflict: 'id' })
        .select('*')
        .maybeSingle();
      if (error) throw error;
      // Atualiza cache imediatamente para que o botão de teste e o provider
      // já enxerguem o som/volume/recorrência recém-salvos (sem esperar refetch).
      if (data) qc.setQueryData(['master-alert-settings'], data);
      qc.invalidateQueries({ queryKey: ['master-alert-settings'] });
    } catch (err: any) {
      toast.error(err?.message || 'Falha ao salvar configuração');
      throw err;
    } finally {
      setSaving(false);
    }
  };


  const handleUpload = async (file: File) => {
    if (!user) return;
    const isAudio = file.type.startsWith('audio/') || /\.(mp3|wav|ogg|m4a|aac)$/i.test(file.name);
    if (!isAudio) {
      toast.error('Envie um arquivo de áudio (MP3, WAV, OGG, M4A).');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Arquivo muito grande (máx 2MB).');
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split('.').pop() || 'mp3';
      const path = `master/${user.id}/${Date.now()}.${ext}`;
      const { error: upErr } = await (supabase as any).storage
        .from('master-alerts')
        .upload(path, file, { upsert: true, contentType: file.type || 'audio/mpeg' });
      if (upErr) throw upErr;

      const { data: signed, error: signErr } = await (supabase as any).storage
        .from('master-alerts')
        .createSignedUrl(path, 60 * 60 * 24 * 365);
      if (signErr) throw signErr;

      const url = signed?.signedUrl as string;
      setSoundUrl(url);
      setSoundName(file.name);
      setPreset('custom');
      await save({ sound_url: url, sound_preset: 'custom' });
      toast.success(`Som "${file.name}" salvo e ativado.`);
    } catch (err: any) {
      toast.error(err?.message || 'Falha no upload');
    } finally {
      setUploading(false);
    }
  };

  return (
    <Popover modal>
      <PopoverTrigger asChild>
        <Button
          variant="ghost" size="icon"
          className="h-7 w-7 text-emerald-500 hover:text-emerald-400"
          onClick={(e) => { e.stopPropagation(); }}
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          aria-label="Configurar alerta de usuários online"
          title="Configurar alerta"
        >
          <Settings2 className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-80 space-y-4"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 pb-1 border-b">
          <Bell className="h-4 w-4 text-emerald-500" />
          <h4 className="text-sm font-semibold">Alerta de usuários online</h4>
          {saving && <Loader2 className="ml-auto h-3 w-3 animate-spin text-muted-foreground" />}
        </div>

        <div className="flex items-center justify-between">
          <Label htmlFor="alert-enabled" className="text-sm">Ativar alerta</Label>
          <Switch
            id="alert-enabled"
            checked={enabled}
            onCheckedChange={(v) => { setEnabled(v); save({ enabled: v }); }}
          />
        </div>

        <div className="flex items-center justify-between">
          <Label htmlFor="alert-auto" className="text-sm">Abrir modal auto.</Label>
          <Switch
            id="alert-auto"
            checked={autoOpen}
            onCheckedChange={(v) => { setAutoOpen(v); save({ auto_open_modal: v }); }}
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs uppercase text-muted-foreground">Som</Label>
          <Select
            value={preset}
            onValueChange={(v: MasterAlertPreset) => {
              if (v === 'custom' && !soundUrl) {
                fileRef.current?.click();
                return;
              }
              setPreset(v);
              save({ sound_preset: v });
            }}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="bell">Bell (sino)</SelectItem>
              <SelectItem value="chime">Chime (acorde)</SelectItem>
              <SelectItem value="ping">Ping (curto)</SelectItem>
              <SelectItem value="custom">
                {soundUrl ? 'Personalizado (MP3)' : 'Personalizado · enviar MP3…'}
              </SelectItem>
            </SelectContent>
          </Select>
          {soundUrl && (
            <p className="text-[10px] text-emerald-500/80 truncate">
              ♪ {soundName || 'Áudio personalizado ativo'}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs uppercase text-muted-foreground flex items-center gap-2">
            <Volume2 className="h-3 w-3" /> Volume · {Math.round(volume * 100)}%
          </Label>
          <Slider
            value={[Math.round(volume * 100)]}
            min={0} max={100} step={5}
            onValueChange={(v) => setVolume((v[0] ?? 80) / 100)}
            onValueCommit={(v) => save({ volume: (v[0] ?? 80) / 100 })}
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs uppercase text-muted-foreground">
            Intervalo mínimo · {recurrence}s
          </Label>
          <Slider
            value={[recurrence]}
            min={10} max={600} step={10}
            onValueChange={(v) => setRecurrence(v[0] ?? 60)}
            onValueCommit={(v) => save({ recurrence_seconds: v[0] ?? 60 })}
          />
        </div>

        <div className="flex gap-2 pt-1">
          <Button
            variant="outline" size="sm" className="flex-1"
            onClick={() => playMasterAlert({ preset, volume, customUrl: soundUrl })}
          >
            Testar som
          </Button>
          <Button
            variant="outline" size="sm" className="flex-1 gap-1"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
          >
            {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
            Upload
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="audio/mpeg,audio/mp3,audio/wav,audio/ogg,audio/*,.mp3,.wav,.ogg,.m4a"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleUpload(f);
              e.target.value = '';
            }}
          />
        </div>

        <Button
          size="sm"
          className="w-full gap-1"
          disabled={saving}
          onClick={handleSaveAll}
        >
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
          Salvar configurações
        </Button>
      </PopoverContent>
    </Popover>
  );
}

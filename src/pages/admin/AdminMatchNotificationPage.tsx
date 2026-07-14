/**
 * AdminMatchNotificationPage — Painel master para o som + vibração de match.
 *
 * Rota: /admin/match-notification  (protegida por MasterAdminRoute)
 *
 * Permite:
 *  - Upload de múltiplos arquivos sonoros (mp3, wav, ogg, m4a, aac, webm)
 *  - Listar/excluir sons salvos
 *  - Escolher qual som está ativo
 *  - Controle de volume (0–100%)
 *  - Ligar/desligar som
 *  - Ligar/desligar vibração + editar padrão (ms)
 *  - Testar agora (toca som + vibra usando as configurações atuais)
 */
import { useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { Upload, Play, Trash2, CheckCircle2, Volume2, Smartphone, Loader2, BellRing } from 'lucide-react';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from '@/hooks/useAuth';
import { useQueryClient } from '@tanstack/react-query';
import {
  useMatchNotificationSettings,
  useMatchSoundsLibrary,
  useMatchNotification,
} from '@/hooks/useMatchNotification';

const BUCKET = 'match-sounds';

export default function AdminMatchNotificationPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);

  const { data: settings, isLoading: loadingSettings } = useMatchNotificationSettings();
  const { data: sounds = [], isLoading: loadingSounds } = useMatchSoundsLibrary();
  const { playMatchAlert } = useMatchNotification();

  // Estados locais para edição
  const [soundEnabled, setSoundEnabled] = useState<boolean | null>(null);
  const [vibrationEnabled, setVibrationEnabled] = useState<boolean | null>(null);
  const [volume, setVolume] = useState<number | null>(null);
  const [pattern, setPattern] = useState<string | null>(null);

  // Sincroniza estado local com servidor
  if (settings && soundEnabled === null) {
    setSoundEnabled(settings.sound_enabled);
    setVibrationEnabled(settings.vibration_enabled);
    setVolume(settings.volume);
    setPattern((settings.vibration_pattern ?? [120, 60, 180, 60, 240]).join(','));
  }

  async function handleUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    let successCount = 0;
    for (const file of Array.from(files)) {
      try {
        const ext = (file.name.split('.').pop() || 'mp3').toLowerCase();
        const path = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: upErr } = await (supabase as any).storage
          .from(BUCKET)
          .upload(path, file, { contentType: file.type, upsert: false });
        if (upErr) throw upErr;
        const { data: pub } = (supabase as any).storage.from(BUCKET).getPublicUrl(path);
        const publicUrl = pub?.publicUrl as string;

        const { error: insErr } = await (supabase as any).from('oculto_match_sounds').insert({
          name: file.name.replace(/\.[^.]+$/, ''),
          file_url: publicUrl,
          file_path: path,
          mime_type: file.type,
          size_bytes: file.size,
          uploaded_by: user?.id ?? null,
        });
        if (insErr) throw insErr;
        successCount++;
      } catch (e: any) {
        toast.error(`Falha ao enviar ${file.name}: ${e?.message || 'erro desconhecido'}`);
      }
    }
    setUploading(false);
    if (successCount > 0) {
      toast.success(`${successCount} arquivo(s) enviado(s)`);
      qc.invalidateQueries({ queryKey: ['oculto_match_sounds'] });
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleSelectActive(soundId: string) {
    setSavingSettings(true);
    const { error } = await (supabase as any)
      .from('oculto_match_notification_settings')
      .update({ active_sound_id: soundId, updated_at: new Date().toISOString(), updated_by: user?.id ?? null })
      .eq('id', 1);
    setSavingSettings(false);
    if (error) return toast.error(`Erro ao definir som ativo: ${error.message}`);
    toast.success('Som ativo atualizado');
    qc.invalidateQueries({ queryKey: ['oculto_match_notification_settings'] });
  }

  async function handleDeleteSound(s: { id: string; file_path: string }) {
    if (!confirm('Excluir este arquivo de som?')) return;
    try {
      await (supabase as any).storage.from(BUCKET).remove([s.file_path]);
      const { error } = await (supabase as any).from('oculto_match_sounds').delete().eq('id', s.id);
      if (error) throw error;
      toast.success('Som excluído');
      qc.invalidateQueries({ queryKey: ['oculto_match_sounds'] });
      qc.invalidateQueries({ queryKey: ['oculto_match_notification_settings'] });
    } catch (e: any) {
      toast.error(`Erro ao excluir: ${e?.message || ''}`);
    }
  }

  async function handleSaveSettings() {
    if (soundEnabled === null || vibrationEnabled === null || volume === null) return;
    const parsedPattern = (pattern || '')
      .split(',')
      .map((n) => parseInt(n.trim(), 10))
      .filter((n) => Number.isFinite(n) && n >= 0 && n <= 5000);
    if (parsedPattern.length === 0) return toast.error('Padrão de vibração inválido (ex.: 120,60,180,60,240)');

    setSavingSettings(true);
    const { error } = await (supabase as any)
      .from('oculto_match_notification_settings')
      .update({
        sound_enabled: soundEnabled,
        vibration_enabled: vibrationEnabled,
        volume: Math.round(volume * 100) / 100,
        vibration_pattern: parsedPattern,
        updated_at: new Date().toISOString(),
        updated_by: user?.id ?? null,
      })
      .eq('id', 1);
    setSavingSettings(false);
    if (error) return toast.error(`Erro ao salvar: ${error.message}`);
    toast.success('Configurações salvas');
    qc.invalidateQueries({ queryKey: ['oculto_match_notification_settings'] });
  }

  function previewSound(url: string) {
    try {
      const a = new Audio(url);
      a.volume = volume ?? 0.8;
      a.play().catch(() => toast.error('Não foi possível tocar (interaja com a página antes).'));
    } catch {
      toast.error('Falha ao tocar áudio');
    }
  }

  if (loadingSettings || loadingSounds) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 border border-violet-400/30">
          <BellRing className="h-5 w-5 text-violet-300" />
        </div>
        <div>
          <h1 className="text-xl md:text-2xl font-bold">Notificação Sonora de Match</h1>
          <p className="text-sm text-muted-foreground">
            Som + vibração disparados quando dois usuários se conectam.
          </p>
        </div>
      </div>

      {/* Configurações globais */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Configurações globais</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <Label className="font-medium flex items-center gap-2">
                <Volume2 className="h-4 w-4" /> Som ativado
              </Label>
              <p className="text-xs text-muted-foreground">Toca o som escolhido em desktop e mobile.</p>
            </div>
            <Switch checked={!!soundEnabled} onCheckedChange={setSoundEnabled} />
          </div>

          <div className="space-y-2">
            <Label className="text-sm">Volume — {Math.round((volume ?? 0) * 100)}%</Label>
            <Slider
              value={[Math.round((volume ?? 0) * 100)]}
              onValueChange={(v) => setVolume((v[0] ?? 0) / 100)}
              min={0}
              max={100}
              step={1}
              disabled={!soundEnabled}
            />
          </div>

          <Separator />

          <div className="flex items-center justify-between gap-3">
            <div>
              <Label className="font-medium flex items-center gap-2">
                <Smartphone className="h-4 w-4" /> Vibração ativada
              </Label>
              <p className="text-xs text-muted-foreground">
                Vibra o dispositivo (mobile e desktops com suporte). Padrão em ms separados por vírgula.
              </p>
            </div>
            <Switch checked={!!vibrationEnabled} onCheckedChange={setVibrationEnabled} />
          </div>

          <div className="space-y-2">
            <Label className="text-sm">Padrão de vibração (ms)</Label>
            <Input
              value={pattern ?? ''}
              onChange={(e) => setPattern(e.target.value)}
              placeholder="120,60,180,60,240"
              disabled={!vibrationEnabled}
            />
            <p className="text-xs text-muted-foreground">
              Sequência alterna vibração/pausa. Ex.: <code>120,60,180,60,240</code> = vibra 120ms, pausa 60ms…
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-2 pt-2">
            <Button onClick={handleSaveSettings} disabled={savingSettings} className="flex-1">
              {savingSettings ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Salvar configurações
            </Button>
            <Button variant="secondary" onClick={() => playMatchAlert()} className="flex-1">
              <Play className="h-4 w-4 mr-2" /> Testar agora
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Biblioteca de sons */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between">
            <span>Biblioteca de sons ({sounds.length})</span>
            <Badge variant="outline" className="text-[10px]">MP3 · WAV · OGG · M4A · AAC · WEBM (até 5MB)</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            multiple
            className="hidden"
            onChange={(e) => handleUpload(e.target.files)}
          />
          <Button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="w-full sm:w-auto"
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
            Enviar arquivo(s)
          </Button>

          {sounds.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              Nenhum som enviado ainda. Faça upload de um arquivo de “som de beijo” para começar.
            </p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {sounds.map((s) => {
                const isActive = settings?.active_sound_id === s.id;
                return (
                  <li key={s.id} className="flex flex-wrap items-center gap-3 p-3">
                    <div className="flex-1 min-w-[180px]">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm truncate">{s.name}</span>
                        {isActive && (
                          <Badge className="bg-emerald-500/15 text-emerald-300 border-emerald-400/30">
                            <CheckCircle2 className="h-3 w-3 mr-1" /> ATIVO
                          </Badge>
                        )}
                      </div>
                      <div className="text-[11px] text-muted-foreground truncate">
                        {s.mime_type ?? 'audio'} · {s.size_bytes ? `${(s.size_bytes / 1024).toFixed(0)} KB` : '—'}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Button size="sm" variant="ghost" onClick={() => previewSound(s.file_url)} title="Tocar">
                        <Play className="h-4 w-4" />
                      </Button>
                      {!isActive && (
                        <Button size="sm" variant="secondary" onClick={() => handleSelectActive(s.id)}>
                          Usar este
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDeleteSound(s)}
                        className="text-destructive hover:text-destructive"
                        title="Excluir"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Onde isso aparece</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-1">
          <p>• Modal de match em <code>Explorar misteriosos(as)</code> (feed).</p>
          <p>• Modal de match do <code>Par Perfeito</code> / <code>Aura Match</code>.</p>
          <p className="pt-2 text-xs">
            Caminho admin: <code className="text-foreground">/admin/match-notification</code>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseExternal';
import { useIsMasterAdmin } from '@/hooks/useUserRoles';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Sparkles, Save, ShieldAlert, Loader2 } from 'lucide-react';

interface SettingRow { key: string; value: any; updated_at?: string }

interface NumKey {
  key: string;
  label: string;
  description: string;
  defaultValue: number;
  min?: number;
  step?: number;
  suffix?: string;
}

const NUM_SETTINGS: NumKey[] = [
  { key: 'attention_cost_xp', label: 'Custo do "Chamar atenção"', description: 'XP debitado ao chamar atenção numa aura. Cooldown de 6h por par já é aplicado pelo backend.', defaultValue: 50, min: 0, step: 5, suffix: 'XP' },
  { key: 'aura_signal_reveal_cost_xp', label: 'Custo para revelar histórico', description: 'XP cobrado para desbloquear o histórico (atenções recebidas / visitas ao perfil). Recomendado inicial: 100 XP.', defaultValue: 100, min: 0, step: 10, suffix: 'XP' },
  { key: 'aura_signal_reveal_window_minutes', label: 'Janela de visibilidade', description: 'Por quantos minutos o histórico fica revelado depois de pago. Volta a bloquear ao expirar.', defaultValue: 60, min: 5, step: 5, suffix: 'min' },
  { key: 'aura_signal_history_days', label: 'Retenção do histórico', description: 'Por quantos dias atrás os sinais aparecem no histórico (mesmo bloqueados).', defaultValue: 3, min: 1, step: 1, suffix: 'dias' },
  { key: 'aura_attention_cooldown_hours', label: 'Cooldown de atenção (h)', description: 'Tempo mínimo entre duas atenções para o mesmo alvo. Padrão backend: 6h.', defaultValue: 6, min: 1, step: 1, suffix: 'h' },
];

export default function AdminAuraSettingsPage() {
  const { data: isMaster, isLoading: loadingRole } = useIsMasterAdmin();
  const [rows, setRows] = useState<SettingRow[]>([]);
  const [saved, setSaved] = useState<Record<string, number>>({});
  const [draft, setDraft] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const saving = savingKey !== null;

  async function load() {
    setLoading(true);
    const { data, error } = await (supabase as any).rpc('aura_get_settings');
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    const list = (data || []) as SettingRow[];
    setRows(list);
    const next: Record<string, number> = {};
    NUM_SETTINGS.forEach((s) => {
      const found = list.find((r) => r.key === s.key);
      const v = found ? Number(found.value) : s.defaultValue;
      next[s.key] = Number.isFinite(v) ? v : s.defaultValue;
    });
    setSaved(next);
    setDraft(next);
  }

  useEffect(() => { if (isMaster) load(); }, [isMaster]);

  async function save(key: string, value: any) {
    setSavingKey(key);
    const { error } = await (supabase as any).rpc('aura_admin_set_setting', {
      p_key: key, p_value: value,
    });
    setSavingKey(null);
    if (error) { toast.error(error.message); return; }
    if (typeof value === 'number') {
      setSaved((s) => ({ ...s, [key]: value }));
    }
    toast.success(`Configuração salva — valor aplicado: ${value}`);
    load();
  }

  if (loadingRole) {
    return <div className="p-6 text-muted-foreground">Carregando…</div>;
  }
  if (!isMaster) {
    return (
      <div className="p-6 max-w-md mx-auto">
        <Card className="p-6 flex gap-3 items-start border-destructive/30 bg-destructive/10">
          <ShieldAlert className="w-5 h-5 text-destructive mt-0.5" />
          <div>
            <p className="font-semibold">Acesso restrito</p>
            <p className="text-sm text-muted-foreground">Apenas o Admin Master pode editar as configurações do Aura Match.</p>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Sparkles className="h-6 w-6 text-fuchsia-400" />
          Aura Match — Configurações
        </h1>
        <Badge variant="secondary">{rows.length} chaves</Badge>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {NUM_SETTINGS.map((s) => {
          const savedVal = saved[s.key] ?? s.defaultValue;
          const draftVal = draft[s.key] ?? savedVal;
          const isDirty = draftVal !== savedVal;
          const isSavingThis = savingKey === s.key;
          return (
            <Card key={s.key} className="overflow-hidden">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">{s.label}</CardTitle>
                <CardDescription className="text-xs">{s.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="rounded-lg border border-fuchsia-500/30 bg-fuchsia-500/5 p-2.5 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Em produção</p>
                    <p className="text-xl font-bold text-fuchsia-200 tabular-nums">{savedVal} {s.suffix}</p>
                  </div>
                  <Badge variant="outline" className="border-emerald-400/40 text-emerald-300 text-[10px]">ativo</Badge>
                </div>
                <Label htmlFor={s.key} className="text-xs">Novo valor</Label>
                <div className="flex flex-wrap gap-1.5">
                  <Input
                    id={s.key}
                    type="number"
                    min={s.min ?? 0}
                    step={s.step ?? 1}
                    value={draftVal}
                    onChange={(e) => setDraft((d) => ({ ...d, [s.key]: Math.max(s.min ?? 0, parseInt(e.target.value || '0', 10)) }))}
                    className="max-w-[120px] h-8"
                  />
                  <Button
                    size="sm"
                    onClick={() => save(s.key, draftVal)}
                    disabled={saving || loading || !isDirty}
                    className="gap-1 h-8"
                  >
                    {isSavingThis ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                    {isDirty ? 'Salvar' : 'Salvo'}
                  </Button>
                  {isDirty && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setDraft((d) => ({ ...d, [s.key]: savedVal }))}
                      disabled={saving}
                      className="h-8"
                    >
                      Cancelar
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Todas as chaves</CardTitle>
          <CardDescription>JSON cru, somente leitura.</CardDescription>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma configuração ainda.</p>
          ) : (
            <ul className="text-xs space-y-1 font-mono">
              {rows.map((r) => (
                <li key={r.key} className="flex justify-between gap-3 border-b border-border/40 py-1">
                  <span className="text-fuchsia-300">{r.key}</span>
                  <span className="truncate text-muted-foreground">{JSON.stringify(r.value)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

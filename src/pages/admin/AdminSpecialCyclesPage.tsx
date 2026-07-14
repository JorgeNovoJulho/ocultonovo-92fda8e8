/**
 * AdminSpecialCyclesPage — Configuração total das Salas Sociais Especiais
 * (oculto_special_cycle_definitions). Master Admin only.
 *
 * Permite:
 *  - Ativar / desativar cada sala
 *  - Editar requisitos (Aura, Score, Prestígio, Plano, KYC, Couple-only)
 *  - Janela horária / dias da semana / data sazonal
 *  - Gatilhos de clima e temperatura
 *  - Capacidade máxima, duração, XP por rodada, cooldown, multiplicador de presentes
 *  - Visual (emoji, cor hue, glow, sort_order)
 *  - Criar nova sala e excluir
 */
import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, Save, Trash2, Sparkles } from 'lucide-react';

interface CycleDef {
  key: string;
  label: string;
  emoji: string;
  hue: number;
  room_slug: string;
  category: string;
  description: string | null;
  active: boolean;
  // gates
  min_aura_level: number;
  min_social_score: number;
  min_prestige_xp: number;
  required_plan: string | null;
  requires_kyc: boolean;
  couple_only: boolean;
  // triggers
  hour_start: number | null;
  hour_end: number | null;
  days_of_week: number[];
  date_month: number | null;
  date_day: number | null;
  weather_kinds: string[];
  min_temp: number | null;
  max_temp: number | null;
  // capacity / duration / xp
  max_members: number;
  max_duration_minutes: number;
  xp_round_amount: number;
  xp_max_winners: number;
  xp_round_cooldown_sec: number;
  gift_xp_multiplier: number;
  glow_intensity: number;
  sort_order: number;
}

const CATEGORIES = [
  { key: 'time', label: 'Horário' },
  { key: 'weekday', label: 'Dia da semana' },
  { key: 'weather', label: 'Clima' },
  { key: 'season', label: 'Sazonal' },
  { key: 'energy', label: 'Energia' },
  { key: 'vip', label: 'Exclusivas' },
];

const DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function NumberField({ label, value, onChange, min, max, step = 1, hint }: any) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input
        type="number" min={min} max={max} step={step}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
      />
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function CycleEditor({ row, onSave, onDelete, saving, deleting }: {
  row: CycleDef;
  onSave: (r: CycleDef) => void;
  onDelete: (key: string) => void;
  saving: boolean;
  deleting: boolean;
}) {
  const [local, setLocal] = useState<CycleDef>(row);
  const set = <K extends keyof CycleDef>(k: K, v: CycleDef[K]) => setLocal((s) => ({ ...s, [k]: v }));

  const toggleDay = (d: number) => {
    const next = local.days_of_week.includes(d)
      ? local.days_of_week.filter((x) => x !== d)
      : [...local.days_of_week, d].sort();
    set('days_of_week', next);
  };

  return (
    <Card className="border-white/10 bg-white/[0.02]">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{local.emoji}</span>
            <div>
              <CardTitle className="text-sm">{local.label}</CardTitle>
              <p className="text-[11px] text-muted-foreground font-mono">{local.key}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={local.active ? 'default' : 'secondary'} className="text-[10px]">
              {local.active ? 'Ativa' : 'Desativada'}
            </Badge>
            <Switch checked={local.active} onCheckedChange={(v) => set('active', v)} />
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Identidade visual */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <div className="space-y-1">
            <Label className="text-xs">Nome</Label>
            <Input value={local.label} onChange={(e) => set('label', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Emoji</Label>
            <Input value={local.emoji} maxLength={4} onChange={(e) => set('emoji', e.target.value)} />
          </div>
          <NumberField label="Cor (hue 0–360)" value={local.hue} onChange={(v: number) => set('hue', v)} min={0} max={360} />
          <NumberField label="Glow (0–100)" value={local.glow_intensity} onChange={(v: number) => set('glow_intensity', v)} min={0} max={100} />
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Descrição</Label>
          <Textarea rows={2} value={local.description ?? ''} onChange={(e) => set('description', e.target.value)} />
        </div>

        {/* Gatilhos */}
        <div className="rounded-lg border border-white/5 p-3 space-y-3">
          <h4 className="text-xs font-bold text-foreground/80 flex items-center gap-1"><Sparkles className="h-3 w-3" /> Gatilhos de abertura</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <NumberField label="Hora início (0–23)" value={local.hour_start} onChange={(v: number) => set('hour_start', v)} min={0} max={23} hint="Vazio = ignora" />
            <NumberField label="Hora fim (0–23)" value={local.hour_end} onChange={(v: number) => set('hour_end', v)} min={0} max={23} />
            <NumberField label="Mês (1–12)" value={local.date_month} onChange={(v: number) => set('date_month', v)} min={1} max={12} hint="Sazonal" />
            <NumberField label="Dia (1–31)" value={local.date_day} onChange={(v: number) => set('date_day', v)} min={1} max={31} />
          </div>

          <div>
            <Label className="text-xs">Dias da semana</Label>
            <div className="flex flex-wrap gap-1 mt-1">
              {DAYS.map((d, i) => (
                <button key={i} type="button"
                  onClick={() => toggleDay(i)}
                  className={`px-2 py-1 text-[11px] rounded border transition ${
                    local.days_of_week.includes(i)
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-transparent border-white/10 text-muted-foreground hover:border-white/30'
                  }`}>
                  {d}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">Vazio = qualquer dia</p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            <div className="space-y-1 md:col-span-1">
              <Label className="text-xs">Climas (CSV)</Label>
              <Input
                value={local.weather_kinds.join(',')}
                placeholder="rain,clouds,clear"
                onChange={(e) => set('weather_kinds', e.target.value.split(',').map((s) => s.trim()).filter(Boolean))}
              />
            </div>
            <NumberField label="Temp mín (°C)" value={local.min_temp} onChange={(v: number) => set('min_temp', v)} step={0.5} />
            <NumberField label="Temp máx (°C)" value={local.max_temp} onChange={(v: number) => set('max_temp', v)} step={0.5} />
          </div>
        </div>

        {/* Requisitos */}
        <div className="rounded-lg border border-white/5 p-3 space-y-3">
          <h4 className="text-xs font-bold text-foreground/80">Requisitos de entrada</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <NumberField label="Aura mín." value={local.min_aura_level} onChange={(v: number) => set('min_aura_level', v ?? 0)} min={0} max={10} />
            <NumberField label="Score Social" value={local.min_social_score} onChange={(v: number) => set('min_social_score', v ?? 0)} min={0} />
            <NumberField label="Prestígio XP" value={local.min_prestige_xp} onChange={(v: number) => set('min_prestige_xp', v ?? 0)} min={0} />
            <div className="space-y-1">
              <Label className="text-xs">Plano exigido</Label>
              <Input
                value={local.required_plan ?? ''}
                placeholder="free | premium | vip | founder"
                onChange={(e) => set('required_plan', e.target.value || null)}
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-xs">
              <Switch checked={local.requires_kyc} onCheckedChange={(v) => set('requires_kyc', v)} />
              Exige KYC
            </label>
            <label className="flex items-center gap-2 text-xs">
              <Switch checked={local.couple_only} onCheckedChange={(v) => set('couple_only', v)} />
              Couple-only
            </label>
          </div>
        </div>

        {/* Capacidade & XP */}
        <div className="rounded-lg border border-white/5 p-3 space-y-3">
          <h4 className="text-xs font-bold text-foreground/80">Capacidade, duração e XP</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <NumberField label="Capacidade máx." value={local.max_members} onChange={(v: number) => set('max_members', v ?? 50)} min={2} max={1000} />
            <NumberField label="Duração (min)" value={local.max_duration_minutes} onChange={(v: number) => set('max_duration_minutes', v ?? 180)} min={10} max={720} />
            <NumberField label="XP por rodada" value={local.xp_round_amount} onChange={(v: number) => set('xp_round_amount', v ?? 50)} min={1} />
            <NumberField label="Vencedores/rodada" value={local.xp_max_winners} onChange={(v: number) => set('xp_max_winners', v ?? 5)} min={1} max={20} />
            <NumberField label="Cooldown XP (seg)" value={local.xp_round_cooldown_sec} onChange={(v: number) => set('xp_round_cooldown_sec', v ?? 300)} min={30} />
            <NumberField label="Multiplicador presentes" value={local.gift_xp_multiplier} onChange={(v: number) => set('gift_xp_multiplier', v ?? 1)} min={0.1} max={10} step={0.1} />
            <NumberField label="Ordem (sort)" value={local.sort_order} onChange={(v: number) => set('sort_order', v ?? 100)} />
            <div className="space-y-1">
              <Label className="text-xs">Slug da sala</Label>
              <Input value={local.room_slug} onChange={(e) => set('room_slug', e.target.value)} />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 pt-2">
          <Button size="sm" variant="destructive" disabled={deleting} onClick={() => {
            if (confirm(`Excluir sala "${local.label}" (${local.key})?`)) onDelete(local.key);
          }}>
            <Trash2 className="h-3.5 w-3.5 mr-1" /> Excluir
          </Button>
          <Button size="sm" disabled={saving} onClick={() => onSave(local)}>
            {saving ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1" />}
            Salvar alterações
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminSpecialCyclesPage() {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState('time');
  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [newLabel, setNewLabel] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['admin-special-cycles'],
    queryFn: async (): Promise<CycleDef[]> => {
      const { data, error } = await (supabase as any)
        .from('oculto_special_cycle_definitions')
        .select('*')
        .order('category', { ascending: true })
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return (data ?? []) as CycleDef[];
    },
  });

  const saveMut = useMutation({
    mutationFn: async (row: CycleDef) => {
      const { error } = await (supabase as any)
        .from('oculto_special_cycle_definitions')
        .update({
          label: row.label, emoji: row.emoji, hue: row.hue, room_slug: row.room_slug,
          description: row.description, active: row.active, category: row.category,
          min_aura_level: row.min_aura_level, min_social_score: row.min_social_score,
          min_prestige_xp: row.min_prestige_xp, required_plan: row.required_plan,
          requires_kyc: row.requires_kyc, couple_only: row.couple_only,
          hour_start: row.hour_start, hour_end: row.hour_end,
          days_of_week: row.days_of_week, date_month: row.date_month, date_day: row.date_day,
          weather_kinds: row.weather_kinds, min_temp: row.min_temp, max_temp: row.max_temp,
          max_members: row.max_members, max_duration_minutes: row.max_duration_minutes,
          xp_round_amount: row.xp_round_amount, xp_max_winners: row.xp_max_winners,
          xp_round_cooldown_sec: row.xp_round_cooldown_sec,
          gift_xp_multiplier: row.gift_xp_multiplier,
          glow_intensity: row.glow_intensity, sort_order: row.sort_order,
        })
        .eq('key', row.key);
      if (error) throw error;
    },
    onSuccess: () => { toast.success('Sala atualizada'); qc.invalidateQueries({ queryKey: ['admin-special-cycles'] }); },
    onError: (e: any) => toast.error(e?.message ?? 'Erro ao salvar'),
  });

  const deleteMut = useMutation({
    mutationFn: async (key: string) => {
      const { error } = await (supabase as any)
        .from('oculto_special_cycle_definitions').delete().eq('key', key);
      if (error) throw error;
    },
    onSuccess: () => { toast.success('Sala excluída'); qc.invalidateQueries({ queryKey: ['admin-special-cycles'] }); },
    onError: (e: any) => toast.error(e?.message ?? 'Erro ao excluir'),
  });

  const createMut = useMutation({
    mutationFn: async () => {
      const key = newKey.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
      if (!key || !newLabel.trim()) throw new Error('Informe chave e nome');
      const { error } = await (supabase as any)
        .from('oculto_special_cycle_definitions').insert({
          key, label: newLabel.trim(), room_slug: `ciclo-${key.replace(/_/g, '-')}`,
          category: activeTab, active: false,
        });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Sala criada (desativada por padrão)');
      setCreating(false); setNewKey(''); setNewLabel('');
      qc.invalidateQueries({ queryKey: ['admin-special-cycles'] });
    },
    onError: (e: any) => toast.error(e?.message ?? 'Erro ao criar'),
  });

  const grouped = useMemo(() => {
    const out: Record<string, CycleDef[]> = {};
    for (const c of CATEGORIES) out[c.key] = [];
    for (const r of data ?? []) (out[r.category] ?? out['time']).push(r);
    return out;
  }, [data]);

  return (
    <div className="container mx-auto p-4 space-y-4 max-w-7xl">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Salas Sociais Especiais</h1>
          <p className="text-sm text-muted-foreground">
            Configuração total dos ciclos especiais — gatilhos, requisitos, capacidade, XP e duração.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setCreating((v) => !v)}>
          <Plus className="h-4 w-4 mr-1" /> Nova sala
        </Button>
      </div>

      {creating && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="pt-4 grid grid-cols-1 md:grid-cols-[1fr_2fr_auto] gap-2 items-end">
            <div className="space-y-1">
              <Label className="text-xs">Chave (a–z, 0–9, _)</Label>
              <Input value={newKey} onChange={(e) => setNewKey(e.target.value)} placeholder="minha_nova_sala" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Nome de exibição</Label>
              <Input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="Minha Nova Sala" />
            </div>
            <Button size="sm" disabled={createMut.isPending} onClick={() => createMut.mutate()}>
              {createMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Criar'}
            </Button>
          </CardContent>
        </Card>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex-wrap h-auto">
          {CATEGORIES.map((c) => (
            <TabsTrigger key={c.key} value={c.key}>
              {c.label}
              <Badge variant="secondary" className="ml-2 text-[10px]">{grouped[c.key]?.length ?? 0}</Badge>
            </TabsTrigger>
          ))}
        </TabsList>

        {CATEGORIES.map((c) => (
          <TabsContent key={c.key} value={c.key} className="space-y-3 mt-4">
            {isLoading && <div className="text-center py-8"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></div>}
            {!isLoading && grouped[c.key]?.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">Nenhuma sala nesta categoria.</p>
            )}
            <div className="grid gap-3 lg:grid-cols-2">
              {grouped[c.key]?.map((row) => (
                <CycleEditor
                  key={row.key} row={row}
                  onSave={(r) => saveMut.mutate(r)}
                  onDelete={(k) => deleteMut.mutate(k)}
                  saving={saveMut.isPending}
                  deleting={deleteMut.isPending}
                />
              ))}
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

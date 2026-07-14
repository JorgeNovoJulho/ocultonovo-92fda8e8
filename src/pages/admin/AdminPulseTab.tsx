/**
 * Pulso de Aura — Tab Admin Master (Fase 1 + Fase 2).
 * Métricas (v_aura_pulse_metrics e v_aura_pulse_metrics_by_type) + edição
 * do singleton aura_pulse_settings via RPC aura_pulse_admin_update_settings.
 *
 * Cobre:
 *  - Configuração global base (cooldowns/limites free e VIP, kill switch)
 *  - Pulso Premium (cooldown/limit/cor/duração/plano mínimo)
 *  - Pulso Raro (plano/trust/prestígio/cor/duração/monetização)
 *  - Ressonância Pública Sutil (cooldown/intensidade/duração/frases)
 *  - Histórico de Atenção (retenção/limite/permissões)
 */
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseExternal';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Sparkles, Save, Loader2, ShieldAlert, Activity, Crown, Zap, Waves, History as HistoryIcon, UserX } from 'lucide-react';

interface Settings {
  // Base
  enabled: boolean;
  cooldown_seconds: number;
  limit_per_window: number;
  window_minutes: number;
  vip_cooldown_seconds: number;
  vip_limit_per_window: number;
  free_can_send: boolean;
  sound_enabled_default: boolean;
  haptic_enabled_default: boolean;
  highlight_color: string;
  // Premium
  premium_pulse_enabled: boolean;
  premium_min_plan: string;
  premium_cooldown_seconds: number;
  premium_limit_30m: number;
  premium_highlight_color: string;
  premium_highlight_ms: number;
  premium_sound_enabled: boolean;
  // Rare
  rare_pulse_enabled: boolean;
  rare_min_plan: string;
  rare_vip_only: boolean;
  rare_min_trust_score: number;
  rare_min_prestige_level: number;
  rare_cooldown_seconds: number;
  rare_limit_30m: number;
  rare_highlight_color: string;
  rare_highlight_ms: number;
  rare_sound_enabled: boolean;
  rare_block_punished: boolean;
  rare_block_recently_reported: boolean;
  rare_monetization_enabled: boolean;
  rare_addon_price_brl: number | null;
  // Resonance
  resonance_enabled: boolean;
  resonance_public: boolean;
  resonance_cooldown_seconds: number;
  resonance_max_intensity: number;
  resonance_expires_seconds: number;
  resonance_min_plan: string | null;
  resonance_phrases: string[];
  // History
  history_enabled: boolean;
  history_retention_days: number;
  history_max_rows: number;
  history_user_can_delete: boolean;
  history_user_can_hide: boolean;
  updated_at?: string;
}

interface MetricRow {
  day: string;
  sent: number;
  responded: number;
  blocked: number;
  unique_senders: number;
  unique_targets: number;
}
interface MetricByTypeRow {
  day: string;
  pulse_type: string;
  sent: number;
  responded: number;
}

const DEFAULTS: Settings = {
  enabled: true,
  cooldown_seconds: 30,
  limit_per_window: 5,
  window_minutes: 30,
  vip_cooldown_seconds: 10,
  vip_limit_per_window: 15,
  free_can_send: true,
  sound_enabled_default: true,
  haptic_enabled_default: true,
  highlight_color: '#D4AF37',
  premium_pulse_enabled: true,
  premium_min_plan: 'premium',
  premium_cooldown_seconds: 300,
  premium_limit_30m: 5,
  premium_highlight_color: '#B57BFF',
  premium_highlight_ms: 14000,
  premium_sound_enabled: true,
  rare_pulse_enabled: true,
  rare_min_plan: 'vip',
  rare_vip_only: true,
  rare_min_trust_score: 70,
  rare_min_prestige_level: 3,
  rare_cooldown_seconds: 600,
  rare_limit_30m: 2,
  rare_highlight_color: '#FF3DE0',
  rare_highlight_ms: 18000,
  rare_sound_enabled: true,
  rare_block_punished: true,
  rare_block_recently_reported: true,
  rare_monetization_enabled: false,
  rare_addon_price_brl: null,
  resonance_enabled: true,
  resonance_public: true,
  resonance_cooldown_seconds: 120,
  resonance_max_intensity: 5,
  resonance_expires_seconds: 90,
  resonance_min_plan: null,
  resonance_phrases: ['duas auras em sintonia', 'a sala vibrou', 'uma faísca silenciosa cruzou o ambiente'],
  history_enabled: true,
  history_retention_days: 30,
  history_max_rows: 200,
  history_user_can_delete: true,
  history_user_can_hide: true,
};

export default function AdminPulseTab() {
  const [saved, setSaved] = useState<Settings>(DEFAULTS);
  const [draft, setDraft] = useState<Settings>(DEFAULTS);
  const [metrics, setMetrics] = useState<MetricRow[]>([]);
  const [byType, setByType] = useState<MetricByTypeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [forbidden, setForbidden] = useState(false);

  async function load() {
    setLoading(true);
    const [{ data: s, error: se }, { data: m }, { data: t }] = await Promise.all([
      (supabase as any).from('aura_pulse_settings').select('*').eq('id', true).maybeSingle(),
      (supabase as any).from('v_aura_pulse_metrics').select('*').limit(30),
      (supabase as any).from('v_aura_pulse_metrics_by_type').select('*').limit(120),
    ]);
    setLoading(false);
    if (se) { toast.error(se.message); return; }
    if (s) {
      const merged: Settings = { ...DEFAULTS, ...s };
      // resonance_phrases pode vir como jsonb array
      if (s.resonance_phrases && Array.isArray(s.resonance_phrases)) {
        merged.resonance_phrases = s.resonance_phrases as string[];
      }
      setSaved(merged);
      setDraft(merged);
    }
    setMetrics((m as MetricRow[]) || []);
    setByType((t as MetricByTypeRow[]) || []);
  }

  useEffect(() => { load(); }, []);

  const dirty = JSON.stringify(saved) !== JSON.stringify(draft);

  async function save() {
    setSaving(true);
    const patch: Record<string, any> = {};
    (Object.keys(draft) as (keyof Settings)[]).forEach((k) => {
      if (JSON.stringify((draft as any)[k]) !== JSON.stringify((saved as any)[k])) {
        patch[k] = (draft as any)[k];
      }
    });
    const { data, error } = await (supabase as any).rpc('aura_pulse_admin_update_settings', { p_patch: patch });
    setSaving(false);
    const r = Array.isArray(data) ? data[0] : data;
    if (error) { toast.error(error.message); return; }
    if (r?.ok === false) {
      if (r.error === 'forbidden') { setForbidden(true); toast.error('Acesso restrito ao Admin Master.'); return; }
      toast.error(r.error || 'Não foi possível salvar');
      return;
    }
    toast.success('Configurações de Pulso atualizadas');
    load();
  }

  if (forbidden) {
    return (
      <Card className="border-destructive/30 bg-destructive/10 p-4">
        <div className="flex gap-3">
          <ShieldAlert className="h-5 w-5 text-destructive" />
          <div>
            <p className="font-semibold">Acesso restrito</p>
            <p className="text-sm text-muted-foreground">Apenas o Admin Master pode configurar o Pulso de Aura.</p>
          </div>
        </div>
      </Card>
    );
  }

  const totals = metrics.reduce(
    (acc, r) => ({
      sent: acc.sent + Number(r.sent || 0),
      responded: acc.responded + Number(r.responded || 0),
      blocked: acc.blocked + Number(r.blocked || 0),
    }),
    { sent: 0, responded: 0, blocked: 0 }
  );
  const respRate = totals.sent ? Math.round((totals.responded / totals.sent) * 100) : 0;
  const totalsByType = byType.reduce<Record<string, { sent: number; responded: number }>>((acc, r) => {
    const k = r.pulse_type || 'default';
    acc[k] = acc[k] || { sent: 0, responded: 0 };
    acc[k].sent += Number(r.sent || 0);
    acc[k].responded += Number(r.responded || 0);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-fuchsia-400" />
        <h2 className="text-lg font-semibold">Pulso de Aura</h2>
        <Badge variant="outline" className="ml-auto text-[10px]">
          {saved.enabled ? 'Ativo globalmente' : 'Desativado'}
        </Badge>
      </div>

      {/* Métricas */}
      <div className="grid gap-2 sm:grid-cols-4">
        <MetricCard label="Pulsos (30d)" value={totals.sent} />
        <MetricCard label="Respondidos" value={totals.responded} accent="emerald" />
        <MetricCard label="Taxa resposta" value={`${respRate}%`} accent="fuchsia" />
        <MetricCard label="Bloqueados" value={totals.blocked} accent="destructive" />
      </div>

      {/* Breakdown por tipo */}
      <div className="grid gap-2 sm:grid-cols-3">
        <TypeCard label="Default" sent={totalsByType.default?.sent || 0} resp={totalsByType.default?.responded || 0} color="#D946EF" />
        <TypeCard label="Premium" sent={totalsByType.premium?.sent || 0} resp={totalsByType.premium?.responded || 0} color="#B57BFF" />
        <TypeCard label="Raro" sent={totalsByType.rare?.sent || 0} resp={totalsByType.rare?.responded || 0} color="#FF3DE0" />
      </div>

      {/* Base */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Configuração base</CardTitle>
          <CardDescription>
            Define cooldowns, janelas e limites por plano para o pulso padrão.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ToggleRow title="Ativar Pulso de Aura"
            description="Kill switch global — desliga todos os envios."
            checked={draft.enabled} onChange={(v) => setDraft({ ...draft, enabled: v })} />
          <ToggleRow title="Free pode enviar pulsos"
            description="Usuários do plano free podem disparar pulsos default."
            checked={draft.free_can_send} onChange={(v) => setDraft({ ...draft, free_can_send: v })} />

          <div className="grid gap-3 sm:grid-cols-3">
            <NumField label="Cooldown (s)" hint="Mínimo entre pulsos pro mesmo alvo" value={draft.cooldown_seconds}
              onChange={(n) => setDraft({ ...draft, cooldown_seconds: n })} />
            <NumField label="Limite por janela" hint="Pulsos por janela (free)" value={draft.limit_per_window}
              onChange={(n) => setDraft({ ...draft, limit_per_window: n })} />
            <NumField label="Janela (min)" value={draft.window_minutes}
              onChange={(n) => setDraft({ ...draft, window_minutes: n })} />
            <NumField label="Cooldown VIP (s)" value={draft.vip_cooldown_seconds}
              onChange={(n) => setDraft({ ...draft, vip_cooldown_seconds: n })} />
            <NumField label="Limite VIP" value={draft.vip_limit_per_window}
              onChange={(n) => setDraft({ ...draft, vip_limit_per_window: n })} />
            <ColorField label="Cor do destaque (default)"
              value={draft.highlight_color}
              onChange={(v) => setDraft({ ...draft, highlight_color: v })} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <ToggleRow title="Som ligado por padrão" description="Novos usuários com som habilitado."
              checked={draft.sound_enabled_default} onChange={(v) => setDraft({ ...draft, sound_enabled_default: v })} />
            <ToggleRow title="Vibração ligada por padrão" description="Novos usuários com vibração habilitada."
              checked={draft.haptic_enabled_default} onChange={(v) => setDraft({ ...draft, haptic_enabled_default: v })} />
          </div>
        </CardContent>
      </Card>

      {/* Premium */}
      <Card style={{ borderColor: `${draft.premium_highlight_color}55` }}>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Crown className="h-4 w-4" style={{ color: draft.premium_highlight_color }} /> Pulso Premium
          </CardTitle>
          <CardDescription>Pulso intermediário para usuários Premium/VIP — mais brilho e som distinto.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ToggleRow title="Habilitar Pulso Premium" description="Desliga sem afetar pulsos default/raros."
            checked={draft.premium_pulse_enabled} onChange={(v) => setDraft({ ...draft, premium_pulse_enabled: v })} />
          <div className="grid gap-3 sm:grid-cols-3">
            <PlanField label="Plano mínimo" value={draft.premium_min_plan}
              onChange={(v) => setDraft({ ...draft, premium_min_plan: v })} />
            <NumField label="Cooldown (s)" value={draft.premium_cooldown_seconds}
              onChange={(n) => setDraft({ ...draft, premium_cooldown_seconds: n })} />
            <NumField label="Limite por 30 min" value={draft.premium_limit_30m}
              onChange={(n) => setDraft({ ...draft, premium_limit_30m: n })} />
            <ColorField label="Cor do destaque" value={draft.premium_highlight_color}
              onChange={(v) => setDraft({ ...draft, premium_highlight_color: v })} />
            <NumField label="Duração destaque (ms)" value={draft.premium_highlight_ms}
              onChange={(n) => setDraft({ ...draft, premium_highlight_ms: n })} />
            <ToggleRow title="Som diferenciado" description="Toca chime premium."
              checked={draft.premium_sound_enabled} onChange={(v) => setDraft({ ...draft, premium_sound_enabled: v })} />
          </div>
        </CardContent>
      </Card>

      {/* Rare */}
      <Card style={{ borderColor: `${draft.rare_highlight_color}55` }}>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Zap className="h-4 w-4" style={{ color: draft.rare_highlight_color }} /> Pulso Raro
          </CardTitle>
          <CardDescription>Restrito a VIP com alto trust e prestígio — alto impacto na sala.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ToggleRow title="Habilitar Pulso Raro" description="Kill switch específico para pulso raro."
            checked={draft.rare_pulse_enabled} onChange={(v) => setDraft({ ...draft, rare_pulse_enabled: v })} />
          <div className="grid gap-3 sm:grid-cols-3">
            <PlanField label="Plano mínimo" value={draft.rare_min_plan}
              onChange={(v) => setDraft({ ...draft, rare_min_plan: v })} />
            <NumField label="Trust mínimo" value={draft.rare_min_trust_score}
              onChange={(n) => setDraft({ ...draft, rare_min_trust_score: n })} />
            <NumField label="Prestígio mínimo" value={draft.rare_min_prestige_level}
              onChange={(n) => setDraft({ ...draft, rare_min_prestige_level: n })} />
            <NumField label="Cooldown (s)" value={draft.rare_cooldown_seconds}
              onChange={(n) => setDraft({ ...draft, rare_cooldown_seconds: n })} />
            <NumField label="Limite por 30 min" value={draft.rare_limit_30m}
              onChange={(n) => setDraft({ ...draft, rare_limit_30m: n })} />
            <ColorField label="Cor do destaque" value={draft.rare_highlight_color}
              onChange={(v) => setDraft({ ...draft, rare_highlight_color: v })} />
            <NumField label="Duração destaque (ms)" value={draft.rare_highlight_ms}
              onChange={(n) => setDraft({ ...draft, rare_highlight_ms: n })} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <ToggleRow title="Apenas VIP" description="Mesmo se plano mínimo for menor, exige VIP."
              checked={draft.rare_vip_only} onChange={(v) => setDraft({ ...draft, rare_vip_only: v })} />
            <ToggleRow title="Som diferenciado" description="Chime descendente característico."
              checked={draft.rare_sound_enabled} onChange={(v) => setDraft({ ...draft, rare_sound_enabled: v })} />
            <ToggleRow title="Bloquear punidos" description="Usuários com sanção ativa não enviam raro."
              checked={draft.rare_block_punished} onChange={(v) => setDraft({ ...draft, rare_block_punished: v })} />
            <ToggleRow title="Bloquear reportados recentes" description="Usuários reportados nos últimos dias."
              checked={draft.rare_block_recently_reported} onChange={(v) => setDraft({ ...draft, rare_block_recently_reported: v })} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2 border-t border-border/40 pt-3">
            <ToggleRow title="Monetizar como add-on" description="Cobra pelo envio do pulso raro."
              checked={draft.rare_monetization_enabled} onChange={(v) => setDraft({ ...draft, rare_monetization_enabled: v })} />
            <div>
              <Label className="text-xs">Preço add-on (BRL)</Label>
              <Input type="number" step="0.01" min={0}
                value={draft.rare_addon_price_brl ?? ''}
                placeholder="ex: 4.90"
                onChange={(e) => setDraft({ ...draft, rare_addon_price_brl: e.target.value ? parseFloat(e.target.value) : null })}
                className="h-8" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Resonance */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Waves className="h-4 w-4 text-cyan-300" /> Ressonância pública sutil
          </CardTitle>
          <CardDescription>Sinal anônimo na sala quando dois usuários "vibram" em sincronia.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <ToggleRow title="Ativar Ressonância" description="Desliga a engine sem afetar pulsos."
              checked={draft.resonance_enabled} onChange={(v) => setDraft({ ...draft, resonance_enabled: v })} />
            <ToggleRow title="Exibir publicamente" description="Outras pessoas na sala veem a faísca anônima."
              checked={draft.resonance_public} onChange={(v) => setDraft({ ...draft, resonance_public: v })} />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <NumField label="Cooldown (s)" value={draft.resonance_cooldown_seconds}
              onChange={(n) => setDraft({ ...draft, resonance_cooldown_seconds: n })} />
            <NumField label="Intensidade máx (1-5)" value={draft.resonance_max_intensity}
              onChange={(n) => setDraft({ ...draft, resonance_max_intensity: Math.min(5, Math.max(1, n)) })} />
            <NumField label="Duração (s)" value={draft.resonance_expires_seconds}
              onChange={(n) => setDraft({ ...draft, resonance_expires_seconds: n })} />
          </div>
          <div>
            <Label className="text-xs">Frases mostradas (uma por linha)</Label>
            <Textarea
              rows={3}
              value={draft.resonance_phrases.join('\n')}
              onChange={(e) => setDraft({
                ...draft,
                resonance_phrases: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean),
              })}
              className="text-xs"
            />
            <p className="mt-1 text-[10px] text-muted-foreground">
              Frases curtas e ambíguas. Nunca cite nomes ou dados identificáveis.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* History */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <HistoryIcon className="h-4 w-4 text-amber-300" /> Histórico de Atenção
          </CardTitle>
          <CardDescription>Define retenção, paginação e permissões do usuário sobre o próprio histórico.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ToggleRow title="Ativar Histórico" description="Desliga o recurso para todos os usuários."
            checked={draft.history_enabled} onChange={(v) => setDraft({ ...draft, history_enabled: v })} />
          <div className="grid gap-3 sm:grid-cols-2">
            <NumField label="Retenção (dias)" hint="Apaga pulsos mais antigos automaticamente." value={draft.history_retention_days}
              onChange={(n) => setDraft({ ...draft, history_retention_days: n })} />
            <NumField label="Máx por consulta" value={draft.history_max_rows}
              onChange={(n) => setDraft({ ...draft, history_max_rows: n })} />
            <ToggleRow title="Usuário pode apagar" description="Permite limpar histórico próprio."
              checked={draft.history_user_can_delete} onChange={(v) => setDraft({ ...draft, history_user_can_delete: v })} />
            <ToggleRow title="Usuário pode ocultar dos outros" description="Permite desativar a aparição no histórico alheio."
              checked={draft.history_user_can_hide} onChange={(v) => setDraft({ ...draft, history_user_can_hide: v })} />
          </div>
        </CardContent>
      </Card>

      {/* Suspensão de usuário (moderação) */}
      <SuspendUserCard />

      <div className="sticky bottom-2 z-10 flex items-center gap-2 rounded-lg border border-border/60 bg-background/95 p-2 shadow-lg backdrop-blur">
        <Button onClick={save} disabled={!dirty || saving} className="gap-1">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {dirty ? 'Salvar mudanças' : 'Salvo'}
        </Button>
        {dirty && (
          <Button variant="ghost" onClick={() => setDraft(saved)} disabled={saving}>
            Cancelar
          </Button>
        )}
        {saved.updated_at && (
          <span className="ml-auto text-[11px] text-muted-foreground">
            Atualizado em {new Date(saved.updated_at).toLocaleString('pt-BR')}
          </span>
        )}
      </div>

      {/* Métricas diárias */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="h-4 w-4" /> Métricas diárias (30 dias)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : metrics.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem dados ainda.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-muted-foreground">
                  <tr className="border-b border-border/40 text-left">
                    <th className="py-1 pr-3">Dia</th>
                    <th className="py-1 pr-3 text-right">Enviados</th>
                    <th className="py-1 pr-3 text-right">Respondidos</th>
                    <th className="py-1 pr-3 text-right">Bloqueados</th>
                    <th className="py-1 pr-3 text-right">Senders</th>
                    <th className="py-1 pr-3 text-right">Alvos</th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.map((r) => (
                    <tr key={r.day} className="border-b border-border/20">
                      <td className="py-1 pr-3 font-mono">{new Date(r.day).toLocaleDateString('pt-BR')}</td>
                      <td className="py-1 pr-3 text-right tabular-nums">{r.sent}</td>
                      <td className="py-1 pr-3 text-right tabular-nums text-emerald-300">{r.responded}</td>
                      <td className="py-1 pr-3 text-right tabular-nums text-destructive">{r.blocked}</td>
                      <td className="py-1 pr-3 text-right tabular-nums">{r.unique_senders}</td>
                      <td className="py-1 pr-3 text-right tabular-nums">{r.unique_targets}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function MetricCard({ label, value, accent }: { label: string; value: number | string; accent?: 'emerald' | 'fuchsia' | 'destructive' }) {
  const color =
    accent === 'emerald' ? 'text-emerald-300' :
    accent === 'fuchsia' ? 'text-fuchsia-300' :
    accent === 'destructive' ? 'text-destructive' : 'text-foreground';
  return (
    <Card className="p-3">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`text-2xl font-bold tabular-nums ${color}`}>{value}</p>
    </Card>
  );
}

function TypeCard({ label, sent, resp, color }: { label: string; sent: number; resp: number; color: string }) {
  const rate = sent ? Math.round((resp / sent) * 100) : 0;
  return (
    <Card className="p-3" style={{ borderColor: `${color}55` }}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold" style={{ color }}>{label}</p>
        <span className="text-[10px] text-muted-foreground">{rate}% resp.</span>
      </div>
      <p className="mt-1 text-xl font-bold tabular-nums">{sent}</p>
      <p className="text-[10px] text-muted-foreground">{resp} respondidos</p>
    </Card>
  );
}

function NumField({ label, hint, value, onChange }: { label: string; hint?: string; value: number; onChange: (n: number) => void }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input
        type="number" min={0} value={value}
        onChange={(e) => onChange(Math.max(0, parseInt(e.target.value || '0', 10)))}
        className="h-8"
      />
      {hint && <p className="mt-0.5 text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <div className="flex items-center gap-2">
        <Input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="h-8 w-14 cursor-pointer p-1" />
        <Input value={value} onChange={(e) => onChange(e.target.value)} className="h-8 flex-1 font-mono text-xs" />
      </div>
    </div>
  );
}

function PlanField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
      >
        <option value="free">free</option>
        <option value="premium">premium</option>
        <option value="vip">vip</option>
      </select>
    </div>
  );
}

function ToggleRow({ title, description, checked, onChange }: { title: string; description: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border/40 bg-background/30 p-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

/**
 * Suspende um usuário específico de enviar Pulsos via RPC
 * aura_pulse_admin_suspend_user(p_user uuid, p_until timestamptz).
 * Passar p_until=null limpa a suspensão.
 */
function SuspendUserCard() {
  const [userId, setUserId] = useState('');
  const [until, setUntil] = useState(''); // datetime-local
  const [busy, setBusy] = useState<'suspend' | 'clear' | null>(null);

  async function call(clear: boolean) {
    const uid = userId.trim();
    if (!uid) { toast.warning('Informe o user_id'); return; }
    if (!clear && !until) { toast.warning('Informe a data/hora limite'); return; }
    setBusy(clear ? 'clear' : 'suspend');
    const p_until = clear ? null : new Date(until).toISOString();
    const { data, error } = await (supabase as any).rpc('aura_pulse_admin_suspend_user', {
      p_user: uid, p_until,
    });
    setBusy(null);
    const r = Array.isArray(data) ? data[0] : data;
    if (error || r?.ok === false) {
      toast.error(r?.error === 'forbidden' ? 'Acesso restrito ao Admin Master.' : (error?.message || r?.error || 'Falha'));
      return;
    }
    toast.success(clear ? 'Suspensão removida' : `Usuário suspenso até ${new Date(until).toLocaleString('pt-BR')}`);
    if (clear) setUntil('');
  }

  return (
    <Card className="border-destructive/30">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <UserX className="h-4 w-4 text-destructive" /> Suspender usuário de enviar Pulsos
        </CardTitle>
        <CardDescription>
          Bloqueia o envio de qualquer pulso até a data informada. Não afeta recebimento.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label className="text-xs">user_id (UUID)</Label>
            <Input
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder="00000000-0000-0000-0000-000000000000"
              className="h-8 font-mono text-xs"
            />
          </div>
          <div>
            <Label className="text-xs">Suspenso até</Label>
            <Input
              type="datetime-local"
              value={until}
              onChange={(e) => setUntil(e.target.value)}
              className="h-8"
            />
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="destructive" onClick={() => call(false)} disabled={busy !== null} className="gap-1">
            {busy === 'suspend' ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserX className="h-4 w-4" />}
            Suspender
          </Button>
          <Button variant="outline" onClick={() => call(true)} disabled={busy !== null || !userId.trim()}>
            {busy === 'clear' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Remover suspensão
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}


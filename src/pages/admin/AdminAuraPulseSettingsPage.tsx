/**
 * AdminAuraPulseSettingsPage — Painel Master para o "Pulso de Aura".
 *
 * - Lê `aura_pulse_settings` (singleton id=true) via SELECT.
 * - Salva via RPC `aura_pulse_admin_update_settings(p_patch jsonb)`.
 * - Subscreve realtime na própria tabela para refletir mudanças de outros admins.
 * - Alterações são lidas pelo backend em CADA `aura_pulse_send`, portanto
 *   os avisos exibidos ao remetente refletem imediatamente (próximo envio).
 */
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseExternal';
import { subscribeTable } from '@/lib/realtimeBus';
import { useIsMasterAdmin } from '@/hooks/useUserRoles';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { Sparkles, Sparkle, Star, Save, ShieldAlert, Loader2, RotateCcw, Radio } from 'lucide-react';

type Settings = Record<string, any>;

const NUM = (v: any, d = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

export default function AdminAuraPulseSettingsPage() {
  const { data: isMaster, isLoading: loadingRole } = useIsMasterAdmin();
  const [saved, setSaved] = useState<Settings>({});
  const [draft, setDraft] = useState<Settings>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);

  const dirty = useMemo(() => {
    return Object.keys(draft).some((k) => draft[k] !== saved[k]);
  }, [draft, saved]);

  async function load() {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from('aura_pulse_settings')
      .select('*')
      .eq('id', true)
      .maybeSingle();
    setLoading(false);
    if (error) { toast.error('Falha ao carregar', { description: error.message }); return; }
    if (!data) { toast.warning('Configurações não encontradas. Rode o SQL da Fase 1.'); return; }
    setSaved(data);
    setDraft(data);
    setLastSync(new Date());
  }

  useEffect(() => { if (isMaster) load(); }, [isMaster]);

  // Realtime: refletir mudanças feitas por outros admins
  useEffect(() => {
    if (!isMaster) return;
    const unsub = subscribeTable('aura_pulse_settings', (payload: any) => {
      const next = payload?.new as Settings;
      if (!next) return;
      setSaved(next);
      setDraft((cur) => (dirty ? cur : next));
      setLastSync(new Date());
    }, { events: ['UPDATE'] });
    return () => { try { unsub(); } catch { /* noop */ } };
  }, [isMaster, dirty]);

  function setK(key: string, value: any) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  async function save() {
    const patch: Settings = {};
    Object.keys(draft).forEach((k) => {
      if (draft[k] !== saved[k]) patch[k] = draft[k];
    });
    if (Object.keys(patch).length === 0) return;
    setSaving(true);
    const { data, error } = await (supabase as any).rpc('aura_pulse_admin_update_settings', { p_patch: patch });
    setSaving(false);
    if (error) { toast.error('Falha ao salvar', { description: error.message }); return; }
    const r = (Array.isArray(data) ? data[0] : data) as { ok?: boolean; error?: string };
    if (r?.ok === false) { toast.error('Bloqueado', { description: r.error || 'forbidden' }); return; }
    toast.success('✨ Configurações aplicadas em tempo real');
    load();
  }

  if (loadingRole) return <div className="p-6 text-muted-foreground">Carregando…</div>;
  if (!isMaster) {
    return (
      <div className="p-6 max-w-md mx-auto">
        <Card className="p-6 flex gap-3 items-start border-destructive/30 bg-destructive/10">
          <ShieldAlert className="w-5 h-5 text-destructive mt-0.5" />
          <div>
            <p className="font-semibold">Acesso restrito</p>
            <p className="text-sm text-muted-foreground">Apenas o Admin Master pode editar o Pulso de Aura.</p>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-3 sm:p-4 space-y-4 pb-32">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-xl sm:text-2xl font-bold">
            <Sparkles className="h-5 w-5 sm:h-6 sm:w-6 text-amber-300" />
            Pulso de Aura — Painel Master
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5">
            <Radio className="h-3 w-3 text-emerald-400 animate-pulse" />
            Realtime · alterações refletem no próximo envio
            {lastSync && <span className="ml-1">· sync {lastSync.toLocaleTimeString()}</span>}
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={load} disabled={loading} className="gap-1">
            <RotateCcw className="h-3.5 w-3.5" /> Recarregar
          </Button>
          <Button size="sm" onClick={save} disabled={!dirty || saving} className="gap-1">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            {dirty ? 'Salvar mudanças' : 'Salvo'}
          </Button>
        </div>
      </div>

      <Tabs defaultValue="base" className="w-full">
        <TabsList className="grid w-full grid-cols-3 h-auto">
          <TabsTrigger value="base" className="text-xs">Base</TabsTrigger>
          <TabsTrigger value="premium" className="text-xs">Premium / Raro</TabsTrigger>
          <TabsTrigger value="resonance" className="text-xs">Ressonância</TabsTrigger>
        </TabsList>

        {/* ============ BASE ============ */}
        <TabsContent value="base" className="space-y-3 mt-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Master switch</CardTitle>
              <CardDescription>Desliga 100% dos pulsos imediatamente.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Toggle k="enabled" label="Sistema habilitado" d={draft} s={saved} on={setK} />
              <Toggle k="free_can_send" label="Free pode enviar pulso comum" d={draft} s={saved} on={setK} />
              <Toggle k="sound_enabled_default" label="Som habilitado por padrão" d={draft} s={saved} on={setK} />
              <Toggle k="haptic_enabled_default" label="Vibração habilitada por padrão" d={draft} s={saved} on={setK} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Limites — Pulso Comum</CardTitle>
              <CardDescription>Valores aplicados no próximo `aura_pulse_send`.</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3">
              <Num k="cooldown_seconds" label="Cooldown free (s)" d={draft} s={saved} on={setK} min={0} />
              <Num k="vip_cooldown_seconds" label="Cooldown VIP (s)" d={draft} s={saved} on={setK} min={0} />
              <Num k="limit_per_window" label="Limite free / janela" d={draft} s={saved} on={setK} min={1} />
              <Num k="vip_limit_per_window" label="Limite VIP / janela" d={draft} s={saved} on={setK} min={1} />
              <Num k="window_minutes" label="Janela (min)" d={draft} s={saved} on={setK} min={1} />
              <Color k="highlight_color" label="Cor do destaque" d={draft} s={saved} on={setK} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ============ PREMIUM + RARO ============ */}
        <TabsContent value="premium" className="space-y-3 mt-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Sparkle className="h-4 w-4 text-fuchsia-300" /> Pulso Premium
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><Toggle k="premium_pulse_enabled" label="Habilitado" d={draft} s={saved} on={setK} /></div>
              <Select k="premium_min_plan" label="Plano mínimo" d={draft} s={saved} on={setK}
                options={[['premium','Premium'],['vip','VIP']]} />
              <Num k="premium_cooldown_seconds" label="Cooldown (s)" d={draft} s={saved} on={setK} min={0} />
              <Num k="premium_limit_30m" label="Limite por 30 min" d={draft} s={saved} on={setK} min={1} />
              <Num k="premium_highlight_ms" label="Destaque (ms)" d={draft} s={saved} on={setK} min={1000} step={500} />
              <Color k="premium_highlight_color" label="Cor do destaque" d={draft} s={saved} on={setK} />
              <div className="col-span-2"><Toggle k="premium_sound_enabled" label="Som Premium habilitado" d={draft} s={saved} on={setK} /></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Star className="h-4 w-4 text-pink-300" /> Pulso Raro
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><Toggle k="rare_pulse_enabled" label="Habilitado" d={draft} s={saved} on={setK} /></div>
              <div className="col-span-2"><Toggle k="rare_vip_only" label="Exclusivo VIP" d={draft} s={saved} on={setK} /></div>
              <Num k="rare_min_trust_score" label="Trust mínimo" d={draft} s={saved} on={setK} min={0} />
              <Num k="rare_min_prestige_level" label="Prestígio mínimo" d={draft} s={saved} on={setK} min={0} />
              <Num k="rare_cooldown_seconds" label="Cooldown (s)" d={draft} s={saved} on={setK} min={0} />
              <Num k="rare_limit_30m" label="Limite por 30 min" d={draft} s={saved} on={setK} min={1} />
              <Num k="rare_highlight_ms" label="Destaque (ms)" d={draft} s={saved} on={setK} min={1000} step={500} />
              <Color k="rare_highlight_color" label="Cor do destaque" d={draft} s={saved} on={setK} />
              <div className="col-span-2"><Toggle k="rare_sound_enabled" label="Som Raro habilitado" d={draft} s={saved} on={setK} /></div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ============ RESONANCE ============ */}
        <TabsContent value="resonance" className="space-y-3 mt-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Ressonância</CardTitle>
              <CardDescription>Eventos públicos quando dois usuários trocam pulsos.</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><Toggle k="resonance_enabled" label="Habilitada" d={draft} s={saved} on={setK} /></div>
              <div className="col-span-2"><Toggle k="resonance_public" label="Mostrar publicamente na sala" d={draft} s={saved} on={setK} /></div>
              <Num k="resonance_cooldown_seconds" label="Cooldown (s)" d={draft} s={saved} on={setK} min={0} />
              <Num k="resonance_max_intensity" label="Intensidade máx" d={draft} s={saved} on={setK} min={1} />
              <Num k="resonance_expires_seconds" label="Expira em (s)" d={draft} s={saved} on={setK} min={10} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Separator />
      <Card className="border-amber-400/30 bg-amber-500/[0.04]">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs uppercase tracking-wider text-amber-300/80">Pré-visualização do destaque</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-3 gap-2">
          {[
            { label: 'Default', color: draft.highlight_color, ms: 12000 },
            { label: 'Premium', color: draft.premium_highlight_color, ms: NUM(draft.premium_highlight_ms, 14000) },
            { label: 'Raro',    color: draft.rare_highlight_color,    ms: NUM(draft.rare_highlight_ms, 18000) },
          ].map((p) => (
            <div key={p.label}
              className="rounded-md p-2 border text-center"
              style={{
                borderColor: `${p.color}66`,
                backgroundColor: `${p.color}1A`,
                color: p.color,
                boxShadow: `inset 0 0 0 1px ${p.color}40`,
              }}
            >
              <div className="text-[10px] uppercase tracking-wider opacity-70">{p.label}</div>
              <div className="font-bold tabular-nums">{Math.round(p.ms / 1000)}s</div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Barra de salvar fixa em mobile */}
      {dirty && (
        <div className="fixed bottom-3 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 rounded-full border border-amber-300/40 bg-background/95 px-3 py-2 shadow-lg backdrop-blur">
          <Badge variant="outline" className="border-amber-300/40 text-amber-200 text-[10px]">
            {Object.keys(draft).filter((k) => draft[k] !== saved[k]).length} alteração(ões)
          </Badge>
          <Button size="sm" onClick={save} disabled={saving} className="gap-1 h-7">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Aplicar agora
          </Button>
        </div>
      )}
    </div>
  );
}

/* ==================== Inputs reutilizáveis ==================== */

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Toggle({ k, label, d, s, on }:
  { k: string; label: string; d: Settings; s: Settings; on: (k: string, v: any) => void }) {
  const dirty = d[k] !== s[k];
  return (
    <div className="flex items-center justify-between rounded-md border border-border/50 px-2.5 py-1.5">
      <div className="text-xs">
        {label}
        {dirty && <Badge variant="outline" className="ml-2 border-amber-300/40 text-amber-200 text-[9px] h-4 px-1">pendente</Badge>}
      </div>
      <Switch checked={!!d[k]} onCheckedChange={(v) => on(k, v)} />
    </div>
  );
}

function Num({ k, label, d, s, on, min = 0, step = 1 }:
  { k: string; label: string; d: Settings; s: Settings; on: (k: string, v: any) => void; min?: number; step?: number }) {
  const dirty = d[k] !== s[k];
  return (
    <Row label={label} hint={dirty ? `Salvo: ${s[k]}` : undefined}>
      <Input
        type="number" min={min} step={step}
        value={d[k] ?? 0}
        onChange={(e) => on(k, Math.max(min, parseInt(e.target.value || '0', 10)))}
        className={`h-8 text-sm ${dirty ? 'border-amber-300/60' : ''}`}
      />
    </Row>
  );
}

function Color({ k, label, d, s, on }:
  { k: string; label: string; d: Settings; s: Settings; on: (k: string, v: any) => void }) {
  const dirty = d[k] !== s[k];
  return (
    <Row label={label} hint={dirty ? `Salvo: ${s[k]}` : undefined}>
      <div className="flex items-center gap-2">
        <input type="color"
          value={d[k] || '#D946EF'}
          onChange={(e) => on(k, e.target.value.toUpperCase())}
          className="h-8 w-10 rounded border border-border/50 bg-transparent cursor-pointer"
        />
        <Input
          value={d[k] || ''}
          onChange={(e) => on(k, e.target.value.toUpperCase())}
          className={`h-8 text-xs font-mono ${dirty ? 'border-amber-300/60' : ''}`}
        />
      </div>
    </Row>
  );
}

function Select({ k, label, d, s, on, options }:
  { k: string; label: string; d: Settings; s: Settings; on: (k: string, v: any) => void; options: [string, string][] }) {
  const dirty = d[k] !== s[k];
  return (
    <Row label={label} hint={dirty ? `Salvo: ${s[k]}` : undefined}>
      <select
        value={d[k] || ''}
        onChange={(e) => on(k, e.target.value)}
        className={`h-8 w-full rounded-md border bg-background px-2 text-sm ${dirty ? 'border-amber-300/60' : 'border-border/50'}`}
      >
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </Row>
  );
}

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseExternal';
import { useIsMasterAdmin } from '@/hooks/useUserRoles';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { ShieldAlert, Save, Loader2, Sparkles, Shield, Trash2, Plus, FlaskConical, Search, RotateCcw, Zap, RefreshCw, Crown } from 'lucide-react';
import { AuraSocialCard } from '@/components/social-score/AuraSocialCard';
import { useSocialScore } from '@/hooks/useSocialScore';
import { AdminPrestigeTab } from '@/components/social-score/AdminPrestigeTab';

interface Rule { kind: string; weight: number; daily_cap: number; cooldown_seconds: number; active: boolean; description?: string }
interface Level { level: number; name: string; min_xp: number; glow_color: string; perks: any }
interface Reward { id: string; level_min: number; kind: string; value: number; label: string; description?: string; active: boolean }
interface TrustSetting { key: string; value: any }
interface UserHit { id: string; username: string; name: string; avatar_url: string | null; plan_type: string }

const REWARD_KINDS = [
  { v: 'discount_sub', l: 'Desconto assinatura mensal (%)' },
  { v: 'discount_vip', l: 'Desconto assinatura VIP (%)' },
  { v: 'discount_fee', l: 'Desconto taxa plataforma (%)' },
  { v: 'boost_radar', l: 'Boost Radar (×)' },
  { v: 'boost_aura',  l: 'Boost Aura (×)' },
  { v: 'highlight',   l: 'Destaque visual' },
  { v: 'custom',      l: 'Customizado' },
];

const SIM_EVENTS = [
  { v: 'post_created',     l: 'Postou (post_created)' },
  { v: 'like_received',    l: 'Curtida recebida (like_received)' },
  { v: 'comment_received', l: 'Comentário recebido (comment_received)' },
  { v: 'follower_gained',  l: 'Novo seguidor (follower_gained)' },
  { v: 'match_made',       l: 'Match (match_made)' },
  { v: 'verification_done',l: 'KYC concluído (verification_done)' },
  { v: 'vip_subscriber_new', l: 'Novo assinante VIP' },
  { v: 'content_sold',     l: 'Conteúdo vendido' },
  { v: 'report_valid',     l: 'Denúncia válida (negativo)' },
];

export default function AdminSocialTrustPage() {
  const { data: isMaster, isLoading } = useIsMasterAdmin();

  const [rules, setRules] = useState<Rule[]>([]);
  const [levels, setLevels] = useState<Level[]>([]);
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [trust, setTrust] = useState<TrustSetting[]>([]);
  const [trustDraft, setTrustDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  // --- Simulador ---
  const [simQuery, setSimQuery] = useState('');
  const [simResults, setSimResults] = useState<UserHit[]>([]);
  const [simUser, setSimUser] = useState<UserHit | null>(null);
  const [simKind, setSimKind] = useState('like_received');
  const [simBusy, setSimBusy] = useState(false);
  const { data: simScore, reload: reloadSim } = useSocialScore(simUser?.id ?? null);

  async function load() {
    const [r, l, w, t] = await Promise.all([
      (supabase as any).from('oculto_social_rules').select('*').order('kind'),
      (supabase as any).from('oculto_social_levels').select('*').order('level'),
      (supabase as any).from('oculto_social_rewards').select('*').order('level_min'),
      (supabase as any).from('oculto_trust_settings').select('*'),
    ]);
    setRules(r.data || []);
    setLevels(l.data || []);
    setRewards(w.data || []);
    setTrust(t.data || []);
    const d: Record<string, string> = {};
    (t.data || []).forEach((s: TrustSetting) => { d[s.key] = JSON.stringify(s.value, null, 2); });
    setTrustDraft(d);
  }
  useEffect(() => { if (isMaster) load(); }, [isMaster]);

  async function saveRule(rule: Rule) {
    setBusy(true);
    const { error } = await (supabase as any).rpc('social_admin_set_rule', {
      p_kind: rule.kind, p_weight: rule.weight, p_daily_cap: rule.daily_cap,
      p_cooldown: rule.cooldown_seconds, p_active: rule.active,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`Regra ${rule.kind} aplicada`);
    load();
  }
  async function saveLevel(lv: Level) {
    setBusy(true);
    const { error } = await (supabase as any).rpc('social_admin_set_level', {
      p_level: lv.level, p_name: lv.name, p_min_xp: lv.min_xp, p_glow: lv.glow_color, p_perks: lv.perks ?? [],
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`Nível ${lv.level} salvo`);
    load();
  }
  async function saveReward(r: Reward) {
    setBusy(true);
    const { error } = await (supabase as any).rpc('social_admin_set_reward', {
      p_id: r.id || null, p_level_min: r.level_min, p_kind: r.kind,
      p_value: r.value, p_label: r.label, p_description: r.description ?? '', p_active: r.active,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success('Recompensa salva');
    load();
  }
  async function delReward(id: string) {
    if (!confirm('Excluir recompensa?')) return;
    const { error } = await (supabase as any).rpc('social_admin_delete_reward', { p_id: id });
    if (error) return toast.error(error.message);
    toast.success('Removida');
    load();
  }

  async function saveTrust(key: string) {
    let parsed: any;
    try { parsed = JSON.parse(trustDraft[key] ?? '{}'); }
    catch (e: any) { return toast.error(`JSON inválido: ${e.message}`); }
    setBusy(true);
    const { error } = await (supabase as any).rpc('trust_admin_set_setting', { p_key: key, p_value: parsed });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`${key} salvo`);
    load();
  }

  // --- simulador handlers ---
  async function searchUsers() {
    const { data, error } = await (supabase as any).rpc('social_admin_search_users', { p_query: simQuery.trim() });
    if (error) return toast.error(error.message);
    setSimResults((data as UserHit[]) || []);
  }
  async function fireEvent() {
    if (!simUser) return toast.error('Selecione um usuário');
    setSimBusy(true);
    const { data, error } = await (supabase as any).rpc('social_admin_simulate_event', {
      p_user: simUser.id, p_kind: simKind,
    });
    setSimBusy(false);
    if (error) return toast.error(error.message);
    const r = data as { ok: boolean; xp: number; level: number; delta: number };
    toast.success(`${simKind}: ${r.delta > 0 ? '+' : ''}${r.delta} XP — Nv ${r.level} (${r.xp} XP)`);
    reloadSim();
  }
  async function resetSimUser() {
    if (!simUser) return;
    if (!confirm(`Zerar XP de ${simUser.username}?`)) return;
    const { error } = await (supabase as any).rpc('social_admin_reset_user', { p_user: simUser.id });
    if (error) return toast.error(error.message);
    toast.success('XP zerado');
    reloadSim();
  }

  // --- Recálculo global de scores/níveis ---
  const [recalcBusy, setRecalcBusy] = useState(false);
  async function recalcAllScores() {
    if (!confirm('Recalcular TODOS os scores e níveis do Aura Social com base nos eventos existentes? Isto pode levar alguns segundos.')) return;
    setRecalcBusy(true);
    const { data, error } = await (supabase as any).rpc('social_admin_recalc_scores', { p_user: null });
    setRecalcBusy(false);
    if (error) return toast.error(error.message);
    const r = data as { recalculated: number; elapsed_ms: number };
    toast.success(`✓ ${r.recalculated} usuários recalculados em ${r.elapsed_ms}ms`);
    if (simUser) reloadSim();
  }
  async function recalcSimUser() {
    if (!simUser) return;
    setRecalcBusy(true);
    const { error } = await (supabase as any).rpc('social_admin_recalc_scores', { p_user: simUser.id });
    setRecalcBusy(false);
    if (error) return toast.error(error.message);
    toast.success('Score do usuário recalculado');
    reloadSim();
  }

  if (isLoading) return <div className="p-6 text-muted-foreground">Carregando…</div>;
  if (!isMaster) return (
    <div className="p-6"><Card><CardContent className="p-6 flex items-center gap-2 text-destructive">
      <ShieldAlert /> Apenas Master Admin pode acessar esta página.
    </CardContent></Card></div>
  );

  return (
    <div className="p-3 sm:p-6 space-y-4 max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Sparkles className="text-primary" /> Social & Trust System
          </h1>
          <p className="text-sm text-muted-foreground">Configure pesos, níveis, recompensas, antifraude e teste tudo no simulador.</p>
        </div>
        <Button
          variant="outline"
          onClick={recalcAllScores}
          disabled={recalcBusy}
          title="Reconstrói total_xp, breakdown e nível de todos os usuários a partir dos eventos registrados"
        >
          {recalcBusy ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RefreshCw className="h-4 w-4 mr-1" />}
          Recalcular scores (auditoria)
        </Button>
      </div>

      <Tabs defaultValue="aura" className="space-y-4">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="aura"><Sparkles className="h-4 w-4 mr-1" /> Aura Social</TabsTrigger>
          <TabsTrigger value="prestige"><Crown className="h-4 w-4 mr-1" /> Prestígio</TabsTrigger>
          <TabsTrigger value="rewards">Recompensas</TabsTrigger>
          <TabsTrigger value="trust"><Shield className="h-4 w-4 mr-1" /> Trust Score</TabsTrigger>
          <TabsTrigger value="sim"><FlaskConical className="h-4 w-4 mr-1" /> Simulador</TabsTrigger>
        </TabsList>

        <TabsContent value="prestige" className="space-y-4">
          <AdminPrestigeTab />
        </TabsContent>

        {/* AURA SOCIAL */}
        <TabsContent value="aura" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Níveis</CardTitle>
              <CardDescription>Defina nome, XP mínimo e cor de glow (HSL).</CardDescription></CardHeader>
            <CardContent className="space-y-3">
              {levels.map((lv) => (
                <div key={lv.level} className="grid grid-cols-2 sm:grid-cols-5 gap-2 items-end p-2 rounded border">
                  <div><Label className="text-xs">Nível</Label><Input type="number" value={lv.level} disabled /></div>
                  <div className="col-span-2 sm:col-span-1"><Label className="text-xs">Nome</Label>
                    <Input value={lv.name} onChange={(e) => setLevels(s => s.map(x => x.level===lv.level ? {...x, name:e.target.value}:x))} /></div>
                  <div><Label className="text-xs">XP mín.</Label>
                    <Input type="number" value={lv.min_xp} onChange={(e)=>setLevels(s=>s.map(x=>x.level===lv.level?{...x,min_xp:Number(e.target.value)}:x))} /></div>
                  <div><Label className="text-xs">Glow HSL</Label>
                    <Input value={lv.glow_color} onChange={(e)=>setLevels(s=>s.map(x=>x.level===lv.level?{...x,glow_color:e.target.value}:x))} /></div>
                  <Button size="sm" disabled={busy} onClick={() => saveLevel(lv)}>
                    <Save className="h-3 w-3 mr-1" /> Salvar
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Regras de pontuação</CardTitle>
              <CardDescription>Pesos, limite diário e cooldown (antifraude).</CardDescription></CardHeader>
            <CardContent className="space-y-2">
              {rules.map((r) => (
                <div key={r.kind} className="grid grid-cols-2 sm:grid-cols-6 gap-2 items-end p-2 rounded border">
                  <div className="col-span-2"><Label className="text-xs">{r.kind}</Label>
                    <div className="text-[11px] text-muted-foreground">{r.description}</div></div>
                  <div><Label className="text-xs">Peso</Label>
                    <Input type="number" value={r.weight} onChange={(e)=>setRules(s=>s.map(x=>x.kind===r.kind?{...x,weight:Number(e.target.value)}:x))} /></div>
                  <div><Label className="text-xs">Cap/dia</Label>
                    <Input type="number" value={r.daily_cap} onChange={(e)=>setRules(s=>s.map(x=>x.kind===r.kind?{...x,daily_cap:Number(e.target.value)}:x))} /></div>
                  <div><Label className="text-xs">Cooldown(s)</Label>
                    <Input type="number" value={r.cooldown_seconds} onChange={(e)=>setRules(s=>s.map(x=>x.kind===r.kind?{...x,cooldown_seconds:Number(e.target.value)}:x))} /></div>
                  <div className="flex items-center gap-2">
                    <Switch checked={r.active} onCheckedChange={(v)=>setRules(s=>s.map(x=>x.kind===r.kind?{...x,active:v}:x))} />
                    <Button size="sm" disabled={busy} onClick={() => saveRule(r)}>
                      {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* RECOMPENSAS */}
        <TabsContent value="rewards" className="space-y-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div><CardTitle>Recompensas dinâmicas</CardTitle>
                <CardDescription>Aplicadas automaticamente ao atingir o nível.</CardDescription></div>
              <Button size="sm" onClick={() => setRewards(s => [...s, {
                id: '', level_min: 2, kind: 'discount_vip', value: 5, label: 'Nova recompensa', description: '', active: true,
              }])}><Plus className="h-3 w-3 mr-1" /> Nova</Button>
            </CardHeader>
            <CardContent className="space-y-2">
              {rewards.map((r, i) => (
                <div key={r.id || `new-${i}`} className="grid grid-cols-2 sm:grid-cols-7 gap-2 items-end p-2 rounded border">
                  <div><Label className="text-xs">Nível mín.</Label>
                    <Input type="number" value={r.level_min} onChange={(e)=>setRewards(s=>s.map((x,j)=>j===i?{...x,level_min:Number(e.target.value)}:x))} /></div>
                  <div><Label className="text-xs">Tipo</Label>
                    <select className="w-full h-9 px-2 rounded border bg-background text-sm"
                      value={r.kind}
                      onChange={(e)=>setRewards(s=>s.map((x,j)=>j===i?{...x,kind:e.target.value}:x))}>
                      {REWARD_KINDS.map(k => <option key={k.v} value={k.v}>{k.l}</option>)}
                    </select></div>
                  <div><Label className="text-xs">Valor</Label>
                    <Input type="number" step="0.01" value={r.value} onChange={(e)=>setRewards(s=>s.map((x,j)=>j===i?{...x,value:Number(e.target.value)}:x))} /></div>
                  <div className="col-span-2"><Label className="text-xs">Label</Label>
                    <Input value={r.label} onChange={(e)=>setRewards(s=>s.map((x,j)=>j===i?{...x,label:e.target.value}:x))} /></div>
                  <div className="flex items-center gap-2">
                    <Switch checked={r.active} onCheckedChange={(v)=>setRewards(s=>s.map((x,j)=>j===i?{...x,active:v}:x))} />
                  </div>
                  <div className="flex gap-1 justify-end">
                    <Button size="sm" disabled={busy} onClick={() => saveReward(r)}><Save className="h-3 w-3" /></Button>
                    {r.id && <Button size="sm" variant="destructive" onClick={() => delReward(r.id)}><Trash2 className="h-3 w-3" /></Button>}
                  </div>
                </div>
              ))}
              {rewards.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma recompensa configurada.</p>}
            </CardContent>
          </Card>
        </TabsContent>

        {/* TRUST */}
        <TabsContent value="trust" className="space-y-3">
          <Card>
            <CardHeader><CardTitle>Trust Score — pesos e tiers</CardTitle>
              <CardDescription>Edite o JSON e clique em salvar. Dica: <code>weights</code> controla pontos; <code>tiers</code> controla excelente/bom/regular.</CardDescription></CardHeader>
            <CardContent className="space-y-3">
              {trust.map(s => (
                <div key={s.key} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">{s.key}</Label>
                    <Button size="sm" disabled={busy} onClick={() => saveTrust(s.key)}>
                      <Save className="h-3 w-3 mr-1" /> Salvar {s.key}
                    </Button>
                  </div>
                  <Textarea
                    rows={6}
                    className="font-mono text-xs"
                    value={trustDraft[s.key] ?? ''}
                    onChange={(e) => setTrustDraft(d => ({ ...d, [s.key]: e.target.value }))}
                  />
                </div>
              ))}
              {trust.length === 0 && <Badge variant="secondary">Nenhuma configuração — rode o SQL inicial.</Badge>}
            </CardContent>
          </Card>
        </TabsContent>

        {/* SIMULADOR */}
        <TabsContent value="sim" className="space-y-3">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><FlaskConical className="h-5 w-5 text-primary" /> Simulador de eventos sociais</CardTitle>
              <CardDescription>
                Escolha um usuário (mock) e dispare eventos para ver o nível e os benefícios atualizando em tempo real.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="flex gap-2 flex-1">
                  <Input
                    placeholder="Buscar por @username ou nome…"
                    value={simQuery}
                    onChange={(e) => setSimQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && searchUsers()}
                  />
                  <Button onClick={searchUsers} variant="secondary"><Search className="h-4 w-4" /></Button>
                </div>
              </div>

              {simResults.length > 0 && (
                <div className="rounded border divide-y max-h-56 overflow-y-auto">
                  {simResults.map(u => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => { setSimUser(u); setSimResults([]); }}
                      className="flex items-center gap-3 p-2 w-full hover:bg-muted/40 text-left"
                    >
                      {u.avatar_url
                        ? <img loading="lazy" decoding="async" src={u.avatar_url} className="h-8 w-8 rounded-full object-cover" alt="" />
                        : <div className="h-8 w-8 rounded-full bg-muted" />}
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate">{u.name || u.username}</div>
                        <div className="text-xs text-muted-foreground truncate">@{u.username} · {u.plan_type}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {simUser && (
                <div className="space-y-3">
                  <div className="p-3 rounded border bg-muted/30 flex items-center gap-3">
                    {simUser.avatar_url
                      ? <img loading="lazy" decoding="async" src={simUser.avatar_url} className="h-10 w-10 rounded-full object-cover" alt="" />
                      : <div className="h-10 w-10 rounded-full bg-muted" />}
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold truncate">{simUser.name || simUser.username}</div>
                      <div className="text-xs text-muted-foreground">
                        @{simUser.username} · {simScore ? `Nv ${simScore.level} (${simScore.xp} XP)` : 'carregando…'}
                      </div>
                    </div>
                    <Button size="sm" variant="outline" onClick={recalcSimUser} disabled={recalcBusy}>
                      {recalcBusy ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <RefreshCw className="h-3 w-3 mr-1" />} Recalcular
                    </Button>
                    <Button size="sm" variant="outline" onClick={resetSimUser}>
                      <RotateCcw className="h-3 w-3 mr-1" /> Zerar
                    </Button>
                  </div>

                  <AuraSocialCard userId={simUser.id} />

                  <div className="grid sm:grid-cols-[1fr_auto] gap-2 items-end">
                    <div>
                      <Label className="text-xs">Evento</Label>
                      <select
                        className="w-full h-9 px-2 rounded border bg-background text-sm"
                        value={simKind}
                        onChange={(e) => setSimKind(e.target.value)}
                      >
                        {SIM_EVENTS.map(e => <option key={e.v} value={e.v}>{e.l}</option>)}
                      </select>
                    </div>
                    <Button onClick={fireEvent} disabled={simBusy}>
                      {simBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4 mr-1" />}
                      Disparar
                    </Button>
                  </div>

                  {simScore && simScore.perks.length > 0 && (
                    <div className="rounded border p-3 space-y-1">
                      <div className="text-xs font-semibold text-muted-foreground">Benefícios ativos</div>
                      {simScore.perks.map((p, i) => (
                        <div key={i} className="text-xs flex justify-between">
                          <span>{p.label}</span>
                          <span className="text-primary">
                            {['discount_sub','discount_vip','discount_fee'].includes(p.kind) && `${p.value}%`}
                            {['boost_aura','boost_radar'].includes(p.kind) && `×${p.value}`}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {!simUser && (
                <p className="text-sm text-muted-foreground">Busque um usuário acima para começar a simular.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

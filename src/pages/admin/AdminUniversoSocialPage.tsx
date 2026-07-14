import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseExternal';
import { useIsMasterAdmin } from '@/hooks/useUserRoles';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import {
  Loader2, Save, Plus, RefreshCw, ShieldAlert, Trash2, Sparkles, Users,
  Activity, Crown, Zap, BarChart3, Calendar, Rocket, Radio, Moon, Heart, Magnet, Fingerprint, Eye,
  MapPin, Check, X, Brain, Coins, Compass, Gift,
} from 'lucide-react';
import { useSettingValue, useUpdateSetting } from '@/hooks/useSystemSettings';
import { useSocialAnalytics, useFeedVivo, useSocialSeason, useSeasonTop, SOCIAL_CORE_DEFAULTS } from '@/social-universe';
import { usePrestigeLevels } from '@/hooks/usePrestige';
import AdminPulseTab from './AdminPulseTab';

interface Room {
  slug: string; name: string; theme: string | null; hue: number; emoji: string | null;
  active: boolean; vip_only: boolean;
  hour_from: number | null; hour_to: number | null;
  min_aura_level: number; min_social_score: number; min_prestige_xp: number;
  required_plan: string | null; requires_kyc: boolean; couple_only: boolean;
  sort_order: number; glow_intensity: number; description: string | null;
  mood: string | null; rising_threshold: number;
}

const EMPTY: Room = {
  slug: '', name: '', theme: '', hue: 280, emoji: '✨',
  active: true, vip_only: false, hour_from: null, hour_to: null,
  min_aura_level: 0, min_social_score: 0, min_prestige_xp: 0,
  required_plan: null, requires_kyc: false, couple_only: false,
  sort_order: 0, glow_intensity: 50, description: '',
  mood: null, rising_threshold: 70,
};

interface MetricRow {
  slug: string; name: string; emoji: string | null;
  energy: number; mood: string | null; rising: boolean;
  presence: number; reactions_60s: number; reputation: number; rising_threshold: number;
}

export default function AdminUniversoSocialPage() {
  const { data: isMaster, isLoading: roleLoading } = useIsMasterAdmin();

  if (roleLoading) return <div className="p-6"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  if (!isMaster) {
    return (
      <div className="p-6">
        <Card><CardContent className="flex items-center gap-2 py-6 text-sm">
          <ShieldAlert className="h-4 w-4 text-amber-500" /> Acesso restrito ao Master Admin.
        </CardContent></Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold">
          <Sparkles className="h-5 w-5 text-fuchsia-400" /> Universo Social
        </h1>
        <p className="text-xs text-muted-foreground">
          Painel master · realtime · score · prestígio · salas · feed vivo · métricas · eventos · boosts
        </p>
      </div>

      <Tabs defaultValue="identity" className="w-full">
        <TabsList className="flex flex-wrap h-auto gap-1 bg-card/40">
          <TabsTrigger value="identity"><Fingerprint className="h-3.5 w-3.5 mr-1" />Identidade</TabsTrigger>
          <TabsTrigger value="realtime"><Radio className="h-3.5 w-3.5 mr-1" />Realtime</TabsTrigger>
          <TabsTrigger value="score"><Zap className="h-3.5 w-3.5 mr-1" />Score</TabsTrigger>
          <TabsTrigger value="prestige"><Crown className="h-3.5 w-3.5 mr-1" />Prestígio</TabsTrigger>
          <TabsTrigger value="rooms"><Users className="h-3.5 w-3.5 mr-1" />Salas</TabsTrigger>
          <TabsTrigger value="feed"><Activity className="h-3.5 w-3.5 mr-1" />Feed Vivo</TabsTrigger>
          <TabsTrigger value="metrics"><BarChart3 className="h-3.5 w-3.5 mr-1" />Métricas</TabsTrigger>
          <TabsTrigger value="nights"><Moon className="h-3.5 w-3.5 mr-1" />Noites</TabsTrigger>
          <TabsTrigger value="seasons"><Calendar className="h-3.5 w-3.5 mr-1" />Temporadas</TabsTrigger>
          <TabsTrigger value="destiny"><Heart className="h-3.5 w-3.5 mr-1" />Destino</TabsTrigger>
          <TabsTrigger value="boosts"><Magnet className="h-3.5 w-3.5 mr-1" />Magnetismo</TabsTrigger>
          <TabsTrigger value="presence"><Eye className="h-3.5 w-3.5 mr-1" />Presença</TabsTrigger>
          <TabsTrigger value="experiences"><MapPin className="h-3.5 w-3.5 mr-1" />Experiências</TabsTrigger>
          <TabsTrigger value="ai"><Brain className="h-3.5 w-3.5 mr-1" />IA Social</TabsTrigger>
          <TabsTrigger value="economy"><Coins className="h-3.5 w-3.5 mr-1" />Economia</TabsTrigger>
          <TabsTrigger value="initial"><Compass className="h-3.5 w-3.5 mr-1" />Início</TabsTrigger>
          <TabsTrigger value="affiliate"><Coins className="h-3.5 w-3.5 mr-1" />Ganhe Indicando</TabsTrigger>
          <TabsTrigger value="pulse"><Sparkles className="h-3.5 w-3.5 mr-1" />Pulso de Aura</TabsTrigger>
          <TabsTrigger value="discovery"><Gift className="h-3.5 w-3.5 mr-1" />Descoberta</TabsTrigger>
        </TabsList>

        <TabsContent value="identity" className="mt-4"><IdentityTab /></TabsContent>
        <TabsContent value="realtime" className="mt-4"><RealtimeTab /></TabsContent>
        <TabsContent value="score" className="mt-4"><ScoreTab /></TabsContent>
        <TabsContent value="prestige" className="mt-4"><PrestigeTab /></TabsContent>
        <TabsContent value="rooms" className="mt-4"><RoomsTab /></TabsContent>
        <TabsContent value="feed" className="mt-4"><FeedTab /></TabsContent>
        <TabsContent value="metrics" className="mt-4"><MetricsTab /></TabsContent>
        <TabsContent value="nights" className="mt-4"><NightsTab /></TabsContent>
        <TabsContent value="seasons" className="mt-4"><SeasonsTab /></TabsContent>
        <TabsContent value="destiny" className="mt-4"><DestinyTab /></TabsContent>
        <TabsContent value="boosts" className="mt-4"><MagnetismTab /></TabsContent>
        <TabsContent value="presence" className="mt-4"><PresenceTab /></TabsContent>
        <TabsContent value="experiences" className="mt-4"><ExperiencesTab /></TabsContent>
        <TabsContent value="ai" className="mt-4"><SocialAiTab /></TabsContent>
        <TabsContent value="economy" className="mt-4"><EconomyTab /></TabsContent>
        <TabsContent value="initial" className="mt-4"><InitialExperienceTab /></TabsContent>
        <TabsContent value="affiliate" className="mt-4"><AffiliateProgramTab /></TabsContent>
        <TabsContent value="pulse" className="mt-4"><AdminPulseTab /></TabsContent>
        <TabsContent value="discovery" className="mt-4"><DiscoveryTab /></TabsContent>
      </Tabs>
    </div>
  );
}

// ============================================================
// Realtime tab — visão rápida do online + canais ativos
// ============================================================
function RealtimeTab() {
  const { data, isLoading, refetch } = useSocialAnalytics('24h');
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold flex items-center gap-2"><Radio className="h-4 w-4" /> Estado realtime</h2>
        <Button size="sm" variant="outline" onClick={() => refetch()}><RefreshCw className="mr-1 h-3.5 w-3.5" />Atualizar</Button>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <StatCard label="Online agora" value={isLoading ? '…' : (data?.online_now ?? 0)} hint="profiles.is_online (excluindo seeds)" />
        <StatCard label="Salas ativas" value={isLoading ? '…' : (data?.rooms_active ?? 0)} hint="aura_rooms_metrics_admin > 0" />
        <StatCard label="Matches 24h" value={isLoading ? '…' : (data?.matches_24h ?? '—')} hint="matches.created_at >= 24h" />
      </div>
      <Card><CardContent className="text-xs text-muted-foreground py-3">
        Canal único <code className="bg-muted px-1 rounded">social:&#123;userId&#125;</code> ativo via SocialUniverseProvider.
        Sub-eventos: matches, follows, social_notifications.
      </CardContent></Card>
    </div>
  );
}

// ============================================================
// Score tab — distribuição de Aura Social
// ============================================================
function ScoreTab() {
  const [rows, setRows] = useState<{ level: number; level_name: string; count: number }[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { data } = await (supabase as any).rpc('social_score_distribution');
        setRows(data || []);
      } catch {
        setRows([]);
      }
      setLoading(false);
    })();
  }, []);
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold flex items-center gap-2"><Zap className="h-4 w-4" /> Distribuição Aura Social</h2>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : rows.length === 0 ? (
        <Card><CardContent className="py-6 text-xs text-muted-foreground">
          RPC <code>social_score_distribution</code> não disponível ainda. Será adicionado na Onda C.
        </CardContent></Card>
      ) : (
        <Card><CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-muted-foreground"><tr>
              <th className="px-3 py-2 text-left">Nível</th><th className="px-3 py-2 text-left">Nome</th><th className="px-3 py-2 text-right">Usuários</th>
            </tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.level} className="border-t border-white/5">
                <td className="px-3 py-1.5">{r.level}</td><td className="px-3 py-1.5">{r.level_name}</td><td className="px-3 py-1.5 text-right">{r.count}</td>
              </tr>
            ))}</tbody>
          </table>
        </CardContent></Card>
      )}
    </div>
  );
}

// ============================================================
// Prestige tab — tiers configurados
// ============================================================
function PrestigeTab() {
  const { levels, loading } = usePrestigeLevels();
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold flex items-center gap-2"><Crown className="h-4 w-4" /> Tiers de Prestígio</h2>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : (
        <div className="grid gap-2 md:grid-cols-2">
          {levels.map((l) => (
            <Card key={l.id} className="border-white/10">
              <CardContent className="flex items-center justify-between py-3">
                <div>
                  <div className="font-semibold" style={{ color: `hsl(${l.glow_color})` }}>
                    #{l.rank} · {l.name}
                  </div>
                  <div className="text-[11px] text-muted-foreground">XP mín: {l.min_xp} · {l.is_active ? 'ativo' : 'inativo'}</div>
                </div>
                <Badge variant="outline">{l.badge_icon}</Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Feed tab — placeholder para feed vivo unificado
// ============================================================
function FeedTab() {
  const { data: items = [], isLoading, refetch } = useFeedVivo(20);
  const [pulsing, setPulsing] = useState(false);
  const handlePulse = async () => {
    setPulsing(true);
    try {
      const { data, error } = await (supabase as any).rpc('social_universe_emit_pulse');
      if (error) throw error;
      toast.success(`Pulse disparado · ${data?.inserted ?? 0} eventos novos`);
      await refetch();
    } catch (e: any) {
      toast.error(`Pulse falhou: ${e?.message || 'erro'}`);
    } finally {
      setPulsing(false);
    }
  };
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold flex items-center gap-2"><Activity className="h-4 w-4" /> Feed Vivo (últimos eventos)</h2>
        <div className="flex gap-2">
          <Button size="sm" variant="default" onClick={handlePulse} disabled={pulsing}>
            {pulsing ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Zap className="mr-1 h-3.5 w-3.5" />}
            Disparar pulse
          </Button>
          <Button size="sm" variant="outline" onClick={() => refetch()}><RefreshCw className="mr-1 h-3.5 w-3.5" />Atualizar</Button>
        </div>
      </div>
      {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : items.length === 0 ? (
        <Card><CardContent className="py-6 text-xs text-muted-foreground">
          Nenhum evento ativo. Eventos vêm de noites, tempestades, milestones de temporada, conexões raras e experiências reais.
        </CardContent></Card>
      ) : (
        <div className="grid gap-2 md:grid-cols-2">
          {items.map((it) => (
            <Card key={it.id} className="border-white/10">
              <CardContent className="flex items-center gap-2 py-2 text-xs">
                <span aria-hidden>{it.emoji}</span>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold uppercase tracking-wider text-[10px] text-muted-foreground">{it.kind}</div>
                  <div className="truncate">{(it.payload?.title as string) || (it.payload?.message as string) || '—'}</div>
                </div>
                {it.pinned && <Badge variant="outline" className="text-[9px]">pin</Badge>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Metrics tab — agregação leve via useSocialAnalytics
// ============================================================
function MetricsTab() {
  const day = useSocialAnalytics('24h');
  const week = useSocialAnalytics('7d');
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold flex items-center gap-2"><BarChart3 className="h-4 w-4" /> Métricas do Universo</h2>
      <div className="grid gap-3 md:grid-cols-2">
        <Card><CardHeader className="pb-1"><CardTitle className="text-xs">Últimas 24h</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-3 gap-2 text-center text-xs">
            <Stat v={day.data?.online_now} l="Online" />
            <Stat v={day.data?.rooms_active} l="Salas" />
            <Stat v={day.data?.matches_24h} l="Matches" />
          </CardContent>
        </Card>
        <Card><CardHeader className="pb-1"><CardTitle className="text-xs">Últimos 7d</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-3 gap-2 text-center text-xs">
            <Stat v={week.data?.online_now} l="Online" />
            <Stat v={week.data?.rooms_active} l="Salas" />
            <Stat v={week.data?.matches_24h} l="Matches" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ============================================================
// Rooms tab — conteúdo original preservado
// ============================================================
function RoomsTab() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [metrics, setMetrics] = useState<MetricRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Room | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await (supabase as any)
      .from('oculto_aura_rooms').select('*').order('sort_order', { ascending: true });
    setRooms((data as Room[]) || []);
    const { data: list } = await (supabase as any).rpc('aura_rooms_list');
    const map: Record<string, number> = {};
    (list || []).forEach((r: any) => { map[r.slug] = r.active_count; });
    setCounts(map);
    const { data: m } = await (supabase as any).rpc('aura_rooms_metrics_admin');
    setMetrics((m as MetricRow[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!editing?.slug || !editing?.name) { toast.error('Slug e nome são obrigatórios'); return; }
    setSaving(true);
    const { error } = await (supabase as any).rpc('aura_room_upsert', { p_payload: editing });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Sala salva');
    setEditing(null);
    load();
  };

  const purgePresence = async (slug: string) => {
    const { error } = await (supabase as any)
      .from('oculto_aura_room_presence').delete().eq('room_slug', slug);
    if (error) toast.error(error.message); else { toast.success('Presença resetada'); load(); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" size="sm" onClick={load}><RefreshCw className="mr-1 h-3.5 w-3.5" /> Atualizar</Button>
        <Button size="sm" onClick={() => setEditing({ ...EMPTY })}><Plus className="mr-1 h-3.5 w-3.5" /> Nova sala</Button>
      </div>

      {!loading && metrics.length > 0 && (
        <Card className="border-fuchsia-500/20 bg-card/40">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Energia & Reputação ao vivo</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full text-[11px]">
              <thead className="text-muted-foreground"><tr>
                <th className="px-3 py-1 text-left">Sala</th><th className="px-2">Energia</th>
                <th className="px-2">Mood</th><th className="px-2">Alta</th>
                <th className="px-2">Presentes</th><th className="px-2">React/60s</th>
                <th className="px-2">Reputação</th><th className="px-2">Limiar</th>
              </tr></thead>
              <tbody>
                {metrics.map((m) => (
                  <tr key={m.slug} className="border-t border-white/5">
                    <td className="px-3 py-1">{m.emoji} {m.name}</td>
                    <td className="px-2 text-center font-semibold">{m.energy}</td>
                    <td className="px-2 text-center">{m.mood ?? '—'}</td>
                    <td className="px-2 text-center">{m.rising ? '🔥' : '—'}</td>
                    <td className="px-2 text-center">{m.presence}</td>
                    <td className="px-2 text-center">{m.reactions_60s}</td>
                    <td className="px-2 text-center">{m.reputation}</td>
                    <td className="px-2 text-center">{m.rising_threshold}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin" /></div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {rooms.map((r) => (
            <Card key={r.slug} className="border-white/10 bg-card/50">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between text-base">
                  <span className="flex items-center gap-2" style={{ color: `hsl(${r.hue},80%,75%)` }}>
                    {r.emoji} {r.name}
                  </span>
                  <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Users className="h-3 w-3" /> {counts[r.slug] ?? 0}
                  </span>
                </CardTitle>
                <CardDescription className="text-[11px]">{r.description || r.theme || r.slug}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap items-center gap-1.5">
                <Badge variant={r.active ? 'default' : 'secondary'}>{r.active ? 'ativa' : 'inativa'}</Badge>
                {r.vip_only && <Badge className="bg-amber-500/20 text-amber-200">VIP</Badge>}
                {r.required_plan && <Badge variant="outline">plano: {r.required_plan}</Badge>}
                {r.couple_only && <Badge variant="outline">casais</Badge>}
                {r.requires_kyc && <Badge variant="outline">KYC</Badge>}
                {r.min_aura_level > 0 && <Badge variant="outline">Aura ≥ {r.min_aura_level}</Badge>}
                {r.min_social_score > 0 && <Badge variant="outline">Score ≥ {r.min_social_score}</Badge>}
                {r.min_prestige_xp > 0 && <Badge variant="outline">XP ≥ {r.min_prestige_xp}</Badge>}
                {r.hour_from !== null && <Badge variant="outline">{r.hour_from}h–{r.hour_to}h</Badge>}
                <div className="ml-auto flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => setEditing({ ...r })}>Editar</Button>
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => purgePresence(r.slug)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {editing && (
        <Card className="border-fuchsia-500/30 bg-card/80">
          <CardHeader>
            <CardTitle className="text-base">{editing.slug ? `Editar: ${editing.slug}` : 'Nova sala'}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            <Field label="Slug"><Input value={editing.slug} onChange={(e) => setEditing({ ...editing, slug: e.target.value.toLowerCase().replace(/\s+/g, '-') })} disabled={!!rooms.find((r) => r.slug === editing.slug)} /></Field>
            <Field label="Nome"><Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></Field>
            <Field label="Emoji"><Input value={editing.emoji ?? ''} onChange={(e) => setEditing({ ...editing, emoji: e.target.value })} /></Field>
            <Field label="Hue (0-360)"><Input type="number" value={editing.hue} onChange={(e) => setEditing({ ...editing, hue: +e.target.value })} /></Field>
            <Field label="Descrição" full><Textarea value={editing.description ?? ''} onChange={(e) => setEditing({ ...editing, description: e.target.value })} /></Field>
            <Field label="Aura level mín."><Input type="number" value={editing.min_aura_level} onChange={(e) => setEditing({ ...editing, min_aura_level: +e.target.value })} /></Field>
            <Field label="Social score mín."><Input type="number" value={editing.min_social_score} onChange={(e) => setEditing({ ...editing, min_social_score: +e.target.value })} /></Field>
            <Field label="Prestígio XP mín."><Input type="number" value={editing.min_prestige_xp} onChange={(e) => setEditing({ ...editing, min_prestige_xp: +e.target.value })} /></Field>
            <Field label="Plano necessário (free/premium/vip)"><Input value={editing.required_plan ?? ''} onChange={(e) => setEditing({ ...editing, required_plan: e.target.value || null })} /></Field>
            <Field label="Hora início (0-23)"><Input type="number" value={editing.hour_from ?? ''} onChange={(e) => setEditing({ ...editing, hour_from: e.target.value === '' ? null : +e.target.value })} /></Field>
            <Field label="Hora fim (0-23)"><Input type="number" value={editing.hour_to ?? ''} onChange={(e) => setEditing({ ...editing, hour_to: e.target.value === '' ? null : +e.target.value })} /></Field>
            <Field label="Glow (0-100)"><Input type="number" value={editing.glow_intensity} onChange={(e) => setEditing({ ...editing, glow_intensity: +e.target.value })} /></Field>
            <Field label="Ordem"><Input type="number" value={editing.sort_order} onChange={(e) => setEditing({ ...editing, sort_order: +e.target.value })} /></Field>
            <Field label="Limiar de ascensão (0-100)"><Input type="number" value={editing.rising_threshold} onChange={(e) => setEditing({ ...editing, rising_threshold: +e.target.value })} /></Field>
            <Field label="Mood manual (deixe vazio para auto)"><Input value={editing.mood ?? ''} onChange={(e) => setEditing({ ...editing, mood: e.target.value || null })} placeholder="calmo|popular|fervendo|misterioso|elite" /></Field>
            <Toggle label="Ativa" v={editing.active} onChange={(v) => setEditing({ ...editing, active: v })} />
            <Toggle label="VIP only" v={editing.vip_only} onChange={(v) => setEditing({ ...editing, vip_only: v })} />
            <Toggle label="KYC obrigatório" v={editing.requires_kyc} onChange={(v) => setEditing({ ...editing, requires_kyc: v })} />
            <Toggle label="Apenas casais" v={editing.couple_only} onChange={(v) => setEditing({ ...editing, couple_only: v })} />

            <div className="md:col-span-2 flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setEditing(null)}>Cancelar</Button>
              <Button onClick={save} disabled={saving}>
                {saving ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1 h-3.5 w-3.5" />}
                Salvar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ============================================================
// Helpers
// ============================================================
function PlaceholderTab({ title, desc }: { title: string; desc: string }) {
  return (
    <Card><CardContent className="py-8 text-center space-y-2">
      <Sparkles className="h-6 w-6 mx-auto text-fuchsia-400" />
      <div className="font-semibold text-sm">{title}</div>
      <div className="text-xs text-muted-foreground max-w-md mx-auto">{desc}</div>
    </CardContent></Card>
  );
}

function StatCard({ label, value, hint }: { label: string; value: any; hint?: string }) {
  return (
    <Card><CardContent className="py-4">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-2xl font-bold">{value}</div>
      {hint && <div className="text-[10px] text-muted-foreground mt-1">{hint}</div>}
    </CardContent></Card>
  );
}

function Stat({ v, l }: { v: any; l: string }) {
  return (
    <div>
      <div className="text-lg font-bold">{v ?? '—'}</div>
      <div className="text-[10px] uppercase text-muted-foreground">{l}</div>
    </div>
  );
}

function Field({ label, full, children }: { label: string; full?: boolean; children: React.ReactNode }) {
  return (
    <div className={full ? 'md:col-span-2 space-y-1' : 'space-y-1'}>
      <Label className="text-[11px]">{label}</Label>
      {children}
    </div>
  );
}
function Toggle({ label, v, onChange }: { label: string; v: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-white/10 px-3 py-2">
      <Label className="text-[12px]">{label}</Label>
      <Switch checked={v} onCheckedChange={onChange} />
    </div>
  );
}

// ============================================================
// Onda C — Noites Ocultas (trigger manual)
// ============================================================
function NightsTab() {
  const [kind, setKind] = useState<'madrugada_secreta' | 'eclipse_social' | 'tempestade_aura' | 'noite_vip'>('madrugada_secreta');
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [minutes, setMinutes] = useState(60);
  const [vipOnly, setVipOnly] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleTrigger = async () => {
    if (!title.trim()) { toast.error('Defina um título'); return; }
    setBusy(true);
    try {
      const { error } = await (supabase as any).rpc('noite_oculta_trigger', {
        p_kind: kind, p_title: title, p_minutes: minutes,
        p_subtitle: subtitle || null, p_vip_only: vipOnly,
        p_intensity: 2, p_emoji: '🌙', p_hue: 280,
      });
      if (error) throw error;
      toast.success('Noite Oculta disparada');
      setTitle(''); setSubtitle('');
    } catch (e: any) { toast.error(e?.message || 'Falhou'); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold flex items-center gap-2"><Moon className="h-4 w-4" /> Disparar Noite Oculta</h2>
      <Card><CardContent className="grid gap-2 py-3 md:grid-cols-2">
        <div>
          <Label className="text-xs">Tipo</Label>
          <select value={kind} onChange={(e) => setKind(e.target.value as any)} className="mt-1 w-full rounded-md bg-card/40 border border-white/10 px-2 py-1.5 text-xs">
            <option value="madrugada_secreta">Madrugada Secreta</option>
            <option value="eclipse_social">Eclipse Social</option>
            <option value="tempestade_aura">Tempestade de Aura</option>
            <option value="noite_vip">Noite VIP</option>
          </select>
        </div>
        <div>
          <Label className="text-xs">Duração (min)</Label>
          <Input type="number" min={5} max={720} value={minutes} onChange={(e) => setMinutes(Number(e.target.value) || 60)} className="mt-1" />
        </div>
        <div className="md:col-span-2">
          <Label className="text-xs">Título</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: Madrugada Secreta · 02h" className="mt-1" />
        </div>
        <div className="md:col-span-2">
          <Label className="text-xs">Subtítulo</Label>
          <Input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} placeholder="Ex.: Conexões raras a noite toda" className="mt-1" />
        </div>
        <div className="flex items-center gap-2">
          <Switch checked={vipOnly} onCheckedChange={setVipOnly} id="vip-only" />
          <Label htmlFor="vip-only" className="text-xs">Apenas VIP</Label>
        </div>
        <div className="md:col-span-2">
          <Button onClick={handleTrigger} disabled={busy} size="sm">
            {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Plus className="mr-1 h-3.5 w-3.5" />}
            Disparar
          </Button>
        </div>
      </CardContent></Card>
    </div>
  );
}

// ============================================================
// Onda C — Temporadas (visão da temporada ativa + top 20)
// ============================================================
function SeasonsTab() {
  const { season } = useSocialSeason();
  const { data: top = [] } = useSeasonTop(20);

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold flex items-center gap-2"><Calendar className="h-4 w-4" /> Temporada ativa</h2>
      {!season ? (
        <Card><CardContent className="py-6 text-xs text-muted-foreground">
          Nenhuma temporada ativa. Insira uma linha em <code>oculto_seasons</code> com <code>active=true</code> e janela <code>starts_at/ends_at</code>.
        </CardContent></Card>
      ) : (
        <Card><CardContent className="py-3 space-y-2">
          <div className="font-semibold flex items-center gap-2">{season.emoji} {season.title}</div>
          <div className="text-xs text-muted-foreground">{season.narrative}</div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
            <div className="h-full bg-fuchsia-400" style={{ width: `${season.progress_pct}%` }} />
          </div>
          <div className="text-[11px] text-muted-foreground">Progresso: {season.progress_pct}%</div>
        </CardContent></Card>
      )}
      <h3 className="text-xs font-semibold mt-2">Top 20</h3>
      <Card><CardContent className="p-0 overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-muted-foreground"><tr>
            <th className="px-3 py-2 text-left">#</th><th className="px-3 py-2 text-left">Usuário</th><th className="px-3 py-2 text-right">XP</th>
          </tr></thead>
          <tbody>
            {top.length === 0 ? (
              <tr><td colSpan={3} className="px-3 py-3 text-center text-muted-foreground">Sem entradas ainda</td></tr>
            ) : top.map((r) => (
              <tr key={r.user_id} className="border-t border-white/5">
                <td className="px-3 py-1.5">{r.rank}</td>
                <td className="px-3 py-1.5">{r.display_name || r.username || r.user_id.slice(0, 8)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{r.xp}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent></Card>
    </div>
  );
}

// ============================================================
// Onda C — Destino Social (distribuição por raridade)
// ============================================================
function DestinyTab() {
  const [stats, setStats] = useState<{ rarity: string; count: number }[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { data } = await (supabase as any)
          .from('oculto_destiny_links')
          .select('rarity');
        const map = new Map<string, number>();
        (data || []).forEach((r: any) => map.set(r.rarity, (map.get(r.rarity) || 0) + 1));
        setStats(Array.from(map.entries()).map(([rarity, count]) => ({ rarity, count })));
      } catch { setStats([]); }
      setLoading(false);
    })();
  }, []);
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold flex items-center gap-2"><Heart className="h-4 w-4" /> Destino social — distribuição</h2>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : (
        <div className="grid gap-2 md:grid-cols-5">
          {['common','uncommon','rare','epic','mythic'].map((rar) => {
            const row = stats.find((s) => s.rarity === rar);
            return (
              <Card key={rar}><CardContent className="py-3 text-center">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{rar}</div>
                <div className="text-xl font-bold">{row?.count ?? 0}</div>
              </CardContent></Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Onda C — Magnetismo (overview)
// ============================================================
function MagnetismTab() {
  const [active, setActive] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { count } = await (supabase as any)
          .from('oculto_magnetic_boosts')
          .select('*', { count: 'exact', head: true })
          .gt('ends_at', new Date().toISOString());
        setActive(count ?? 0);
      } catch { setActive(0); }
      setLoading(false);
    })();
  }, []);
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold flex items-center gap-2"><Magnet className="h-4 w-4" /> Energia Magnética</h2>
      <Card><CardContent className="py-4 text-center">
        <div className="text-xs text-muted-foreground">Boosts ativos agora</div>
        <div className="text-3xl font-bold">{loading ? '…' : active}</div>
      </CardContent></Card>
      <Card><CardContent className="py-3 text-xs text-muted-foreground">
        Boost elegante: max 120 min/sessão, multiplicador 1.0–3.0. Aumenta descoberta, presença e prioridade no Aura Match. Sem leilão de visibilidade — sem pay-to-win.
      </CardContent></Card>
    </div>
  );
}

// ============================================================
// Prioridade 1 — Identidade Social (Social Core Engine)
// ============================================================
function IdentityTab() {
  const [cfg, setCfg] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await (supabase as any)
        .from('oculto_social_core_config')
        .select('*')
        .eq('id', 'singleton')
        .maybeSingle();
      setCfg(data ?? { weights: SOCIAL_CORE_DEFAULTS.weights, thresholds: SOCIAL_CORE_DEFAULTS.thresholds, multipliers: SOCIAL_CORE_DEFAULTS.multipliers });
    } catch {
      setCfg({ weights: SOCIAL_CORE_DEFAULTS.weights, thresholds: SOCIAL_CORE_DEFAULTS.thresholds, multipliers: SOCIAL_CORE_DEFAULTS.multipliers });
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!cfg) return;
    setSaving(true);
    try {
      const { error } = await (supabase as any).rpc('social_core_config_update', {
        p_weights: cfg.weights,
        p_thresholds: cfg.thresholds,
        p_multipliers: cfg.multipliers,
      });
      if (error) throw error;
      toast.success('Configuração da Identidade Social salva');
    } catch (e: any) {
      toast.error(e?.message || 'Falha ao salvar');
    }
    setSaving(false);
  };

  if (loading || !cfg) return <Loader2 className="h-4 w-4 animate-spin" />;

  const setW = (k: string, v: string) => setCfg({ ...cfg, weights: { ...cfg.weights, [k]: parseFloat(v) || 0 } });
  const setT = (k: string, v: string) => setCfg({ ...cfg, thresholds: { ...cfg.thresholds, [k]: parseInt(v) || 0 } });
  const setM = (k: string, v: string) => setCfg({ ...cfg, multipliers: { ...cfg.multipliers, [k]: parseFloat(v) || 1 } });

  const W = cfg.weights || {};
  const T = cfg.thresholds || {};
  const M = cfg.multipliers || {};

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-fuchsia-400" /> Identidade Social — fonte única
          </h2>
          <p className="text-xs text-muted-foreground mt-1 max-w-xl">
            Pesos, limites e multiplicadores que governam o Social Core Engine
            (aura, prestígio, trust, popularidade, magnetismo). Aplica-se a Aura
            Match, Feed Vivo, Salas e descoberta. RPC central: <code>social_core_identity_get</code>.
          </p>
        </div>
        <Button size="sm" onClick={save} disabled={saving}>
          {saving ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1" />}
          Salvar
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">Pesos (somam ~1.00)</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {(['aura','prestige','trust','popularity','magnetism'] as const).map((k) => (
            <div key={k} className="space-y-1">
              <Label className="text-[11px] capitalize">{k}</Label>
              <Input type="number" step="0.05" min="0" max="1" value={W[k] ?? 0} onChange={(e) => setW(k, e.target.value)} />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">Limiares antifraude / acesso</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="space-y-1">
            <Label className="text-[11px]">Score mínimo p/ aparecer no match</Label>
            <Input type="number" value={T.min_score_to_match ?? 0} onChange={(e) => setT('min_score_to_match', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Trust mínimo p/ enviar mensagem</Label>
            <Input type="number" value={T.min_trust_to_message ?? 0} onChange={(e) => setT('min_trust_to_message', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Score de shadowban</Label>
            <Input type="number" value={T.shadowban_score ?? -30} onChange={(e) => setT('shadowban_score', e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">Multiplicadores Premium / VIP</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-[11px]">Premium</Label>
            <Input type="number" step="0.05" value={M.premium ?? 1.15} onChange={(e) => setM('premium', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">VIP</Label>
            <Input type="number" step="0.05" value={M.vip ?? 1.30} onChange={(e) => setM('vip', e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="py-3 text-[11px] text-muted-foreground space-y-1">
          <div>• Componentes consomem via <code>useSocialCore</code> (<code>@/social-universe</code>) — substitui chamadas paralelas dos hooks legados.</div>
          <div>• Cards individuais (Aura/Prestige/Trust) seguem funcionando — sem quebra.</div>
          <div>• Magnetismo lê <code>oculto_magnetic_boosts</code>, raridade lê <code>oculto_destiny_links</code>, popularidade agrega <code>oculto_aura_attentions</code> + <code>followers</code>.</div>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================
// PresenceTab — sinais invisíveis (Prioridade 2)
// ============================================================
function PresenceTab() {
  const [cfg, setCfg] = useState<any>(null);
  const [stats, setStats] = useState<{ total: number; per_type: any[] } | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const { data } = await (supabase as any).from('oculto_presence_config').select('*').eq('id','singleton').maybeSingle();
    setCfg(data ?? { intensity: 1.0, cooldown_minutes: 30, cap_hour: 4, cap_day: 12, premium_only_hints: false });
    const { count } = await (supabase as any)
      .from('oculto_presence_signals').select('*', { count: 'exact', head: true })
      .gte('created_at', new Date(Date.now() - 86_400_000).toISOString());
    setStats({ total: count ?? 0, per_type: [] });
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!cfg) return;
    setSaving(true);
    try {
      const patch = {
        intensity: Number(cfg.intensity),
        cooldown_minutes: Number(cfg.cooldown_minutes),
        cap_hour: Number(cfg.cap_hour),
        cap_day: Number(cfg.cap_day),
        premium_only_hints: !!cfg.premium_only_hints,
      };
      const { error } = await (supabase as any).rpc('presence_config_update', { p_patch: patch });
      if (error) throw error;
      toast.success('Configuração de presença salva');
    } catch (e: any) {
      toast.error(e?.message ?? 'Falha ao salvar');
    } finally { setSaving(false); }
  };

  if (!cfg) return <div className="text-xs text-muted-foreground p-4">Carregando…</div>;
  return (
    <div className="space-y-3">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2"><Eye className="h-4 w-4 text-emerald-300" />Presença Invisível</CardTitle>
          <CardDescription className="text-xs">Intensidade global, cooldowns e caps anti-spam dos sinais anonimizados.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Field label="Intensidade (0–2)"><Input type="number" step="0.1" value={cfg.intensity} onChange={(e) => setCfg({ ...cfg, intensity: e.target.value })} /></Field>
          <Field label="Cooldown (min/par)"><Input type="number" value={cfg.cooldown_minutes} onChange={(e) => setCfg({ ...cfg, cooldown_minutes: e.target.value })} /></Field>
          <Field label="Cap por hora"><Input type="number" value={cfg.cap_hour} onChange={(e) => setCfg({ ...cfg, cap_hour: e.target.value })} /></Field>
          <Field label="Cap por dia"><Input type="number" value={cfg.cap_day} onChange={(e) => setCfg({ ...cfg, cap_day: e.target.value })} /></Field>
          <Field label="Hints somente Premium"><Toggle label="" v={!!cfg.premium_only_hints} onChange={(v) => setCfg({ ...cfg, premium_only_hints: v })} /></Field>
          <div className="flex items-end"><Button size="sm" onClick={save} disabled={saving}>{saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1"/> : <Save className="h-3.5 w-3.5 mr-1"/>}Salvar</Button></div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="py-3 text-[12px] text-muted-foreground">Sinais nas últimas 24h: <strong className="text-foreground">{stats?.total ?? 0}</strong></CardContent>
      </Card>
    </div>
  );
}

// ============================================================
// ExperiencesTab — moderação master das Experiências Reais (Prioridade 3)
// ============================================================
interface AdminExperience {
  id: string; host_user: string; kind: string; title: string; description: string | null;
  city: string | null; state: string | null; approximate_region: string | null;
  starts_at: string; ends_at: string | null;
  capacity: number; max_participants: number | null;
  vip_only: boolean; requires_kyc: boolean;
  visibility: string; approval_required: boolean;
  min_social_score: number; min_trust_score: number; min_aura_level: number;
  status: string; rejection_reason: string | null; created_at: string;
  going_count: number; pending_count: number;
}
function ExperiencesTab() {
  const [filter, setFilter] = useState<string>('pending_moderation');
  const [items, setItems] = useState<AdminExperience[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any).rpc('real_experience_admin_list', {
      p_status: filter === 'all' ? null : filter, p_limit: 100,
    });
    if (error) toast.error(error.message);
    setItems((data ?? []) as AdminExperience[]);
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [filter]);

  const moderate = async (id: string, decision: 'approved' | 'rejected' | 'cancelled' | 'closed', reason?: string) => {
    const { error } = await (supabase as any).rpc('real_experience_moderate', {
      p_experience: id, p_decision: decision, p_reason: reason ?? null,
    });
    if (error) return toast.error(error.message);
    toast.success(`Experiência ${decision}`);
    load();
  };

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2"><MapPin className="h-4 w-4 text-emerald-300" />Experiências Reais</CardTitle>
          <CardDescription className="text-xs">Modera lounges, encontros e eventos reais. Privacidade: localização nunca exposta — só região aproximada.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2 items-center">
            {['pending_moderation','approved','rejected','cancelled','closed','all'].map((s) => (
              <Button key={s} size="sm" variant={filter === s ? 'default' : 'outline'} onClick={() => setFilter(s)} className="h-7 text-[11px]">
                {s === 'all' ? 'Todos' : s}
              </Button>
            ))}
            <Button size="sm" variant="ghost" onClick={load} className="h-7"><RefreshCw className="h-3.5 w-3.5" /></Button>
          </div>

          {loading ? (
            <div className="text-xs text-muted-foreground">Carregando…</div>
          ) : items.length === 0 ? (
            <div className="text-xs text-muted-foreground">Nenhuma experiência neste filtro.</div>
          ) : (
            <div className="space-y-2">
              {items.map((it) => (
                <div key={it.id} className="rounded-lg border border-border/40 bg-card/40 p-3 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="text-[10px] uppercase">{it.kind}</Badge>
                        {it.vip_only && <Badge className="text-[10px] bg-amber-500/20 text-amber-200 border-amber-400/30">VIP</Badge>}
                        {it.requires_kyc && <Badge className="text-[10px] bg-emerald-500/20 text-emerald-200 border-emerald-400/30">KYC</Badge>}
                        <Badge className="text-[10px]" variant="secondary">{it.visibility}</Badge>
                        <span className="text-[10px] text-muted-foreground">{it.status}</span>
                      </div>
                      <div className="font-semibold text-sm mt-1 truncate">{it.title}</div>
                      <div className="text-[11px] text-muted-foreground line-clamp-2">{it.description}</div>
                      <div className="text-[10px] text-muted-foreground mt-1 flex flex-wrap gap-2">
                        <span>📅 {new Date(it.starts_at).toLocaleString('pt-BR')}</span>
                        <span>📍 {[it.approximate_region, it.city, it.state].filter(Boolean).join(' · ') || '—'}</span>
                        <span>👥 {it.going_count}/{it.max_participants ?? it.capacity}</span>
                        {it.pending_count > 0 && <span className="text-amber-300">⏳ {it.pending_count} pendentes</span>}
                        <span>score≥{it.min_social_score} · trust≥{it.min_trust_score} · aura≥{it.min_aura_level}</span>
                      </div>
                      {it.rejection_reason && <div className="text-[10px] text-red-300 mt-1">Motivo: {it.rejection_reason}</div>}
                    </div>
                    <div className="flex flex-col gap-1 shrink-0">
                      {it.status === 'pending_moderation' && (
                        <>
                          <Button size="sm" className="h-7 text-[11px]" onClick={() => moderate(it.id, 'approved')}>
                            <Check className="h-3 w-3 mr-1" />Aprovar
                          </Button>
                          <Button size="sm" variant="destructive" className="h-7 text-[11px]" onClick={() => {
                            const r = window.prompt('Motivo da rejeição?');
                            if (r) moderate(it.id, 'rejected', r);
                          }}>
                            <X className="h-3 w-3 mr-1" />Rejeitar
                          </Button>
                        </>
                      )}
                      {it.status === 'approved' && (
                        <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => moderate(it.id, 'cancelled')}>
                          Cancelar
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="py-3 text-[11px] text-muted-foreground space-y-1">
          <div>• Privacidade: lat/lng exatos nunca são salvos — apenas <code>approximate_region</code>, cidade e estado.</div>
          <div>• Participação exige consentimento explícito + score/trust/aura/KYC mínimos definidos pelo host.</div>
          <div>• Bloqueios (<code>blocked_contacts</code>) impedem inscrição mútua automaticamente.</div>
          <div>• Free vê eventos públicos aprovados; VIP-only e invite_only ficam invisíveis para não-VIPs.</div>
        </CardContent>
      </Card>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// SocialAiTab — Prioridade 4 (IA Social por regras, opt-out aware)
// ────────────────────────────────────────────────────────────────────
function SocialAiTab() {
  const [cfg, setCfg] = useState<any>(null);
  const [metrics, setMetrics] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const { data: c } = await (supabase as any).from('oculto_social_ai_config').select('*').eq('id','singleton').maybeSingle();
    setCfg(c);
    const { data: m } = await (supabase as any).rpc('social_ai_admin_metrics');
    setMetrics(m);
  };
  useEffect(() => { load(); }, []);

  const save = async (patch: any) => {
    setSaving(true);
    try {
      const { error } = await (supabase as any).rpc('social_ai_config_update', {
        p_enabled: patch.enabled ?? null,
        p_max_suggestions: patch.max_suggestions ?? null,
        p_cooldown_minutes: patch.cooldown_minutes ?? null,
        p_rules_enabled: patch.rules_enabled ?? null,
      });
      if (error) throw error;
      toast.success('Configuração atualizada');
      await load();
    } catch (e: any) { toast.error(e?.message ?? 'Erro ao salvar'); }
    finally { setSaving(false); }
  };

  if (!cfg) return <div className="text-sm text-muted-foreground">Carregando...</div>;

  const rules = cfg.rules_enabled || {};
  const ruleLabels: Record<string,string> = {
    never_used_aura: 'Sugerir Aura Match (nunca usou)',
    vip_creator_hint: 'Sugerir Canal VIP (assinante VIP)',
    inactive_noite_oculta: 'Reengajar inativos via Noite Oculta',
    high_score_rare_rooms: 'Score alto → salas raras',
    low_score_complete_profile: 'Score baixo → completar perfil',
    checkout_abandoned: 'Retomar checkout abandonado',
    premium_value_hint: 'Sugerir Premium (free engajado)',
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2"><Brain className="h-4 w-4 text-violet-300" />IA Social — Configuração</CardTitle>
          <CardDescription>Engine leve por regras, explicável, com opt-out via consentimento de personalização (LGPD).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="ai-on">Engine ativo</Label>
            <Switch id="ai-on" checked={!!cfg.enabled} onCheckedChange={(v) => save({ enabled: v })} disabled={saving} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Máx. sugestões / sessão</Label>
              <Input type="number" min={1} max={5} defaultValue={cfg.max_suggestions}
                onBlur={(e) => save({ max_suggestions: Number(e.target.value) })} />
            </div>
            <div>
              <Label className="text-xs">Cooldown (min)</Label>
              <Input type="number" min={30} max={1440} defaultValue={cfg.cooldown_minutes}
                onBlur={(e) => save({ cooldown_minutes: Number(e.target.value) })} />
            </div>
          </div>
          <div className="space-y-2 pt-2 border-t border-white/10">
            <div className="text-xs font-bold text-white/70">Regras</div>
            {Object.entries(ruleLabels).map(([key, label]) => (
              <div key={key} className="flex items-center justify-between">
                <span className="text-xs">{label}</span>
                <Switch
                  checked={!!rules[key]}
                  onCheckedChange={(v) => save({ rules_enabled: { ...rules, [key]: v } })}
                  disabled={saving}
                />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2"><BarChart3 className="h-4 w-4 text-violet-300" />Métricas (7 dias)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-xs">
          {metrics ? (
            <>
              <div>Mostradas: <strong>{metrics.shown_7d ?? 0}</strong></div>
              <div>Cliques: <strong>{metrics.clicked_7d ?? 0}</strong></div>
              <div>Dispensadas: <strong>{metrics.dismissed_7d ?? 0}</strong></div>
              <div className="pt-2 border-t border-white/10">
                <div className="font-bold mb-1">Por regra:</div>
                {Object.entries(metrics.by_rule_7d || {}).length === 0 && <div className="text-muted-foreground">Sem eventos.</div>}
                {Object.entries(metrics.by_rule_7d || {}).map(([k,v]) => (
                  <div key={k}>{k}: {String(v)}</div>
                ))}
              </div>
            </>
          ) : <div>Carregando...</div>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm">Garantias</CardTitle></CardHeader>
        <CardContent className="text-xs space-y-1 text-muted-foreground">
          <div>• Sem IA externa, sem Lovable AI. Apenas regras auditáveis.</div>
          <div>• Usuário com <code>cookies_personalization=false</code> recebe lista vazia.</div>
          <div>• Cooldown por regra/usuário evita spam.</div>
          <div>• Telemetria anonimizada e auto-purga após 30 dias.</div>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================
// Economia Social Premium tab — Prioridade 5
// ============================================================
function EconomyTab() {
  const [products, setProducts] = useState<any[]>([]);
  const [metrics, setMetrics] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<any | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [{ data: list }, { data: m }] = await Promise.all([
        (supabase as any).rpc('social_economy_list'),
        (supabase as any).rpc('social_economy_admin_metrics'),
      ]);
      setProducts(list || []);
      setMetrics(m || null);
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao carregar economia');
    }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const toggle = async (slug: string, active: boolean) => {
    const { error } = await (supabase as any).rpc('social_economy_admin_toggle', { p_slug: slug, p_active: active });
    if (error) { toast.error(error.message); return; }
    toast.success(active ? 'Produto ativado' : 'Produto desativado');
    load();
  };

  const save = async () => {
    if (!editing?.slug || !editing?.name || !editing?.kind) { toast.error('slug/name/kind obrigatórios'); return; }
    const { error } = await (supabase as any).rpc('social_economy_admin_upsert', { p: editing });
    if (error) { toast.error(error.message); return; }
    toast.success('Produto salvo');
    setEditing(null);
    load();
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold flex items-center gap-2"><Coins className="h-4 w-4" /> Economia Social Premium</h2>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={load}><RefreshCw className="mr-1 h-3.5 w-3.5" />Atualizar</Button>
          <Button size="sm" onClick={() => setEditing({ slug: '', name: '', kind: 'energia_magnetica', price_cents: 990, duration_minutes: 30, cooldown_minutes: 60, daily_limit: 3, min_plan: 'free', multiplier: 1.5, active: true, sort_order: 100 })}>
            <Plus className="mr-1 h-3.5 w-3.5" />Novo produto
          </Button>
        </div>
      </div>

      {metrics && (
        <div className="grid gap-3 md:grid-cols-3">
          <StatCard label="Compras 24h" value={metrics.purchases_24h ?? 0} hint="Pedidos criados" />
          <StatCard label="Pagas 24h" value={metrics.paid_24h ?? 0} hint="status paid|activated" />
          <StatCard label="Receita 24h" value={`R$ ${((metrics.revenue_cents_24h ?? 0) / 100).toFixed(2)}`} hint="Soma amount_cents" />
        </div>
      )}

      <Card>
        <CardHeader><CardTitle className="text-sm">Catálogo</CardTitle><CardDescription className="text-xs">Anti-abuso por cooldown + daily_limit + min_plan. Backend valida tudo.</CardDescription></CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          {loading ? <div className="p-4"><Loader2 className="h-4 w-4 animate-spin" /></div> : (
            <table className="w-full text-xs">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Produto</th>
                  <th className="px-3 py-2 text-left">Tipo</th>
                  <th className="px-3 py-2 text-right">Preço</th>
                  <th className="px-3 py-2 text-right">Dur.</th>
                  <th className="px-3 py-2 text-right">Cool.</th>
                  <th className="px-3 py-2 text-right">Limite/dia</th>
                  <th className="px-3 py-2 text-left">Plano</th>
                  <th className="px-3 py-2 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p.slug} className="border-t border-white/5">
                    <td className="px-3 py-1.5">{p.icon} <strong>{p.name}</strong> <span className="text-muted-foreground">({p.slug})</span></td>
                    <td className="px-3 py-1.5"><Badge variant="outline" className="text-[10px]">{p.kind}</Badge></td>
                    <td className="px-3 py-1.5 text-right">R$ {(p.price_cents / 100).toFixed(2)}</td>
                    <td className="px-3 py-1.5 text-right">{p.duration_minutes}min</td>
                    <td className="px-3 py-1.5 text-right">{p.cooldown_minutes}min</td>
                    <td className="px-3 py-1.5 text-right">{p.daily_limit}</td>
                    <td className="px-3 py-1.5"><Badge className="text-[10px]">{p.min_plan}</Badge></td>
                    <td className="px-3 py-1.5 text-right">
                      <Button size="sm" variant="ghost" onClick={() => setEditing(p)}><Save className="h-3 w-3" /></Button>
                      <Button size="sm" variant="ghost" onClick={() => toggle(p.slug, false)}><X className="h-3 w-3 text-destructive" /></Button>
                    </td>
                  </tr>
                ))}
                {products.length === 0 && <tr><td colSpan={8} className="px-3 py-4 text-center text-muted-foreground">Sem produtos. Crie o primeiro.</td></tr>}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {editing && (
        <Card>
          <CardHeader><CardTitle className="text-sm">{editing.id ? 'Editar' : 'Novo'} produto</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-xs">
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-xs">Slug</Label><Input value={editing.slug || ''} onChange={(e) => setEditing({ ...editing, slug: e.target.value })} /></div>
              <div><Label className="text-xs">Nome</Label><Input value={editing.name || ''} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></div>
              <div><Label className="text-xs">Ícone</Label><Input value={editing.icon || ''} onChange={(e) => setEditing({ ...editing, icon: e.target.value })} /></div>
              <div>
                <Label className="text-xs">Tipo</Label>
                <select className="w-full bg-background border border-input rounded h-9 px-2" value={editing.kind} onChange={(e) => setEditing({ ...editing, kind: e.target.value })}>
                  {['energia_magnetica','pass_vip_social','conexoes_ocultas','entrada_prioritaria','destaque_salas','destaque_feed_vivo','salas_raras','experiencia_vip'].map((k) => <option key={k} value={k}>{k}</option>)}
                </select>
              </div>
              <div><Label className="text-xs">Preço (centavos)</Label><Input type="number" value={editing.price_cents ?? 0} onChange={(e) => setEditing({ ...editing, price_cents: Number(e.target.value) })} /></div>
              <div><Label className="text-xs">Duração (min)</Label><Input type="number" value={editing.duration_minutes ?? 30} onChange={(e) => setEditing({ ...editing, duration_minutes: Number(e.target.value) })} /></div>
              <div><Label className="text-xs">Cooldown (min)</Label><Input type="number" value={editing.cooldown_minutes ?? 60} onChange={(e) => setEditing({ ...editing, cooldown_minutes: Number(e.target.value) })} /></div>
              <div><Label className="text-xs">Limite diário</Label><Input type="number" value={editing.daily_limit ?? 3} onChange={(e) => setEditing({ ...editing, daily_limit: Number(e.target.value) })} /></div>
              <div>
                <Label className="text-xs">Plano mínimo</Label>
                <select className="w-full bg-background border border-input rounded h-9 px-2" value={editing.min_plan || 'free'} onChange={(e) => setEditing({ ...editing, min_plan: e.target.value })}>
                  <option value="free">free</option><option value="premium">premium</option><option value="vip">vip</option>
                </select>
              </div>
              <div><Label className="text-xs">Multiplier</Label><Input type="number" step="0.1" value={editing.multiplier ?? 1.5} onChange={(e) => setEditing({ ...editing, multiplier: Number(e.target.value) })} /></div>
              <div><Label className="text-xs">Tier (pass VIP)</Label><Input value={editing.tier || ''} onChange={(e) => setEditing({ ...editing, tier: e.target.value })} /></div>
              <div><Label className="text-xs">Ordem</Label><Input type="number" value={editing.sort_order ?? 100} onChange={(e) => setEditing({ ...editing, sort_order: Number(e.target.value) })} /></div>
            </div>
            <div><Label className="text-xs">Descrição</Label><Textarea value={editing.description || ''} onChange={(e) => setEditing({ ...editing, description: e.target.value })} /></div>
            <div className="flex items-center gap-2">
              <Switch checked={!!editing.active} onCheckedChange={(c) => setEditing({ ...editing, active: c })} />
              <span>Ativo</span>
            </div>
            <div className="flex gap-2 pt-2">
              <Button size="sm" onClick={save}><Save className="h-3.5 w-3.5 mr-1" />Salvar</Button>
              <Button size="sm" variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-sm">Vendas por produto (7d)</CardTitle></CardHeader>
        <CardContent className="text-xs space-y-1">
          {metrics?.by_product_7d && Object.entries(metrics.by_product_7d).length > 0 ? (
            Object.entries(metrics.by_product_7d).map(([slug, count]) => (
              <div key={slug} className="flex justify-between border-b border-white/5 py-1">
                <span>{slug}</span><strong>{String(count)}</strong>
              </div>
            ))
          ) : <div className="text-muted-foreground">Sem vendas ainda.</div>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm">Garantias</CardTitle></CardHeader>
        <CardContent className="text-xs space-y-1 text-muted-foreground">
          <div>• ASAAS continua como gateway. Webhook chama <code>social_economy_mark_paid(asaas_id)</code> que ativa o produto.</div>
          <div>• Anti-abuso: cooldown + daily_limit + min_plan validados no backend.</div>
          <div>• Roteamento por kind: magnetic, pass VIP social, conexões ocultas, destaque salas/feed, experiências VIP.</div>
          <div>• Free vê catálogo (teaser); só compra os com <code>min_plan=free</code>.</div>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================
// InitialExperienceTab — gerencia tips/CTAs por nível de engajamento
// ============================================================
interface IECRow {
  id: string;
  kind: 'tip' | 'cta' | 'toggle';
  title: string;
  body: string | null;
  cta_label: string | null;
  cta_route: string | null;
  icon: string | null;
  hue: number;
  min_level: 'new' | 'engaged' | 'premium' | 'vip';
  max_level: 'new' | 'engaged' | 'premium' | 'vip' | null;
  active: boolean;
  sort_order: number;
}

const EMPTY_IEC: IECRow = {
  id: '', kind: 'tip', title: '', body: '', cta_label: '', cta_route: '',
  icon: 'sparkles', hue: 280, min_level: 'new', max_level: null, active: true, sort_order: 0,
};

function InitialExperienceTab() {
  const [rows, setRows] = useState<IECRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<IECRow>(EMPTY_IEC);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('oculto_initial_experience_config' as any)
      .select('*')
      .order('sort_order', { ascending: true });
    if (error) toast.error('Erro ao carregar: ' + error.message);
    setRows((data ?? []) as IECRow[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const save = async (row: IECRow) => {
    setSaving(true);
    const payload = { ...row, body: row.body || null, cta_label: row.cta_label || null, cta_route: row.cta_route || null, icon: row.icon || null, max_level: row.max_level || null };
    const { error } = await supabase.from('oculto_initial_experience_config' as any).upsert(payload as any);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Salvo');
    setDraft(EMPTY_IEC);
    load();
  };

  const remove = async (id: string) => {
    if (!confirm(`Remover "${id}"?`)) return;
    const { error } = await supabase.from('oculto_initial_experience_config' as any).delete().eq('id', id);
    if (error) { toast.error(error.message); return; }
    toast.success('Removido'); load();
  };

  const toggleActive = async (row: IECRow) => {
    await supabase.from('oculto_initial_experience_config' as any).update({ active: !row.active } as any).eq('id', row.id);
    load();
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Compass className="h-4 w-4 text-cyan-400" /> Experiência Inicial — Dicas e CTAs progressivos
          </CardTitle>
          <CardDescription className="text-xs">
            Cada item aparece para usuários a partir de <code>min_level</code> (new → engaged → premium → vip).
            Use <code>max_level</code> para esconder após determinado nível. Render no feed via MicroTipsStrip / EarnByReferralCard.
          </CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm">Novo / Editar</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-xs">ID (slug)</Label><Input value={draft.id} onChange={e => setDraft({ ...draft, id: e.target.value })} placeholder="tip_xxx" /></div>
            <div><Label className="text-xs">Tipo</Label>
              <select className="w-full h-9 rounded-md border border-border bg-background px-2 text-sm"
                value={draft.kind} onChange={e => setDraft({ ...draft, kind: e.target.value as any })}>
                <option value="tip">tip</option><option value="cta">cta</option><option value="toggle">toggle</option>
              </select>
            </div>
          </div>
          <div><Label className="text-xs">Título</Label><Input value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} /></div>
          <div><Label className="text-xs">Corpo</Label><Textarea rows={2} value={draft.body ?? ''} onChange={e => setDraft({ ...draft, body: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-xs">CTA label</Label><Input value={draft.cta_label ?? ''} onChange={e => setDraft({ ...draft, cta_label: e.target.value })} /></div>
            <div><Label className="text-xs">CTA rota</Label><Input value={draft.cta_route ?? ''} onChange={e => setDraft({ ...draft, cta_route: e.target.value })} placeholder="/affiliates" /></div>
          </div>
          <div className="grid grid-cols-4 gap-2">
            <div><Label className="text-xs">Ícone</Label><Input value={draft.icon ?? ''} onChange={e => setDraft({ ...draft, icon: e.target.value })} placeholder="sparkles" /></div>
            <div><Label className="text-xs">Hue (0-360)</Label><Input type="number" value={draft.hue} onChange={e => setDraft({ ...draft, hue: Number(e.target.value) || 0 })} /></div>
            <div><Label className="text-xs">Min nível</Label>
              <select className="w-full h-9 rounded-md border border-border bg-background px-2 text-sm"
                value={draft.min_level} onChange={e => setDraft({ ...draft, min_level: e.target.value as any })}>
                <option value="new">new</option><option value="engaged">engaged</option>
                <option value="premium">premium</option><option value="vip">vip</option>
              </select>
            </div>
            <div><Label className="text-xs">Max nível</Label>
              <select className="w-full h-9 rounded-md border border-border bg-background px-2 text-sm"
                value={draft.max_level ?? ''} onChange={e => setDraft({ ...draft, max_level: (e.target.value || null) as any })}>
                <option value="">— sem limite —</option>
                <option value="new">new</option><option value="engaged">engaged</option>
                <option value="premium">premium</option><option value="vip">vip</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 items-end">
            <div><Label className="text-xs">Ordem</Label><Input type="number" value={draft.sort_order} onChange={e => setDraft({ ...draft, sort_order: Number(e.target.value) || 0 })} /></div>
            <div className="flex items-center gap-2"><Switch checked={draft.active} onCheckedChange={v => setDraft({ ...draft, active: v })} /><span className="text-xs">Ativo</span></div>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => save(draft)} disabled={saving || !draft.id || !draft.title}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4 mr-1" />} Salvar
            </Button>
            <Button variant="ghost" onClick={() => setDraft(EMPTY_IEC)}>Limpar</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-sm">Itens cadastrados ({rows.length})</CardTitle>
          <Button size="sm" variant="ghost" onClick={load}><RefreshCw className="h-3.5 w-3.5" /></Button>
        </CardHeader>
        <CardContent>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : (
            <div className="space-y-2">
              {rows.map(r => (
                <div key={r.id} className="flex items-center gap-2 rounded-md border border-border/50 p-2 text-xs">
                  <Badge variant="outline" className="shrink-0">{r.kind}</Badge>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold truncate">{r.title} <span className="text-muted-foreground font-normal">({r.id})</span></div>
                    <div className="text-muted-foreground truncate">{r.body || '—'} · min:{r.min_level}{r.max_level ? ` · max:${r.max_level}` : ''} · ordem:{r.sort_order}</div>
                  </div>
                  <Switch checked={r.active} onCheckedChange={() => toggleActive(r)} />
                  <Button size="sm" variant="ghost" onClick={() => setDraft(r)}>Editar</Button>
                  <Button size="sm" variant="ghost" onClick={() => remove(r.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                </div>
              ))}
              {!rows.length && <div className="text-xs text-muted-foreground">Nenhum item cadastrado.</div>}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ===========================================================================
// AffiliateProgramTab — gerencia níveis e campanhas do "Ganhe Indicando"
// ===========================================================================
function AffiliateProgramTab() {
  const [levels, setLevels] = useState<any[]>([]);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data: lv } = await (supabase as any).from('oculto_affiliate_levels').select('*').order('sort_order');
    const { data: cp } = await (supabase as any).from('oculto_affiliate_campaigns').select('*').order('sort_order');
    setLevels(lv ?? []); setCampaigns(cp ?? []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const updateLevel = async (id: string, patch: any) => {
    await (supabase as any).from('oculto_affiliate_levels').update(patch).eq('id', id);
    await load();
    toast.success('Nível atualizado');
  };
  const updateCampaign = async (id: string, patch: any) => {
    await (supabase as any).from('oculto_affiliate_campaigns').update(patch).eq('id', id);
    await load();
    toast.success('Campanha atualizada');
  };

  if (loading) return <p className="text-sm text-muted-foreground">Carregando…</p>;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Coins className="h-4 w-4 text-amber-400" /> Ganhe Indicando — Níveis e Campanhas
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Edite níveis (badges, perks, requisitos) e campanhas exibidas no feed.
            Atalhos para antifraude e split: <a href="/admin/affiliate-audit" className="text-primary underline">Affiliate Audit</a> ·{' '}
            <a href="/admin/affiliate-management" className="text-primary underline">Affiliate Management</a> ·{' '}
            <a href="/admin/refund-chargeback-hub" className="text-primary underline">Chargebacks</a>.
          </p>

          <div>
            <p className="text-xs font-bold mb-2">Níveis</p>
            <div className="space-y-2">
              {levels.map((l) => (
                <div key={l.id} className="flex items-center gap-2 flex-wrap rounded-lg border border-border/40 p-2 bg-card/40">
                  <span className="text-xs font-mono w-24 truncate">{l.id}</span>
                  <Input className="h-7 text-xs w-32" defaultValue={l.name}
                    onBlur={(e) => e.target.value !== l.name && updateLevel(l.id, { name: e.target.value })} />
                  <label className="text-[10px] text-muted-foreground flex items-center gap-1">
                    Min ind.
                    <Input type="number" className="h-7 text-xs w-16" defaultValue={l.min_referrals}
                      onBlur={(e) => Number(e.target.value) !== l.min_referrals && updateLevel(l.id, { min_referrals: Number(e.target.value) })} />
                  </label>
                  <label className="text-[10px] text-muted-foreground flex items-center gap-1">
                    Min R$
                    <Input type="number" step="0.01" className="h-7 text-xs w-20" defaultValue={l.min_revenue}
                      onBlur={(e) => Number(e.target.value) !== Number(l.min_revenue) && updateLevel(l.id, { min_revenue: Number(e.target.value) })} />
                  </label>
                  <label className="text-[10px] text-muted-foreground flex items-center gap-1">
                    Hue
                    <Input type="number" className="h-7 text-xs w-16" defaultValue={l.badge_hue}
                      onBlur={(e) => Number(e.target.value) !== l.badge_hue && updateLevel(l.id, { badge_hue: Number(e.target.value) })} />
                  </label>
                  <label className="text-[10px] flex items-center gap-1 ml-auto">
                    <Switch checked={l.active} onCheckedChange={(v) => updateLevel(l.id, { active: v })} />
                    Ativo
                  </label>
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-bold mb-2">Campanhas no feed</p>
            <div className="space-y-2">
              {campaigns.map((c) => (
                <div key={c.id} className="flex items-center gap-2 flex-wrap rounded-lg border border-border/40 p-2 bg-card/40">
                  <span className="text-xs font-mono w-28 truncate">{c.id}</span>
                  <Input className="h-7 text-xs flex-1 min-w-[180px]" defaultValue={c.title}
                    onBlur={(e) => e.target.value !== c.title && updateCampaign(c.id, { title: e.target.value })} />
                  <Input className="h-7 text-xs w-32" defaultValue={c.cta_label}
                    onBlur={(e) => e.target.value !== c.cta_label && updateCampaign(c.id, { cta_label: e.target.value })} />
                  <Input className="h-7 text-xs w-32" defaultValue={c.cta_route}
                    onBlur={(e) => e.target.value !== c.cta_route && updateCampaign(c.id, { cta_route: e.target.value })} />
                  <label className="text-[10px] text-muted-foreground flex items-center gap-1">
                    Hue
                    <Input type="number" className="h-7 text-xs w-16" defaultValue={c.hue}
                      onBlur={(e) => Number(e.target.value) !== c.hue && updateCampaign(c.id, { hue: Number(e.target.value) })} />
                  </label>
                  <label className="text-[10px] flex items-center gap-1 ml-auto">
                    <Switch checked={c.active} onCheckedChange={(v) => updateCampaign(c.id, { active: v })} />
                    Ativa
                  </label>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================
// Descoberta — Explorar novos misteriosos(as)
// ============================================================
function DiscoveryTab() {
  const enabled = useSettingValue<boolean>('discovery_explore_enabled', true);
  const giftAuto = useSettingValue<boolean>('discovery_gift_autoreply_enabled', true);
  const updateSetting = useUpdateSetting();
  const [stats, setStats] = useState<{ ignores: number; likes: number; gifts: number } | null>(null);
  const [loading, setLoading] = useState(false);


  const loadStats = async () => {
    setLoading(true);
    try {
      const [i, l, g] = await Promise.all([
        supabase.from('oculto_discovery_ignores').select('id', { count: 'exact', head: true }),
        supabase.from('oculto_discovery_likes').select('id', { count: 'exact', head: true }),
        supabase.from('oculto_discovery_gift_log').select('id', { count: 'exact', head: true }),
      ]);
      setStats({
        ignores: i.count ?? 0,
        likes: l.count ?? 0,
        gifts: g.count ?? 0,
      });
    } catch (e: any) {
      toast.error('Falha ao carregar métricas: ' + (e?.message ?? ''));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadStats(); }, []);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Gift className="h-4 w-4 text-fuchsia-400" /> Descoberta Social
          </CardTitle>
          <CardDescription className="text-xs">
            Controla a sessão “Explorar novos misteriosos(as)” do feed — ignorar (30d), aproximar/match e presente XP contextual.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-md border border-border/40 p-3">
            <div>
              <p className="text-sm font-medium">Função ativa no feed</p>
              <p className="text-xs text-muted-foreground">Desativa o carrossel inteiro para todos os usuários.</p>
            </div>
            <Switch
              checked={enabled}
              onCheckedChange={(v) => updateSetting.mutate({ key: 'discovery_explore_enabled', value: v })}
            />
          </div>

          <div className="flex items-center justify-between rounded-md border border-border/40 p-3">
            <div>
              <p className="text-sm font-medium">Mensagem automática após presente</p>
              <p className="text-xs text-muted-foreground">Envia uma mensagem contextual no chat quando o presente é entregue.</p>
            </div>
            <Switch
              checked={giftAuto}
              onCheckedChange={(v) => updateSetting.mutate({ key: 'discovery_gift_autoreply_enabled', value: v })}
            />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-md border border-border/40 p-3 text-center">
              <p className="text-[10px] uppercase text-muted-foreground">Ignorados</p>
              <p className="text-lg font-bold">{stats?.ignores ?? '—'}</p>
            </div>
            <div className="rounded-md border border-border/40 p-3 text-center">
              <p className="text-[10px] uppercase text-muted-foreground">Aproximações</p>
              <p className="text-lg font-bold">{stats?.likes ?? '—'}</p>
            </div>
            <div className="rounded-md border border-border/40 p-3 text-center">
              <p className="text-[10px] uppercase text-muted-foreground">Presentes</p>
              <p className="text-lg font-bold">{stats?.gifts ?? '—'}</p>
            </div>
          </div>

          <Button size="sm" variant="outline" onClick={loadStats} disabled={loading}>
            <RefreshCw className={`mr-1 h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Atualizar métricas
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

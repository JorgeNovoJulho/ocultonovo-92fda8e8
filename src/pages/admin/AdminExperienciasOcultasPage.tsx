/**
 * Admin — Módulo Social Beta
 * Controle master-only: nomes editáveis, flags, planos, usuários liberados,
 * métricas de uso por sub-área e busca por username.
 */
import { useEffect, useMemo, useState } from 'react';
import { Loader2, Save, Plus, X, BarChart3, Search, UserPlus, Check } from 'lucide-react';
import { supabase } from '@/lib/supabaseExternal';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  getDefaultSocialBetaAdminConfig,
  mapAdminConfig,
  normalizeRpcRow,
  type SocialBetaAdminConfig,
} from '@/hooks/useSocialBetaModule';
import { AdminSocialBetaReports } from '@/components/social-beta/AdminSocialBetaReports';
import { AdminSocialBetaModules } from '@/components/social-beta/AdminSocialBetaModules';
import { AdminSocialBetaContentReports } from '@/components/social-beta/AdminSocialBetaContentReports';
import { AdminSocialBetaSlotAnalytics } from '@/components/social-beta/AdminSocialBetaSlotAnalytics';

const ALL_PLANS = ['free', 'premium', 'vip'] as const;

const SLOT_LABEL_KEYS: Record<string, keyof SocialBetaAdminConfig | 'moduleName'> = {
  hub: 'moduleName',
  lounge: 'loungeLabel',
  connections: 'connectionsLabel',
  games: 'gamesLabel',
  dynamics: 'dynamicsLabel',
};

type Metric = {
  slot: string;
  visits_total: number;
  visits_7d: number;
  visits_30d: number;
  unique_users_30d: number;
  last_visit: string | null;
};

type UserHit = {
  user_id: string;
  username: string | null;
  name: string | null;
  avatar_url: string | null;
  is_selected: boolean;
};

export default function AdminExperienciasOcultasPage() {
  const { toast } = useToast();
  const [cfg, setCfg] = useState<SocialBetaAdminConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newUserId, setNewUserId] = useState('');

  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [metricsLoading, setMetricsLoading] = useState(false);

  const [searchTerm, setSearchTerm] = useState('');
  const [searchHits, setSearchHits] = useState<UserHit[]>([]);
  const [searching, setSearching] = useState(false);

  const load = async () => {
    setLoading(true);
    const next = await (supabase as any).rpc('social_beta_get_config');
    if (!next.error && next.data) {
      setCfg(mapAdminConfig(normalizeRpcRow(next.data)));
    } else {
      setCfg(getDefaultSocialBetaAdminConfig());
    }
    setLoading(false);
  };

  const loadMetrics = async () => {
    setMetricsLoading(true);
    const { data, error } = await (supabase as any).rpc('social_beta_metrics');
    if (!error && Array.isArray(data)) {
      setMetrics(data as Metric[]);
    } else if (error) {
      toast({ title: 'Métricas indisponíveis', description: error.message, variant: 'destructive' });
    }
    setMetricsLoading(false);
  };

  useEffect(() => { load(); loadMetrics(); }, []);

  // busca por username/nome — debounce simples
  useEffect(() => {
    const term = searchTerm.trim();
    if (term.length < 2) { setSearchHits([]); return; }
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(async () => {
      const { data, error } = await (supabase as any).rpc('social_beta_search_users', {
        _query: term,
        _limit: 10,
      });
      if (cancelled) return;
      if (!error && Array.isArray(data)) setSearchHits(data as UserHit[]);
      setSearching(false);
    }, 280);
    return () => { cancelled = true; clearTimeout(t); };
  }, [searchTerm]);

  const save = async () => {
    if (!cfg) return;
    setSaving(true);
    const { error } = await (supabase as any).rpc('social_beta_update_config', {
      _enabled: cfg.enabled,
      _beta_mode: cfg.betaMode,
      _allowed_plans: cfg.allowedPlans,
      _selected_users: cfg.selectedUsers,
      _module_name: cfg.moduleName,
      _lounge_label: cfg.loungeLabel,
      _connections_label: cfg.connectionsLabel,
      _games_label: cfg.gamesLabel,
      _dynamics_label: cfg.dynamicsLabel,
      _notes: cfg.notes,
    });
    setSaving(false);
    if (error) toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    else toast({ title: 'Configuração salva' });
  };

  const togglePlan = (p: string) => {
    if (!cfg) return;
    const has = cfg.allowedPlans.includes(p);
    setCfg({ ...cfg, allowedPlans: has ? cfg.allowedPlans.filter(x => x !== p) : [...cfg.allowedPlans, p] });
  };

  const addUserId = (id: string) => {
    if (!cfg) return;
    const trimmed = id.trim();
    if (!trimmed || cfg.selectedUsers.includes(trimmed)) return;
    setCfg({ ...cfg, selectedUsers: [...cfg.selectedUsers, trimmed] });
  };

  const removeUser = (id: string) => {
    if (!cfg) return;
    setCfg({ ...cfg, selectedUsers: cfg.selectedUsers.filter(x => x !== id) });
  };

  const slotLabel = useMemo(() => {
    return (slot: string) => {
      if (!cfg) return slot;
      const key = SLOT_LABEL_KEYS[slot];
      if (!key) return slot;
      return (cfg as any)[key] ?? slot;
    };
  }, [cfg]);

  if (loading || !cfg) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Módulo Social Beta</h1>
        <p className="text-sm text-muted-foreground">
          Estrutura isolada, invisível por padrão e renomeável em tempo real pelo Admin Master.
        </p>
      </header>

      {/* Nomes editáveis */}
      <section className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="module_name" className="text-base">Nome principal do módulo</Label>
            <Input id="module_name" value={cfg.moduleName} onChange={(e) => setCfg({ ...cfg, moduleName: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="lounge_label" className="text-base">Placeholder 1</Label>
            <Input id="lounge_label" value={cfg.loungeLabel} onChange={(e) => setCfg({ ...cfg, loungeLabel: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="connections_label" className="text-base">Placeholder 2</Label>
            <Input id="connections_label" value={cfg.connectionsLabel} onChange={(e) => setCfg({ ...cfg, connectionsLabel: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="games_label" className="text-base">Placeholder 3</Label>
            <Input id="games_label" value={cfg.gamesLabel} onChange={(e) => setCfg({ ...cfg, gamesLabel: e.target.value })} />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="dynamics_label" className="text-base">Placeholder 4</Label>
          <Input id="dynamics_label" value={cfg.dynamicsLabel} onChange={(e) => setCfg({ ...cfg, dynamicsLabel: e.target.value })} />
        </div>
      </section>

      {/* Flags */}
      <section className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-base">Função habilitada</Label>
            <p className="text-xs text-muted-foreground">Quando desligada, ninguém vê — nem por URL direta.</p>
          </div>
          <Switch checked={cfg.enabled} onCheckedChange={(v) => setCfg({ ...cfg, enabled: v })} />
        </div>
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-base">Modo beta</Label>
            <p className="text-xs text-muted-foreground">Só usuários selecionados + admin master entram.</p>
          </div>
          <Switch checked={cfg.betaMode} onCheckedChange={(v) => setCfg({ ...cfg, betaMode: v })} />
        </div>
      </section>

      {/* Planos */}
      <section className="rounded-xl border border-border bg-card p-5 space-y-3">
        <Label className="text-base">Planos permitidos</Label>
        <p className="text-xs text-muted-foreground">Usado apenas quando o modo beta está desligado.</p>
        <div className="flex gap-2 flex-wrap">
          {ALL_PLANS.map(p => {
            const active = cfg.allowedPlans.includes(p);
            return (
              <Button key={p} size="sm" variant={active ? 'default' : 'outline'} onClick={() => togglePlan(p)}>
                {p}
              </Button>
            );
          })}
        </div>
      </section>

      {/* Busca por username */}
      <section className="rounded-xl border border-border bg-card p-5 space-y-3">
        <Label className="text-base flex items-center gap-2">
          <Search className="h-4 w-4" />
          Buscar usuário por username ou nome
        </Label>
        <Input
          placeholder="Digite ao menos 2 caracteres..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        {searching && <p className="text-xs text-muted-foreground">Buscando…</p>}
        {!searching && searchTerm.trim().length >= 2 && searchHits.length === 0 && (
          <p className="text-xs text-muted-foreground">Nenhum resultado.</p>
        )}
        <div className="space-y-1.5">
          {searchHits.map((hit) => {
            const already = cfg.selectedUsers.includes(hit.user_id) || hit.is_selected;
            return (
              <div key={hit.user_id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background p-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    @{hit.username ?? '—'} <span className="text-muted-foreground font-normal">· {hit.name ?? '—'}</span>
                  </p>
                  <p className="text-[10px] font-mono text-muted-foreground truncate">{hit.user_id}</p>
                </div>
                <Button
                  size="sm"
                  variant={already ? 'secondary' : 'default'}
                  disabled={already}
                  onClick={() => addUserId(hit.user_id)}
                  className="shrink-0 gap-1"
                >
                  {already ? <Check className="h-3.5 w-3.5" /> : <UserPlus className="h-3.5 w-3.5" />}
                  {already ? 'Liberado' : 'Liberar'}
                </Button>
              </div>
            );
          })}
        </div>
      </section>

      {/* Usuários liberados */}
      <section className="rounded-xl border border-border bg-card p-5 space-y-3">
        <Label className="text-base">Usuários liberados (user_id)</Label>
        <div className="flex gap-2">
          <Input
            placeholder="Cole um UUID e clique +"
            value={newUserId}
            onChange={(e) => setNewUserId(e.target.value)}
          />
          <Button onClick={() => { addUserId(newUserId); setNewUserId(''); }} size="icon">
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {cfg.selectedUsers.length === 0 && (
            <p className="text-xs text-muted-foreground">Nenhum usuário liberado ainda.</p>
          )}
          {cfg.selectedUsers.map(id => (
            <Badge key={id} variant="secondary" className="gap-1">
              <span className="font-mono text-[10px]">{id.slice(0, 8)}…</span>
              <button onClick={() => removeUser(id)} className="ml-1 hover:text-destructive">
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      </section>

      {/* Notas */}
      <section className="rounded-xl border border-border bg-card p-5 space-y-2">
        <Label className="text-base">Notas internas</Label>
        <Textarea value={cfg.notes ?? ''} onChange={(e) => setCfg({ ...cfg, notes: e.target.value })} rows={3} />
      </section>

      {/* Métricas */}
      <section className="rounded-xl border border-border bg-card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-base flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Métricas de uso
          </Label>
          <Button size="sm" variant="outline" onClick={loadMetrics} disabled={metricsLoading}>
            {metricsLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Atualizar'}
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr>
                <th className="text-left py-2">Sub-área</th>
                <th className="text-right py-2">Total</th>
                <th className="text-right py-2">7d</th>
                <th className="text-right py-2">30d</th>
                <th className="text-right py-2">Usuários 30d</th>
                <th className="text-right py-2">Última visita</th>
              </tr>
            </thead>
            <tbody>
              {metrics.length === 0 && (
                <tr><td colSpan={6} className="py-3 text-center text-xs text-muted-foreground">Sem dados ainda.</td></tr>
              )}
              {metrics.map(m => (
                <tr key={m.slot} className="border-t border-border">
                  <td className="py-2">{slotLabel(m.slot)} <span className="text-[10px] text-muted-foreground">({m.slot})</span></td>
                  <td className="py-2 text-right tabular-nums">{m.visits_total}</td>
                  <td className="py-2 text-right tabular-nums">{m.visits_7d}</td>
                  <td className="py-2 text-right tabular-nums">{m.visits_30d}</td>
                  <td className="py-2 text-right tabular-nums">{m.unique_users_30d}</td>
                  <td className="py-2 text-right text-xs text-muted-foreground">
                    {m.last_visit ? new Date(m.last_visit).toLocaleString('pt-BR') : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <AdminSocialBetaModules />

      <AdminSocialBetaSlotAnalytics />

      <AdminSocialBetaReports />

      <AdminSocialBetaContentReports />





      <div className="flex justify-end">
        <Button onClick={save} disabled={saving} className="gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Salvar
        </Button>
      </div>
    </div>
  );
}

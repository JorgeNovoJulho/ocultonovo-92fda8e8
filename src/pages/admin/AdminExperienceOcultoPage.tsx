/**
 * Admin Master > Experiência do Oculto
 * Rota: /admin/experiencia-oculto (protegida por <MasterAdminRoute>)
 *
 * Reaproveita:
 *  - oculto_experience_mode_settings (singleton runtime)
 *  - RPCs oculto_experience_settings_get/update, _modal_reset_all,
 *    _metrics, _logs_list
 *  - HOME_SECTIONS para listagem de seções
 *  - view_mode_metrics (granular) já existente
 */
import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Loader2, Save, RotateCcw, Sparkles, Settings2, Layers, Eye, BarChart3, History } from 'lucide-react';
import { toast } from 'sonner';
import { HOME_SECTIONS } from '@/config/homeSections';

interface Settings {
  id: string;
  enabled: boolean;
  default_new_user_mode: 'simple' | 'custom' | 'complete';
  default_existing_user_mode: 'simple' | 'custom' | 'complete';
  force_migration_modal: boolean;
  hidden_sessions_enabled: boolean;
  hidden_sessions_title: string;
  hidden_sessions_description: string;
  modal_title: string;
  modal_description: string;
  simple_label: string;
  custom_label: string;
  complete_label: string;
  sections_config: Record<string, any>;
  hidden_sessions_order: string[];
  created_at: string;
  updated_at: string;
}

interface Metrics {
  total_users: number;
  distribution: Record<string, number>;
  modal_seen: number;
  modal_snoozed: number;
  last_change: string | null;
  top_custom_users: { sections_count: number; updated_at: string }[];
}

interface LogRow {
  id: number;
  actor_id: string | null;
  action: string;
  payload: any;
  created_at: string;
}

function useSettings() {
  return useQuery<Settings | null>({
    queryKey: ['admin-experience-settings'],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('oculto_experience_settings_get');
      if (error) throw error;
      return (data as Settings) ?? null;
    },
  });
}

function useMetrics() {
  return useQuery<Metrics | null>({
    queryKey: ['admin-experience-metrics'],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('oculto_experience_metrics');
      if (error) throw error;
      return (data as Metrics) ?? null;
    },
  });
}

function useLogs() {
  return useQuery<LogRow[]>({
    queryKey: ['admin-experience-logs'],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('oculto_experience_logs_list', { p_limit: 100 });
      if (error) throw error;
      return (data ?? []) as LogRow[];
    },
  });
}

export default function AdminExperienceOcultoPage() {
  const qc = useQueryClient();
  const { data: settings, isLoading } = useSettings();
  const { data: metrics } = useMetrics();
  const { data: logs } = useLogs();

  const [draft, setDraft] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (settings) setDraft(settings); }, [settings]);

  const dirty = useMemo(() => {
    if (!settings || !draft) return false;
    return JSON.stringify(settings) !== JSON.stringify(draft);
  }, [settings, draft]);

  const save = async (patch?: Partial<Settings>) => {
    if (!draft) return;
    try {
      setSaving(true);
      const body = patch ?? draft;
      const { error } = await (supabase as any).rpc('oculto_experience_settings_update', { p_patch: body });
      if (error) throw error;
      toast.success('Configurações salvas');
      qc.invalidateQueries({ queryKey: ['admin-experience-settings'] });
      qc.invalidateQueries({ queryKey: ['admin-experience-logs'] });
    } catch (e: any) {
      toast.error(e?.message || 'Falha ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const resetModal = async () => {
    if (!confirm('Resetar o modal de migração para TODOS os usuários?')) return;
    try {
      const { data, error } = await (supabase as any).rpc('oculto_experience_modal_reset_all');
      if (error) throw error;
      toast.success(`Modal resetado para ${data ?? 0} usuários`);
      qc.invalidateQueries({ queryKey: ['admin-experience-metrics'] });
      qc.invalidateQueries({ queryKey: ['admin-experience-logs'] });
    } catch (e: any) {
      toast.error(e?.message || 'Falha ao resetar');
    }
  };

  if (isLoading || !draft) {
    return (
      <div className="min-h-[40vh] grid place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const total = metrics?.total_users || 0;

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4">
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-amber-400" />
            Experiência do Oculto
          </h1>
          <p className="text-sm text-muted-foreground">
            Controle os Modos de Visualização, Sessões Ocultas, métricas e logs.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={draft.enabled ? 'default' : 'outline'}>
            {draft.enabled ? 'Sistema ativo' : 'Sistema desligado'}
          </Badge>
          <Button size="sm" onClick={() => save()} disabled={!dirty || saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
            Salvar
          </Button>
        </div>
      </header>

      <Tabs defaultValue="geral">
        <TabsList className="flex flex-wrap">
          <TabsTrigger value="geral"><Settings2 className="h-4 w-4 mr-1" /> Geral</TabsTrigger>
          <TabsTrigger value="secoes"><Layers className="h-4 w-4 mr-1" /> Seções</TabsTrigger>
          <TabsTrigger value="ocultas"><Eye className="h-4 w-4 mr-1" /> Sessões Ocultas</TabsTrigger>
          <TabsTrigger value="metricas"><BarChart3 className="h-4 w-4 mr-1" /> Métricas</TabsTrigger>
          <TabsTrigger value="logs"><History className="h-4 w-4 mr-1" /> Logs</TabsTrigger>
        </TabsList>

        {/* ======================= GERAL ======================= */}
        <TabsContent value="geral" className="space-y-3">
          <Card>
            <CardHeader><CardTitle className="text-base">Sistema de modos</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">Ativar sistema de modos</div>
                  <div className="text-xs text-muted-foreground">Desligar volta todos os usuários para o feed legado.</div>
                </div>
                <Switch checked={draft.enabled} onCheckedChange={(v) => setDraft({ ...draft, enabled: v })} />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">Forçar modal de migração</div>
                  <div className="text-xs text-muted-foreground">Exibe o modal para usuários que ainda não escolheram um modo.</div>
                </div>
                <Switch checked={draft.force_migration_modal} onCheckedChange={(v) => setDraft({ ...draft, force_migration_modal: v })} />
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Modo padrão (novos usuários)</Label>
                  <Select value={draft.default_new_user_mode} onValueChange={(v: any) => setDraft({ ...draft, default_new_user_mode: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="simple">Modo Simples</SelectItem>
                      <SelectItem value="custom">Personalizado</SelectItem>
                      <SelectItem value="complete">Universo Completo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Modo padrão (usuários antigos)</Label>
                  <Select value={draft.default_existing_user_mode} onValueChange={(v: any) => setDraft({ ...draft, default_existing_user_mode: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="simple">Modo Simples</SelectItem>
                      <SelectItem value="custom">Personalizado</SelectItem>
                      <SelectItem value="complete">Universo Completo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Button variant="outline" size="sm" onClick={resetModal}>
                <RotateCcw className="h-4 w-4 mr-1" /> Resetar modal para todos
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Textos do modal</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label className="text-xs">Título</Label>
                <Input value={draft.modal_title} onChange={(e) => setDraft({ ...draft, modal_title: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Descrição</Label>
                <Textarea rows={3} value={draft.modal_description} onChange={(e) => setDraft({ ...draft, modal_description: e.target.value })} />
              </div>
              <div className="grid sm:grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs">Nome do Modo Simples</Label>
                  <Input value={draft.simple_label} onChange={(e) => setDraft({ ...draft, simple_label: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs">Nome do Personalizado</Label>
                  <Input value={draft.custom_label} onChange={(e) => setDraft({ ...draft, custom_label: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs">Nome do Universo Completo</Label>
                  <Input value={draft.complete_label} onChange={(e) => setDraft({ ...draft, complete_label: e.target.value })} />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ======================= SEÇÕES ======================= */}
        <TabsContent value="secoes" className="space-y-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Seções da Home</CardTitle>
              <p className="text-xs text-muted-foreground">
                Personalize comportamento de cada seção. Salvas em <code>sections_config</code> (override do default).
              </p>
            </CardHeader>
            <CardContent>
              <ScrollArea className="max-h-[60vh] pr-2">
                <div className="space-y-2">
                  {HOME_SECTIONS.map((s) => {
                    const cfg = (draft.sections_config?.[s.key] ?? {}) as any;
                    const inSimple = cfg.in_simple ?? s.defaultSimple;
                    const inHidden = cfg.in_hidden_sessions ?? s.hiddenSessions;
                    const customizable = cfg.customizable ?? true;
                    const desc = cfg.description ?? s.description;
                    const guideKey = cfg.guide_key ?? s.guideKey ?? '';
                    const patch = (next: any) => {
                      setDraft({
                        ...draft,
                        sections_config: { ...draft.sections_config, [s.key]: { ...cfg, ...next } },
                      });
                    };
                    return (
                      <div key={s.key} className="rounded-lg border border-border/60 bg-card/40 p-3 space-y-2">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="font-semibold text-sm">{s.label}</div>
                          <code className="text-[10px] text-muted-foreground">{s.key}</code>
                        </div>
                        <Textarea
                          rows={2}
                          value={desc}
                          onChange={(e) => patch({ description: e.target.value })}
                          placeholder="Descrição curta para o usuário"
                          className="text-xs"
                        />
                        <div className="grid sm:grid-cols-3 gap-2 text-xs">
                          <label className="flex items-center justify-between gap-2 rounded border border-border/40 p-2">
                            <span>Aparece no Modo Simples</span>
                            <Switch checked={inSimple} onCheckedChange={(v) => patch({ in_simple: v })} />
                          </label>
                          <label className="flex items-center justify-between gap-2 rounded border border-border/40 p-2">
                            <span>Vai para Sessões Ocultas</span>
                            <Switch checked={inHidden} onCheckedChange={(v) => patch({ in_hidden_sessions: v })} />
                          </label>
                          <label className="flex items-center justify-between gap-2 rounded border border-border/40 p-2">
                            <span>Personalizável</span>
                            <Switch checked={customizable} onCheckedChange={(v) => patch({ customizable: v })} />
                          </label>
                        </div>
                        <div>
                          <Label className="text-[10px] uppercase">Vincular guideKey</Label>
                          <Input value={guideKey} onChange={(e) => patch({ guide_key: e.target.value })} className="h-8 text-xs" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ======================= SESSÕES OCULTAS ======================= */}
        <TabsContent value="ocultas" className="space-y-3">
          <Card>
            <CardHeader><CardTitle className="text-base">Sessões Ocultas</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">Ativar Sessões Ocultas</div>
                  <div className="text-xs text-muted-foreground">Mostra o atalho ✨ no menu lateral no Modo Simples.</div>
                </div>
                <Switch
                  checked={draft.hidden_sessions_enabled}
                  onCheckedChange={(v) => setDraft({ ...draft, hidden_sessions_enabled: v })}
                />
              </div>
              <div>
                <Label className="text-xs">Nome da entrada</Label>
                <Input
                  value={draft.hidden_sessions_title}
                  onChange={(e) => setDraft({ ...draft, hidden_sessions_title: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-xs">Chamada / descrição</Label>
                <Textarea
                  rows={3}
                  value={draft.hidden_sessions_description}
                  onChange={(e) => setDraft({ ...draft, hidden_sessions_description: e.target.value })}
                />
              </div>
              <p className="text-[11px] text-muted-foreground">
                A ordem dos itens segue <code>HOME_SECTIONS</code>; Caixa Oculta, Criadores VIP e Salas Ocultas
                ganham destaque visual automaticamente.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ======================= MÉTRICAS ======================= */}
        <TabsContent value="metricas" className="space-y-3">
          <div className="grid sm:grid-cols-3 gap-3">
            <Card><CardContent className="p-4">
              <div className="text-[11px] text-muted-foreground uppercase">Usuários totais</div>
              <div className="text-2xl font-bold">{total}</div>
            </CardContent></Card>
            <Card><CardContent className="p-4">
              <div className="text-[11px] text-muted-foreground uppercase">Viram o modal</div>
              <div className="text-2xl font-bold">{metrics?.modal_seen ?? 0}</div>
            </CardContent></Card>
            <Card><CardContent className="p-4">
              <div className="text-[11px] text-muted-foreground uppercase">Adiaram modal</div>
              <div className="text-2xl font-bold">{metrics?.modal_snoozed ?? 0}</div>
            </CardContent></Card>
          </div>

          <Card>
            <CardHeader><CardTitle className="text-base">Distribuição por modo</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {Object.entries(metrics?.distribution ?? {}).map(([mode, count]) => {
                const pct = total ? Math.round((count / total) * 100) : 0;
                return (
                  <div key={mode} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="font-medium capitalize">{mode}</span>
                      <span className="text-muted-foreground">{count} · {pct}%</span>
                    </div>
                    <div className="h-2 rounded bg-muted overflow-hidden">
                      <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
              {!metrics && <div className="text-xs text-muted-foreground">Carregando…</div>}
              <div className="text-[11px] text-muted-foreground pt-2">
                Última troca registrada: {metrics?.last_change ? new Date(metrics.last_change).toLocaleString() : '—'}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Top usuários em Personalizado</CardTitle></CardHeader>
            <CardContent>
              {(metrics?.top_custom_users ?? []).length === 0 ? (
                <div className="text-xs text-muted-foreground">Sem dados.</div>
              ) : (
                <ul className="text-xs space-y-1">
                  {(metrics?.top_custom_users ?? []).map((u, i) => (
                    <li key={i} className="flex justify-between border-b border-border/40 py-1">
                      <span>#{i + 1} · {u.sections_count} seções ativas</span>
                      <span className="text-muted-foreground">{new Date(u.updated_at).toLocaleDateString()}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ======================= LOGS ======================= */}
        <TabsContent value="logs">
          <Card>
            <CardHeader><CardTitle className="text-base">Logs do painel</CardTitle></CardHeader>
            <CardContent>
              <ScrollArea className="max-h-[60vh]">
                {(logs ?? []).length === 0 ? (
                  <div className="text-xs text-muted-foreground">Sem registros.</div>
                ) : (
                  <ul className="text-xs space-y-2">
                    {(logs ?? []).map((l) => (
                      <li key={l.id} className="rounded border border-border/40 p-2">
                        <div className="flex justify-between gap-2">
                          <span className="font-semibold">{l.action}</span>
                          <span className="text-muted-foreground">{new Date(l.created_at).toLocaleString()}</span>
                        </div>
                        <pre className="mt-1 text-[10px] text-muted-foreground overflow-x-auto whitespace-pre-wrap break-words">
{JSON.stringify(l.payload, null, 2)}
                        </pre>
                      </li>
                    ))}
                  </ul>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

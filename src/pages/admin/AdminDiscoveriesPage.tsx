import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { supabase } from '@/lib/supabaseExternal';
import { toast } from 'sonner';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import {
  Plus,
  Pencil,
  Trash2,
  Sparkles,
  Loader2,
  RotateCcw,
  BarChart3,
} from 'lucide-react';
import {
  DISCOVERY_ICON_NAMES,
  getDiscoveryIcon,
} from '@/components/feed/discoveryIcons';
import { DiscoverySlidePreviewCard } from '@/components/feed/DiscoverySlidePreviewCard';
import type {
  DiscoverySlide,
  DiscoveryPlan,
} from '@/data/discoveryUniverseSlides';

interface SlideRow {
  id: string;
  slug: string;
  title: string;
  description: string;
  cta_label: string;
  cta_route: string;
  icon: string | null;
  category: string | null;
  target_plans: string[] | null;
  priority: number;
  is_new: boolean;
  is_active: boolean;
  requires_kyc: boolean;
  starts_at: string | null;
  ends_at: string | null;
  mission_label: string | null;
  mission_goal: string | null;
  mission_target: number | null;
  campaign_tag: string | null;
  campaign_color: string | null;
}

const PLANS: DiscoveryPlan[] = ['free', 'premium', 'vip'];
const ANALYTICS_KEY = 'discovery_clicks_v1';

// ─── Validação ─────────────────────────────────────────────────────────
const slideSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(2, 'Slug muito curto')
    .max(60, 'Slug muito longo')
    .regex(/^[a-z0-9-]+$/, 'Use apenas letras minúsculas, números e hífen'),
  title: z.string().trim().min(2, 'Título muito curto').max(80, 'Máx. 80'),
  description: z
    .string()
    .trim()
    .min(10, 'Descrição muito curta')
    .max(240, 'Máx. 240'),
  cta_label: z.string().trim().min(2, 'CTA muito curto').max(40, 'Máx. 40'),
  cta_route: z
    .string()
    .trim()
    .min(1, 'Rota obrigatória')
    .max(120, 'Máx. 120')
    .regex(/^\//, 'A rota deve começar com /'),
  icon: z.string().trim().min(1).max(40),
  category: z.string().trim().min(1).max(40),
  target_plans: z.array(z.enum(['free', 'premium', 'vip'])).min(1, 'Escolha ao menos um plano'),
  priority: z.number().int().min(0).max(999),
});

function sanitizeText(s: string) {
  return s.replace(/<[^>]*>/g, '').trim();
}

const empty: Partial<SlideRow> = {
  slug: '',
  title: '',
  description: '',
  cta_label: '',
  cta_route: '/',
  icon: 'sparkles',
  category: 'social',
  target_plans: ['free', 'premium', 'vip'],
  priority: 50,
  is_new: false,
  is_active: true,
  requires_kyc: false,
  starts_at: null,
  ends_at: null,
  mission_label: null,
  mission_goal: null,
  mission_target: null,
  campaign_tag: null,
  campaign_color: null,
};

// Aceita "" / null / Date local; devolve ISO ou null.
function toIsoOrNull(v: string | null | undefined): string | null {
  if (!v) return null;
  const t = new Date(v);
  return Number.isNaN(t.getTime()) ? null : t.toISOString();
}
// Converte ISO em valor para input[type=datetime-local] (sem tz suffix)
function isoToLocalInput(v: string | null | undefined): string {
  if (!v) return '';
  try {
    const d = new Date(v);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch { return ''; }
}

// ─── Analytics local (localStorage) ────────────────────────────────────
function readAnalytics(): Record<string, number> {
  try {
    const raw = localStorage.getItem(ANALYTICS_KEY);
    return raw ? (JSON.parse(raw) as Record<string, number>) : {};
  } catch {
    return {};
  }
}

export default function AdminDiscoveriesPage() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Partial<SlideRow> | null>(null);
  const [analyticsTick, setAnalyticsTick] = useState(0);

  const { data: slides = [], isLoading } = useQuery({
    queryKey: ['admin', 'discovery-slides'],
    queryFn: async (): Promise<SlideRow[]> => {
      const { data, error } = await (supabase as any)
        .from('feed_discovery_slides')
        .select('*')
        .order('priority', { ascending: false });
      if (error) throw error;
      return (data || []) as SlideRow[];
    },
  });

  const upsert = useMutation({
    mutationFn: async (row: Partial<SlideRow>) => {
      const cleaned = {
        slug: (row.slug || '').toLowerCase().trim(),
        title: sanitizeText(row.title || ''),
        description: sanitizeText(row.description || ''),
        cta_label: sanitizeText(row.cta_label || ''),
        cta_route: (row.cta_route || '').trim(),
        icon: (row.icon || 'sparkles').trim(),
        category: (row.category || 'general').trim(),
        target_plans: row.target_plans || [],
        priority: Number(row.priority ?? 50),
      };
      const parsed = slideSchema.safeParse(cleaned);
      if (!parsed.success) {
        throw new Error(parsed.error.issues[0]?.message || 'Dados inválidos');
      }
      const missionTarget =
        row.mission_target == null || row.mission_target === ('' as any)
          ? null
          : Math.max(1, Math.min(9999, Number(row.mission_target) || 0));
      const campaignColor = (row.campaign_color || '').trim() || null;
      if (campaignColor && !/^#[0-9a-fA-F]{3,8}$/.test(campaignColor)) {
        throw new Error('Cor da campanha inválida (use HEX, ex.: #8b5cf6)');
      }
      const payload: any = {
        ...cleaned,
        is_new: !!row.is_new,
        is_active: !!row.is_active,
        requires_kyc: !!row.requires_kyc,
        starts_at: toIsoOrNull(row.starts_at as any),
        ends_at: toIsoOrNull(row.ends_at as any),
        mission_label: sanitizeText(row.mission_label || '') || null,
        mission_goal: sanitizeText(row.mission_goal || '') || null,
        mission_target: missionTarget,
        campaign_tag: sanitizeText(row.campaign_tag || '') || null,
        campaign_color: campaignColor,
      };
      if (row.id) payload.id = row.id;
      const { error } = await (supabase as any)
        .from('feed_discovery_slides')
        .upsert(payload, { onConflict: 'slug' });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Slide salvo');
      qc.invalidateQueries({ queryKey: ['admin', 'discovery-slides'] });
      qc.invalidateQueries({ queryKey: ['discovery-slides'] });
      setEditing(null);
    },
    onError: (e: any) => toast.error(e?.message || 'Erro ao salvar'),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from('feed_discovery_slides')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Slide removido');
      qc.invalidateQueries({ queryKey: ['admin', 'discovery-slides'] });
      qc.invalidateQueries({ queryKey: ['discovery-slides'] });
    },
    onError: (e: any) => toast.error(e?.message || 'Erro ao remover'),
  });

  const toggle = useMutation({
    mutationFn: async ({
      id,
      field,
      value,
    }: {
      id: string;
      field: 'is_active' | 'is_new';
      value: boolean;
    }) => {
      const { error } = await (supabase as any)
        .from('feed_discovery_slides')
        .update({ [field]: value })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'discovery-slides'] });
      qc.invalidateQueries({ queryKey: ['discovery-slides'] });
    },
  });

  const analytics = useMemo(() => {
    const data = readAnalytics();
    const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
    const total = entries.reduce((s, [, v]) => s + v, 0);
    return { entries, total };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analyticsTick]);

  const resetAnalytics = () => {
    if (!confirm('Apagar todos os contadores locais de cliques?')) return;
    try {
      localStorage.removeItem(ANALYTICS_KEY);
      setAnalyticsTick((t) => t + 1);
      toast.success('Analytics local resetado');
    } catch {
      toast.error('Não foi possível resetar');
    }
  };

  return (
    <div className="container mx-auto p-4 sm:p-6 max-w-5xl space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" /> Descubra o Universo Oculto
          </h1>
          <p className="text-sm text-muted-foreground">
            Gerencie os slides do carrossel fixo no topo do feed.
          </p>
        </div>
        <Button onClick={() => setEditing({ ...empty })}>
          <Plus className="h-4 w-4" /> Novo slide
        </Button>
      </div>

      {/* ─── Analytics local ─────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" /> Cliques (local)
            </CardTitle>
            <Button size="sm" variant="ghost" onClick={resetAnalytics}>
              <RotateCcw className="h-3.5 w-3.5" /> Resetar
            </Button>
          </div>
          <CardDescription className="text-xs">
            Contagem armazenada no navegador (`localStorage`). Útil para validar
            interesse durante testes — não substitui um analytics central.
            Total: <strong>{analytics.total}</strong>
          </CardDescription>
        </CardHeader>
        <CardContent>
          {analytics.entries.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhum clique registrado ainda.</p>
          ) : (
            <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {analytics.entries.map(([slug, count]) => (
                <li
                  key={slug}
                  className="flex items-center justify-between rounded-md border border-border/40 bg-muted/30 px-2 py-1 text-xs"
                >
                  <span className="font-mono truncate">{slug}</span>
                  <Badge variant="secondary">{count}</Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* ─── Lista de slides ─────────────────────────────────────── */}
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : slides.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            Nenhum slide cadastrado. O feed exibirá os slides padrão (fallback).
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {slides.map((s) => {
            const Icon = getDiscoveryIcon(s.icon);
            return (
              <Card key={s.id} className="border-border/60">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="h-9 w-9 rounded-lg flex items-center justify-center border border-primary/30 bg-primary/10 shrink-0">
                        <Icon className="h-4 w-4 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <CardTitle className="text-base flex items-center gap-2 flex-wrap">
                          {s.title}
                          {s.is_new && (
                            <Badge className="bg-amber-500/15 text-amber-300 border-amber-400/30">
                              Novo
                            </Badge>
                          )}
                          {!s.is_active && <Badge variant="secondary">Inativo</Badge>}
                          {s.campaign_tag && (
                            <Badge
                              className="border"
                              style={{
                                color: s.campaign_color || 'hsl(var(--primary))',
                                borderColor: (s.campaign_color || 'hsl(var(--primary))') + '55',
                                background: (s.campaign_color || 'hsl(var(--primary))') + '14',
                              }}
                            >
                              {s.campaign_tag}
                            </Badge>
                          )}
                          {s.mission_label && (
                            <Badge variant="outline" className="text-[10px]">
                              ✦ {s.mission_label}
                            </Badge>
                          )}
                        </CardTitle>
                        <CardDescription className="text-xs truncate">
                          <span className="font-mono">{s.slug}</span> · {s.category} · prioridade {s.priority} ·{' '}
                          {(s.target_plans || []).join(', ')}
                          {(s.starts_at || s.ends_at) && (
                            <>
                              {' '}· vigência{' '}
                              {s.starts_at ? new Date(s.starts_at).toLocaleDateString() : '—'}
                              {' → '}
                              {s.ends_at ? new Date(s.ends_at).toLocaleDateString() : '∞'}
                            </>
                          )}
                        </CardDescription>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={s.is_active}
                        onCheckedChange={(v) =>
                          toggle.mutate({ id: s.id, field: 'is_active', value: v })
                        }
                      />
                      <Button size="icon" variant="ghost" onClick={() => setEditing(s)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          if (confirm(`Remover slide "${s.title}"?`)) remove.mutate(s.id);
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  {s.description}
                  <div className="mt-1 text-xs text-foreground/70">
                    CTA: <span className="font-medium">{s.cta_label}</span> →{' '}
                    <span className="font-mono">{s.cta_route}</span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* ─── Modal de edição ─────────────────────────────────────── */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && !upsert.isPending && setEditing(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing?.id ? 'Editar slide' : 'Novo slide'}</DialogTitle>
          </DialogHeader>
          {editing && (
            <SlideForm value={editing} onChange={setEditing} disabled={upsert.isPending} />
          )}
          <DialogFooter className="gap-2">
            <Button
              variant="ghost"
              disabled={upsert.isPending}
              onClick={() => setEditing(null)}
            >
              Cancelar
            </Button>
            <Button
              disabled={upsert.isPending}
              onClick={() => editing && upsert.mutate(editing)}
            >
              {upsert.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Salvando…
                </>
              ) : (
                'Salvar'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Formulário ─────────────────────────────────────────────────────────
function SlideForm({
  value,
  onChange,
  disabled,
}: {
  value: Partial<SlideRow>;
  onChange: (v: Partial<SlideRow>) => void;
  disabled?: boolean;
}) {
  const set = (patch: Partial<SlideRow>) => onChange({ ...value, ...patch });
  const plans = (value.target_plans || []) as DiscoveryPlan[];

  // Slide para o preview (mapeamento row → slide)
  const previewSlide: DiscoverySlide = {
    id: value.id || 'preview',
    slug: value.slug || 'preview',
    title: value.title || 'Título do slide',
    description: value.description || 'Descrição emocional curta para despertar curiosidade.',
    ctaLabel: value.cta_label || 'Explorar',
    ctaRoute: value.cta_route || '/',
    icon: value.icon || 'sparkles',
    category: value.category || 'social',
    targetPlans: plans.length > 0 ? plans : ['free', 'premium', 'vip'],
    priority: value.priority ?? 50,
    isNew: !!value.is_new,
    requiresKyc: !!value.requires_kyc,
    missionLabel: value.mission_label || undefined,
    missionGoal: value.mission_goal || undefined,
    missionTarget: value.mission_target ?? undefined,
    campaignTag: value.campaign_tag || undefined,
    campaignColor: value.campaign_color || undefined,
  };

  return (
    <div className="grid gap-4 max-h-[70vh] overflow-y-auto pr-1">
      {/* Preview ao vivo */}
      <div>
        <Label className="text-xs uppercase tracking-wider text-muted-foreground">
          Preview no feed
        </Label>
        <div className="mt-1.5 p-2 rounded-lg bg-black/40 border border-border/40">
          <DiscoverySlidePreviewCard slide={previewSlide} userPlan="free" />
        </div>
      </div>

      <Separator />

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Slug (único)</Label>
          <Input
            value={value.slug || ''}
            onChange={(e) =>
              set({
                slug: e.target.value
                  .toLowerCase()
                  .replace(/[^a-z0-9-]/g, '-')
                  .slice(0, 60),
              })
            }
            placeholder="aura-match"
            disabled={disabled}
          />
        </div>
        <div>
          <Label>Categoria</Label>
          <Input
            value={value.category || ''}
            onChange={(e) => set({ category: e.target.value.slice(0, 40) })}
            disabled={disabled}
            placeholder="social"
          />
        </div>
      </div>

      <div>
        <Label>Título</Label>
        <Input
          value={value.title || ''}
          onChange={(e) => set({ title: e.target.value.slice(0, 80) })}
          disabled={disabled}
          maxLength={80}
        />
        <p className="text-[10px] text-muted-foreground mt-0.5">
          {(value.title || '').length}/80
        </p>
      </div>

      <div>
        <Label>Descrição emocional</Label>
        <Textarea
          value={value.description || ''}
          onChange={(e) => set({ description: e.target.value.slice(0, 240) })}
          rows={3}
          maxLength={240}
          disabled={disabled}
        />
        <p className="text-[10px] text-muted-foreground mt-0.5">
          {(value.description || '').length}/240
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>CTA Label</Label>
          <Input
            value={value.cta_label || ''}
            onChange={(e) => set({ cta_label: e.target.value.slice(0, 40) })}
            disabled={disabled}
            maxLength={40}
          />
        </div>
        <div>
          <Label>Rota</Label>
          <Input
            value={value.cta_route || ''}
            onChange={(e) => set({ cta_route: e.target.value.slice(0, 120) })}
            placeholder="/aura-match"
            disabled={disabled}
          />
        </div>
      </div>

      <div>
        <Label>Ícone</Label>
        <IconPicker
          value={value.icon || 'sparkles'}
          onChange={(name) => set({ icon: name })}
          disabled={disabled}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Prioridade (0–999)</Label>
          <Input
            type="number"
            min={0}
            max={999}
            value={value.priority ?? 50}
            onChange={(e) =>
              set({
                priority: Math.max(0, Math.min(999, Number(e.target.value) || 0)),
              })
            }
            disabled={disabled}
          />
        </div>
        <div>
          <Label>Planos alvo</Label>
          <div className="flex gap-3 mt-2 flex-wrap">
            {PLANS.map((p) => {
              const checked = plans.includes(p);
              return (
                <label key={p} className="flex items-center gap-2 text-sm capitalize">
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={disabled}
                    onChange={(e) =>
                      set({
                        target_plans: e.target.checked
                          ? [...plans, p]
                          : plans.filter((x) => x !== p),
                      })
                    }
                  />
                  {p}
                </label>
              );
            })}
          </div>
        </div>
      </div>

      <Separator />

      {/* ─── Missão (opcional) ───────────────────────────────────── */}
      <div className="space-y-2">
        <Label className="text-xs uppercase tracking-wider text-muted-foreground">
          Missão (opcional) — vira CTA emocional no card
        </Label>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Rótulo</Label>
            <Input
              value={value.mission_label || ''}
              onChange={(e) => set({ mission_label: e.target.value.slice(0, 40) })}
              placeholder="Sua Missão"
              maxLength={40}
              disabled={disabled}
            />
          </div>
          <div>
            <Label className="text-xs">Alvo numérico</Label>
            <Input
              type="number"
              min={1}
              max={9999}
              value={value.mission_target ?? ''}
              onChange={(e) =>
                set({ mission_target: e.target.value === '' ? null : Math.max(1, Math.min(9999, Number(e.target.value) || 0)) })
              }
              placeholder="3"
              disabled={disabled}
            />
          </div>
        </div>
        <div>
          <Label className="text-xs">Objetivo emocional</Label>
          <Input
            value={value.mission_goal || ''}
            onChange={(e) => set({ mission_goal: e.target.value.slice(0, 120) })}
            placeholder="Faça 3 conexões no Aura Match"
            maxLength={120}
            disabled={disabled}
          />
        </div>
      </div>

      <Separator />

      {/* ─── Campanha temporária (opcional) ─────────────────────── */}
      <div className="space-y-2">
        <Label className="text-xs uppercase tracking-wider text-muted-foreground">
          Campanha temporária (opcional)
        </Label>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Tag visível</Label>
            <Input
              value={value.campaign_tag || ''}
              onChange={(e) => set({ campaign_tag: e.target.value.slice(0, 40) })}
              placeholder="🌙 Semana das Salas"
              maxLength={40}
              disabled={disabled}
            />
          </div>
          <div>
            <Label className="text-xs">Cor (HEX)</Label>
            <div className="flex items-center gap-2">
              <Input
                value={value.campaign_color || ''}
                onChange={(e) => set({ campaign_color: e.target.value.slice(0, 9) })}
                placeholder="#8b5cf6"
                maxLength={9}
                disabled={disabled}
              />
              <input
                type="color"
                value={value.campaign_color || '#8b5cf6'}
                onChange={(e) => set({ campaign_color: e.target.value })}
                disabled={disabled}
                aria-label="Selecionar cor da campanha"
                className="h-9 w-9 rounded border border-border/40 bg-transparent"
              />
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Início (opcional)</Label>
            <Input
              type="datetime-local"
              value={isoToLocalInput(value.starts_at)}
              onChange={(e) => set({ starts_at: e.target.value || null })}
              disabled={disabled}
            />
          </div>
          <div>
            <Label className="text-xs">Fim (opcional)</Label>
            <Input
              type="datetime-local"
              value={isoToLocalInput(value.ends_at)}
              onChange={(e) => set({ ends_at: e.target.value || null })}
              disabled={disabled}
            />
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground">
          Slides com vigência fora da janela ficam ocultos automaticamente.
        </p>
      </div>

      <Separator />

      <div className="flex items-center gap-6 flex-wrap">
        <label className="flex items-center gap-2 text-sm">
          <Switch
            checked={!!value.is_active}
            disabled={disabled}
            onCheckedChange={(v) => set({ is_active: v })}
          />
          Ativo
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Switch
            checked={!!value.is_new}
            disabled={disabled}
            onCheckedChange={(v) => set({ is_new: v })}
          />
          Marcar como Novo
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Switch
            checked={!!value.requires_kyc}
            disabled={disabled}
            onCheckedChange={(v) => set({ requires_kyc: v })}
          />
          Exige KYC
        </label>
      </div>
    </div>
  );
}

// ─── Icon picker ────────────────────────────────────────────────────────
function IconPicker({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (name: string) => void;
  disabled?: boolean;
}) {
  const [filter, setFilter] = useState('');
  const list = useMemo(
    () =>
      DISCOVERY_ICON_NAMES.filter((n) =>
        n.toLowerCase().includes(filter.toLowerCase())
      ),
    [filter]
  );

  return (
    <div className="space-y-2">
      <Input
        placeholder="Buscar ícone…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        disabled={disabled}
        className="h-8 text-sm"
      />
      <div className="grid grid-cols-6 sm:grid-cols-8 gap-1 max-h-40 overflow-y-auto rounded-md border border-border/40 p-2 bg-muted/20">
        {list.map((name) => {
          const Icon = getDiscoveryIcon(name);
          const active = value === name;
          return (
            <button
              key={name}
              type="button"
              disabled={disabled}
              title={name}
              onClick={() => onChange(name)}
              className={[
                'h-9 w-full rounded-md flex items-center justify-center transition-colors',
                active
                  ? 'bg-primary/20 border border-primary/50 text-primary'
                  : 'border border-transparent hover:bg-muted text-muted-foreground',
              ].join(' ')}
            >
              <Icon className="h-4 w-4" />
            </button>
          );
        })}
        {list.length === 0 && (
          <p className="col-span-full text-xs text-muted-foreground py-3 text-center">
            Nenhum ícone encontrado.
          </p>
        )}
      </div>
      <p className="text-[10px] text-muted-foreground">
        Selecionado: <span className="font-mono">{value}</span>
      </p>
    </div>
  );
}

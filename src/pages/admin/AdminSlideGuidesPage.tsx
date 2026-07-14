/**
 * AdminSlideGuidesPage — editor master do conteúdo do modal "Saiba mais"
 * por slide (slug). Persiste em oculto_slide_guides via RPC.
 * Recursos: reordenação de passos/FAQ, pré-visualização ao vivo, export/import JSON.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Plus, Trash2, Save, BookOpen, ArrowUp, ArrowDown,
  Eye, Download, Upload,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabaseExternal';
import { useSlideGuidesAdmin, type SlideGuideOverride } from '@/hooks/useSlideGuide';
import { STATIC_DISCOVERY_SLIDES, type DiscoverySlide } from '@/data/discoveryUniverseSlides';
import { SlideInfoDialog } from '@/components/feed/SlideInfoDialog';

interface DraftFaq { q: string; a: string; }
interface Draft {
  slug: string;
  title: string;
  intro: string;
  steps: string[];
  tip: string;
  faq: DraftFaq[];
  cta_label: string;
  cta_route: string;
  is_published: boolean;
}

const EMPTY: Draft = {
  slug: '',
  title: '',
  intro: '',
  steps: [''],
  tip: '',
  faq: [],
  cta_label: '',
  cta_route: '',
  is_published: true,
};

function fromOverride(o: SlideGuideOverride): Draft {
  return {
    slug: o.slug,
    title: o.title || '',
    intro: o.intro || '',
    steps: (o.steps && o.steps.length > 0 ? o.steps : ['']),
    tip: o.tip || '',
    faq: (o.faq && o.faq.length > 0 ? o.faq : []),
    cta_label: o.cta_label || '',
    cta_route: o.cta_route || '',
    is_published: o.is_published !== false,
  };
}

function moveItem<T>(arr: T[], i: number, dir: -1 | 1): T[] {
  const j = i + dir;
  if (j < 0 || j >= arr.length) return arr;
  const next = arr.slice();
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

export default function AdminSlideGuidesPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: list = [], isLoading, refetch } = useSlideGuidesAdmin();
  const [selectedSlug, setSelectedSlug] = useState<string>('');
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const slugOptions = useMemo(() => {
    const fromStatic = STATIC_DISCOVERY_SLIDES.map(s => s.slug);
    const fromDb = list.map(g => g.slug);
    return Array.from(new Set([...fromStatic, ...fromDb])).sort();
  }, [list]);

  useEffect(() => {
    if (!selectedSlug) return;
    const existing = list.find(g => g.slug === selectedSlug);
    if (existing) setDraft(fromOverride(existing));
    else {
      const stat = STATIC_DISCOVERY_SLIDES.find(s => s.slug === selectedSlug);
      setDraft({
        ...EMPTY,
        slug: selectedSlug,
        title: stat?.title || '',
        intro: stat?.description || '',
        cta_label: stat?.ctaLabel || '',
        cta_route: stat?.ctaRoute || '',
      });
    }
  }, [selectedSlug, list]);

  // Steps
  const updateStep = (i: number, v: string) =>
    setDraft(d => ({ ...d, steps: d.steps.map((s, j) => (i === j ? v : s)) }));
  const addStep = () => setDraft(d => ({ ...d, steps: [...d.steps, ''] }));
  const removeStep = (i: number) =>
    setDraft(d => ({ ...d, steps: d.steps.filter((_, j) => j !== i) }));
  const moveStep = (i: number, dir: -1 | 1) =>
    setDraft(d => ({ ...d, steps: moveItem(d.steps, i, dir) }));

  // FAQ
  const updateFaq = (i: number, key: keyof DraftFaq, v: string) =>
    setDraft(d => ({ ...d, faq: d.faq.map((f, j) => (i === j ? { ...f, [key]: v } : f)) }));
  const addFaq = () => setDraft(d => ({ ...d, faq: [...d.faq, { q: '', a: '' }] }));
  const removeFaq = (i: number) =>
    setDraft(d => ({ ...d, faq: d.faq.filter((_, j) => j !== i) }));
  const moveFaq = (i: number, dir: -1 | 1) =>
    setDraft(d => ({ ...d, faq: moveItem(d.faq, i, dir) }));

  // Slide sintético para pré-visualização
  const previewSlide: DiscoverySlide = useMemo(() => {
    const base = STATIC_DISCOVERY_SLIDES.find(s => s.slug === draft.slug);
    return {
      id: `preview-${draft.slug || 'novo'}`,
      slug: draft.slug || 'preview',
      title: draft.title || base?.title || 'Pré-visualização',
      description: draft.intro || base?.description || '',
      ctaLabel: draft.cta_label || base?.ctaLabel || 'Começar',
      ctaRoute: draft.cta_route || base?.ctaRoute || '/feed',
      icon: base?.icon || 'sparkles',
      category: base?.category || 'social',
      targetPlans: base?.targetPlans || ['free', 'premium', 'vip'],
      priority: base?.priority || 0,
      isNew: false,
    } as DiscoverySlide;
  }, [draft]);

  // Export JSON
  const exportCurrent = () => {
    if (!draft.slug) {
      toast({ title: 'Selecione um slug primeiro', variant: 'destructive' });
      return;
    }
    const payload = { version: 1, type: 'slide_guide', guide: draft };
    downloadJson(`slide-guide-${draft.slug}.json`, payload);
  };

  const exportAll = () => {
    const payload = {
      version: 1,
      type: 'slide_guides_bundle',
      exported_at: new Date().toISOString(),
      guides: list,
    };
    downloadJson(`slide-guides-all-${new Date().toISOString().slice(0, 10)}.json`, payload);
  };

  // Import JSON
  const onPickFile = () => fileInputRef.current?.click();
  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      if (json?.type === 'slide_guide' && json.guide) {
        const g = json.guide as Draft;
        if (!g.slug) throw new Error('slug ausente no JSON');
        setSelectedSlug(g.slug);
        setDraft({ ...EMPTY, ...g, steps: g.steps?.length ? g.steps : [''] });
        toast({ title: 'Guia carregado no editor', description: `Revise e clique em "Salvar" para persistir (${g.slug}).` });
      } else if (json?.type === 'slide_guides_bundle' && Array.isArray(json.guides)) {
        if (!confirm(`Importar e salvar ${json.guides.length} guias agora? Cada slug será sobrescrito.`)) return;
        let ok = 0; let fail = 0;
        for (const g of json.guides as SlideGuideOverride[]) {
          try {
            await (supabase as any).rpc('slide_guide_upsert', {
              p_slug: g.slug,
              p_title: g.title || null,
              p_intro: g.intro || null,
              p_steps: (g.steps || []).filter((s: string) => s && s.trim().length > 0),
              p_tip: g.tip || null,
              p_faq: (g.faq || []).filter((f: any) => f?.q?.trim() && f?.a?.trim()),
              p_cta_label: g.cta_label || null,
              p_cta_route: g.cta_route || null,
              p_is_published: g.is_published !== false,
            });
            ok++;
          } catch {
            fail++;
          }
        }
        await refetch();
        toast({ title: 'Importação concluída', description: `${ok} salvos, ${fail} falharam.` });
      } else {
        toast({ title: 'JSON inválido', description: 'Formato não reconhecido.', variant: 'destructive' });
      }
    } catch (err: any) {
      toast({ title: 'Erro ao importar', description: err?.message || 'Arquivo inválido', variant: 'destructive' });
    }
  };

  const save = async () => {
    if (!draft.slug) {
      toast({ title: 'Selecione um slug', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const { error } = await (supabase as any).rpc('slide_guide_upsert', {
        p_slug: draft.slug,
        p_title: draft.title || null,
        p_intro: draft.intro || null,
        p_steps: draft.steps.filter(s => s.trim().length > 0),
        p_tip: draft.tip || null,
        p_faq: draft.faq.filter(f => f.q.trim() && f.a.trim()),
        p_cta_label: draft.cta_label || null,
        p_cta_route: draft.cta_route || null,
        p_is_published: draft.is_published,
      });
      if (error) throw error;
      toast({ title: 'Guia salvo com sucesso' });
      await refetch();
      qc.invalidateQueries({ queryKey: ['slide-guide', draft.slug] });
    } catch (e: any) {
      toast({ title: 'Erro ao salvar', description: e?.message || 'Tente novamente', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!draft.slug) return;
    if (!confirm(`Remover o guia "${draft.slug}"?`)) return;
    try {
      const { error } = await (supabase as any).rpc('slide_guide_delete', { p_slug: draft.slug });
      if (error) throw error;
      toast({ title: 'Guia removido' });
      setSelectedSlug('');
      setDraft(EMPTY);
      await refetch();
    } catch (e: any) {
      toast({ title: 'Erro ao remover', description: e?.message, variant: 'destructive' });
    }
  };

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6 space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-bold">Guias "Saiba mais" — Editor Master</h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" variant="outline" onClick={exportAll}>
            <Download className="h-4 w-4 mr-1.5" /> Exportar todos
          </Button>
          <Button size="sm" variant="outline" onClick={onPickFile}>
            <Upload className="h-4 w-4 mr-1.5" /> Importar JSON
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={onFileChange}
          />
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        Personalize o conteúdo do modal de tutorial de cada card do carrossel de descoberta.
        Mudanças refletem em tempo real para todos os usuários.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-4">
        {/* Lista */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Slugs disponíveis</CardTitle>
          </CardHeader>
          <CardContent className="p-2 max-h-[70vh] overflow-y-auto">
            <ul className="space-y-1">
              {slugOptions.map(slug => {
                const has = list.find(g => g.slug === slug);
                return (
                  <li key={slug}>
                    <button
                      onClick={() => setSelectedSlug(slug)}
                      className={`w-full text-left text-sm rounded-md px-2 py-1.5 transition flex items-center justify-between gap-2
                        ${selectedSlug === slug ? 'bg-primary/15 text-primary' : 'hover:bg-muted/60'}`}
                    >
                      <span className="truncate">{slug}</span>
                      {has && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full
                          ${has.is_published ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400'}`}>
                          {has.is_published ? 'on' : 'off'}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
            {isLoading && <div className="text-xs text-muted-foreground p-2">Carregando…</div>}
          </CardContent>
        </Card>

        {/* Editor */}
        <Card>
          <CardHeader className="pb-2 flex-row items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-sm">
              {draft.slug ? `Editando: ${draft.slug}` : 'Selecione um slug'}
            </CardTitle>
            <div className="flex items-center gap-3 flex-wrap">
              {draft.slug && (
                <Button size="sm" variant="outline" onClick={() => setPreviewOpen(true)}>
                  <Eye className="h-4 w-4 mr-1.5" /> Pré-visualizar
                </Button>
              )}
              {draft.slug && (
                <Button size="sm" variant="outline" onClick={exportCurrent}>
                  <Download className="h-4 w-4 mr-1.5" /> Exportar
                </Button>
              )}
              {draft.slug && (
                <div className="flex items-center gap-2">
                  <Label htmlFor="pub" className="text-xs">Publicado</Label>
                  <Switch
                    id="pub"
                    checked={draft.is_published}
                    onCheckedChange={v => setDraft(d => ({ ...d, is_published: v }))}
                  />
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {!draft.slug ? (
              <p className="text-sm text-muted-foreground">Escolha um card à esquerda para editar.</p>
            ) : (
              <>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Título</Label>
                    <Input value={draft.title} onChange={e => setDraft(d => ({ ...d, title: e.target.value }))} />
                  </div>
                  <div>
                    <Label className="text-xs">CTA — texto</Label>
                    <Input value={draft.cta_label} onChange={e => setDraft(d => ({ ...d, cta_label: e.target.value }))} />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">CTA — rota (opcional, sobrescreve o slide)</Label>
                  <Input value={draft.cta_route} onChange={e => setDraft(d => ({ ...d, cta_route: e.target.value }))} placeholder="/feed" />
                </div>
                <div>
                  <Label className="text-xs">Intro</Label>
                  <Textarea
                    value={draft.intro}
                    onChange={e => setDraft(d => ({ ...d, intro: e.target.value }))}
                    rows={2}
                  />
                </div>
                <div>
                  <Label className="text-xs">Dica (opcional)</Label>
                  <Textarea
                    value={draft.tip}
                    onChange={e => setDraft(d => ({ ...d, tip: e.target.value }))}
                    rows={2}
                  />
                </div>

                {/* Steps */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">Passos (ordem do tutorial)</Label>
                    <Button size="sm" variant="outline" onClick={addStep}>
                      <Plus className="h-3.5 w-3.5 mr-1" /> Passo
                    </Button>
                  </div>
                  {draft.steps.map((s, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="mt-2 text-[11px] font-semibold text-primary tabular-nums w-5">{i + 1}.</span>
                      <Textarea
                        value={s}
                        onChange={e => updateStep(i, e.target.value)}
                        rows={2}
                        className="flex-1"
                      />
                      <div className="flex flex-col gap-1">
                        <Button size="icon" variant="ghost" className="h-7 w-7" disabled={i === 0}
                          onClick={() => moveStep(i, -1)} aria-label="Mover para cima">
                          <ArrowUp className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7" disabled={i === draft.steps.length - 1}
                          onClick={() => moveStep(i, 1)} aria-label="Mover para baixo">
                          <ArrowDown className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      <Button size="icon" variant="ghost" onClick={() => removeStep(i)} aria-label="Remover passo">
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>

                {/* FAQ */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">FAQ (ordem de exibição)</Label>
                    <Button size="sm" variant="outline" onClick={addFaq}>
                      <Plus className="h-3.5 w-3.5 mr-1" /> Pergunta
                    </Button>
                  </div>
                  {draft.faq.length === 0 && (
                    <p className="text-xs text-muted-foreground">Nenhuma pergunta cadastrada.</p>
                  )}
                  {draft.faq.map((f, i) => (
                    <div key={i} className="rounded-md border border-border/50 p-2 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-semibold text-primary tabular-nums w-5">{i + 1}.</span>
                        <Input
                          value={f.q}
                          onChange={e => updateFaq(i, 'q', e.target.value)}
                          placeholder="Pergunta"
                        />
                        <div className="flex flex-col gap-1">
                          <Button size="icon" variant="ghost" className="h-7 w-7" disabled={i === 0}
                            onClick={() => moveFaq(i, -1)} aria-label="Mover pergunta para cima">
                            <ArrowUp className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7" disabled={i === draft.faq.length - 1}
                            onClick={() => moveFaq(i, 1)} aria-label="Mover pergunta para baixo">
                            <ArrowDown className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                        <Button size="icon" variant="ghost" onClick={() => removeFaq(i)} aria-label="Remover pergunta">
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                      <Textarea
                        value={f.a}
                        onChange={e => updateFaq(i, 'a', e.target.value)}
                        placeholder="Resposta"
                        rows={2}
                      />
                    </div>
                  ))}
                </div>

                <div className="flex flex-col sm:flex-row gap-2 pt-2">
                  <Button onClick={save} disabled={saving} className="flex-1">
                    <Save className="h-4 w-4 mr-1.5" />
                    {saving ? 'Salvando…' : 'Salvar guia'}
                  </Button>
                  {list.find(g => g.slug === draft.slug) && (
                    <Button variant="outline" onClick={remove} className="sm:w-auto">
                      <Trash2 className="h-4 w-4 mr-1.5 text-destructive" />
                      Remover
                    </Button>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Pré-visualização ao vivo — usa o draft atual sem precisar salvar */}
      {previewOpen && (
        <SlideInfoDialog
          open={previewOpen}
          onOpenChange={setPreviewOpen}
          slide={previewSlide}
          previewOverride={{
            slug: draft.slug,
            title: draft.title,
            intro: draft.intro,
            steps: draft.steps.filter(s => s.trim().length > 0),
            tip: draft.tip,
            faq: draft.faq.filter(f => f.q.trim() && f.a.trim()),
            cta_label: draft.cta_label,
            cta_route: draft.cta_route,
            is_published: draft.is_published,
          }}
        />
      )}
    </div>
  );
}

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 0);
}

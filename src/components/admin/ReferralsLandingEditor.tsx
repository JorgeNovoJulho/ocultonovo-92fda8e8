/**
 * ReferralsLandingEditor — editor admin da landing /programa-indicacoes.
 * Edição completa de hero, passos, programas, tabela, selos, FAQ, CTA final
 * e flag global "published". Save abre diff de confirmação.
 */
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Trash2, Plus, ArrowUp, ArrowDown, ExternalLink, Save } from "lucide-react";
import {
  useReferralsLandingContent, useUpdateReferralsLanding,
  DEFAULT_REFERRALS_LANDING, type ReferralsLandingContent, type ProgramItem, type FaqItem, type ComparisonRow,
} from "@/hooks/useReferralsLandingContent";

function move<T>(arr: T[], from: number, to: number): T[] {
  if (to < 0 || to >= arr.length) return arr;
  const next = [...arr];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function ReferralsLandingEditor() {
  const { data, isLoading } = useReferralsLandingContent();
  const update = useUpdateReferralsLanding();
  const [draft, setDraft] = useState<ReferralsLandingContent | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => { if (data) setDraft(data); }, [data]);

  const dirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(data),
    [draft, data],
  );

  if (isLoading || !draft) {
    return <Skeleton className="h-96 w-full" />;
  }

  const setField = <K extends keyof ReferralsLandingContent>(k: K, v: ReferralsLandingContent[K]) =>
    setDraft({ ...draft, [k]: v });

  const setHero = (patch: Partial<ReferralsLandingContent["hero"]>) =>
    setDraft({ ...draft, hero: { ...draft.hero, ...patch } });
  const setHow = (patch: Partial<ReferralsLandingContent["howItWorks"]>) =>
    setDraft({ ...draft, howItWorks: { ...draft.howItWorks, ...patch } });
  const setCmp = (patch: Partial<ReferralsLandingContent["comparison"]>) =>
    setDraft({ ...draft, comparison: { ...draft.comparison, ...patch } });
  const setFaq = (patch: Partial<ReferralsLandingContent["faq"]>) =>
    setDraft({ ...draft, faq: { ...draft.faq, ...patch } });
  const setCta = (patch: Partial<ReferralsLandingContent["finalCta"]>) =>
    setDraft({ ...draft, finalCta: { ...draft.finalCta, ...patch } });

  return (
    <div className="space-y-4">
      {/* HEADER ACTIONS */}
      <div className="flex items-center justify-between gap-3 flex-wrap rounded-lg border border-border/40 bg-card/60 p-3">
        <div className="flex items-center gap-3">
          <Switch
            checked={draft.published}
            onCheckedChange={(v) => setField("published", v)}
            id="published"
          />
          <Label htmlFor="published" className="text-sm font-semibold">
            {draft.published ? "Página publicada" : "Página oculta"}
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild size="sm" variant="outline">
            <a href="/programa-indicacoes" target="_blank" rel="noreferrer">
              <ExternalLink className="h-3.5 w-3.5 mr-1" />Ver página
            </a>
          </Button>
          <Button size="sm" disabled={!dirty || update.isPending} onClick={() => setConfirmOpen(true)}>
            <Save className="h-3.5 w-3.5 mr-1" />
            {dirty ? "Salvar alterações" : "Sem alterações"}
          </Button>
        </div>
      </div>

      {/* HERO */}
      <Card>
        <CardHeader><CardTitle className="text-base">Hero</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Field label="Badge"><Input value={draft.hero.badge} onChange={(e) => setHero({ badge: e.target.value })} /></Field>
          <Field label="Título"><Input value={draft.hero.title} onChange={(e) => setHero({ title: e.target.value })} /></Field>
          <Field label="Subtítulo"><Textarea rows={3} value={draft.hero.subtitle} onChange={(e) => setHero({ subtitle: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="CTA principal — texto"><Input value={draft.hero.ctaLabel} onChange={(e) => setHero({ ctaLabel: e.target.value })} /></Field>
            <Field label="CTA principal — rota"><Input value={draft.hero.ctaRoute} onChange={(e) => setHero({ ctaRoute: e.target.value })} /></Field>
            <Field label="CTA secundário — texto"><Input value={draft.hero.secondaryLabel || ""} onChange={(e) => setHero({ secondaryLabel: e.target.value })} /></Field>
            <Field label="CTA secundário — rota"><Input value={draft.hero.secondaryRoute || ""} onChange={(e) => setHero({ secondaryRoute: e.target.value })} /></Field>
          </div>
        </CardContent>
      </Card>

      {/* HOW IT WORKS */}
      <Card>
        <CardHeader><CardTitle className="text-base">Como funciona</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Field label="Título"><Input value={draft.howItWorks.title} onChange={(e) => setHow({ title: e.target.value })} /></Field>
          <Field label="Subtítulo"><Input value={draft.howItWorks.subtitle} onChange={(e) => setHow({ subtitle: e.target.value })} /></Field>
          <div className="space-y-2">
            {draft.howItWorks.steps.map((s, i) => (
              <div key={i} className="rounded-lg border border-border/30 p-2 space-y-1.5">
                <div className="flex items-center gap-1.5 justify-end">
                  <span className="text-[10px] text-muted-foreground mr-auto">Passo {i + 1}</span>
                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setHow({ steps: move(draft.howItWorks.steps, i, i - 1) })}><ArrowUp className="h-3 w-3" /></Button>
                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setHow({ steps: move(draft.howItWorks.steps, i, i + 1) })}><ArrowDown className="h-3 w-3" /></Button>
                  <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => setHow({ steps: draft.howItWorks.steps.filter((_, x) => x !== i) })}><Trash2 className="h-3 w-3" /></Button>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  <Input placeholder="Ícone (lucide)" value={s.icon} onChange={(e) => { const arr = [...draft.howItWorks.steps]; arr[i] = { ...s, icon: e.target.value }; setHow({ steps: arr }); }} />
                  <Input placeholder="Título" value={s.title} onChange={(e) => { const arr = [...draft.howItWorks.steps]; arr[i] = { ...s, title: e.target.value }; setHow({ steps: arr }); }} className="col-span-2" />
                </div>
                <Textarea rows={2} placeholder="Descrição" value={s.description} onChange={(e) => { const arr = [...draft.howItWorks.steps]; arr[i] = { ...s, description: e.target.value }; setHow({ steps: arr }); }} />
              </div>
            ))}
            <Button size="sm" variant="outline" onClick={() => setHow({ steps: [...draft.howItWorks.steps, { icon: "Sparkles", title: "Novo passo", description: "" }] })}>
              <Plus className="h-3.5 w-3.5 mr-1" />Adicionar passo
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* PROGRAMS */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between">
            Programas
            <Badge variant="outline">{draft.programs.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {draft.programs.map((p, i) => (
            <ProgramEditor
              key={p.id + i}
              item={p}
              onChange={(np) => { const arr = [...draft.programs]; arr[i] = np; setField("programs", arr); }}
              onMoveUp={() => setField("programs", move(draft.programs, i, i - 1))}
              onMoveDown={() => setField("programs", move(draft.programs, i, i + 1))}
              onRemove={() => setField("programs", draft.programs.filter((_, x) => x !== i))}
            />
          ))}
          <Button size="sm" variant="outline" onClick={() => setField("programs", [
            ...draft.programs,
            { id: `programa-${Date.now()}`, icon: "Gift", name: "Novo programa", tagline: "", commission: "5%", audience: "Todos", steps: [], earningsExample: "", ctaLabel: "Acessar", ctaRoute: "/", visible: true } as ProgramItem,
          ])}>
            <Plus className="h-3.5 w-3.5 mr-1" />Adicionar programa
          </Button>
        </CardContent>
      </Card>

      {/* COMPARISON */}
      <Card>
        <CardHeader><CardTitle className="text-base">Tabela comparativa</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Field label="Título"><Input value={draft.comparison.title} onChange={(e) => setCmp({ title: e.target.value })} /></Field>
          <div className="space-y-2">
            {draft.comparison.rows.map((r, i) => (
              <div key={i} className="rounded-lg border border-border/30 p-2 space-y-1.5">
                <div className="flex items-center gap-1.5 justify-end">
                  <span className="text-[10px] text-muted-foreground mr-auto">Linha {i + 1}</span>
                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setCmp({ rows: move(draft.comparison.rows, i, i - 1) })}><ArrowUp className="h-3 w-3" /></Button>
                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setCmp({ rows: move(draft.comparison.rows, i, i + 1) })}><ArrowDown className="h-3 w-3" /></Button>
                  <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => setCmp({ rows: draft.comparison.rows.filter((_, x) => x !== i) })}><Trash2 className="h-3 w-3" /></Button>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-1.5">
                  <Input placeholder="Programa" value={r.program} onChange={(e) => { const arr = [...draft.comparison.rows]; arr[i] = { ...r, program: e.target.value }; setCmp({ rows: arr }); }} />
                  <Input placeholder="Comissão" value={r.commission} onChange={(e) => { const arr = [...draft.comparison.rows]; arr[i] = { ...r, commission: e.target.value }; setCmp({ rows: arr }); }} />
                  <Input placeholder="Público" value={r.audience} onChange={(e) => { const arr = [...draft.comparison.rows]; arr[i] = { ...r, audience: e.target.value }; setCmp({ rows: arr }); }} />
                  <Input placeholder="Pagamento" value={r.payment} onChange={(e) => { const arr = [...draft.comparison.rows]; arr[i] = { ...r, payment: e.target.value }; setCmp({ rows: arr }); }} />
                  <Input placeholder="Requisitos" value={r.requirements} onChange={(e) => { const arr = [...draft.comparison.rows]; arr[i] = { ...r, requirements: e.target.value }; setCmp({ rows: arr }); }} />
                </div>
              </div>
            ))}
            <Button size="sm" variant="outline" onClick={() => setCmp({ rows: [...draft.comparison.rows, { program: "", commission: "", audience: "", payment: "", requirements: "" } as ComparisonRow] })}>
              <Plus className="h-3.5 w-3.5 mr-1" />Adicionar linha
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* TRUST SEALS */}
      <Card>
        <CardHeader><CardTitle className="text-base">Selos de confiança</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {draft.trustSeals.map((s, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <Input value={s} onChange={(e) => { const arr = [...draft.trustSeals]; arr[i] = e.target.value; setField("trustSeals", arr); }} />
              <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => setField("trustSeals", draft.trustSeals.filter((_, x) => x !== i))}><Trash2 className="h-3.5 w-3.5" /></Button>
            </div>
          ))}
          <Button size="sm" variant="outline" onClick={() => setField("trustSeals", [...draft.trustSeals, "🔒 Novo selo"])}>
            <Plus className="h-3.5 w-3.5 mr-1" />Adicionar selo
          </Button>
        </CardContent>
      </Card>

      {/* FAQ */}
      <Card>
        <CardHeader><CardTitle className="text-base">FAQ</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Field label="Título"><Input value={draft.faq.title} onChange={(e) => setFaq({ title: e.target.value })} /></Field>
          <div className="space-y-2">
            {draft.faq.items.map((f, i) => (
              <div key={i} className="rounded-lg border border-border/30 p-2 space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <Switch checked={f.visible !== false} onCheckedChange={(v) => { const arr = [...draft.faq.items]; arr[i] = { ...f, visible: v }; setFaq({ items: arr }); }} />
                  <span className="text-[10px] text-muted-foreground">Visível</span>
                  <div className="ml-auto flex items-center gap-1">
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setFaq({ items: move(draft.faq.items, i, i - 1) })}><ArrowUp className="h-3 w-3" /></Button>
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setFaq({ items: move(draft.faq.items, i, i + 1) })}><ArrowDown className="h-3 w-3" /></Button>
                    <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => setFaq({ items: draft.faq.items.filter((_, x) => x !== i) })}><Trash2 className="h-3 w-3" /></Button>
                  </div>
                </div>
                <Input placeholder="Pergunta" value={f.q} onChange={(e) => { const arr = [...draft.faq.items]; arr[i] = { ...f, q: e.target.value }; setFaq({ items: arr }); }} />
                <Textarea rows={3} placeholder="Resposta" value={f.a} onChange={(e) => { const arr = [...draft.faq.items]; arr[i] = { ...f, a: e.target.value }; setFaq({ items: arr }); }} />
              </div>
            ))}
            <Button size="sm" variant="outline" onClick={() => setFaq({ items: [...draft.faq.items, { q: "", a: "", visible: true } as FaqItem] })}>
              <Plus className="h-3.5 w-3.5 mr-1" />Adicionar pergunta
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* FINAL CTA */}
      <Card>
        <CardHeader><CardTitle className="text-base">CTA final</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Field label="Título"><Input value={draft.finalCta.title} onChange={(e) => setCta({ title: e.target.value })} /></Field>
          <Field label="Subtítulo"><Input value={draft.finalCta.subtitle} onChange={(e) => setCta({ subtitle: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="CTA — texto"><Input value={draft.finalCta.ctaLabel} onChange={(e) => setCta({ ctaLabel: e.target.value })} /></Field>
            <Field label="CTA — rota"><Input value={draft.finalCta.ctaRoute} onChange={(e) => setCta({ ctaRoute: e.target.value })} /></Field>
          </div>
        </CardContent>
      </Card>

      {/* RESET */}
      <div className="flex justify-end">
        <Button size="sm" variant="ghost" onClick={() => setDraft(DEFAULT_REFERRALS_LANDING)}>
          Restaurar conteúdo padrão
        </Button>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Publicar alterações?</AlertDialogTitle>
            <AlertDialogDescription>
              Estas mudanças entram em vigor imediatamente na página pública <code>/programa-indicacoes</code>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={update.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={update.isPending}
              onClick={() => draft && update.mutate(draft, { onSuccess: () => setConfirmOpen(false) })}
            >
              {update.isPending ? "Salvando..." : "Confirmar e publicar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function ProgramEditor({
  item, onChange, onMoveUp, onMoveDown, onRemove,
}: {
  item: ProgramItem;
  onChange: (p: ProgramItem) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-xl border border-border/40 p-3 space-y-2 bg-card/40">
      <div className="flex items-center gap-1.5">
        <Switch checked={item.visible !== false} onCheckedChange={(v) => onChange({ ...item, visible: v })} />
        <span className="text-[10px] text-muted-foreground">Visível</span>
        <Badge variant="outline" className="text-[10px] ml-2 font-mono">#{item.id}</Badge>
        <div className="ml-auto flex items-center gap-1">
          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={onMoveUp} aria-label="Ação"><ArrowUp className="h-3 w-3" /></Button>
          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={onMoveDown} aria-label="Ação"><ArrowDown className="h-3 w-3" /></Button>
          <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={onRemove} aria-label="Excluir"><Trash2 className="h-3 w-3" /></Button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Anchor ID"><Input value={item.id} onChange={(e) => onChange({ ...item, id: e.target.value })} /></Field>
        <Field label="Ícone (lucide)"><Input value={item.icon} onChange={(e) => onChange({ ...item, icon: e.target.value })} /></Field>
        <Field label="Nome"><Input value={item.name} onChange={(e) => onChange({ ...item, name: e.target.value })} /></Field>
        <Field label="Badge (opcional)"><Input value={item.badge || ""} onChange={(e) => onChange({ ...item, badge: e.target.value })} /></Field>
      </div>
      <Field label="Tagline"><Input value={item.tagline} onChange={(e) => onChange({ ...item, tagline: e.target.value })} /></Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Comissão"><Input value={item.commission} onChange={(e) => onChange({ ...item, commission: e.target.value })} /></Field>
        <Field label="Público-alvo"><Input value={item.audience} onChange={(e) => onChange({ ...item, audience: e.target.value })} /></Field>
      </div>
      <Field label="Passos (1 por linha)">
        <Textarea
          rows={4}
          value={(item.steps || []).join("\n")}
          onChange={(e) => onChange({ ...item, steps: e.target.value.split("\n").filter(Boolean) })}
        />
      </Field>
      <Field label="Exemplo de ganho"><Textarea rows={2} value={item.earningsExample} onChange={(e) => onChange({ ...item, earningsExample: e.target.value })} /></Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="CTA — texto"><Input value={item.ctaLabel} onChange={(e) => onChange({ ...item, ctaLabel: e.target.value })} /></Field>
        <Field label="CTA — rota"><Input value={item.ctaRoute} onChange={(e) => onChange({ ...item, ctaRoute: e.target.value })} /></Field>
      </div>
    </div>
  );
}

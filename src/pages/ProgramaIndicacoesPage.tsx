/**
 * /programa-indicacoes — landing pública explicando todos os programas
 * de indicação/afiliados do OCULTO. Conteúdo 100% editável pelo admin.
 * Mobile-first, flat, sem auto-play. Deep-link por #anchor de cada programa.
 */
import { Suspense, lazy, useMemo } from "react";
import { Link } from "react-router-dom";
import * as Icons from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import { Skeleton } from "@/components/ui/skeleton";
import { useReferralsLandingContent, DEFAULT_REFERRALS_LANDING } from "@/hooks/useReferralsLandingContent";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

function Ico({ name, className }: { name: string; className?: string }) {
  const Cmp = (Icons as any)[name] || Icons.Sparkles;
  return <Cmp className={className} aria-hidden />;
}

export default function ProgramaIndicacoesPage() {
  const { data, isLoading } = useReferralsLandingContent();
  const { user } = useAuth();
  const content = data || DEFAULT_REFERRALS_LANDING;

  // Se admin desabilitou, mostra estado mínimo
  if (!isLoading && content.published === false) {
    return (
      <div className="container mx-auto max-w-2xl py-20 px-4 text-center">
        <h1 className="text-xl font-bold mb-2">Programa de Indicações</h1>
        <p className="text-sm text-muted-foreground">
          Esta página está temporariamente indisponível. Volte em breve.
        </p>
      </div>
    );
  }

  const heroPrimaryRoute = user ? content.hero.ctaRoute : "/signup";
  const programs = useMemo(
    () => (content.programs || []).filter((p) => p.visible !== false),
    [content.programs],
  );
  const faqs = useMemo(
    () => (content.faq.items || []).filter((f) => f.visible !== false),
    [content.faq.items],
  );

  if (isLoading) {
    return (
      <div className="container mx-auto max-w-4xl py-10 px-4 space-y-6">
        <Skeleton className="h-40 w-full rounded-2xl" />
        <Skeleton className="h-60 w-full rounded-2xl" />
        <Skeleton className="h-80 w-full rounded-2xl" />
      </div>
    );
  }

  return (
    <main className="min-h-dvh bg-background text-foreground pb-16">
      {/* HERO */}
      <section className="relative overflow-hidden border-b border-border/40">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/10 via-transparent to-transparent pointer-events-none" />
        <div className="container mx-auto max-w-4xl px-4 py-12 md:py-20 relative">
          <Badge variant="outline" className="mb-4 text-[11px] uppercase tracking-wider">
            {content.hero.badge}
          </Badge>
          <h1 className="text-3xl md:text-5xl font-bold leading-tight mb-4">
            {content.hero.title}
          </h1>
          <p className="text-base md:text-lg text-muted-foreground max-w-2xl mb-6">
            {content.hero.subtitle}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button asChild size="lg" className="gap-1.5">
              <Link to={heroPrimaryRoute}>
                <Icons.Rocket className="h-4 w-4" />
                {content.hero.ctaLabel}
              </Link>
            </Button>
            {content.hero.secondaryLabel && content.hero.secondaryRoute && (
              <Button asChild size="lg" variant="outline">
                <Link to={content.hero.secondaryRoute}>{content.hero.secondaryLabel}</Link>
              </Button>
            )}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="container mx-auto max-w-4xl px-4 py-12">
        <div className="text-center mb-8">
          <h2 className="text-2xl md:text-3xl font-bold mb-2">{content.howItWorks.title}</h2>
          <p className="text-sm text-muted-foreground">{content.howItWorks.subtitle}</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {content.howItWorks.steps.map((s, i) => (
            <div key={i} className="rounded-xl border border-border/40 bg-card/60 p-5 relative">
              <span className="absolute -top-3 -left-3 w-8 h-8 rounded-full bg-primary text-primary-foreground text-sm font-bold flex items-center justify-center">
                {i + 1}
              </span>
              <Ico name={s.icon} className="h-6 w-6 text-primary mb-3" />
              <h3 className="font-semibold mb-1">{s.title}</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">{s.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* PROGRAMS GRID */}
      <section className="container mx-auto max-w-5xl px-4 py-12 border-t border-border/40">
        <div className="text-center mb-8">
          <h2 className="text-2xl md:text-3xl font-bold mb-2">Nossos programas</h2>
          <p className="text-sm text-muted-foreground">
            Escolha um — ou todos. Você pode participar de quantos quiser.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {programs.map((p) => (
            <article
              key={p.id}
              id={p.id}
              className="scroll-mt-20 rounded-2xl border border-border/40 bg-card/60 p-5 flex flex-col gap-3 hover:border-primary/40 transition-colors"
            >
              <header className="flex items-start gap-3">
                <div className="shrink-0 w-11 h-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                  <Ico name={p.icon} className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-bold text-lg">{p.name}</h3>
                    {p.badge && (
                      <Badge variant="secondary" className="text-[10px]">{p.badge}</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{p.tagline}</p>
                </div>
              </header>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg bg-primary/5 border border-primary/20 p-2">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Comissão</p>
                  <p className="font-bold text-primary">{p.commission}</p>
                </div>
                <div className="rounded-lg bg-muted/40 border border-border/30 p-2">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Quem participa</p>
                  <p className="font-semibold">{p.audience}</p>
                </div>
              </div>

              <div>
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">Como participar</p>
                <ol className="text-xs space-y-1 list-decimal list-inside text-muted-foreground">
                  {p.steps.map((s, i) => <li key={i}>{s}</li>)}
                </ol>
              </div>

              <div className="rounded-lg bg-emerald-500/5 border border-emerald-500/20 p-2.5">
                <p className="text-[10px] uppercase tracking-wider text-emerald-500 font-semibold mb-0.5">
                  💰 Quanto você ganha
                </p>
                <p className="text-xs">{p.earningsExample}</p>
              </div>

              <Button asChild size="sm" className="w-full mt-auto">
                <Link to={p.ctaRoute}>
                  {p.ctaLabel}
                  <Icons.ArrowRight className="h-3.5 w-3.5 ml-1" />
                </Link>
              </Button>
            </article>
          ))}
        </div>
      </section>

      {/* COMPARISON TABLE */}
      <section className="container mx-auto max-w-5xl px-4 py-12 border-t border-border/40">
        <h2 className="text-2xl md:text-3xl font-bold text-center mb-6">{content.comparison.title}</h2>
        <div className="overflow-x-auto rounded-xl border border-border/40">
          <table className="w-full text-xs md:text-sm">
            <thead className="bg-muted/40">
              <tr>
                <th className="text-left p-3 font-semibold">Programa</th>
                <th className="text-left p-3 font-semibold">Comissão</th>
                <th className="text-left p-3 font-semibold">Público</th>
                <th className="text-left p-3 font-semibold">Pagamento</th>
                <th className="text-left p-3 font-semibold">Requisitos</th>
              </tr>
            </thead>
            <tbody>
              {content.comparison.rows.map((r, i) => (
                <tr key={i} className={cn("border-t border-border/30", i % 2 === 1 && "bg-card/40")}>
                  <td className="p-3 font-semibold">{r.program}</td>
                  <td className="p-3 text-primary font-bold">{r.commission}</td>
                  <td className="p-3 text-muted-foreground">{r.audience}</td>
                  <td className="p-3 text-muted-foreground">{r.payment}</td>
                  <td className="p-3 text-muted-foreground">{r.requirements}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* TRUST SEALS */}
      <section className="container mx-auto max-w-4xl px-4 py-8">
        <div className="flex flex-wrap justify-center gap-2">
          {content.trustSeals.map((seal, i) => (
            <Badge key={i} variant="outline" className="text-xs py-1.5 px-3">
              {seal}
            </Badge>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section className="container mx-auto max-w-3xl px-4 py-12 border-t border-border/40">
        <h2 className="text-2xl md:text-3xl font-bold text-center mb-6">{content.faq.title}</h2>
        <Accordion type="single" collapsible className="w-full">
          {faqs.map((f, i) => (
            <AccordionItem key={i} value={`faq-${i}`}>
              <AccordionTrigger className="text-left text-sm md:text-base">{f.q}</AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground leading-relaxed">
                {f.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>

      {/* FINAL CTA */}
      <section className="container mx-auto max-w-3xl px-4 py-16">
        <div className="rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-8 text-center">
          <h2 className="text-2xl md:text-3xl font-bold mb-2">{content.finalCta.title}</h2>
          <p className="text-sm text-muted-foreground mb-5">{content.finalCta.subtitle}</p>
          <Button asChild size="lg" className="gap-1.5">
            <Link to={user ? content.finalCta.ctaRoute : "/signup"}>
              <Icons.Sparkles className="h-4 w-4" />
              {content.finalCta.ctaLabel}
            </Link>
          </Button>
        </div>
      </section>
    </main>
  );
}

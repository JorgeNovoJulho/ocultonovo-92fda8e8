import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, ArrowLeft } from 'lucide-react';
import { useDiscoverySlides } from '@/hooks/useDiscoverySlides';
import { useProfile } from '@/hooks/useProfile';
import type { DiscoveryPlan } from '@/data/discoveryUniverseSlides';
import { Button } from '@/components/ui/button';

const DiscoverySlidePreviewCard = lazy(() =>
  import('@/components/feed/DiscoverySlidePreviewCard').then((m) => ({
    default: m.DiscoverySlidePreviewCard,
  }))
);

function normalizePlan(plan: string | null | undefined): DiscoveryPlan {
  const p = (plan || 'free').toLowerCase();
  if (p === 'vip') return 'vip';
  if (p === 'premium' || p === 'standard') return 'premium';
  return 'free';
}

/**
 * 🌌 Novidades do Universo Oculto — Fase D
 * Lista enxuta de descobertas marcadas como `is_new=true`
 * (ou as 12 mais recentes/relevantes como fallback).
 * Reusa 100% do card e do hook do carrossel — zero duplicação.
 */
export default function NovidadesPage() {
  const navigate = useNavigate();
  const { profile } = useProfile();
  const userPlan = normalizePlan(profile?.plan_type);
  const { slides, isLoading } = useDiscoverySlides({ userPlan });
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    document.title = 'Novidades do Universo Oculto';
  }, []);

  const list = useMemo(() => {
    const news = slides.filter((s) => s.isNew);
    return (news.length > 0 ? news : slides).slice(0, 12);
  }, [slides]);

  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-30 border-b border-border/50 bg-background/85 backdrop-blur-md">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            onClick={() => navigate(-1)}
            aria-label="Voltar"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <h1 className="text-base sm:text-lg font-semibold tracking-tight">
              Novidades do Universo Oculto
            </h1>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-3 sm:px-4 py-4 pb-[max(env(safe-area-inset-bottom),6rem)] sm:pb-8">
        <p className="text-xs sm:text-sm text-muted-foreground mb-4 px-1">
          Energias, ambientes e experiências que chegaram ao Oculto.
        </p>

        {isLoading || !mounted ? (
          <div className="grid gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-[160px] rounded-2xl border border-border/40 bg-muted/30 animate-pulse"
                style={{ contain: 'content' }}
              />
            ))}
          </div>
        ) : list.length === 0 ? (
          <div className="rounded-2xl border border-border/40 bg-muted/20 p-6 text-center">
            <Sparkles className="h-5 w-5 mx-auto mb-2 text-primary/70" />
            <p className="text-sm text-muted-foreground">
              Nada novo por enquanto. Volte em breve.
            </p>
          </div>
        ) : (
          <Suspense fallback={null}>
            <div className="grid gap-3 [&>article]:w-full [&>article]:max-w-full">
              {list.map((s) => (
                <DiscoverySlidePreviewCard
                  key={s.id}
                  slide={s}
                  userPlan={userPlan}
                  onCta={() => navigate(s.ctaRoute)}
                />
              ))}
            </div>
          </Suspense>
        )}
      </main>
    </div>
  );
}

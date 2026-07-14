/**
 * SlideGuidesViewedResetCard — permite ao usuário redefinir o estado "Visto"
 * dos modais de "Saiba mais", limpando localStorage e o espelho no perfil.
 */
import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BookOpen, RotateCcw, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getViewedSlideGuides, resetViewedSlideGuides, syncViewedSlideGuidesFromServer } from '@/lib/slideGuideViewed';

export function SlideGuidesViewedResetCard() {
  const { toast } = useToast();
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const refresh = () => setCount(getViewedSlideGuides().length);

  useEffect(() => {
    refresh();
    // one-shot: garante reflexo cross-device
    void syncViewedSlideGuidesFromServer().then(refresh);
    const onChange = () => refresh();
    window.addEventListener('slide-guide-viewed', onChange);
    return () => window.removeEventListener('slide-guide-viewed', onChange);
  }, []);

  const handleReset = async () => {
    if (count === 0) {
      toast({ title: 'Nada para redefinir', description: 'Você ainda não marcou nenhum guia como visto.' });
      return;
    }
    if (!confirm('Redefinir o estado "Visto" de todos os guias? Eles voltarão a aparecer como novos.')) return;
    setLoading(true);
    try {
      await resetViewedSlideGuides();
      refresh();
      toast({ title: 'Guias redefinidos', description: 'Os tutoriais voltarão a aparecer como novos.' });
    } catch (e: any) {
      toast({ title: 'Erro', description: e?.message || 'Tente novamente', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-primary" />
          Tutoriais "Saiba mais"
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground leading-relaxed">
          Você já abriu <span className="font-semibold text-foreground">{count}</span>{' '}
          {count === 1 ? 'guia' : 'guias'} de descoberta. Redefina para revisitar todos os tutoriais
          como se fosse a primeira vez (também limpa a indicação "Visto" nos cards).
        </p>
        <Button
          variant="outline"
          className="w-full sm:w-auto"
          onClick={handleReset}
          disabled={loading}
        >
          {loading
            ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Redefinindo…</>
            : <><RotateCcw className="h-4 w-4 mr-2" /> Redefinir guias vistos</>}
        </Button>
      </CardContent>
    </Card>
  );
}

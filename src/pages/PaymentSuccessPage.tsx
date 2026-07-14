import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { subscribeTable } from "@/lib/realtimeBus";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle, Loader2, Crown, Zap, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function PaymentSuccessPage() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [confirmed, setConfirmed] = useState(false);
  const [planType, setPlanType] = useState<string | null>(null);
  const confettiDone = useRef(false);

  const triggerConfetti = useCallback(async () => {
    if (confettiDone.current) return;
    confettiDone.current = true;
    try {
      const confetti = (await import("canvas-confetti")).default;
      confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 }, colors: ["#635BFF", "#7C3AED", "#fbbf24", "#34d399"] });
    } catch {}
  }, []);

  // Check immediately if plan is already upgraded
  useEffect(() => {
    if (!profile) return;
    if (profile.plan_type === "premium" || profile.plan_type === "vip") {
      setPlanType(profile.plan_type);
      setConfirmed(true);
      triggerConfetti();
    }
  }, [profile, triggerConfetti]);

  // Subscribe to Realtime changes on profiles table (via shared bus)
  useEffect(() => {
    if (!profile?.id || confirmed) return;
    const unsub = subscribeTable('profiles', (payload: any) => {
      if (payload?.new?.id !== profile.id) return;
      const newPlan = payload.new?.plan_type;
      if (newPlan === "premium" || newPlan === "vip") {
        setPlanType(newPlan);
        setConfirmed(true);
        triggerConfetti();
        queryClient.invalidateQueries({ queryKey: ["profile"] });
      }
    }, { events: ['UPDATE'] });
    return unsub;
  }, [profile?.id, confirmed, triggerConfetti, queryClient]);

  // Fallback: manual check button
  const handleManualCheck = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ["profile"] });
  }, [queryClient]);

  const isVip = planType === "vip";

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm text-center space-y-6">
        {confirmed ? (
          <>
            <div className="mx-auto h-20 w-20 rounded-full bg-[hsl(142,76%,36%)]/10 flex items-center justify-center">
              <CheckCircle className="h-12 w-12 text-[hsl(142,76%,36%)]" />
            </div>
            <h1 className="text-2xl font-bold text-foreground">Pagamento Confirmado!</h1>
            <Badge
              className={
                isVip
                  ? "bg-[hsl(45,93%,47%)]/20 text-[hsl(45,93%,47%)] border-[hsl(45,93%,47%)]/30 text-sm px-4 py-1"
                  : "bg-primary/20 text-primary border-primary/30 text-sm px-4 py-1"
              }
            >
              {isVip ? <Crown className="h-4 w-4 mr-1.5" /> : <Zap className="h-4 w-4 mr-1.5" />}
              Plano {planType?.toUpperCase()} Ativado
            </Badge>
            <p className="text-sm text-muted-foreground">
              Seu plano foi ativado com sucesso. Aproveite todos os benefícios!
            </p>
            <Button onClick={() => navigate("/feed")} className="w-full gap-2">
              Ir para o Feed <ArrowRight className="h-4 w-4" />
            </Button>
          </>
        ) : (
          <>
            <div className="mx-auto h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center">
              <Loader2 className="h-10 w-10 text-primary animate-spin" />
            </div>
            <h1 className="text-xl font-bold text-foreground">Validando pagamento…</h1>
            <p className="text-sm text-muted-foreground">
              Aguarde enquanto confirmamos seu pagamento. Isso leva apenas alguns segundos.
            </p>
            <Button variant="outline" size="sm" onClick={handleManualCheck} className="mt-4">
              Já pagou? Verificar assinatura
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

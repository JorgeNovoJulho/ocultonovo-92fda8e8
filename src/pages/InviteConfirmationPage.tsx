import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Logo } from "@/components/Logo";
import { useAuth } from "@/hooks/useAuth";
import { useInviteCodeStore } from "@/store/useInviteCodeStore";
import { CheckCircle2, Crown, ArrowRight, Sparkles, Gift } from "lucide-react";
import confetti from "canvas-confetti";

type PlanKey = "free" | "premium" | "vip";

const PLAN_META: Record<PlanKey, { label: string; price: string; color: string; icon: JSX.Element }> = {
  free: {
    label: "Gratuito",
    price: "R$ 0,00",
    color: "from-slate-500/20 to-slate-700/20",
    icon: <Gift className="h-7 w-7 text-slate-300" />,
  },
  premium: {
    label: "Premium",
    price: "R$ 25,90/mês",
    color: "from-pink-500/20 to-purple-500/20",
    icon: <Sparkles className="h-7 w-7 text-pink-400" />,
  },
  vip: {
    label: "VIP",
    price: "R$ 145,90/mês",
    color: "from-yellow-500/20 to-pink-500/20",
    icon: <Crown className="h-7 w-7 text-yellow-400" />,
  },
};

function normalizePlan(raw: string | null): PlanKey {
  if (!raw) return "free";
  const v = raw.toLowerCase();
  if (v === "vip") return "vip";
  if (["premium", "monthly", "mensal", "annual", "anual"].includes(v)) return "premium";
  return "free";
}

export default function InviteConfirmationPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { user } = useAuth();
  const persistedCode = useInviteCodeStore((s) => s.code);

  const plan: PlanKey = useMemo(
    () => normalizePlan(params.get("plan")),
    [params]
  );
  const code = (params.get("ref") || persistedCode || "").toUpperCase();
  const madrinhaName = params.get("from") || "Anfitrião(ã)";

  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    // Mock registration confirmation — fires confetti + marks done
    const t = setTimeout(() => {
      setConfirmed(true);
      try {
        confetti({
          particleCount: 120,
          spread: 80,
          origin: { y: 0.4 },
          colors: ["#ec4899", "#a855f7", "#facc15"],
        });
      } catch {
        // confetti optional
      }
    }, 600);
    return () => clearTimeout(t);
  }, []);

  const meta = PLAN_META[plan];

  return (
    <div className="min-h-dvh bg-gradient-to-br from-background via-background to-pink-950/20 flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <Logo className="mx-auto h-10 mb-2" />
        </div>

        <Card className="bg-card/80 backdrop-blur-sm border-border/50 overflow-hidden">
          <div className={`h-24 bg-gradient-to-r ${meta.color} relative flex items-center justify-center`}>
            <div className="p-3 rounded-full bg-background/40 backdrop-blur-sm">
              {confirmed ? (
                <CheckCircle2 className="h-8 w-8 text-green-400" />
              ) : (
                meta.icon
              )}
            </div>
          </div>

          <CardHeader className="text-center pb-2">
            <h1 className="text-2xl font-bold">
              {confirmed ? "Inscrição Confirmada!" : "Confirmando inscrição..."}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Bem-vindo(a) ao <span className="text-pink-400 font-semibold">OCULTO</span>
            </p>
          </CardHeader>

          <CardContent className="space-y-5">
            {/* Plan summary */}
            <div className="rounded-xl border border-border/50 bg-card/40 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                  Plano contratado
                </span>
                <Badge className="bg-pink-500/20 text-pink-300 border-pink-500/30">
                  {meta.label}
                </Badge>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-bold">{meta.price}</span>
                {plan !== "free" && (
                  <span className="text-xs text-green-400 font-medium">
                    Ativado com sucesso
                  </span>
                )}
              </div>
            </div>

            {/* Inviter info */}
            {code && (
              <div className="p-3 rounded-lg bg-gradient-to-br from-pink-500/10 to-purple-500/10 border border-pink-500/20 text-center">
                <p className="text-xs text-muted-foreground">
                  Indicado por
                </p>
                <p className="text-sm font-semibold text-pink-300 mt-0.5">
                  {madrinhaName}
                </p>
                <p className="text-[10px] text-muted-foreground mt-1 font-mono">
                  Código: {code}
                </p>
              </div>
            )}

            {/* What's next */}
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                Próximos passos
              </p>
              <ul className="space-y-2 text-sm">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                  <span>Complete seu perfil para aparecer no Radar</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                  <span>Ative o Selo Oculto para acesso total</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                  <span>Explore conteúdos exclusivos e perfis verificados</span>
                </li>
              </ul>
            </div>

            <Button
              className="w-full bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600 text-white font-semibold h-12"
              onClick={() => navigate(user ? "/feed" : "/signup")}
            >
              {user ? "Ir para o Feed" : "Criar Minha Conta"}
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          Sua inscrição via convite garante benefícios exclusivos.
        </p>
      </div>
    </div>
  );
}

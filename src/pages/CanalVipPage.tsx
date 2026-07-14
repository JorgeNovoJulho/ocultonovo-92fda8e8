import { lazy, Suspense, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useProfile } from "@/hooks/useProfile";
import { useAuth } from "@/hooks/useAuth";
import { useVipChannelEnabled } from "@/hooks/useVipChannelEnabled";
import { Loader2, Crown, Plus, ExternalLink, Power, Lock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { progressAuraQuest } from "@/lib/auraQuests";


const VipProfileManager = lazy(() => import("@/components/creator/VipProfileManager"));
const AddPaidContentModal = lazy(() => import("@/components/creator/AddPaidContentModal"));

/**
 * /canal-vip — Local ÚNICO e centralizado para VIPs criarem e gerenciarem
 * o canal de assinatura. Acesso restrito a usuários com plano VIP.
 *
 * Esta página substitui as entradas duplicadas em:
 *  - CreatorDashboard (aba "Perfil VIP")
 *  - SubscriptionsPage ("Configurar canal VIP")
 */
export default function CanalVipPage() {
  const { user, loading: authLoading } = useAuth();
  const { profile, isLoading: profileLoading } = useProfile();
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    void progressAuraQuest('visit_canal_vip', 1, { reason: 'canal VIP aberto' });
  }, [user?.id]);


  // Garante que o plano fique sincronizado ao voltar do checkout (mock ou real)
  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: ['profile'] });
    queryClient.invalidateQueries({ queryKey: ['my-subscriptions'] });
    queryClient.invalidateQueries({ queryKey: ['payment-status'] });
  }, [queryClient]);

  if (authLoading || profileLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  const planType = (profile as any)?.plan_type;
  const isVip = planType === "vip";

  if (!isVip) {
    return (
      <div className="container max-w-2xl mx-auto p-4 py-10">
        <Card className="border-[hsl(45,93%,47%)]/40 bg-gradient-to-br from-[hsl(45,93%,47%)]/5 to-transparent">
          <CardContent className="p-6 text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-[hsl(45,93%,47%)]/10 flex items-center justify-center mx-auto">
              <Crown className="h-8 w-8 text-[hsl(45,93%,47%)]" />
            </div>
            <h1 className="text-2xl font-bold">Canal VIP é exclusivo do plano VIP</h1>
            <p className="text-muted-foreground text-sm">
              Para criar seu canal pago, configurar planos mensais/anuais, capa, trailer
              e vender conteúdo exclusivo, você precisa do plano <strong>VIP</strong>.
            </p>
            <Button
              asChild
              className="bg-gradient-to-r from-[hsl(45,93%,47%)] to-[hsl(35,80%,40%)] text-[hsl(45,93%,10%)] font-semibold"
            >
              <Link to="/subscriptions?upgrade=vip">
                <Crown className="h-4 w-4 mr-1.5" />
                Fazer upgrade para VIP
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <CanalVipPageInner profile={profile} user={user} addOpen={addOpen} setAddOpen={setAddOpen} />;
}

function CanalVipPageInner({
  profile,
  user,
  addOpen,
  setAddOpen,
}: {
  profile: any;
  user: any;
  addOpen: boolean;
  setAddOpen: (v: boolean) => void;
}) {
  const { enabled, hasPlan, isLoading: enabledLoading, toggle, isToggling } = useVipChannelEnabled();
  const locked = !enabled; // tudo travado quando o canal está desativado

  return (
    <div className="container max-w-4xl mx-auto p-4 py-6 space-y-4">
      <div className="flex items-center gap-2">
        <Crown className="h-6 w-6 text-[hsl(45,93%,47%)]" />
        <h1 className="text-2xl font-bold">Meu Canal VIP</h1>
      </div>
      <p className="text-sm text-muted-foreground">
        Centro único para gerenciar seu canal de assinatura, preços, capa e trailer.
        Para publicar conteúdo VIP ou PPV, use o botão <strong>Publicar</strong> no menu lateral.
      </p>

      {/* Toggle ON/OFF do canal — autoridade única para visibilidade pública */}
      <Card
        className={cn(
          "border transition-colors",
          enabled
            ? "border-emerald-500/40 bg-emerald-500/5"
            : "border-amber-500/40 bg-amber-500/5",
        )}
      >
        <CardContent className="p-4 flex items-center gap-3">
          <div
            className={cn(
              "h-10 w-10 rounded-full flex items-center justify-center shrink-0",
              enabled ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/15 text-amber-400",
            )}
          >
            <Power className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground">
              {enabled ? "Canal VIP ativado" : "Canal VIP desativado"}
            </p>
            <p className="text-[12px] text-muted-foreground leading-snug">
              {enabled
                ? "Seu canal está visível publicamente e pode receber assinaturas e publicações VIP."
                : "Enquanto desativado, seu canal fica oculto em todos os locais públicos e novas configurações ficam bloqueadas. Somente você o vê."}
            </p>
          </div>
          <Switch
            checked={enabled}
            onCheckedChange={(v) => toggle(v)}
            disabled={enabledLoading || isToggling}
            aria-label="Ativar ou desativar canal VIP"
          />
        </CardContent>
      </Card>

      {/* Bloco trava o conteúdo quando o canal está desativado */}
      <div
        className={cn(
          "relative transition-all",
          locked && "pointer-events-none opacity-50 select-none",
        )}
        aria-disabled={locked}
      >
        {locked && (
          <div className="absolute inset-0 z-10 flex items-start justify-center pt-6 pointer-events-none">
            <div className="flex items-center gap-2 rounded-full bg-background/90 border border-amber-500/40 px-3 py-1.5 text-[12px] font-semibold text-amber-300 shadow-sm">
              <Lock className="h-3.5 w-3.5" />
              Ative o canal para liberar as configurações
            </div>
          </div>
        )}

        <Suspense fallback={<div className="py-10 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></div>}>
          <VipProfileManager />
        </Suspense>

        <div className="pt-2 flex flex-col sm:flex-row gap-2 sm:items-center">
          <Button
            onClick={() => setAddOpen(true)}
            disabled={locked}
            className="w-full sm:w-auto bg-gradient-to-r from-[hsl(45,93%,47%)] to-[hsl(35,80%,40%)] text-[hsl(45,93%,10%)] font-semibold"
          >
            <Plus className="h-4 w-4 mr-1.5" />
            Adicionar Conteúdo
          </Button>
          <Button
            asChild
            variant="outline"
            className="w-full sm:w-auto border-[hsl(45,93%,47%)]/40 hover:bg-[hsl(45,93%,47%)]/10"
          >
            <Link to={`/canal/${(profile as any)?.id || user.id}`}>
              <ExternalLink className="h-4 w-4 mr-1.5" />
              Ver meu Canal
            </Link>
          </Button>
          <Button
            asChild
            variant="outline"
            className="w-full sm:w-auto border-amber-400/40 hover:bg-amber-400/10"
          >
            <Link to="/caixa-oculta/criador">
              <ExternalLink className="h-4 w-4 mr-1.5" />
              Caixa Oculta (campanhas)
            </Link>
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Publique vídeos, fotos ou packs com preço avulso e link de compartilhamento.
        </p>
      </div>

      {addOpen && !locked && (
        <Suspense fallback={null}>
          <AddPaidContentModal open={addOpen} onOpenChange={setAddOpen} />
        </Suspense>
      )}
    </div>
  );
}


import { useEffect, useState } from "react";
import { useProfile } from "@/hooks/useProfile";
import { useCreatorReferralCode, useMyAfilhadas } from "@/hooks/useCreatorReferrals";
import { buildCreatorInviteShareUrl } from "@/lib/inviteLinks";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, Share2, Copy, Crown, Lock, Gift, TrendingUp, Info, DollarSign, UserPlus, Sparkles, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { ShareLinkStatsCard } from "./ShareLinkStatsCard";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function ProfileReferralSection() {
  const { profile } = useProfile();
  const [showInfoModal, setShowInfoModal] = useState(false);
  const { code: referralCode, isLoading: codeLoading, generateCode, isGenerating } = useCreatorReferralCode();
  const { data: referrals = [] } = useMyAfilhadas();

  const totalEarned = referrals.reduce((sum, r) => sum + (r.total_commission_earned || 0), 0);
  const childrenCount = referrals.length;

  const referralLink = buildCreatorInviteShareUrl(referralCode);

  const handleCopyLink = () => {
    if (!referralLink) return;
    navigator.clipboard.writeText(referralLink);
    toast.success("Link copiado!");
  };

  const handleShare = async () => {
    if (!referralLink) return;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Oculto - Convite', text: 'Use meu convite:', url: referralLink });
      } catch { handleCopyLink(); }
    } else {
      handleCopyLink();
    }
  };

  useEffect(() => {
    if (!referralCode && !codeLoading && !isGenerating) {
      generateCode();
    }
  }, [referralCode, codeLoading, isGenerating, generateCode]);

  return (
    <div className="space-y-4">
      {/* Share Link Stats */}
      <ShareLinkStatsCard />

      <Card className="border-border/30 bg-card/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            Meus Indicados (Filhos)
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowInfoModal(true)}
            className="h-7 px-2 gap-1 text-xs text-primary hover:text-primary hover:bg-primary/10"
          >
            <Info className="h-3.5 w-3.5" />
            Saiba mais
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 rounded-lg bg-primary/5 border border-primary/20 text-center">
            <p className="text-2xl font-bold text-primary">{childrenCount}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Filhos</p>
          </div>
          <div className="p-3 rounded-lg bg-accent/5 border border-accent/20 text-center">
            <p className="text-2xl font-bold text-accent-foreground">
              R$ {totalEarned.toFixed(2)}
            </p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Total Ganho</p>
          </div>
        </div>

        {referralCode ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/50 border border-border/50">
              <code className="text-xs text-foreground flex-1 truncate">
                {referralLink}
              </code>
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={handleCopyLink} aria-label="Copiar">
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
            <Button onClick={handleShare} className="w-full bg-gradient-to-r from-primary to-secondary text-primary-foreground gap-2">
              <Share2 className="h-4 w-4" />
              Compartilhar e Ganhar
            </Button>
          </div>
        ) : (
          <Button onClick={() => generateCode()} disabled={isGenerating || codeLoading} className="w-full bg-gradient-to-r from-primary to-secondary text-primary-foreground gap-2">
            <Gift className="h-4 w-4" />
            {isGenerating ? 'Preparando link...' : 'Preparando seu link...'}
          </Button>
        )}

        {referrals.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <TrendingUp className="h-3 w-3" />
              Árvore de Indicados
            </p>
            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {referrals.map((ref) => (
                <div key={ref.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/30 text-xs">
                  <span className="text-foreground truncate">
                    {ref.afilhada_profile?.name || 'Indicado'}
                  </span>
                  <Badge variant="secondary" className="text-[10px] bg-accent/10 text-accent-foreground">
                    R$ {(ref.total_commission_earned || 0).toFixed(2)}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="text-[10px] text-muted-foreground text-center">
          Comissão de 5% sobre a primeira assinatura de cada indicado
        </p>
      </CardContent>
    </Card>

      <ReferralInfoModal open={showInfoModal} onOpenChange={setShowInfoModal} />
    </div>
  );
}

// ───── Modal explicativo do Programa de Indicação ─────
function ReferralInfoModal({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center mb-2">
            <Gift className="h-6 w-6 text-primary" />
          </div>
          <DialogTitle className="text-xl">Como funciona o Programa de Indicação</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Passo a passo */}
          <div className="space-y-3">
            <Step
              icon={<Sparkles className="h-4 w-4 text-primary" />}
              title="1. Gere seu link único"
              text="Todo usuário recebe automaticamente um link exclusivo de indicação para compartilhar."
            />
            <Step
              icon={<Share2 className="h-4 w-4 text-[hsl(150,70%,45%)]" />}
              title="2. Compartilhe com amigos"
              text="Envie seu link por WhatsApp, redes sociais ou para qualquer pessoa interessada."
            />
            <Step
              icon={<UserPlus className="h-4 w-4 text-[hsl(210,90%,55%)]" />}
              title="3. Eles se cadastram"
              text="Quando alguém usar seu link e criar uma conta, ela vira sua 'filha' (indicada)."
            />
            <Step
              icon={<DollarSign className="h-4 w-4 text-[hsl(45,93%,47%)]" />}
              title="4. Você ganha 5%"
              text="Ao assinar Premium ou VIP pela primeira vez, você recebe 5% do valor pago — comissão única, paga direto na sua carteira."
            />
          </div>

          {/* Exemplo */}
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
            <p className="text-xs font-semibold text-primary mb-1.5 flex items-center gap-1">
              <TrendingUp className="h-3.5 w-3.5" />
              Exemplo prático
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Se sua indicada assinar o Premium de <strong className="text-foreground">R$ 49,90</strong>, você ganha <strong className="text-[hsl(150,70%,45%)]">R$ 2,49</strong>. Indique 50 amigos e ganhe até <strong className="text-foreground">R$ 124,75</strong> em comissões.
            </p>
          </div>

          {/* Regras */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-foreground">Regras importantes:</p>
            <Rule text="Comissão única (one-time) sobre a primeira assinatura paga." />
            <Rule text="Indicações ficam vinculadas a você para sempre na 'árvore de indicados'." />
            <Rule text="Comissões são creditadas automaticamente após a confirmação do pagamento." />
            <Rule text="Você pode sacar via PIX a partir do mínimo configurado na sua carteira." />
            <Rule text="Sem limite de indicações — quanto mais amigos, mais ganhos." />
          </div>

          <Button onClick={() => onOpenChange(false)} className="w-full bg-gradient-to-r from-primary to-secondary text-primary-foreground">
            Entendi
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Step({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="flex gap-3">
      <div className="w-8 h-8 rounded-full bg-muted/50 border border-border/50 flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground leading-snug">{text}</p>
      </div>
    </div>
  );
}

function Rule({ text }: { text: string }) {
  return (
    <div className="flex gap-2 items-start">
      <CheckCircle2 className="h-3.5 w-3.5 text-[hsl(150,70%,45%)] shrink-0 mt-0.5" />
      <p className="text-xs text-muted-foreground leading-snug">{text}</p>
    </div>
  );
}

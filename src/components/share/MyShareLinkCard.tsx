import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Link as RouterLink } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Share2,
  Copy,
  ExternalLink,
  Info,
  Gift,
  Sparkles,
  UserPlus,
  DollarSign,
  CheckCircle2,
  QrCode,
  RefreshCw,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { useProfile } from '@/hooks/useProfile';
import { useAuth } from '@/hooks/useAuth';
import { useCreatorReferralCode } from '@/hooks/useCreatorReferrals';
import { buildCreatorInviteShareUrl } from '@/lib/inviteLinks';

/**
 * Card "Meu Link de Compartilhamento" — acesso rápido ao link de indicação
 * do usuário logado, com QR code, cópia e prévia da página pública.
 * Quando o link ainda não foi gerado, mostra "Saiba mais" e CTA direto
 * para o local de criação (aba Indicados do perfil).
 */
export function MyShareLinkCard({ className }: { className?: string }) {
  const { user, loading: authLoading } = useAuth();
  const { profile } = useProfile();
  const {
    code: referralCode,
    isLoading,
    regenerateCode,
    isRegenerating,
  } = useCreatorReferralCode();
  const [showInfo, setShowInfo] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [showRegenerate, setShowRegenerate] = useState(false);

  const resolvedCode = referralCode || null;

  if ((!profile && !user) || authLoading || (isLoading && !resolvedCode)) return null;

  const shareUrl = buildCreatorInviteShareUrl(resolvedCode) || '';

  const handleRegenerate = async () => {
    try {
      await regenerateCode();
      setShowRegenerate(false);
    } catch {
      /* toast já exibido pelo hook */
    }
  };


  const handleCopy = () => {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl).catch(() => undefined);
    toast.success('Link copiado!');
  };

  const handleShare = async () => {
    if (!shareUrl) return;
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'OCULTO — convite',
          text: 'Entra no Oculto pelo meu convite:',
          url: shareUrl,
        });
        return;
      } catch {
        /* fallback p/ copiar */
      }
    }
    handleCopy();
  };

  // ─── Sem link criado: incentivo + CTA para criação ────────────────
  if (!resolvedCode) {
    return (
      <>
        <Card
          className={
            'border-primary/30 bg-gradient-to-br from-primary/10 via-card to-secondary/10 ' +
            (className || '')
          }
        >
          <CardContent className="p-4 space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                <Gift className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-sm text-foreground">
                  Crie seu link de indicação
                </h3>
                <p className="text-xs text-muted-foreground leading-snug mt-0.5">
                  Compartilhe o Oculto e ganhe <strong>5% de comissão</strong>{' '}
                  por cada amigo que assinar.
                </p>
              </div>
              <Badge variant="secondary" className="bg-primary/15 text-primary shrink-0">
                Novo
              </Badge>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button asChild size="sm" className="flex-1 gap-1.5">
                <RouterLink to="/profile?tab=referral">
                  <Sparkles className="h-3.5 w-3.5" />
                  Criar meu link
                </RouterLink>
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowInfo(true)}
                className="gap-1.5"
              >
                <Info className="h-3.5 w-3.5" />
                Saiba mais
              </Button>
            </div>
          </CardContent>
        </Card>

        <ShareInfoModal open={showInfo} onOpenChange={setShowInfo} />
      </>
    );
  }

  // ─── Link já criado: exibe URL, copiar, QR, prévia, compartilhar ──
  return (
    <>
      <Card
        className={
          'border-primary/30 bg-gradient-to-br from-primary/10 via-card to-secondary/10 ' +
          (className || '')
        }
      >
        <CardContent className="p-4 space-y-3">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
              <Share2 className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-sm text-foreground">
                Meu link de indicação
              </h3>
              <p className="text-xs text-muted-foreground leading-snug mt-0.5">
                Compartilhe e ganhe <strong>5%</strong> sobre cada assinatura.
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0 text-muted-foreground"
              onClick={() => setShowInfo(true)}
              aria-label="Saiba mais sobre indicações"
            >
              <Info className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex items-center gap-2 p-2 rounded-lg bg-background/60 border border-border/50">
            <code
              className="text-[11px] text-foreground flex-1 truncate"
              title={shareUrl}
            >
              {shareUrl}
            </code>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
              onClick={handleCopy}
              aria-label="Copiar link"
            >
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <Button
              size="sm"
              onClick={handleShare}
              className="gap-1.5 bg-gradient-to-r from-primary to-secondary text-primary-foreground"
            >
              <Share2 className="h-3.5 w-3.5" />
              Compartilhar
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowQr(true)}
              className="gap-1.5"
            >
              <QrCode className="h-3.5 w-3.5" />
              QR Code
            </Button>
            <Button
              asChild
              size="sm"
              variant="outline"
              className="gap-1.5"
            >
              <a
                href={shareUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Abrir prévia da página de compartilhamento"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Prévia
              </a>
            </Button>
          </div>

          <button
            type="button"
            onClick={() => setShowRegenerate(true)}
            className="w-full flex items-center justify-center gap-1.5 text-[12px] font-semibold py-2 rounded-lg bg-amber-500/15 text-amber-300 border border-amber-400/40 hover:bg-amber-500/25 hover:text-amber-200 hover:border-amber-300/70 transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Gerar novo link de indicação
          </button>
        </CardContent>
      </Card>

      {/* Modal: confirmação de regeneração */}
      <Dialog open={showRegenerate} onOpenChange={(v) => !isRegenerating && setShowRegenerate(v)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="w-12 h-12 rounded-full bg-amber-500/15 flex items-center justify-center mb-2">
              <AlertTriangle className="h-6 w-6 text-amber-500" />
            </div>
            <DialogTitle className="text-lg">Gerar novo link de indicação?</DialogTitle>
            <DialogDescription className="text-sm leading-relaxed pt-2">
              Vamos criar um novo link baseado no seu <strong>@{profile?.username || 'usuário'}</strong>
              {' '}com um sufixo único.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 text-sm">
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
              <div className="flex gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-medium text-foreground text-xs">
                    Os links antigos continuam funcionando
                  </p>
                  <p className="text-xs text-muted-foreground leading-snug">
                    Quem entrar por qualquer link que você já compartilhou vai continuar
                    sendo vinculado à sua lista de indicados.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
              <div className="flex gap-2">
                <Sparkles className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-medium text-foreground text-xs">
                    Os novos cadastros também contam pra você
                  </p>
                  <p className="text-xs text-muted-foreground leading-snug">
                    A partir de agora, todo mundo que se cadastrar pelo novo link
                    entra na mesma lista de indicados.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={() => setShowRegenerate(false)}
              disabled={isRegenerating}
              className="flex-1"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleRegenerate}
              disabled={isRegenerating}
              className="flex-1 gap-1.5 bg-gradient-to-r from-primary to-secondary text-primary-foreground"
            >
              {isRegenerating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              Gerar novo link
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      {/* Modal do QR */}
      <Dialog open={showQr} onOpenChange={setShowQr}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <QrCode className="h-5 w-5 text-primary" />
              Seu QR de indicação
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-3 py-2">
            <div className="bg-white p-4 rounded-xl">
              <QRCodeSVG value={shareUrl} size={180} level="M" />
            </div>
            <p className="text-[11px] text-muted-foreground text-center leading-snug">
              Aponte a câmera para o código ou compartilhe a imagem com seus
              convidados.
            </p>
            <code className="text-[10px] text-muted-foreground break-all text-center">
              {shareUrl}
            </code>
            <div className="flex gap-2 w-full">
              <Button
                size="sm"
                variant="outline"
                className="flex-1 gap-1.5"
                onClick={handleCopy}
              >
                <Copy className="h-3.5 w-3.5" />
                Copiar link
              </Button>
              <Button
                size="sm"
                className="flex-1 gap-1.5 bg-gradient-to-r from-primary to-secondary text-primary-foreground"
                onClick={handleShare}
              >
                <Share2 className="h-3.5 w-3.5" />
                Enviar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ShareInfoModal open={showInfo} onOpenChange={setShowInfo} />
    </>
  );
}

function ShareInfoModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center mb-2">
            <Gift className="h-6 w-6 text-primary" />
          </div>
          <DialogTitle className="text-lg">
            Como criar e usar seu link
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 mt-2">
          <Step
            icon={<Sparkles className="h-4 w-4 text-primary" />}
            title="1. Gere seu link"
            text="Vá em Perfil → Indicados e toque em “Gerar Meu Link de Indicação”."
          />
          <Step
            icon={<Share2 className="h-4 w-4 text-[hsl(150,70%,45%)]" />}
            title="2. Compartilhe"
            text="Envie por WhatsApp, redes sociais ou mostre seu QR Code."
          />
          <Step
            icon={<UserPlus className="h-4 w-4 text-[hsl(210,90%,55%)]" />}
            title="3. Seu amigo entra"
            text="Quando alguém se cadastrar pelo seu link, vira sua indicada."
          />
          <Step
            icon={<DollarSign className="h-4 w-4 text-[hsl(45,93%,47%)]" />}
            title="4. Você ganha 5%"
            text="Receba 5% sobre a primeira assinatura paga, direto na sua carteira."
          />

          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs text-muted-foreground leading-relaxed">
            <CheckCircle2 className="h-3.5 w-3.5 text-[hsl(150,70%,45%)] inline mr-1" />
            Sem limite de indicações. Quanto mais você compartilha, mais ganha.
          </div>

          <Button asChild className="w-full gap-1.5">
            <RouterLink to="/profile?tab=referral">
              <Sparkles className="h-4 w-4" />
              Ir para criação do link
            </RouterLink>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Step({
  icon,
  title,
  text,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
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

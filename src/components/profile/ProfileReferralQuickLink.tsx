import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Copy, Share2, Gift, ArrowRight, QrCode, Download, Wallet, Sparkles, MessageCircle, RefreshCw, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useProfile } from "@/hooks/useProfile";
import { useCreatorReferralCode, useMyAfilhadas } from "@/hooks/useCreatorReferrals";
import { buildCreatorInviteShareUrl } from "@/lib/inviteLinks";

/**
 * Card compacto exibido logo abaixo dos botões "Editar Perfil" e "Encontro Seguro"
 * no /profile. Mostra o link único de indicação do usuário (mesmo link da página
 * /indicacoes — fonte única) com botões rápidos de copiar, compartilhar, QR Code
 * e atalho para PIX/saque.
 */
export function ProfileReferralQuickLink() {
  const { profile } = useProfile();
  const { code, isLoading, generateCode, isGenerating, regenerateCode, isRegenerating } = useCreatorReferralCode();
  const { data: referrals = [] } = useMyAfilhadas();
  const [showQr, setShowQr] = useState(false);
  const [showRegenerate, setShowRegenerate] = useState(false);
  const [qrSize, setQrSize] = useState<720 | 1080>(720);
  const qrWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!code && !isLoading && !isGenerating) {
      generateCode();
    }
  }, [code, isLoading, isGenerating, generateCode]);

  const resolvedCode = code || null;
  const link = buildCreatorInviteShareUrl(resolvedCode);
  const childrenCount = referrals.length;
  const totalEarned = referrals.reduce(
    (sum, r) => sum + (r.total_commission_earned || 0),
    0,
  );
  const hasResults = childrenCount > 0 || totalEarned > 0;
  // Privacidade: usar APENAS @username em links públicos de indicação.
  const shareHandle = (profile as any)?.username
    ? `@${(profile as any).username}`
    : "alguém";
  const shareName = shareHandle;
  const shareText = `Oi! Eu sou ${shareName} no OCULTO. Vem conhecer pelo meu convite:`;
  const shareMessage = link ? `${shareText} ${link}` : shareText;

  const handleCopy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Link copiado!");
    } catch {
      toast.error("Não foi possível copiar o link.");
    }
  };

  const handleShare = async () => {
    if (!link) return;
    if (navigator.share) {
      try {
        await navigator.share({
          title: "OCULTO — Convite",
          text: shareText,
          url: link,
        });
        return;
      } catch {
        /* cancelado */
      }
    }
    try {
      await navigator.clipboard.writeText(shareMessage);
      toast.success("Texto de convite copiado!");
    } catch {
      toast.error("Não foi possível compartilhar agora.");
    }
  };

  const handleWhatsAppShare = () => {
    if (!link) return;
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(shareMessage)}`;
    window.open(whatsappUrl, "_blank", "noopener,noreferrer");
  };

  const renderQrPng = async (size: 720 | 1080) => {
    const svg = qrWrapRef.current?.querySelector("svg");
    if (!svg || !link || !code) throw new Error("QR indisponível");
    const xml = new XMLSerializer().serializeToString(svg);
    const svgBlob = new Blob([xml], { type: "image/svg+xml;charset=utf-8" });
    const svgUrl = URL.createObjectURL(svgBlob);

    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const nextImg = new Image();
        nextImg.onload = () => resolve(nextImg);
        nextImg.onerror = () => reject(new Error("Falha ao ler SVG"));
        nextImg.src = svgUrl;
      });

      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas indisponível");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, size, size);
      ctx.drawImage(img, 0, 0, size, size);

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((value) => {
          if (value) resolve(value);
          else reject(new Error("Falha ao gerar PNG"));
        }, "image/png");
      });

      return {
        blob,
        dataUrl: canvas.toDataURL("image/png"),
        file: new File([blob], `oculto-convite-${code}-${size}.png`, { type: "image/png" }),
      };
    } finally {
      URL.revokeObjectURL(svgUrl);
    }
  };

  const handleDownloadQr = async (size: 720 | 1080) => {
    try {
      const { dataUrl } = await renderQrPng(size);
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `oculto-convite-${code}-${size}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast.success(`QR Code ${size}x${size} baixado!`);
    } catch {
      toast.error("Não foi possível gerar a imagem.");
    }
  };

  const handleShareQr = async () => {
    if (!link) return;

    try {
      const { file } = await renderQrPng(qrSize);
      const canShareFiles =
        typeof navigator.share === "function" &&
        (typeof navigator.canShare !== "function" || navigator.canShare({ files: [file] }));

      if (canShareFiles) {
        await navigator.share({
          title: "OCULTO — Meu QR Code de convite",
          text: shareText,
          url: link,
          files: [file],
        });
        return;
      }

      await handleDownloadQr(qrSize);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      toast.error("Não foi possível compartilhar o QR Code.");
    }
  };

  return (
    <>
      <div className="mt-3 w-full rounded-xl border border-primary/30 bg-gradient-to-br from-primary/10 via-card to-secondary/5 p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="h-8 w-8 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
              <Gift className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-foreground leading-tight">
                Meu link de indicação
              </p>
              {hasResults ? (
                <p className="text-[10px] text-muted-foreground leading-tight">
                  {childrenCount} indicado{childrenCount === 1 ? "" : "s"} · R${" "}
                  {totalEarned.toFixed(2)} ganhos
                </p>
              ) : (
                <p className="text-[10px] text-primary/90 leading-tight flex items-center gap-1">
                  <Sparkles className="h-3 w-3" />
                  Compartilhe e ganhe sua primeira comissão
                </p>
              )}
            </div>
          </div>
          <Link
            to="/indicacoes"
            className="text-[10px] font-semibold text-primary hover:underline flex items-center gap-0.5 shrink-0"
          >
            Detalhes <ArrowRight className="h-3 w-3" />
          </Link>
        </div>

        {link ? (
          <>
            <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-md bg-background/60 border border-border/50">
              <code className="text-[11px] text-foreground/90 font-mono flex-1 truncate text-left">
                {link}
              </code>
              <button
                onClick={handleCopy}
                aria-label="Copiar link"
                className="p-1 rounded hover:bg-muted transition-colors"
              >
                <Copy className="h-3.5 w-3.5 text-primary" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Button
                size="sm"
                variant="outline"
                onClick={handleCopy}
                className="h-7 text-[11px] gap-1 px-1"
              >
                <Copy className="h-3 w-3" />
                Copiar
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowQr(true)}
                className="h-7 text-[11px] gap-1 px-1"
              >
                <QrCode className="h-3 w-3" />
                QR Code
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleWhatsAppShare}
                className="h-7 text-[11px] gap-1 px-1"
              >
                <MessageCircle className="h-3 w-3" />
                WhatsApp
              </Button>
              <Button
                size="sm"
                onClick={handleShare}
                className="h-7 text-[11px] gap-1 px-1 bg-gradient-to-r from-primary to-secondary text-primary-foreground"
              >
                <Share2 className="h-3 w-3" />
                Enviar
              </Button>
            </div>

            {/* Atalho para PIX e saque */}
            <Button
              asChild
              size="sm"
              variant="ghost"
              className="w-full h-7 text-[11px] gap-1.5 text-foreground/80 hover:text-primary hover:bg-primary/10"
            >
              <Link to="/indicacoes#saque">
                <Wallet className="h-3.5 w-3.5" />
                Cadastrar PIX e sacar ganhos
              </Link>
            </Button>

            <button
              type="button"
              onClick={() => setShowRegenerate(true)}
              className="w-full flex items-center justify-center gap-1.5 text-[11px] font-semibold py-1.5 rounded-md bg-amber-500/15 text-amber-300 border border-amber-400/40 hover:bg-amber-500/25 hover:text-amber-200 hover:border-amber-300/70 transition-colors"
            >
              <RefreshCw className="h-3 w-3" />
              Gerar novo link de indicação
            </button>
          </>
        ) : (
          <Button
            size="sm"
            onClick={() => generateCode()}
            disabled={isGenerating || (isLoading && !resolvedCode)}
            className="w-full h-8 text-xs gap-1.5 bg-gradient-to-r from-primary to-secondary text-primary-foreground"
          >
            <Gift className="h-3.5 w-3.5" />
            {isGenerating ? "Gerando..." : "Gerar meu link"}
          </Button>
        )}
      </div>

      {/* Modal: confirmação de regeneração de link */}
      <Dialog open={showRegenerate} onOpenChange={(v) => !isRegenerating && setShowRegenerate(v)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="w-12 h-12 rounded-full bg-amber-500/15 flex items-center justify-center mb-2">
              <AlertTriangle className="h-6 w-6 text-amber-500" />
            </div>
            <DialogTitle className="text-lg">Gerar novo link de indicação?</DialogTitle>
            <DialogDescription className="text-sm leading-relaxed pt-2">
              Vamos criar um novo link baseado no seu <strong>@{profile?.username || 'usuário'}</strong> com um sufixo único.
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
                    Quem entrar por qualquer link que você já compartilhou vai continuar sendo vinculado à sua lista de indicados.
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
                    A partir de agora, todo mundo que se cadastrar pelo novo link entra na mesma lista de indicados.
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
              onClick={async () => {
                try { await regenerateCode(); setShowRegenerate(false); } catch {}
              }}
              disabled={isRegenerating}
              className="flex-1 gap-1.5 bg-gradient-to-r from-primary to-secondary text-primary-foreground"
            >
              {isRegenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Gerar novo link
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal QR Code */}
      <Dialog open={showQr} onOpenChange={setShowQr}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <QrCode className="h-4 w-4 text-primary" />
              Meu QR Code de convite
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-center">
            <div
              ref={qrWrapRef}
              className="mx-auto w-fit rounded-lg bg-white p-3 border border-border"
            >
              {link && <QRCodeSVG value={link} size={200} level="M" includeMargin={false} />}
            </div>
            <p className="text-[11px] text-muted-foreground leading-snug px-2">
              Aponte a câmera do celular ou baixe a imagem para enviar nas redes sociais.
            </p>
            <div className="space-y-2">
              <p className="text-[11px] font-medium text-foreground">Qualidade do arquivo</p>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={qrSize === 720 ? "default" : "outline"}
                  className="h-8 text-xs"
                  onClick={() => setQrSize(720)}
                >
                  720 x 720
                </Button>
                <Button
                  type="button"
                  variant={qrSize === 1080 ? "default" : "outline"}
                  className="h-8 text-xs"
                  onClick={() => setQrSize(1080)}
                >
                  1080 x 1080
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleWhatsAppShare}
                className="w-full gap-2"
              >
                <MessageCircle className="h-4 w-4" />
                Enviar pelo WhatsApp
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleShareQr}
                className="w-full gap-2"
              >
                <Share2 className="h-4 w-4" />
                Compartilhar QR Code
              </Button>
              <Button
                type="button"
                onClick={() => handleDownloadQr(qrSize)}
                className="w-full gap-2 bg-gradient-to-r from-primary to-secondary text-primary-foreground"
              >
                <Download className="h-4 w-4" />
                Baixar QR Code ({qrSize} PNG)
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

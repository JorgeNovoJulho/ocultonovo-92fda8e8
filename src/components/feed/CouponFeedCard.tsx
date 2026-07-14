import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Ticket, Copy, Sparkles, Calendar, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { Link, useNavigate } from "react-router-dom";
import type { CreatorCoupon } from "@/hooks/useCreatorCoupons";

interface Props {
  coupon: CreatorCoupon;
  creator?: {
    username?: string | null;
    display_name?: string | null;
    avatar_url?: string | null;
  } | null;
  /** Renderização compatível com o feed premium (kind='coupon'). */
}

const TARGET_LABELS: Record<string, string> = {
  long_video: "Vídeos longos",
  short_video: "Vídeos curtos",
  photo: "Fotos",
  photo_pack: "Packs de fotos",
  video_pack: "Packs de vídeos",
  monthly_subscription: "Assinatura mensal",
  annual_subscription: "Assinatura anual",
  super_dm: "Super DM",
};

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

export default function CouponFeedCard({ coupon, creator }: Props) {
  const navigate = useNavigate();
  const remaining = Math.max(0, coupon.max_uses - coupon.uses_count);
  const expiresIn = Math.max(
    0,
    Math.ceil((new Date(coupon.valid_until).getTime() - Date.now()) / 86_400_000)
  );

  /** Tenta copiar via Clipboard API e cai num fallback (execCommand + prompt). */
  const safeCopy = async (text: string): Promise<{ ok: boolean; method: "api" | "exec" | "manual" }> => {
    // Primeira tentativa: Clipboard API moderna (requer contexto seguro)
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return { ok: true, method: "api" };
      } catch {
        /* segue para fallback */
      }
    }
    // Fallback: textarea oculto + execCommand (cobre WebViews antigos do iOS/Android)
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.top = "-1000px";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      ta.setSelectionRange(0, text.length);
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      if (ok) return { ok: true, method: "exec" };
    } catch {
      /* segue para manual */
    }
    return { ok: false, method: "manual" };
  };

  const copy = async () => {
    const r = await safeCopy(coupon.code);
    if (r.ok) {
      toast.success(`Cupom ${coupon.code} copiado!`, {
        description: "Use no checkout para aplicar o desconto.",
      });
    } else {
      toast.error("Não foi possível copiar automaticamente", {
        description: `Selecione e copie manualmente o código: ${coupon.code}`,
        duration: 8000,
      });
    }
  };

  /**
   * Copia o cupom e abre o checkout pré-preenchido.
   * - Se aplicar a assinatura → /checkout?plan=...&amount=...&coupon=CODE
   * - Caso contrário → /c/{username}?coupon=CODE (canal do criador para escolher conteúdo)
   * O parâmetro `coupon` na URL faz o auto-preenchimento mesmo se a cópia falhar.
   */
  const copyAndCheckout = async () => {
    const r = await safeCopy(coupon.code);
    const applies = coupon.applies_to || [];
    let target: string | null = null;
    let label = "Abrindo checkout…";

    if (applies.includes("monthly_subscription")) {
      target = `/checkout?plan=monthly&amount=25.90&coupon=${encodeURIComponent(coupon.code)}`;
      label = "Abrindo checkout da assinatura mensal…";
    } else if (applies.includes("annual_subscription")) {
      target = `/checkout?plan=annual&amount=145.90&coupon=${encodeURIComponent(coupon.code)}`;
      label = "Abrindo checkout da assinatura anual…";
    } else if (creator?.username) {
      target = `/c/${creator.username}?coupon=${encodeURIComponent(coupon.code)}`;
      label = "Abrindo o canal — escolha o conteúdo para aplicar.";
    }

    if (r.ok) {
      toast.success(`Cupom ${coupon.code} copiado!`, { description: label });
    } else {
      // Mobile fallback: cópia falhou, mas a URL leva o cupom — informa ao usuário.
      toast.message(`Cupom ${coupon.code}`, {
        description: target
          ? "Não foi possível copiar, mas o cupom já está no link do checkout."
          : `Selecione e copie manualmente: ${coupon.code}`,
        duration: 7000,
      });
    }

    if (target) navigate(target);
  };

  const channelHref = creator?.username ? `/c/${creator.username}` : "#";

  return (
    <Card className="relative overflow-hidden border-pink-500/40 bg-gradient-to-br from-pink-950/40 via-background to-purple-950/30 p-4 shadow-[0_8px_24px_-12px_rgba(236,72,153,0.5)]">
      {/* Glow decoration */}
      <div className="pointer-events-none absolute -top-10 -right-10 h-32 w-32 rounded-full bg-pink-500/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-12 -left-10 h-28 w-28 rounded-full bg-purple-500/20 blur-3xl" />

      <div className="relative flex items-start gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-pink-500 to-purple-600 shadow-lg">
          <Ticket className="h-6 w-6 text-white" />
        </div>

        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge className="bg-pink-500 text-white border-0 text-xs font-bold">
              <Sparkles className="h-3 w-3 mr-1" />
              {coupon.discount_percent}% OFF
            </Badge>
            {creator?.username && (
              <Link
                to={channelHref}
                className="text-xs text-muted-foreground hover:text-foreground truncate"
              >
                @{creator.username}
              </Link>
            )}
          </div>

          <p className="text-sm font-semibold leading-tight">
            Cupom exclusivo do criador
          </p>

          <div className="flex flex-wrap gap-1 pt-0.5">
            {coupon.applies_to.slice(0, 3).map((t) => (
              <span
                key={t}
                className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-muted-foreground"
              >
                {TARGET_LABELS[t] ?? t}
              </span>
            ))}
            {coupon.applies_to.length > 3 && (
              <span className="text-[10px] text-muted-foreground">
                +{coupon.applies_to.length - 3}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="relative mt-3 flex items-center gap-2 rounded-lg border border-pink-500/40 bg-pink-500/15 p-2">
        <code className="flex-1 font-mono text-sm font-bold tracking-wider text-pink-100">
          {coupon.code}
        </code>
        <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={copy}>
          <Copy className="h-3 w-3" /> Copiar
        </Button>
      </div>

      <Button
        size="sm"
        onClick={copyAndCheckout}
        className="relative mt-2 w-full gap-1.5 bg-gradient-to-r from-pink-500 to-purple-600 text-white hover:opacity-90"
      >
        Copiar e ir ao checkout <ArrowRight className="h-3.5 w-3.5" />
      </Button>

      <div className="relative mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <Calendar className="h-3 w-3" />
          {expiresIn > 0 ? `Expira em ${expiresIn}d (${fmtDate(coupon.valid_until)})` : "Expira hoje"}
        </span>
        <span>{remaining} restantes · 1×/usuário</span>
      </div>
    </Card>
  );
}

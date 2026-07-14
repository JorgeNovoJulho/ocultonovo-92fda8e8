import { Lock, Crown, Sparkles, LogIn, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { usePurchaseMedia } from "@/hooks/useMediaAccess";
import { useDiaryPostAccess } from "@/hooks/useDiaryPostAccess";
import { useQueryClient } from "@tanstack/react-query";

interface DiaryPaywallProps {
  post: any;
  /** Quando true, exibe título + capa por trás (visual completo do card) */
  preview?: boolean;
}

/**
 * Paywall exibido dentro do ChannelContentViewer quando o visitante
 * não tem acesso ao conteúdo do Diário VIP.
 *  - Não logado → CTA Entrar
 *  - PPV avulso → Comprar por R$ X (usePurchaseMedia)
 *  - vip_only sem PPV → Assinar Canal (navega para /canal/:id?tab=plans)
 */
export function DiaryPaywall({ post }: DiaryPaywallProps) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const purchase = usePurchaseMedia();
  const access = useDiaryPostAccess(post);

  if (access.effectiveAccess) return null;

  const isPaid = !!post?.is_paid || access.price > 0;
  const creatorId = post?.author_id || post?.creator_id || post?.user_id;

  const handlePurchase = async () => {
    try {
      await purchase.mutateAsync({ postId: post.id });
      qc.invalidateQueries({ queryKey: ["diary-purchase"] });
      qc.invalidateQueries({ queryKey: ["media-access"] });
      qc.invalidateQueries({ queryKey: ["media-access-batch"] });
    } catch {
      /* toast já é exibido pelo hook */
    }
  };

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-background/80 backdrop-blur-md p-4">
      <div className="max-w-md w-full rounded-xl border border-amber-500/40 bg-card/95 p-6 text-center space-y-4 shadow-2xl">
        <div className="mx-auto w-14 h-14 rounded-full bg-amber-500/15 flex items-center justify-center">
          {isPaid ? (
            <Lock className="h-7 w-7 text-amber-400" />
          ) : (
            <Crown className="h-7 w-7 text-amber-400" />
          )}
        </div>

        <div className="space-y-1">
          <h3 className="text-lg font-bold text-foreground">
            {isPaid ? "Conteúdo exclusivo PPV" : "Apenas para assinantes"}
          </h3>
          <p className="text-sm text-muted-foreground">
            {isPaid
              ? "Desbloqueie este conteúdo do Diário VIP por um valor único e mantenha acesso permanente."
              : "Este conteúdo está reservado aos assinantes ativos do canal VIP do criador."}
          </p>
          {post?.teaser && (
            <p className="text-xs text-muted-foreground/80 italic mt-2 line-clamp-3 border-l-2 border-amber-500/40 pl-2 text-left">
              {post.teaser}
            </p>
          )}
        </div>

        {access.needsLogin ? (
          <Button
            onClick={() => navigate(`/login?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`)}
            className="w-full bg-amber-500 hover:bg-amber-600 text-black font-semibold gap-2"
          >
            <LogIn className="h-4 w-4" />
            Entrar para acessar
          </Button>
        ) : isPaid ? (
          <Button
            onClick={handlePurchase}
            disabled={purchase.isPending}
            className="w-full bg-amber-500 hover:bg-amber-600 text-black font-semibold gap-2"
          >
            {purchase.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Processando…
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Desbloquear por R$ {access.price.toFixed(2)}
              </>
            )}
          </Button>
        ) : (
          <Button
            onClick={() => navigate(`/canal/${creatorId}?tab=plans`)}
            className="w-full bg-amber-500 hover:bg-amber-600 text-black font-semibold gap-2"
          >
            <Crown className="h-4 w-4" />
            Assinar canal VIP
          </Button>
        )}

        <p className="text-[10px] text-muted-foreground/70">
          Pagamento seguro processado pela OCULTO · Acesso vitalício ao item PPV
        </p>
      </div>
    </div>
  );
}

export default DiaryPaywall;

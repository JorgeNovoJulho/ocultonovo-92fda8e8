import { useState, useCallback, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useProfile } from "@/hooks/useProfile";
import { supabase } from "@/lib/supabaseExternal";
import { buildShareUrl } from "@/lib/appConfig";
import { useQueryClient } from "@tanstack/react-query";
import {
  Copy,
  Check,
  Share2,
  Link as LinkIcon,
  Gift,
  UserPlus,
  DollarSign,
  Sparkles,
  Smartphone,
} from "lucide-react";

/* ── WhatsApp icon (lucide não tem nativo) ── */
function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.009-.57-.009-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421-7.435c1.409 0 2.554-1.147 2.554-2.56 0-1.412-1.145-2.559-2.554-2.559-1.41 0-2.555 1.147-2.555 2.56 0 1.412 1.145 2.559 2.555 2.559m8.302-3.527C19.126 1.753 15.588 0 12 0 5.373 0 0 5.373 0 12c0 2.111.552 4.17 1.598 5.993L0 24l6.169-1.575A11.93 11.93 0 0012 24c6.627 0 12-5.373 12-12 0-3.588-1.572-7.126-4.098-9.58z" />
    </svg>
  );
}

interface SharePostModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  postId: string;
  postPreview?: string;
  /** Override completo da URL de compartilhamento (ex.: diário usa /leitura/:id). */
  shareUrlOverride?: string;
}

export function SharePostModal({ open, onOpenChange, postId, postPreview, shareUrlOverride }: SharePostModalProps) {
  const { toast } = useToast();
  const { profile } = useProfile();
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(shareUrlOverride ?? null);

  useEffect(() => {
    if (!open || !postId) return;
    if (shareUrlOverride) {
      setShareUrl(shareUrlOverride);
      return;
    }

    let cancelled = false;

    (async () => {
      const { data } = await (supabase as any)
        .from("posts")
        .select("id, share_slug")
        .eq("id", postId)
        .maybeSingle();

      if (cancelled || !data) return;
      const slug = data.share_slug || data.id;
      setShareUrl(buildShareUrl(`/c/${slug}`));
    })();

    return () => {
      cancelled = true;
    };
  }, [open, postId, shareUrlOverride]);

  const handleCreateLink = useCallback(() => {
    const url = shareUrl || buildShareUrl(`/c/${postId}`);
    setShareUrl(url);

    // Optimistic update: incrementa shares_count no cache imediatamente
    const applyDelta = (delta: number) => {
      const updater = (old: any) => {
        if (!old) return old;
        const update = (p: any) =>
          p.id === postId ? { ...p, shares_count: Math.max(0, (p.shares_count || 0) + delta) } : p;
        if (old.pages) {
          return {
            ...old,
            pages: old.pages.map((page: any) => {
              const items = Array.isArray(page?.posts) ? page.posts : Array.isArray(page) ? page : null;
              if (!items) return page;
              const next = items.map(update);
              return Array.isArray(page) ? next : { ...page, posts: next };
            }),
          };
        }
        if (Array.isArray(old)) return old.map(update);
        return old;
      };
      queryClient.setQueriesData({ queryKey: ['posts'] }, updater);
      queryClient.setQueriesData({ queryKey: ['posts-infinite'] }, updater);
      queryClient.setQueriesData({ queryKey: ['creator-posts'] }, updater);
    };

    if (profile?.id && postId) {
      applyDelta(+1);
      (supabase as any)
        .from('post_shares')
        .insert({ post_id: postId, user_id: profile.id, channel: navigator.share ? 'native' : 'clipboard' })
        .then(({ error }: any) => {
          if (error) {
            // Rollback
            applyDelta(-1);
            console.warn('[SharePostModal] insert post_shares falhou:', error?.message);
          } else {
            queryClient.invalidateQueries({ queryKey: ['posts'] });
          }
        });
    }

    if (navigator.share) {
      navigator.share({
        title: 'OCULTO',
        text: postPreview || 'Venha fazer parte do OCULTO!',
        url,
      }).catch(() => {});
    } else {
      navigator.clipboard.writeText(url).then(() => {
        setCopied(true);
        toast({ title: "✅ Link copiado!", description: "Cole e envie para quem quiser convidar." });
        setTimeout(() => setCopied(false), 2000);
      }).catch(() => {
        toast({ title: "Link gerado", description: url });
      });
    }
  }, [postPreview, postId, queryClient, shareUrl, toast]);

  const handleCopy = useCallback(async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast({ title: "✅ Link copiado!" });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Link", description: shareUrl });
    }
  }, [shareUrl, toast]);

  const buildShareText = useCallback(() => {
    const preview = postPreview || 'Venha fazer parte do OCULTO!';
    const url = shareUrl || buildShareUrl(`/c/${postId}`);
    return `${preview}\n\n${url}`;
  }, [postPreview, postId, shareUrl]);

  const handleShareWhatsApp = useCallback(() => {
    const text = buildShareText();
    const encoded = encodeURIComponent(text);
    // iOS / Android abrem o app nativo; desktop cai no WhatsApp Web
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    const url = isMobile
      ? `whatsapp://send?text=${encoded}`
      : `https://wa.me/?text=${encoded}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  }, [buildShareText]);

  const handleNativeShare = useCallback(() => {
    const url = shareUrl || buildShareUrl(`/c/${postId}`);
    if (navigator.share) {
      navigator.share({
        title: 'OCULTO',
        text: postPreview || 'Venha fazer parte do OCULTO!',
        url,
      }).catch(() => {});
    }
  }, [postPreview, postId, shareUrl]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="h-5 w-5" />
            Compartilhar
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* ── Bloco explicativo do Programa de Indicações ── */}
          <div className="rounded-xl border border-primary/30 bg-gradient-to-br from-primary/10 via-pink-500/5 to-amber-500/10 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <div className="h-9 w-9 rounded-full bg-primary/20 flex items-center justify-center">
                <Gift className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-foreground flex items-center gap-1.5">
                  Programa de Indicações
                  <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                </h3>
                <p className="text-[11px] text-muted-foreground leading-tight">
                  Ganhe comissão indicando novos membros
                </p>
              </div>
            </div>

            <ul className="space-y-2 text-xs text-foreground/90">
              <li className="flex items-start gap-2">
                <UserPlus className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                <span><strong className="text-primary">1.</strong> Compartilhe seu link único de convite.</span>
              </li>
              <li className="flex items-start gap-2">
                <Sparkles className="h-3.5 w-3.5 text-pink-400 shrink-0 mt-0.5" />
                <span><strong className="text-pink-400">2.</strong> Quem se cadastrar pelo seu link vira seu <em>afiliado</em>.</span>
              </li>
              <li className="flex items-start gap-2">
                <DollarSign className="h-3.5 w-3.5 text-emerald-400 shrink-0 mt-0.5" />
                <span><strong className="text-emerald-400">3.</strong> Você ganha <strong>comissão</strong> na primeira assinatura paga do seu afiliado.</span>
              </li>
            </ul>
          </div>

          {shareUrl ? (
            <div className="space-y-3">
              <label className="text-sm font-medium">Link de compartilhamento</label>
              <div className="flex gap-2">
                <Input value={shareUrl} readOnly className="bg-muted text-sm" />
                <Button variant="outline" size="icon" onClick={handleCopy}>
                  {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>

              {/* ── Botões de compartilhamento direto ── */}
              <div className="grid grid-cols-2 gap-2">
                <Button
                  onClick={handleShareWhatsApp}
                  className="w-full bg-[#25D366] hover:bg-[#128C7E] text-white"
                >
                  <WhatsAppIcon className="h-4 w-4 mr-2" />
                  WhatsApp
                </Button>
                {navigator.share && (
                  <Button
                    variant="outline"
                    onClick={handleNativeShare}
                    className="w-full"
                  >
                    <Smartphone className="h-4 w-4 mr-2" />
                    Compartilhar
                  </Button>
                )}
              </div>

              <p className="text-xs text-muted-foreground">
                Quem abrir este link verá a landing da postagem publicada.
              </p>
            </div>
          ) : (
            <Button onClick={handleCreateLink} className="w-full">
              <LinkIcon className="h-4 w-4 mr-2" />
              Gerar link de compartilhamento
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

import { useCallback, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Loader2, Send, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabaseExternal";
import { useProfile } from "@/hooks/useProfile";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import * as htmlToImage from "html-to-image";

const BG_OPTIONS: Array<{ id: string; bg: string; text: string; label: string }> = [
  { id: "rosa",     bg: "linear-gradient(135deg,#ff5ea8 0%,#ff2d8a 100%)", text: "#ffffff", label: "Rosa" },
  { id: "violeta",  bg: "linear-gradient(135deg,#7b2ff7 0%,#b14bff 100%)", text: "#ffffff", label: "Violeta" },
  { id: "ambar",    bg: "linear-gradient(135deg,#f59e0b 0%,#ff7a18 100%)", text: "#1a1a1a", label: "Âmbar" },
  { id: "esmeralda",bg: "linear-gradient(135deg,#10b981 0%,#059669 100%)", text: "#ffffff", label: "Esmeralda" },
  { id: "azul",     bg: "linear-gradient(135deg,#2563eb 0%,#4f46e5 100%)", text: "#ffffff", label: "Azul" },
  { id: "noite",    bg: "linear-gradient(135deg,#0f172a 0%,#1e293b 100%)", text: "#f8fafc", label: "Noite" },
  { id: "carmim",   bg: "linear-gradient(135deg,#dc2626 0%,#7f1d1d 100%)", text: "#ffffff", label: "Carmim" },
  { id: "papel",    bg: "linear-gradient(135deg,#fafaf9 0%,#e7e5e4 100%)", text: "#1c1917", label: "Papel" },
];

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  profileOwnerId: string;
  ownerHandle?: string | null;
}

const MAX_LEN = 280;

export function WriteOnMuralModal({ open, onOpenChange, profileOwnerId, ownerHandle }: Props) {
  const { profile } = useProfile();
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [text, setText] = useState("");
  const [bgId, setBgId] = useState(BG_OPTIONS[0].id);
  const [submitting, setSubmitting] = useState(false);
  const previewRef = useRef<HTMLDivElement | null>(null);

  const selected = BG_OPTIONS.find((b) => b.id === bgId) || BG_OPTIONS[0];

  const mentions = useMemo(() => {
    const set = new Set<string>();
    (text.match(/@([a-zA-Z0-9_\.]{2,30})/g) || []).forEach((m) => set.add(m.slice(1).toLowerCase()));
    return Array.from(set);
  }, [text]);

  const renderedContent = useMemo(() => {
    if (!text) return null;
    const parts = text.split(/(@[a-zA-Z0-9_\.]{2,30})/g);
    return parts.map((p, i) =>
      p.startsWith("@") ? (
        <span key={i} style={{ color: "#fde68a", fontWeight: 700 }}>{p}</span>
      ) : (
        <span key={i}>{p}</span>
      ),
    );
  }, [text]);

  const reset = useCallback(() => {
    setText("");
    setBgId(BG_OPTIONS[0].id);
    setSubmitting(false);
  }, []);

  const handleSubmit = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed) {
      toast({ title: "Escreva uma mensagem", variant: "destructive" });
      return;
    }
    if (!user?.id || !profile?.id) {
      toast({ title: "Faça login para escrever no mural", variant: "destructive" });
      return;
    }
    if (!previewRef.current) return;

    setSubmitting(true);
    try {
      const blob = await htmlToImage.toBlob(previewRef.current, {
        pixelRatio: 2,
        cacheBust: true,
        backgroundColor: "#0f172a",
      });
      if (!blob) throw new Error("Falha ao gerar imagem");

      const path = `${profileOwnerId}/${crypto.randomUUID()}.png`;
      const { error: upErr } = await (supabase as any).storage
        .from("mural-posts")
        .upload(path, blob, { contentType: "image/png", upsert: false });
      if (upErr) throw upErr;

      const { data: pub } = (supabase as any).storage.from("mural-posts").getPublicUrl(path);
      const imageUrl = pub?.publicUrl as string;

      const { error: insErr } = await (supabase as any)
        .from("oculto_profile_mural_posts")
        .insert({
          profile_owner_id: profileOwnerId,
          author_id: profile.id,
          content_text: trimmed,
          bg_id: selected.id,
          image_url: imageUrl,
          mentions,
        });
      if (insErr) throw insErr;

      // Notifica o dono do mural (se não for o próprio autor)
      try {
        if (profileOwnerId !== profile.id) {
          const { data: ownerProf } = await (supabase as any)
            .from("profiles")
            .select("user_id, username")
            .eq("id", profileOwnerId)
            .maybeSingle();
          const ownerAuthId = ownerProf?.user_id;
          if (ownerAuthId && ownerAuthId !== user.id) {
            const preview = trimmed.length > 90 ? trimmed.slice(0, 87) + "…" : trimmed;
            await (supabase as any).from("notifications").insert({
              user_id: ownerAuthId,
              type: "mention",
              title: `@${profile.username || "alguém"} escreveu no seu mural`,
              body: preview,
              data: {
                kind: "mural_post",
                profile_owner_id: profileOwnerId,
                owner_user_id: ownerAuthId,
                owner_username: ownerProf?.username || ownerHandle || null,
                actor_id: profile.id,
                actor_user_id: user.id,
                actor_username: profile.username,
                actor_avatar: profile.avatar_url,
                image_url: imageUrl,
                bg_id: selected.id,
                cta_label: "Abrir mural",
                cta_url: `/creator/${profileOwnerId}#mural`,
              },
            });
          }
        }
      } catch (notifErr) {
        console.warn("[WriteOnMuralModal] notificação falhou (não bloqueia post):", notifErr);
      }

      toast({ title: "Publicado no mural", description: ownerHandle ? `de @${ownerHandle.replace(/^@/, "")}` : undefined });
      qc.invalidateQueries({ queryKey: ["profile-mural", profileOwnerId] });
      reset();
      onOpenChange(false);
    } catch (err: any) {
      console.error("[WriteOnMuralModal] erro:", err);
      toast({
        title: "Não foi possível publicar",
        description: err?.message || "Tente novamente em instantes.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  }, [text, user?.id, profile?.id, profile?.username, profile?.avatar_url, profileOwnerId, selected, mentions, ownerHandle, qc, reset, onOpenChange, toast]);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!submitting) { if (!v) reset(); onOpenChange(v); } }}>
      <DialogContent
        className={cn(
          "p-0 gap-0 border-border/60 bg-background",
          // Mobile: ocupa quase toda a tela; Desktop: largura controlada
          "w-[calc(100vw-1rem)] sm:w-full sm:max-w-[560px]",
          "max-h-[92dvh] sm:max-h-[88vh]",
          "overflow-hidden rounded-2xl",
          "flex flex-col",
        )}
      >
        <DialogHeader className="px-4 sm:px-6 pt-4 pb-3 border-b border-border/40 flex-shrink-0">
          <DialogTitle className="flex items-center gap-2 text-sm sm:text-base pr-6 leading-tight">
            <Sparkles className="h-4 w-4 text-amber-400 flex-shrink-0" />
            <span className="truncate">
              Escrever no mural {ownerHandle ? `de @${ownerHandle.replace(/^@/, "")}` : ""}
            </span>
          </DialogTitle>
        </DialogHeader>

        {/* Área rolável com scrollbar invisível */}
        <div
          className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-4 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden overscroll-contain"
        >
          {/* Preview ao vivo */}
          <div className="rounded-xl overflow-hidden border border-border/50 shadow-sm">
            <div
              ref={previewRef}
              style={{
                background: selected.bg,
                color: selected.text,
                minHeight: 200,
                padding: 24,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
                fontWeight: 600,
                fontSize: text.length > 140 ? 17 : text.length > 80 ? 20 : 24,
                lineHeight: 1.35,
                textAlign: "center",
                wordBreak: "break-word",
                whiteSpace: "pre-wrap",
              }}
            >
              {renderedContent || (
                <span style={{ opacity: 0.55, fontStyle: "italic", fontWeight: 500 }}>
                  Sua mensagem aparece aqui…
                </span>
              )}
            </div>
          </div>

          {/* Paleta de cores */}
          <div>
            <p className="text-xs text-muted-foreground mb-2">Fundo</p>
            <div className="flex flex-wrap gap-2">
              {BG_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setBgId(opt.id)}
                  title={opt.label}
                  aria-label={opt.label}
                  className={cn(
                    "h-9 w-9 rounded-full border-2 transition-transform",
                    bgId === opt.id ? "border-amber-400 scale-110" : "border-border/50 hover:scale-105",
                  )}
                  style={{ background: opt.bg }}
                />
              ))}
            </div>
          </div>

          {/* Texto */}
          <div>
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, MAX_LEN))}
              placeholder="Escreva sua mensagem... use @username para mencionar alguém"
              rows={4}
              className="resize-none text-sm"
              disabled={submitting}
            />
            <div className="flex items-center justify-between mt-1 text-[11px] text-muted-foreground">
              <span>
                {mentions.length > 0 ? `${mentions.length} menção${mentions.length > 1 ? "es" : ""}` : "Sem menções"}
              </span>
              <span>{text.length}/{MAX_LEN}</span>
            </div>
          </div>

          {/* Autor */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Avatar className="h-7 w-7">
              <AvatarImage src={profile?.avatar_url || undefined} alt={profile?.username || "eu"} />
              <AvatarFallback className="text-[10px]">
                {(profile?.username || profile?.name || "EU").slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span className="truncate">publicando como @{profile?.username || "você"}</span>
          </div>
        </div>

        {/* Footer fixo */}
        <div className="flex-shrink-0 flex justify-end gap-2 px-4 sm:px-6 py-3 border-t border-border/40 bg-background/95 backdrop-blur pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancelar
          </Button>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={submitting || !text.trim()}
            className="bg-gradient-to-r from-pink-500 to-amber-500 text-white"
          >
            {submitting ? (
              <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Publicando…</>
            ) : (
              <><Send className="h-4 w-4 mr-1" /> Publicar</>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default WriteOnMuralModal;

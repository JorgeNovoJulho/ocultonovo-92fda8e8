import { useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { BookOpen, Loader2, Lock, Upload, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabaseExternal";
import { getCanonicalAuthorIds } from "@/lib/postAuthorResolver";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { smartImageUpload } from "@/lib/smartUpload";
import { useQueryClient } from "@tanstack/react-query";

export type NarrativeSectionKey =
  | "story" | "chapter" | "diary" | "article" | "series" | "text_post";

const SECTION_LABEL: Record<NarrativeSectionKey, string> = {
  story: "História",
  chapter: "Capítulo",
  diary: "Diário VIP",
  article: "Texto",
  series: "Série",
  text_post: "Bastidor",
};

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  sectionKey: NarrativeSectionKey;
  channelName?: string;
  /** Quando definido, o modal entra em modo edição (UPDATE em vez de INSERT). */
  editingPost?: any | null;
}

const AVG_WPM = 200;

export default function AddNarrativeContentModal({
  open, onOpenChange, sectionKey, channelName, editingPost,
}: Props) {

  const { user } = useAuth();
  const { profile } = useProfile();
  const queryClient = useQueryClient();
  const coverInputRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [teaser, setTeaser] = useState("");
  const [body, setBody] = useState("");
  const [seriesId, setSeriesId] = useState<string>("none");
  const [newSeriesTitle, setNewSeriesTitle] = useState("");
  const [chapterNumber, setChapterNumber] = useState<string>("");
  const [scheduledAt, setScheduledAt] = useState<string>("");
  const [isLocked, setIsLocked] = useState(true);
  const [isPaid, setIsPaid] = useState(false);
  const [price, setPrice] = useState<string>("9.90");
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [series, setSeries] = useState<{ id: string; title: string }[]>([]);

  const ownerProfileId = (profile as any)?.id || null;
  const finalChannelName = channelName || (profile as any)?.display_name || "criador";

  const isEditing = !!editingPost?.id;

  // Prefill quando entra em modo edição
  useEffect(() => {
    if (!open || !editingPost?.id) return;
    setTitle(editingPost.title || "");
    setSubtitle(editingPost.subtitle || "");
    setTeaser(editingPost.teaser || "");
    setBody(editingPost.content_text || "");
    setSeriesId(editingPost.series_id || "none");
    setNewSeriesTitle("");
    setChapterNumber(editingPost.chapter_number ? String(editingPost.chapter_number) : "");
    setScheduledAt(
      editingPost.scheduled_at
        ? new Date(editingPost.scheduled_at).toISOString().slice(0, 16)
        : ""
    );
    setIsLocked(editingPost.is_locked ?? true);
    setIsPaid(!!editingPost.is_paid);
    setPrice(editingPost.paid_price ? String(editingPost.paid_price) : "9.90");
    setCoverPreview(editingPost.thumbnail_url || "");
    setCoverFile(null);
  }, [open, editingPost?.id]);

  // Carrega séries existentes do criador
  useEffect(() => {
    if (!open || !ownerProfileId) return;
    (async () => {
      const { data } = await (supabase as any)
        .from("creator_content_series")
        .select("id, title")
        .eq("creator_id", ownerProfileId)
        .eq("status", "active")
        .order("sort_order", { ascending: true });
      setSeries(data || []);
    })();
  }, [open, ownerProfileId]);


  const wordCount = useMemo(
    () => body.trim().split(/\s+/).filter(Boolean).length,
    [body]
  );
  const readMinutes = Math.max(1, Math.round(wordCount / AVG_WPM));

  const reset = () => {
    if (coverPreview) URL.revokeObjectURL(coverPreview);
    setTitle(""); setSubtitle(""); setTeaser(""); setBody("");
    setSeriesId("none"); setNewSeriesTitle(""); setChapterNumber("");
    setScheduledAt(""); setIsLocked(true); setIsPaid(false); setPrice("9.90");
    setCoverFile(null); setCoverPreview(""); setSubmitting(false);
  };

  const handleClose = (o: boolean) => {
    if (!o) reset();
    onOpenChange(o);
  };

  const handleCoverPicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith("image/")) { toast.error("Capa deve ser uma imagem"); return; }
    if (coverPreview) URL.revokeObjectURL(coverPreview);
    setCoverFile(f);
    setCoverPreview(URL.createObjectURL(f));
  };

  const handleSubmit = async () => {
    if (!user?.id || !ownerProfileId) { toast.error("Sessão inválida"); return; }
    if (!title.trim()) { toast.error("Título obrigatório"); return; }
    if (!body.trim()) { toast.error("Texto principal obrigatório"); return; }
    if (isPaid) {
      const priceNum = parseFloat(price.replace(",", "."));
      if (!Number.isFinite(priceNum) || priceNum < 1 || priceNum > 500) {
        toast.error("Valor avulso deve estar entre R$ 1,00 e R$ 500,00");
        return;
      }
    }

    setSubmitting(true);
    try {
      // 1) Cria série nova se solicitado
      let resolvedSeriesId: string | null = seriesId !== "none" ? seriesId : null;
      let resolvedSeriesTitle: string | null = null;
      if (!resolvedSeriesId && newSeriesTitle.trim()) {
        const { data: newSerie, error: sErr } = await (supabase as any)
          .from("creator_content_series")
          .insert({
            creator_id: ownerProfileId,
            title: newSeriesTitle.trim().slice(0, 120),
          })
          .select("id, title")
          .single();
        if (sErr) throw sErr;
        resolvedSeriesId = newSerie.id;
        resolvedSeriesTitle = newSerie.title;
      } else if (resolvedSeriesId) {
        resolvedSeriesTitle = series.find((s) => s.id === resolvedSeriesId)?.title || null;
      }

      // 2) Upload da capa (opcional)
      let coverUrl: string | null = null;
      if (coverFile) {
        const r = await smartImageUpload(coverFile, user.id, "vip-narrative-cover", "post-media", () => {});
        coverUrl = r.publicUrl;
      }

      // 3) Insert post narrativo
      const { authorProfileId, creatorId } = await getCanonicalAuthorIds(user.id);
      const priceNum = isPaid ? parseFloat(price.replace(",", ".")) : 0;
      const scheduledIso = scheduledAt ? new Date(scheduledAt).toISOString() : null;
      const status = scheduledIso && new Date(scheduledIso) > new Date() ? "scheduled" : "published";

      const insertPayload: any = {
        author_id: authorProfileId,
        creator_id: creatorId,
        content_text: body.trim(),
        media_type: "text",
        thumbnail_url: coverUrl ?? (isEditing ? editingPost.thumbnail_url : null),
        privacy_level: "vip",
        is_locked: isLocked,
        is_paid: isPaid,
        paid_price: priceNum || 0,
        section_type: sectionKey,
        content_format: "narrative",
        narrative_status: status,
        title: title.trim().slice(0, 200),
        subtitle: subtitle.trim().slice(0, 250) || null,
        teaser: teaser.trim().slice(0, 600) || null,
        series_id: resolvedSeriesId,
        series_title: resolvedSeriesTitle,
        chapter_number: chapterNumber ? parseInt(chapterNumber, 10) : null,
        scheduled_at: scheduledIso,
        read_time_minutes: readMinutes,
      };

      if (isEditing) {
        const { author_id, creator_id, ...updatePayload } = insertPayload;
        const { error } = await (supabase as any)
          .from("posts")
          .update(updatePayload)
          .eq("id", editingPost.id);
        if (error) throw error;
        toast.success(`${SECTION_LABEL[sectionKey]} atualizada!`);
      } else {
        const { error } = await (supabase as any).from("posts").insert(insertPayload);
        if (error) throw error;
        toast.success(`${SECTION_LABEL[sectionKey]} publicada no canal!`);
      }

      queryClient.invalidateQueries({ queryKey: ["creator-channel"] });
      queryClient.invalidateQueries({ queryKey: ["creator-media"] });
      queryClient.invalidateQueries({ queryKey: ["posts"] });
      queryClient.invalidateQueries({ queryKey: ["posts-infinite"] });
      queryClient.refetchQueries({ queryKey: ["posts-infinite"], type: "active" });
      handleClose(false);

    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || "Erro ao publicar");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className={cn(
          "p-0 gap-0 border-border bg-background",
          "w-screen h-[100dvh] max-w-none rounded-none sm:w-full sm:h-auto sm:max-h-[92vh] sm:max-w-2xl sm:rounded-lg",
          "flex flex-col overflow-hidden"
        )}
      >
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-border/60">
          <DialogTitle className="flex items-center gap-2 text-base">
            <BookOpen className="h-5 w-5 text-[hsl(45,93%,47%)]" />
            {isEditing ? "Editar" : "Nova"} {SECTION_LABEL[sectionKey]} — {finalChannelName}
          </DialogTitle>
          <DialogDescription className="text-xs">
            Conteúdo narrativo do seu canal VIP. Leitores assinantes ou compradores
            avulsos veem o texto completo; visitantes veem apenas o teaser.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          <div className="space-y-2">
            <Label htmlFor="nar-title">Título *</Label>
            <Input
              id="nar-title"
              placeholder="Ex.: A noite que mudou tudo"
              value={title}
              onChange={(e) => setTitle(e.target.value.slice(0, 200))}
              maxLength={200}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="nar-subtitle">Subtítulo</Label>
            <Input
              id="nar-subtitle"
              placeholder="Uma linha curta para complementar o título"
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value.slice(0, 250))}
              maxLength={250}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="nar-teaser">Teaser (sempre visível)</Label>
              <span className="text-[10px] text-muted-foreground">{teaser.length}/600</span>
            </div>
            <Textarea
              id="nar-teaser"
              placeholder="Resumo público que aparece para todo mundo, mesmo sem acesso."
              value={teaser}
              onChange={(e) => setTeaser(e.target.value.slice(0, 600))}
              rows={3}
              className="resize-none"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="nar-body">Texto completo *</Label>
              <span className="text-[10px] text-muted-foreground">
                {wordCount} palavras · ~{readMinutes} min
              </span>
            </div>
            <Textarea
              id="nar-body"
              placeholder="Escreva sua história, capítulo, diário ou texto longo aqui..."
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={14}
              className="resize-y min-h-[260px] font-serif text-[15px] leading-relaxed"
            />
          </div>

          {(sectionKey === "chapter" || sectionKey === "story") && (
            <div className="rounded-lg border border-border p-3 space-y-3">
              <p className="text-xs font-semibold">Série / Capítulo</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label className="text-[11px]">Série existente</Label>
                  <Select value={seriesId} onValueChange={(v) => { setSeriesId(v); if (v !== "none") setNewSeriesTitle(""); }}>
                    <SelectTrigger><SelectValue placeholder="Nenhuma" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhuma</SelectItem>
                      {series.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.title}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px]">Nº do capítulo</Label>
                  <Input
                    type="number"
                    min="1"
                    placeholder="1"
                    value={chapterNumber}
                    onChange={(e) => setChapterNumber(e.target.value.replace(/[^0-9]/g, ""))}
                  />
                </div>
              </div>
              {seriesId === "none" && (
                <div className="space-y-1.5">
                  <Label className="text-[11px]">…ou criar nova série</Label>
                  <Input
                    placeholder="Título da nova série (opcional)"
                    value={newSeriesTitle}
                    onChange={(e) => setNewSeriesTitle(e.target.value.slice(0, 120))}
                    maxLength={120}
                  />
                </div>
              )}
            </div>
          )}

          <div className="rounded-lg border border-border p-3 space-y-2">
            <input ref={coverInputRef} type="file" accept="image/*" onChange={handleCoverPicked} className="hidden" />
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium">Capa (opcional)</p>
                <p className="text-[11px] text-muted-foreground">Imagem ilustrativa para o card no canal.</p>
              </div>
              {coverPreview && (
                <img loading="lazy" decoding="async" src={coverPreview} alt="capa" className="h-14 w-14 object-cover rounded-md border border-border shrink-0" />
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => coverInputRef.current?.click()}>
                <Upload className="h-3.5 w-3.5 mr-1.5" /> Enviar capa
              </Button>
              {coverFile && (
                <Button
                  type="button" variant="ghost" size="sm"
                  onClick={() => { if (coverPreview) URL.revokeObjectURL(coverPreview); setCoverFile(null); setCoverPreview(""); }}
                >
                  <ImageIcon className="h-3.5 w-3.5 mr-1.5" /> Remover
                </Button>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-border p-3 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Conteúdo bloqueado</p>
                <p className="text-[11px] text-muted-foreground">Apenas assinantes e compradores avulsos veem o texto completo.</p>
              </div>
              <Switch checked={isLocked} onCheckedChange={setIsLocked} />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Vender também avulso</p>
                <p className="text-[11px] text-muted-foreground">Permite compra individual além da assinatura.</p>
              </div>
              <Switch checked={isPaid} onCheckedChange={setIsPaid} />
            </div>
            {isPaid && (
              <div className="space-y-1.5">
                <Label htmlFor="nar-price" className="text-[11px]">Preço avulso (R$)</Label>
                <Input
                  id="nar-price"
                  type="number"
                  step="0.01"
                  min="1"
                  max="500"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                />
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="nar-sched" className="text-[11px]">Agendar publicação (opcional)</Label>
            <Input
              id="nar-sched"
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter className="px-5 py-3 border-t border-border/60 gap-2 flex-row">
          <Button variant="ghost" onClick={() => handleClose(false)} disabled={submitting} className="flex-1 sm:flex-initial">
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || !title.trim() || !body.trim()}
            className="flex-1 sm:flex-initial bg-gradient-to-r from-[hsl(45,93%,47%)] to-[hsl(35,80%,40%)] text-[hsl(45,93%,10%)] font-semibold"
          >
            {submitting ? (
              <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> {isEditing ? "Salvando..." : "Publicando..."}</>
            ) : (
              <><Lock className="h-4 w-4 mr-1.5" /> {isEditing ? "Salvar alterações" : "Publicar no canal"}</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

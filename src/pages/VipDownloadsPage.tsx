import { useMemo, useState } from "react";
import { Download, Trash2, Play, Lock, Link as LinkIcon, Image as ImageIcon, Video as VideoIcon, ChevronLeft, ChevronRight, Filter, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRemoveVipDownload, useVipDownloads, type VipDownloadRecord } from "@/hooks/useVipDownloads";
import { fetchPaidMediaUrl } from "@/lib/paidMedia";
import { formatCurrencyBR } from "@/lib/paidVideoDownload";
import { toast } from "sonner";

type MediaKind = "all" | "video" | "image" | "link";
const PAGE_SIZE = 9;

function detectKind(record: VipDownloadRecord): Exclude<MediaKind, "all"> {
  const url = record.post.media_url || "";
  const type = record.post.media_type || "";
  if (type === "video" || /\.(mp4|webm|mov)(\?|$)/i.test(url)) return "video";
  if (type === "image" || /\.(jpe?g|png|gif|webp|avif)(\?|$)/i.test(url)) return "image";
  return "link";
}

function downloadFile(url: string, title?: string | null, ext = "mp4") {
  const link = document.createElement("a");
  link.href = url;
  link.download = `${(title || "download-vip").slice(0, 32).replace(/[^a-z0-9-_]+/gi, "-")}.${ext}`;
  link.rel = "noopener noreferrer";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

async function copyProtectedLink(postId: string) {
  try {
    const r = await fetchPaidMediaUrl(postId);
    const url = r.url;
    if (!url) {
      toast.error("Não foi possível gerar link protegido.");
      return;
    }
    await navigator.clipboard.writeText(url);
    toast.success("Link protegido copiado (válido por ~60s).");
  } catch (e: any) {
    toast.error(e?.message || "Erro ao gerar link protegido.");
  }
}

export default function VipDownloadsPage() {
  const { data: downloads = [], isLoading } = useVipDownloads();
  const removeDownload = useRemoveVipDownload();

  const [kindFilter, setKindFilter] = useState<MediaKind>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return downloads.filter((d) => {
      if (kindFilter !== "all" && detectKind(d) !== kindFilter) return false;
      if (q && !(d.post.content_text || "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [downloads, kindFilter, searchTerm]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageItems = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const removeItem = (id: string) => {
    removeDownload.mutate(id);
    toast.success("Item removido dos seus downloads");
  };

  return (
    <div className="p-4 lg:p-6 pb-24 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Download className="h-6 w-6 text-primary" /> Meus downloads VIP
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Conteúdos pagos liberados para você. Use o link protegido para acessar fora da plataforma (expira em ~60s).
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={kindFilter} onValueChange={(v) => { setKindFilter(v as MediaKind); setPage(1); }}>
            <SelectTrigger className="w-[180px] h-9">
              <SelectValue placeholder="Filtrar por tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="video">Vídeos</SelectItem>
              <SelectItem value="image">Imagens</SelectItem>
              <SelectItem value="link">Links</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
            placeholder="Buscar por título ou conteúdo..."
            className="pl-9 h-9"
          />
        </div>
        <span className="text-xs text-muted-foreground">
          {filtered.length} item{filtered.length === 1 ? "" : "s"}
        </span>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-64 rounded-lg" />)}
        </div>
      ) : pageItems.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <Lock className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="font-medium">Nenhum download {kindFilter !== "all" ? `do tipo ${kindFilter}` : "liberado ainda"}</p>
          <p className="text-sm text-muted-foreground mt-1">Após desbloquear um conteúdo pago, ele aparecerá aqui.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {pageItems.map((record) => {
              const kind = detectKind(record);
              const isVideo = kind === "video";
              const isImage = kind === "image";
              const cover = record.post.thumbnail_url || (isImage ? record.post.media_url : null);
              const KindIcon = isVideo ? VideoIcon : isImage ? ImageIcon : LinkIcon;
              return (
                <article key={record.id} className="rounded-lg border border-border bg-card overflow-hidden">
                  <div className="relative aspect-video bg-muted">
                    {cover ? (
                      <img src={cover} alt={record.post.content_text || "Mídia VIP"} loading="lazy" decoding="async" className="w-full h-full object-cover" />
                    ) : isVideo ? (
                      <video src={record.post.media_url || ""} className="w-full h-full object-cover" muted preload="metadata" controlsList="nodownload nofullscreen noremoteplayback" disablePictureInPicture onContextMenu={(e) => e.preventDefault()} />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                        <KindIcon className="h-10 w-10" />
                      </div>
                    )}
                    {isVideo && (
                      <div className="absolute inset-0 flex items-center justify-center bg-background/20 pointer-events-none">
                        <div className="h-12 w-12 rounded-full bg-background/80 flex items-center justify-center">
                          <Play className="h-5 w-5 text-foreground ml-0.5" />
                        </div>
                      </div>
                    )}
                    <Badge className="absolute top-2 left-2 bg-primary text-primary-foreground gap-1">
                      <KindIcon className="h-3 w-3" /> {kind}
                    </Badge>
                  </div>
                  <div className="p-4 space-y-3">
                    <div>
                      <p className="font-semibold line-clamp-2">{record.post.content_text || "Conteúdo VIP liberado"}</p>
                      <p className="text-xs text-muted-foreground">Liberado em {new Date(record.purchased_at).toLocaleString("pt-BR")}</p>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Valor pago</span>
                      <span className="font-semibold text-primary">{formatCurrencyBR(record.amount_paid)}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        className="gap-2"
                        disabled={!record.post.media_url}
                        onClick={() => record.post.media_url && downloadFile(record.post.media_url, record.post.content_text, isVideo ? "mp4" : isImage ? "jpg" : "bin")}
                      >
                        <Download className="h-4 w-4" /> Baixar
                      </Button>
                      <Button
                        variant="outline"
                        className="gap-2"
                        onClick={() => copyProtectedLink(record.post.id)}
                      >
                        <LinkIcon className="h-4 w-4" /> Copiar link
                      </Button>
                    </div>
                    <Button variant="ghost" size="sm" className="w-full gap-2 text-muted-foreground hover:text-destructive" onClick={() => removeItem(record.id)}>
                      <Trash2 className="h-4 w-4" /> Remover dos meus downloads
                    </Button>
                  </div>
                </article>
              );
            })}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-2">
              <Button variant="outline" size="sm" disabled={currentPage === 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                <ChevronLeft className="h-4 w-4" /> Anterior
              </Button>
              <span className="text-sm text-muted-foreground">
                Página {currentPage} de {totalPages}
              </span>
              <Button variant="outline" size="sm" disabled={currentPage === totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
                Próxima <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

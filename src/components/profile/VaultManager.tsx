/**
 * VaultManager — gerencia o Cofre paginado (até 5000 itens).
 * - Paginação 500/página, máx 10 páginas.
 * - Seleção individual ou em lote.
 * - Backup ZIP local + remoção em massa do banco.
 * - Alerta quando atinge o limite de 5000.
 */
import { useMemo, useState } from "react";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Download, Trash2, AlertTriangle, CheckSquare, Square, ChevronLeft, ChevronRight, FileVideo, ImageIcon, Play } from "lucide-react";
import { PostExpandedModal } from "@/components/PostExpandedModal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { Progress } from "@/components/ui/progress";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabaseExternal";
import { resolveMediaKind, resolveVideoThumbnail } from "@/lib/mediaType";
import { resolvePostMediaUrl } from "@/lib/postMediaUtils";
import {
  useMyVaultPosts,
  VAULT_PAGE_SIZE,
  VAULT_MAX_PAGES,
  VAULT_MAX_TOTAL,
} from "@/hooks/useMyProfileStats";

interface Props {
  profileId: string | undefined;
}

function filenameFromUrl(url: string, id: string, type?: string | null) {
  try {
    const clean = url.split("?")[0];
    const last = clean.substring(clean.lastIndexOf("/") + 1) || `${id}`;
    if (last.includes(".")) return last;
    const ext = type === "video" ? "mp4" : "jpg";
    return `${last}.${ext}`;
  } catch {
    return `${id}.${type === "video" ? "mp4" : "jpg"}`;
  }
}

export default function VaultManager({ profileId }: Props) {
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [backupOpen, setBackupOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [working, setWorking] = useState(false);
  const [progress, setProgress] = useState(0);
  const [innerTab, setInnerTab] = useState<"videos" | "images">("videos");
  const [previewPost, setPreviewPost] = useState<any | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading } = useMyVaultPosts(profileId, page);
  const items = data?.items ?? [];
  const normalizedItems = useMemo(
    () =>
      (items as any[])
        .map((post) => {
          const resolvedUrl = resolvePostMediaUrl(post);
          const mediaKind = resolveMediaKind(post?.media_type, resolvedUrl);

          return {
            ...(post as Record<string, any>),
            media_url: resolvedUrl,
            media_type: mediaKind === "video" ? "video" : (post?.media_type || "image"),
            thumbnail_url:
              mediaKind === "video"
                ? resolveVideoThumbnail(post?.thumbnail_url, resolvedUrl)
                : (post?.thumbnail_url || resolvedUrl),
          } as Record<string, any>;
        })
        .filter((post) => !!post.media_url),
    [items]
  );

  const videoItems = useMemo(
    () => normalizedItems.filter((p: any) => p.media_type === "video"),
    [normalizedItems]
  );
  const imageItems = useMemo(
    () => normalizedItems.filter((p: any) => p.media_type !== "video"),
    [normalizedItems]
  );
  const visibleItems = innerTab === "videos" ? videoItems : imageItems;

  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;
  const limitReached = !!data?.limitReached;

  const allSelectedOnPage = useMemo(
    () => visibleItems.length > 0 && visibleItems.every((p: any) => selected.has(p.id)),
    [visibleItems, selected]
  );


  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const togglePage = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelectedOnPage) visibleItems.forEach((p: any) => next.delete(p.id));
      else visibleItems.forEach((p: any) => next.add(p.id));
      return next;
    });
  };


  const clearSelection = () => setSelected(new Set());

  /** Apenas baixa um ZIP com as mídias selecionadas. NÃO apaga nada do banco. */
  const backupOnly = async () => {
    if (selected.size === 0) return;
    setWorking(true);
    setProgress(0);
    const ids = Array.from(selected);
    const zip = new JSZip();
    const folder = zip.folder("cofre-backup")!;

    const { data: rows, error } = await (supabase as any)
      .from("posts")
      .select("id, media_url, media_type, created_at, content_text")
      .in("id", ids);

    if (error || !rows) {
      toast({ title: "Erro ao buscar mídias", description: error?.message, variant: "destructive" });
      setWorking(false);
      return;
    }

    const manifest: any[] = [];
    let done = 0;
    for (const row of rows) {
      try {
        if (row.media_url) {
          const res = await fetch(row.media_url);
          if (res.ok) {
            const blob = await res.blob();
            const fname = filenameFromUrl(row.media_url, row.id, row.media_type);
            folder.file(fname, blob);
            manifest.push({ id: row.id, file: fname, created_at: row.created_at, note: row.content_text });
          } else {
            manifest.push({ id: row.id, file: null, error: `HTTP ${res.status}` });
          }
        } else {
          manifest.push({ id: row.id, file: null, created_at: row.created_at, note: row.content_text });
        }
      } catch (e: any) {
        manifest.push({ id: row.id, error: e?.message || "fetch failed" });
      }
      done += 1;
      setProgress(Math.round((done / rows.length) * 85));
    }

    folder.file(
      "manifest.json",
      JSON.stringify({ exported_at: new Date().toISOString(), total: rows.length, items: manifest }, null, 2),
    );

    const blob = await zip.generateAsync({ type: "blob" }, (meta) => {
      setProgress(85 + Math.round(meta.percent * 0.15));
    });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    saveAs(blob, `oculto-cofre-backup-${stamp}.zip`);

    setProgress(100);
    setWorking(false);
    setBackupOpen(false);

    toast({
      title: "Backup concluído",
      description: `${rows.length} mídia(s) salva(s) no ZIP. Nada foi removido do Cofre.`,
    });
  };

  /** Apenas exclui as mídias selecionadas do banco. NÃO gera ZIP. */
  const deleteOnly = async () => {
    if (selected.size === 0) return;
    setWorking(true);
    setProgress(50);
    const ids = Array.from(selected);

    const { error: delErr } = await (supabase as any)
      .from("posts")
      .delete()
      .in("id", ids);

    setProgress(100);
    setWorking(false);
    setDeleteOpen(false);

    if (delErr) {
      toast({ title: "Falha ao excluir", description: delErr.message, variant: "destructive" });
      return;
    }

    clearSelection();
    queryClient.invalidateQueries({ queryKey: ["my-vault-posts", profileId] });
    queryClient.invalidateQueries({ queryKey: ["my-posts", profileId] });

    toast({
      title: "Mídias removidas",
      description: `${ids.length} mídia(s) excluída(s) permanentemente do Cofre.`,
    });
  };


  return (
    <div className="space-y-4">
      {/* Alerta de limite */}
      {limitReached && (
        <div className="flex items-start gap-2 p-3 rounded-lg border border-amber-500/40 bg-amber-500/10">
          <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
          <div className="text-[12px] text-amber-700 dark:text-amber-300 leading-relaxed">
            <p className="font-semibold">Limite do Cofre atingido — {VAULT_MAX_TOTAL.toLocaleString("pt-BR")} mídias.</p>
            <p>Selecione abaixo as mídias que deseja salvar em backup (ZIP) e remover do Cofre para liberar espaço.</p>
          </div>
        </div>
      )}

      {/* Barra de status / ações */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="outline" className="text-[10px]">
            Página {page} de {totalPages}
          </Badge>
          <Badge variant="outline" className="text-[10px]">
            {total.toLocaleString("pt-BR")} / {VAULT_MAX_TOTAL.toLocaleString("pt-BR")}
          </Badge>
          {selected.size > 0 && (
            <Badge className="bg-primary/15 text-primary text-[10px]">
              {selected.size} selecionada(s)
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={togglePage} disabled={items.length === 0}>
            {allSelectedOnPage ? <CheckSquare className="h-3.5 w-3.5 mr-1" /> : <Square className="h-3.5 w-3.5 mr-1" />}
            {allSelectedOnPage ? "Desmarcar página" : "Selecionar página"}
          </Button>
          {selected.size > 0 && (
            <Button size="sm" variant="ghost" onClick={clearSelection}>
              Limpar
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            disabled={selected.size === 0 || working}
            onClick={() => setBackupOpen(true)}
          >
            <Download className="h-3.5 w-3.5 mr-1" />
            Backup ZIP ({selected.size})
          </Button>
          <Button
            size="sm"
            variant="destructive"
            disabled={selected.size === 0 || working}
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="h-3.5 w-3.5 mr-1" />
            Excluir ({selected.size})
          </Button>

        </div>
      </div>

      {/* Guias internas: Vídeos / Fotos */}
      <div className="flex items-center gap-2 border-b border-border/40">
        <button
          type="button"
          onClick={() => { setInnerTab("videos"); clearSelection(); }}
          className={cn(
            "flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors border-b-2 -mb-px",
            innerTab === "videos"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          <FileVideo className="h-3.5 w-3.5" />
          Vídeos
          <Badge variant="outline" className="text-[10px] ml-1">{videoItems.length}</Badge>
        </button>
        <button
          type="button"
          onClick={() => { setInnerTab("images"); clearSelection(); }}
          className={cn(
            "flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors border-b-2 -mb-px",
            innerTab === "images"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          <ImageIcon className="h-3.5 w-3.5" />
          Fotos
          <Badge variant="outline" className="text-[10px] ml-1">{imageItems.length}</Badge>
        </button>
      </div>

      {/* Grade */}
      {isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : visibleItems.length === 0 ? (
        <div className="text-center py-12 text-sm text-muted-foreground">
          {innerTab === "videos" ? "Nenhum vídeo no Cofre." : "Nenhuma foto no Cofre."}
        </div>
      ) : (
        <div className="columns-2 sm:columns-3 lg:columns-4 gap-2">
          {visibleItems.map((post: any) => {
            const isSelected = selected.has(post.id);
            const isVideo = post.media_type === "video";
            return (
              <div
                key={post.id}
                className={cn(
                  "relative mb-2 break-inside-avoid overflow-hidden rounded-md border bg-muted/30 text-left transition-all",
                  isSelected ? "border-primary ring-2 ring-primary/50" : "border-border/40 hover:border-primary/40"
                )}
              >
                {post.media_url ? (
                  <img
                    src={isVideo ? resolveVideoThumbnail(post.thumbnail_url, post.media_url) : (post.thumbnail_url || post.media_url)}
                    alt=""
                    loading="lazy"
                    className="w-full h-auto object-cover pointer-events-none"
                  />
                ) : (
                  <div className="flex min-h-[180px] w-full items-center justify-center text-muted-foreground">
                    <ImageIcon className="h-6 w-6 opacity-30" />
                  </div>
                )}
                {isVideo && (
                  <>
                    <button
                      type="button"
                      aria-label="Reproduzir vídeo"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPreviewPost(post);
                      }}
                      className="absolute inset-0 z-[5] flex items-center justify-center bg-black/0 hover:bg-black/30 transition-colors group"
                    >
                      <span className="h-10 w-10 rounded-full bg-black/60 group-hover:bg-primary/90 flex items-center justify-center transition-colors">
                        <Play className="h-5 w-5 text-white fill-white ml-0.5" />
                      </span>
                    </button>
                    <div className="absolute bottom-1 left-1 bg-black/60 rounded p-0.5 pointer-events-none">
                      <FileVideo className="h-3 w-3 text-white" />
                    </div>
                  </>
                )}
                {/* Checkbox de seleção — clique aqui NÃO abre o player */}
                <button
                  type="button"
                  aria-label={isSelected ? "Desmarcar" : "Selecionar"}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleOne(post.id);
                  }}
                  className={cn(
                    "absolute top-1 right-1 h-6 w-6 rounded border flex items-center justify-center transition-colors z-10",
                    isSelected ? "bg-primary border-primary text-primary-foreground" : "bg-black/60 border-white/60 text-white hover:bg-black/80"
                  )}
                >
                  {isSelected ? <CheckSquare className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Paginação */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <span className="text-xs text-muted-foreground">
            Página {page} / {totalPages} · {VAULT_PAGE_SIZE}/página
          </span>
          <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {/* Confirmação — Backup ZIP */}
      <AlertDialog open={backupOpen} onOpenChange={(o) => !working && setBackupOpen(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Backup ZIP do Cofre</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span className="block">
                Serão baixadas <b>{selected.size}</b> mídia(s) em um arquivo ZIP no seu dispositivo.
                Os arquivos <b>permanecem</b> no Cofre — esta ação apenas gera o backup.
              </span>
              {working && (
                <span className="block pt-2">
                  <Progress value={progress} className="h-2" />
                  <span className="text-[11px] text-muted-foreground mt-1 block">Processando… {progress}%</span>
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={working}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); backupOnly(); }} disabled={working}>
              {working ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Gerando ZIP…</>
              ) : (
                <><Download className="h-4 w-4 mr-2" /> Baixar ZIP</>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmação — Excluir */}
      <AlertDialog open={deleteOpen} onOpenChange={(o) => !working && setDeleteOpen(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir mídias do Cofre</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span className="block">
                <b>{selected.size}</b> mídia(s) serão <b>removidas permanentemente</b> do Cofre.
              </span>
              <span className="block text-amber-600 dark:text-amber-400">
                Esta ação não pode ser desfeita. Se quiser preservar uma cópia, gere o Backup ZIP antes.
              </span>
              {working && (
                <span className="block pt-2">
                  <Progress value={progress} className="h-2" />
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={working}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); deleteOnly(); }}
              disabled={working}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {working ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Excluindo…</>
              ) : (
                <><Trash2 className="h-4 w-4 mr-2" /> Excluir definitivamente</>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Player expandido (mesmo do feed) — abre ao clicar no Play do card de vídeo */}
      {previewPost && (
        <PostExpandedModal
          open={!!previewPost}
          onOpenChange={(o) => { if (!o) setPreviewPost(null); }}
          post={previewPost}
          isLiked={!!previewPost.is_liked}
          isDisliked={!!previewPost.is_disliked}
          isSaved={!!previewPost.is_saved}
        />
      )}
    </div>
  );
}

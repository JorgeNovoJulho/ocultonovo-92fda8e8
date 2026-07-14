import { useState } from "react";
import { Image as ImageIcon, Video, Clock, Lock, Heart, MessageCircle, MoreVertical, Pencil, Trash2, Globe, Users, Flame, Play, Download } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { MediaGalleryModal } from "@/components/MediaGalleryModal";
import type { MediaItem } from "@/hooks/useMediaManager";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabaseExternal";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { VideoCoverPicker } from "@/components/VideoCoverPicker";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { PinterestMasonry } from "@/components/common/PinterestMasonry";
import { EXTERNAL_SUPABASE_URL } from '@/lib/appConfig';

interface MediaPost {
  id: string;
  media_url: string | null;
  media_type?: string | null;
  video_duration_seconds?: number | null;
  thumbnail_url?: string | null;
  privacy_level?: string;
  likes_count?: number;
  comments_count?: number;
  content_text?: string | null;
  user_id?: string;
  is_paid?: boolean;
  paid_price?: number;
}

interface ProfileMediaTabsProps {
  posts: MediaPost[];
  isLoading: boolean;
  planType?: string;
  isOwner?: boolean;
}

const VIDEO_DURATION_LIMITS: Record<string, number> = {
  free: 10 * 60,
  premium: 30 * 60,
  monthly: 30 * 60,
  vip: Infinity,
};

function formatDuration(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (hrs > 0) return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function getVideoDurationLimit(planType: string): number {
  return VIDEO_DURATION_LIMITS[planType] || VIDEO_DURATION_LIMITS.free;
}

export function getVideoDurationLimitLabel(planType: string): string {
  const limit = getVideoDurationLimit(planType);
  if (limit === Infinity) return "Sem limite";
  return `${Math.floor(limit / 60)} minutos`;
}

function MediaCard({
  post,
  isOwner,
  onClick,
}: {
  post: MediaPost;
  isOwner: boolean;
  onClick: () => void;
}) {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showPrivacyDialog, setShowPrivacyDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showCoverDialog, setShowCoverDialog] = useState(false);
  const [editCaption, setEditCaption] = useState(post.content_text || "");

  const isVideo = post.media_type === "video";
  const isPaid = post.is_paid && (post.paid_price ?? 0) > 0;

  const handleDelete = async () => {
    const { error } = await supabase.from("posts").delete().eq("id", post.id);
    if (!error) {
      toast({ title: "Post excluído" });
      queryClient.invalidateQueries({ queryKey: ["my-posts"] });
      queryClient.invalidateQueries({ queryKey: ["posts"] });
    }
    setShowDeleteDialog(false);
  };

  const handleSaveCaption = async () => {
    const { error } = await supabase.from("posts").update({ content_text: editCaption }).eq("id", post.id);
    if (!error) {
      toast({ title: "Legenda atualizada" });
      queryClient.invalidateQueries({ queryKey: ["my-posts"] });
    }
    setShowEditDialog(false);
  };

  const handlePrivacyChange = async (value: string) => {
    const { error } = await supabase.from("posts").update({ privacy_level: value }).eq("id", post.id);
    if (!error) {
      toast({ title: "Privacidade atualizada" });
      queryClient.invalidateQueries({ queryKey: ["my-posts"] });
    }
    setShowPrivacyDialog(false);
  };

  const handleCoverSelected = async (_url: string, blob: Blob) => {
    if (!user?.id || !isVideo) return;
    try {
      const path = `${user.id}/thumbnails/${post.id}-${Date.now()}.webp`;
      const { data, error: uploadError } = await supabase.storage.from("media").upload(path, blob, { contentType: "image/webp", upsert: true });
      if (uploadError) throw uploadError;
      const thumbnailUrl = `${EXTERNAL_SUPABASE_URL}/storage/v1/object/public/media/${data.path}`;
      const { error } = await (supabase as any).from("posts").update({ thumbnail_url: thumbnailUrl }).eq("id", post.id);
      if (error) throw error;
      toast({ title: "Capa do vídeo atualizada" });
      queryClient.invalidateQueries({ queryKey: ["my-posts"] });
      queryClient.invalidateQueries({ queryKey: ["posts"] });
      setShowCoverDialog(false);
    } catch (error: any) {
      toast({ title: "Erro ao salvar capa", description: error?.message || "Tente novamente", variant: "destructive" });
    }
  };

  const privacyIcon = post.privacy_level === "vip" ? <Flame className="h-3 w-3" /> : post.privacy_level === "friends" ? <Users className="h-3 w-3" /> : <Globe className="h-3 w-3" />;

  return (
    <>
      <div className="relative rounded-lg overflow-hidden bg-card border border-border/30 group">
        {/* Thumbnail */}
        <div className="relative aspect-square cursor-pointer" onClick={onClick}>
          {isVideo ? (
            <>
              {post.thumbnail_url ? <img src={post.thumbnail_url} alt="Capa do vídeo" loading="lazy" decoding="async" className="w-full h-full object-cover" /> : <video src={post.media_url!} aria-label="Vídeo sem capa personalizada" className="w-full h-full object-cover" preload="metadata" muted />}
              <div className="absolute inset-0 flex items-center justify-center bg-background/20">
                <div className="w-10 h-10 rounded-full bg-background/80 backdrop-blur-sm flex items-center justify-center">
                  <Play className="h-4 w-4 text-foreground ml-0.5" />
                </div>
              </div>
              {post.video_duration_seconds && (
                <div className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-background/80 backdrop-blur-sm text-[10px] font-medium text-foreground flex items-center gap-1">
                  <Clock className="h-2.5 w-2.5" />{formatDuration(post.video_duration_seconds)}
                </div>
              )}
            </>
          ) : (
            <img src={post.media_url!} alt="Foto" loading="lazy" decoding="async" className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
          )}

          {/* Paid badge */}
          {isPaid && (
            <div className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-[hsl(45,93%,47%)]/90 text-[10px] font-bold text-[hsl(45,93%,10%)] flex items-center gap-1">
              <Lock className="h-2.5 w-2.5" />
              R$ {(post.paid_price || 0).toFixed(2)}
            </div>
          )}

          {isVideo && (
            <Badge className="absolute bottom-1 left-1 text-[10px] h-5 bg-background/85 text-foreground border border-border/60">
              {isPaid ? "Bloqueado" : "Baixar desabilitado"}
            </Badge>
          )}

          {/* Privacy badge */}
          <div className="absolute top-1 right-1">
            {privacyIcon}
          </div>
        </div>

        {/* Info bar */}
        <div className="flex items-center justify-between px-2 py-1.5">
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Heart className="h-3 w-3" /> {post.likes_count || 0}
            </span>
            <span className="flex items-center gap-1">
              <MessageCircle className="h-3 w-3" /> {post.comments_count || 0}
            </span>
          </div>

          {isOwner && (
            <TooltipProvider delayDuration={150}>
            <DropdownMenu>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-6 w-6" aria-label="Abrir menu da mídia">
                      <MoreVertical className="h-3.5 w-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent>Mais opções da mídia</TooltipContent>
              </Tooltip>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem onClick={() => { setEditCaption(post.content_text || ""); setShowEditDialog(true); }}>
                  <Pencil className="h-3.5 w-3.5 mr-2" /> Editar legenda
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setShowPrivacyDialog(true)}>
                  <Lock className="h-3.5 w-3.5 mr-2" /> Privacidade
                </DropdownMenuItem>
                {isVideo && (
                  <DropdownMenuItem onClick={() => setShowCoverDialog(true)}>
                    <ImageIcon className="h-3.5 w-3.5 mr-2" /> Escolher capa
                  </DropdownMenuItem>
                )}
                {isVideo && (
                  <DropdownMenuItem disabled>
                    <Download className="h-3.5 w-3.5 mr-2" /> Baixar — {isPaid ? "Bloqueado" : "Liberado para VIP apenas quando pago"}
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setShowDeleteDialog(true)} className="text-destructive focus:text-destructive">
                  <Trash2 className="h-3.5 w-3.5 mr-2" /> Excluir
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            </TooltipProvider>
          )}
        </div>
      </div>

      {/* Delete Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir post?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Dialog */}
      <AlertDialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Editar legenda</AlertDialogTitle></AlertDialogHeader>
          <textarea value={editCaption} onChange={(e) => setEditCaption(e.target.value)} className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm" />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleSaveCaption}>Salvar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Privacy Dialog */}
      <AlertDialog open={showPrivacyDialog} onOpenChange={setShowPrivacyDialog}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Alterar privacidade</AlertDialogTitle></AlertDialogHeader>
          <Select defaultValue={post.privacy_level || "public"} onValueChange={handlePrivacyChange}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="public"><div className="flex items-center gap-2"><Globe className="h-4 w-4" /> Público</div></SelectItem>
              <SelectItem value="friends"><div className="flex items-center gap-2"><Users className="h-4 w-4" /> Amigos</div></SelectItem>
              <SelectItem value="vip"><div className="flex items-center gap-2"><Flame className="h-4 w-4" /> VIP</div></SelectItem>
            </SelectContent>
          </Select>
          <AlertDialogFooter><AlertDialogCancel>Fechar</AlertDialogCancel></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={showCoverDialog} onOpenChange={setShowCoverDialog}>
        <DialogContent className="sm:max-w-lg max-h-[90dvh] overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          <DialogHeader><DialogTitle>Escolher capa do vídeo</DialogTitle></DialogHeader>
          {post.media_url && (
            <VideoCoverPicker
              videoFile={new File([], "video.mp4", { type: "video/mp4" })}
              videoUrl={post.media_url}
              onCoverSelected={handleCoverSelected}
              selectedCoverUrl={post.thumbnail_url}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

export function ProfileMediaTabs({ posts, isLoading, planType = 'free', isOwner = true }: ProfileMediaTabsProps) {
  const [activeSubTab, setActiveSubTab] = useState<'photos' | 'videos'>('photos');
  const [selectedPost, setSelectedPost] = useState<MediaPost | null>(null);
  const { user } = useAuth();

  const mediaPosts = posts.filter(p => p.media_url);
  const photos = mediaPosts.filter(p => !p.media_type || p.media_type === 'image');
  const videos = mediaPosts.filter(p => p.media_type === 'video');

  const durationLimit = getVideoDurationLimitLabel(planType);
  const currentList = activeSubTab === 'photos' ? photos : videos;

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="aspect-square rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="mt-4">
      {/* Sub-tabs */}
      <div className="flex border-b border-border/30 mb-4">
        <button
          onClick={() => setActiveSubTab('photos')}
          className={cn(
            "flex items-center gap-2 px-4 py-2 text-xs font-semibold border-b-2 transition-colors uppercase tracking-wider",
            activeSubTab === 'photos' ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          <ImageIcon className="h-3.5 w-3.5" />
          Fotos
          <Badge variant="secondary" className="text-[10px] px-1.5 h-4 bg-primary/10 text-primary">{photos.length}</Badge>
        </button>
        <button
          onClick={() => setActiveSubTab('videos')}
          className={cn(
            "flex items-center gap-2 px-4 py-2 text-xs font-semibold border-b-2 transition-colors uppercase tracking-wider",
            activeSubTab === 'videos' ? "border-secondary text-secondary" : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          <Video className="h-3.5 w-3.5" />
          Vídeos
          <Badge variant="secondary" className="text-[10px] px-1.5 h-4 bg-secondary/10 text-secondary">{videos.length}</Badge>
        </button>
        <div className="ml-auto flex items-center gap-1 px-2 text-[10px] text-muted-foreground">
          <Clock className="h-3 w-3" />
          Limite: {durationLimit}
        </div>
      </div>

      {/* Photos Grid */}
      {activeSubTab === 'photos' && (
        photos.length === 0 ? (
          <div className="py-12 text-center">
            <div className="w-14 h-14 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-3">
              <ImageIcon className="h-7 w-7 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground text-sm">Nenhuma foto ainda</p>
          </div>
        ) : (
          <PinterestMasonry
            items={photos}
            onItemClick={(post) => setSelectedPost(post)}
            className="columns-2 sm:columns-3 lg:columns-4"
          />
        )
      )}

      {/* Videos Grid */}
      {activeSubTab === 'videos' && (
        videos.length === 0 ? (
          <div className="py-12 text-center">
            <div className="w-14 h-14 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-3">
              <Video className="h-7 w-7 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground text-sm">Nenhum vídeo ainda</p>
          </div>
        ) : (
          <PinterestMasonry
            items={videos.map((post) => ({
              ...post,
              preview_url: post.thumbnail_url || post.media_url,
              thumbnail_url: post.thumbnail_url || post.media_url,
            }))}
            onItemClick={(post) => setSelectedPost(post)}
            className="columns-2 sm:columns-3 lg:columns-4"
          />
        )
      )}

      {/* Player padrão (mesmo do Cofre/Feed) */}
      {(() => {
        const normalize = (p: any): MediaItem => ({
          ...(p as MediaItem),
          media_type:
            p?.media_type === "video" || /\.(mp4|webm|mov|m3u8)(\?|$)/i.test(p?.media_url || "")
              ? "video"
              : (p?.media_type || "image"),
        });
        return (
          <MediaGalleryModal
            open={!!selectedPost}
            onClose={() => setSelectedPost(null)}
            media={selectedPost ? normalize(selectedPost) : null}
            allMedia={(currentList as any[])
              .filter((p) => p?.media_url)
              .map(normalize) as MediaItem[]}
            onNavigate={(m) => setSelectedPost(m as any)}
          />
        );
      })()}

    </div>
  );
}

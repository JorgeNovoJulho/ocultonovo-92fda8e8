import { useState, useRef, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Camera,
  Upload,
  Loader2,
  User,
  Trash2,
  X,
  ImageIcon,
} from "lucide-react";
import {
  useEventPhotos,
  useUploadEventPhoto,
  useDeleteEventPhoto,
  type EventPhoto,
} from "@/hooks/useEventPhotos";
import { useProfile } from "@/hooks/useProfile";
import { cn } from "@/lib/utils";
import { MediaGalleryModal } from "@/components/MediaGalleryModal";
import type { MediaItem } from "@/hooks/useMediaManager";

interface EventGalleryTabProps {
  eventId: string;
  canUpload: boolean; // user has check-in
  isOrganizer: boolean;
  eventDate: string;
}

export function EventGalleryTab({
  eventId,
  canUpload,
  isOrganizer,
  eventDate,
}: EventGalleryTabProps) {
  const { profile } = useProfile();
  const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: photos, isLoading } = useEventPhotos(eventId);
  const uploadPhoto = useUploadEventPhoto();
  const deletePhoto = useDeleteEventPhoto();

  // Map event photos to MediaItem shape so we can reuse MediaGalleryModal
  const mediaItems = useMemo<MediaItem[]>(() => {
    return (photos ?? []).map((p: EventPhoto) => ({
      id: p.id,
      user_id: p.user_id,
      content_text: p.caption,
      media_url: p.photo_url,
      privacy_level: 'public',
      is_locked: false,
      likes_count: 0,
      comments_count: 0,
      created_at: p.created_at,
      updated_at: p.created_at,
    }));
  }, [photos]);

  const selectedMedia = useMemo(
    () => mediaItems.find((m) => m.id === selectedPhotoId) ?? null,
    [mediaItems, selectedPhotoId]
  );

  // Check if event has passed
  const eventHasPassed = new Date(eventDate) < new Date();
  const showUploadSection = canUpload && eventHasPassed;

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        alert("Arquivo muito grande. Máximo 10MB.");
        return;
      }
      setPreviewFile(file);
      setPreviewUrl(URL.createObjectURL(file));
    }
  };

  const handleUpload = async () => {
    if (!previewFile) return;

    await uploadPhoto.mutateAsync({
      eventId,
      file: previewFile,
      caption: caption.trim() || undefined,
    });

    // Clear form
    setPreviewFile(null);
    setPreviewUrl(null);
    setCaption("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDelete = (photoId: string, storagePath: string) => {
    if (confirm("Tem certeza que deseja remover esta foto?")) {
      deletePhoto.mutate({ photoId, storagePath, eventId });
    }
  };

  const cancelUpload = () => {
    setPreviewFile(null);
    setPreviewUrl(null);
    setCaption("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="flex flex-col h-full">
      {/* Upload Section */}
      {showUploadSection && (
        <div className="p-4 border-b">
          {previewUrl ? (
            <div className="space-y-3">
              <div className="relative">
                <img loading="lazy" decoding="async"
                  src={previewUrl}
                  alt="Preview"
                  className="w-full h-40 object-cover rounded-lg"
                />
                <Button
                  size="icon"
                  variant="destructive"
                  className="absolute top-2 right-2 h-8 w-8"
                  onClick={cancelUpload}
                 aria-label="Fechar">
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <Input
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="Adicione uma legenda (opcional)"
                maxLength={200}
              />
              <Button
                className="w-full"
                onClick={handleUpload}
                disabled={uploadPhoto.isPending}
              >
                {uploadPhoto.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Upload className="h-4 w-4 mr-2" />
                )}
                Enviar Foto
              </Button>
            </div>
          ) : (
            <div
              className="border-2 border-dashed border-muted-foreground/30 rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <Camera className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Clique para adicionar uma foto
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                JPG, PNG ou GIF • Máximo 10MB
              </p>
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileSelect}
          />
        </div>
      )}

      {/* Not allowed to upload message */}
      {!eventHasPassed && canUpload && (
        <div className="p-4 border-b bg-muted/30">
          <p className="text-sm text-muted-foreground text-center">
            📸 O upload de fotos estará disponível após o evento
          </p>
        </div>
      )}

      {/* Photos Grid */}
      <ScrollArea className="flex-1 p-4" style={{ maxHeight: "400px" }}>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : photos?.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <ImageIcon className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>Nenhuma foto ainda</p>
            {eventHasPassed && canUpload && (
              <p className="text-sm mt-1">
                Seja o primeiro a compartilhar momentos do evento!
              </p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {photos?.map((photo) => {
              const canDelete =
                photo.user_id === profile?.id || isOrganizer;

              return (
                <div key={photo.id} className="relative group">
                  <img loading="lazy" decoding="async"
                    src={photo.photo_url}
                    alt={photo.caption || "Foto do evento"}
                    className="w-full aspect-square object-cover rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
                    onClick={() => setSelectedPhotoId(photo.id)}
                  />
                  
                  {/* Overlay with user info */}
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-2 rounded-b-lg">
                    <div className="flex items-center gap-1.5">
                      <Avatar className="h-5 w-5">
                        <AvatarImage src={photo.user?.avatar_url || ""} />
                        <AvatarFallback>
                          <User className="h-3 w-3" />
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-white text-xs truncate">
                        @{photo.user?.username || "usuário"}
                      </span>
                    </div>
                  </div>

                  {/* Delete button */}
                  {canDelete && (
                    <Button
                      size="icon"
                      variant="destructive"
                      className={cn(
                        "absolute top-2 right-2 h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity",
                        deletePhoto.isPending && "opacity-50"
                      )}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(photo.id, photo.storage_path);
                      }}
                      disabled={deletePhoto.isPending}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>

      {/* Full-screen gallery modal (swipe, contador, autor, suporte a vídeo) */}
      <MediaGalleryModal
        open={!!selectedMedia}
        onClose={() => setSelectedPhotoId(null)}
        media={selectedMedia}
        allMedia={mediaItems}
        onNavigate={(m) => setSelectedPhotoId(m.id)}
      />
    </div>
  );
}

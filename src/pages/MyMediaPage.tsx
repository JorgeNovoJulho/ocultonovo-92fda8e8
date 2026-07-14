import { useState, useMemo } from "react";
import { isVideoUrl, getVideoMimeType, resolveVideoThumbnail } from "@/lib/mediaType";
import { VideoThumb } from "@/components/VideoThumb";
import {
  DndContext,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
  DragOverEvent,
  useDroppable,
} from "@dnd-kit/core";
import {
  useSortable,
  SortableContext,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EditMediaModal } from "@/components/EditMediaModal";
import { MediaUploadModal } from "@/components/MediaUploadModal";
import { MediaGalleryModal } from "@/components/MediaGalleryModal";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
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
import {
  Image as ImageIcon,
  Video,
  LayoutGrid,
  Pencil,
  Trash2,
  ArrowRight,
  Globe,
  Users,
  Crown,
  Check,
  X,
  GripVertical,
  Upload,
  Info,
  Expand,
  Maximize2,
  Play,
  EyeOff,
  Download,
  Lock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useCreatorMedia,
  useMoveMedia,
  useDeleteMedia,
  useBulkMoveMedia,
  useBulkDeleteMedia,
  type PrivacyLevel,
  type MediaItem,
} from "@/hooks/useMediaManager";
import { useMediaUploadWithLimits } from "@/hooks/useMediaUploadWithLimits";
import { usePlanPermissions } from "@/hooks/usePlanPermissions";
import { useToast } from "@/hooks/use-toast";
import { PaidVideoDownloadCheckoutModal } from "@/components/PaidVideoDownloadCheckoutModal";
import { useUnlockVipDownload, useVipDownloads } from "@/hooks/useVipDownloads";

type MediaFilter = 'all' | 'photos' | 'videos';

const privacyConfig: Record<PrivacyLevel, { 
  label: string; 
  icon: React.ElementType; 
  color: string;
  borderColor: string;
  bgColor: string;
  dropBgColor: string;
}> = {
  public: {
    label: '🌍 Público',
    icon: Globe,
    color: 'text-emerald-500',
    borderColor: 'border-emerald-500/50',
    bgColor: 'bg-emerald-500/10',
    dropBgColor: 'bg-emerald-500/20',
  },
  friends: {
    label: '👥 Amigos',
    icon: Users,
    color: 'text-blue-500',
    borderColor: 'border-blue-500/50',
    bgColor: 'bg-blue-500/10',
    dropBgColor: 'bg-blue-500/20',
  },
  vip: {
    label: '🔥 Conteúdo VIP',
    icon: Crown,
    color: 'text-amber-500',
    borderColor: 'border-amber-500/50',
    bgColor: 'bg-amber-500/10',
    dropBgColor: 'bg-amber-500/20',
  },
  hidden: {
    label: '🔒 Invisível a Todos',
    icon: EyeOff,
    color: 'text-slate-300',
    borderColor: 'border-slate-500/60',
    bgColor: 'bg-slate-800/40',
    dropBgColor: 'bg-slate-700/50',
  },
};

// Draggable Media Card
function DraggableMediaCard({
  item,
  isSelected,
  onSelect,
  onEdit,
  onMove,
  onDelete,
  onExpand,
  onDownloadRequest,
  isDownloadUnlocked,
  isSelectionMode,
  isDragging,
}: {
  item: MediaItem;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onEdit: (item: MediaItem) => void;
  onMove: (id: string, level: PrivacyLevel) => void;
  onDelete: (id: string) => void;
  onExpand: (item: MediaItem) => void;
  onDownloadRequest: (item: MediaItem) => void;
  isDownloadUnlocked: boolean;
  isSelectionMode: boolean;
  isDragging?: boolean;
}) {
  const [isHovered, setIsHovered] = useState(false);
  const isVideo = item.media_type === 'video' || isVideoUrl(item.media_url);
  const isPaidVideo = isVideo && !!item.is_paid && (item.paid_price ?? 0) > 0;

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isSortableDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isSortableDragging ? 0.5 : 1,
  };

  const otherLevels = (['public', 'friends', 'vip', 'hidden'] as PrivacyLevel[]).filter(
    (l) => l !== item.privacy_level
  );

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "relative aspect-square rounded-lg overflow-hidden cursor-pointer group transition-all duration-200",
        "border-2",
        isSelected 
          ? "ring-2 ring-primary border-primary" 
          : privacyConfig[item.privacy_level].borderColor,
        isHovered && !isSelected && "scale-[1.02] shadow-lg",
        isDragging && "shadow-2xl ring-2 ring-primary"
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={() => isSelectionMode && onSelect(item.id)}
    >
      {/* Drag Handle */}
      <div
        {...attributes}
        {...listeners}
        className="absolute top-2 left-2 z-20 p-1.5 rounded bg-black/60 text-white/80 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <GripVertical className="h-4 w-4" />
      </div>

      {/* Thumbnail */}
      {isVideo ? (
        <VideoThumb
          thumbnailUrl={item.thumbnail_url}
          mediaUrl={item.media_url}
          orientation="auto"
          showPlayIcon={false}
          alt={item.content_text || 'Capa do vídeo'}
        />
      ) : (
        <img loading="lazy" decoding="async"
          src={item.media_url || ''}
          alt={item.content_text || 'Media'}
          className="w-full h-full object-cover pointer-events-none"
        />
      )}

      {/* Video Indicator */}
      {isVideo && (
        <div className="absolute top-2 right-2 flex flex-col items-end gap-1">
          <Badge variant="secondary" className="bg-black/60 text-white">
            <Play className="h-3 w-3 mr-1" />
            Vídeo
          </Badge>
          <Badge variant={isDownloadUnlocked ? "default" : "secondary"} className="bg-background/85 text-foreground border border-border/60">
            {isDownloadUnlocked ? "Liberado para VIP" : "Bloqueado"}
          </Badge>
        </div>
      )}

      {/* Selection Checkbox */}
      {isSelectionMode && (
        <div className="absolute top-2 right-2 z-10">
          <Checkbox
            checked={isSelected}
            onCheckedChange={() => onSelect(item.id)}
            className="h-5 w-5 bg-background/80 border-2"
          />
        </div>
      )}

      {/* Hover Overlay */}
      <div
        className={cn(
          "absolute inset-0 bg-black/60 flex flex-wrap items-center justify-center gap-1 sm:gap-2 p-1 transition-opacity",
          isHovered && !isSelectionMode ? "opacity-100" : "opacity-0"
        )}
      >
        <Button
          size="icon"
          variant="secondary"
          className="h-7 w-7 sm:h-9 sm:w-9"
          onClick={(e) => {
            e.stopPropagation();
            onExpand(item);
          }}
        >
          <Expand className="h-4 w-4" />
        </Button>

        <Button
          size="icon"
          variant="secondary"
          className="h-7 w-7 sm:h-9 sm:w-9"
          onClick={(e) => {
            e.stopPropagation();
            onEdit(item);
          }}
        >
          <Pencil className="h-4 w-4" />
        </Button>

        {isVideo && (
          <Button
            size="icon"
            variant="secondary"
            className="h-7 w-7 sm:h-9 sm:w-9"
            disabled={!isPaidVideo}
            onClick={(e) => {
              e.stopPropagation();
              onDownloadRequest(item);
            }}
            aria-label={isPaidVideo ? "Abrir checkout de download do vídeo" : "Download bloqueado para este vídeo"}
          >
            {isDownloadUnlocked ? <Download className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
          </Button>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon"
              variant="secondary"
              className="h-7 w-7 sm:h-9 sm:w-9"
              onClick={(e) => e.stopPropagation()}
            >
              <ArrowRight className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center">
            {otherLevels.map((level) => {
              const config = privacyConfig[level];
              const Icon = config.icon;
              return (
                <DropdownMenuItem
                  key={level}
                  onClick={(e) => {
                    e.stopPropagation();
                    onMove(item.id, level);
                  }}
                  className={config.color}
                >
                  <Icon className="h-4 w-4 mr-2" />
                  Mover para {config.label}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>

        {isVideo && (
          <div className="absolute bottom-12 left-3 right-3 text-center text-xs text-white/90 pointer-events-none">
            Baixar: {isDownloadUnlocked ? "Liberado para VIP" : "Bloqueado"}
          </div>
        )}

        <Button
          size="icon"
          variant="destructive"
          className="h-7 w-7 sm:h-9 sm:w-9"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(item.id);
          }}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      {/* Stats */}
      <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/80 to-transparent">
        <div className="flex items-center gap-2 text-xs text-white/80">
          <span>❤️ {item.likes_count}</span>
          <span>💬 {item.comments_count}</span>
        </div>
      </div>
    </div>
  );
}

// Static Media Card for Drag Overlay
function MediaCardOverlay({ item }: { item: MediaItem }) {
  const isVideo = item.media_type === 'video' || isVideoUrl(item.media_url);

  return (
    <div
      className={cn(
        "aspect-square rounded-lg overflow-hidden shadow-2xl ring-2 ring-primary",
        "border-2",
        privacyConfig[item.privacy_level].borderColor,
        "w-32"
      )}
    >
      {isVideo ? (
        <VideoThumb
          thumbnailUrl={item.thumbnail_url}
          mediaUrl={item.media_url}
          orientation="auto"
          showPlayIcon={false}
          alt={item.content_text || 'Capa do vídeo'}
        />
      ) : (
        <img loading="lazy" decoding="async"
          src={item.media_url || ''}
          alt={item.content_text || 'Media'}
          className="w-full h-full object-cover"
        />
      )}
    </div>
  );
}

// Droppable Media Column
function DroppableMediaColumn({
  level,
  items,
  selectedIds,
  onSelect,
  onEdit,
  onMove,
  onDelete,
  onExpand,
  onDownloadRequest,
  unlockedDownloads,
  onExpandColumn,
  onUpload,
  isSelectionMode,
  onToggleSelection,
  isLoading,
  isOver,
}: {
  level: PrivacyLevel;
  items: MediaItem[];
  selectedIds: Set<string>;
  onSelect: (id: string) => void;
  onEdit: (item: MediaItem) => void;
  onMove: (id: string, level: PrivacyLevel) => void;
  onDelete: (id: string) => void;
  onExpand: (item: MediaItem) => void;
  onDownloadRequest: (item: MediaItem) => void;
  unlockedDownloads: Set<string>;
  onExpandColumn: (level: PrivacyLevel) => void;
  onUpload?: (level: PrivacyLevel) => void;
  isSelectionMode: boolean;
  onToggleSelection: (level: PrivacyLevel) => void;
  isLoading: boolean;
  isOver: boolean;
}) {
  const config = privacyConfig[level];
  
  const { setNodeRef } = useDroppable({
    id: `column-${level}`,
    data: { type: 'column', level },
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex-1 min-w-0 rounded-xl p-3 sm:p-4 transition-all duration-200",
        isOver ? config.dropBgColor : config.bgColor,
        isOver && "ring-2 ring-offset-2 ring-offset-background",
        isOver && config.borderColor.replace('/50', '')
      )}
    >
      <div className="flex items-center justify-between mb-3 sm:mb-4 gap-2 flex-wrap">
        <h3 className={cn("font-semibold text-base sm:text-lg truncate min-w-0", config.color)}>
          {config.label}
        </h3>
        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap justify-end">
          <Badge variant="outline" className={cn("text-[10px] sm:text-xs px-2 py-0.5", config.borderColor)}>
            {items.length} itens
          </Badge>
          {items.length > 0 && (
            <Button
              variant={isSelectionMode ? "default" : "outline"}
              size="sm"
              className="h-8 gap-1.5 px-2 sm:px-3"
              onClick={() => onToggleSelection(level)}
              aria-label={isSelectionMode ? "Cancelar seleção" : "Selecionar mídias deste card"}
            >
              {isSelectionMode ? <X className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
              <span className="hidden md:inline">
                {isSelectionMode ? `Cancelar (${selectedIds.size})` : 'Selecionar'}
              </span>
              {isSelectionMode && (
                <span className="md:hidden">{selectedIds.size}</span>
              )}
            </Button>
          )}
          {onUpload && (
            <Button
              variant="secondary"
              size="sm"
              className="h-8 gap-1.5 px-2 sm:px-3"
              onClick={() => onUpload(level)}
              aria-label={`Adicionar mídia em ${config.label}`}
            >
              <Upload className="h-3.5 w-3.5" />
              <span className="hidden md:inline">Adicionar</span>
            </Button>
          )}
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => onExpandColumn(level)}>
            <Maximize2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="aspect-square rounded-lg" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className={cn(
          "flex flex-col items-center justify-center py-12 text-muted-foreground rounded-lg border-2 border-dashed transition-colors",
          isOver ? config.borderColor : "border-transparent"
        )}>
          <config.icon className="h-12 w-12 mb-2 opacity-50" />
          <p className="text-sm">
            {isOver ? "Solte aqui!" : `Nenhuma mídia ${config.label.toLowerCase()}`}
          </p>
          {onUpload && !isOver && (
            <Button
              variant="outline"
              size="sm"
              className="mt-3 gap-1.5"
              onClick={() => onUpload(level)}
            >
              <Upload className="h-3.5 w-3.5" />
              Adicionar mídia aqui
            </Button>
          )}
        </div>
      ) : (
        <SortableContext items={items.map(i => i.id)} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-3 xs:grid-cols-3 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-6 gap-2 sm:gap-3">
            {items.map((item) => (
              <DraggableMediaCard
                key={item.id}
                item={item}
                isSelected={selectedIds.has(item.id)}
                onSelect={onSelect}
                onEdit={onEdit}
                onMove={onMove}
                onDelete={onDelete}
                onExpand={onExpand}
                onDownloadRequest={onDownloadRequest}
                isDownloadUnlocked={unlockedDownloads.has(item.id)}
                isSelectionMode={isSelectionMode}
              />
            ))}
          </div>
        </SortableContext>
      )}
    </div>
  );
}

export default function MyMediaPage() {
  const [filter, setFilter] = useState<MediaFilter>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectionColumn, setSelectionColumn] = useState<PrivacyLevel | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [editingMedia, setEditingMedia] = useState<MediaItem | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overColumn, setOverColumn] = useState<PrivacyLevel | null>(null);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploadInitialPrivacy, setUploadInitialPrivacy] = useState<PrivacyLevel>('public');
  const [expandedMedia, setExpandedMedia] = useState<MediaItem | null>(null);
  const [expandedColumn, setExpandedColumn] = useState<PrivacyLevel | null>(null);
  const [checkoutMedia, setCheckoutMedia] = useState<MediaItem | null>(null);
  const [unlockedDownloads, setUnlockedDownloads] = useState<Set<string>>(new Set());
  const [vipPricePrompt, setVipPricePrompt] = useState<{ ids: string[] } | null>(null);
  const [vipPriceInput, setVipPriceInput] = useState<string>('');

  const { limits } = useMediaUploadWithLimits();
  const { isVip } = usePlanPermissions();
  const { toast } = useToast();

  const { data: allMedia = [], isLoading } = useCreatorMedia();
  const { data: vipDownloads = [] } = useVipDownloads();
  const unlockVipDownload = useUnlockVipDownload();
  const moveMedia = useMoveMedia();
  const deleteMedia = useDeleteMedia();
  const bulkMove = useBulkMoveMedia();
  const bulkDelete = useBulkDeleteMedia();

  const isSelectionMode = selectionColumn !== null;

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 250,
        tolerance: 5,
      },
    }),
    useSensor(KeyboardSensor)
  );

  // Filter by media type
  const filteredMedia = useMemo(() => {
    return allMedia.filter((item) => {
      const isVideo = item.media_type === 'video' || isVideoUrl(item.media_url);
      if (filter === 'videos') return isVideo;
      if (filter === 'photos') return !isVideo;
      return true;
    });
  }, [allMedia, filter]);

  // Group by privacy level
  const mediaByLevel = useMemo(() => {
    const grouped: Record<PrivacyLevel, MediaItem[]> = {
      public: [],
      friends: [],
      vip: [],
      hidden: [],
    };
    
    filteredMedia.forEach((item) => {
      const level = (item.privacy_level as PrivacyLevel) || 'public';
      grouped[level].push(item);
    });
    
    return grouped;
  }, [filteredMedia]);

  const activeItem = useMemo(() => {
    return activeId ? filteredMedia.find(m => m.id === activeId) : null;
  }, [activeId, filteredMedia]);

  const handleSelect = (id: string) => {
    // Restrict selection to items from the currently active selection column
    const item = allMedia.find((m) => m.id === id);
    if (!item) return;
    if (selectionColumn && item.privacy_level !== selectionColumn) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleMove = (id: string, level: PrivacyLevel) => {
    if (level === 'vip') {
      const item = allMedia.find((m) => m.id === id);
      const existing = Number(item?.paid_price ?? 0);
      if (!(existing > 0)) {
        setVipPriceInput('');
        setVipPricePrompt({ ids: [id] });
        return;
      }
    }
    moveMedia.mutate({ mediaId: id, newPrivacyLevel: level });
  };

  const handleEdit = (item: MediaItem) => {
    setEditingMedia(item);
  };

  const handleExpand = (item: MediaItem) => {
    setExpandedMedia(item);
  };

  const triggerVideoDownload = (item: MediaItem) => {
    if (!item.media_url) return;
    const link = document.createElement('a');
    link.href = item.media_url;
    link.download = `${(item.content_text || 'video-pago').slice(0, 32).replace(/[^a-z0-9-_]+/gi, '-')}.mp4`;
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const persistentlyUnlockedIds = useMemo(() => new Set(vipDownloads.map(d => d.post.id)), [vipDownloads]);
  const isUnlocked = (id: string) => unlockedDownloads.has(id) || persistentlyUnlockedIds.has(id);

  const handleDownloadRequest = (item: MediaItem) => {
    const isVideo = item.media_type === 'video' || isVideoUrl(item.media_url);
    const isPaidVideo = isVideo && !!item.is_paid && (item.paid_price ?? 0) > 0;
    if (!isPaidVideo) {
      toast({ title: 'Download bloqueado', description: 'Só vídeos marcados como pagos podem liberar download.', variant: 'destructive' });
      return;
    }
    if (!isVip) {
      toast({ title: 'Apenas VIP', description: 'O download pago de vídeos é exclusivo para usuários VIP.', variant: 'destructive' });
      return;
    }
    if (!isUnlocked(item.id)) {
      setCheckoutMedia(item);
      return;
    }
    triggerVideoDownload(item);
  };

  const handleDelete = (id: string) => {
    setDeleteConfirmId(id);
  };

  const confirmDelete = () => {
    if (deleteConfirmId) {
      deleteMedia.mutate(deleteConfirmId);
      setDeleteConfirmId(null);
    }
  };

  const handleBulkMove = (level: PrivacyLevel) => {
    const ids = Array.from(selectedIds);
    if (level === 'vip') {
      const missingPrice = ids.some((id) => {
        const item = allMedia.find((m) => m.id === id);
        return !(Number(item?.paid_price ?? 0) > 0);
      });
      if (missingPrice) {
        setVipPriceInput('');
        setVipPricePrompt({ ids });
        return;
      }
    }
    bulkMove.mutate({ mediaIds: ids, newPrivacyLevel: level });
    setSelectedIds(new Set());
    setSelectionColumn(null);
  };

  const handleBulkDelete = () => {
    setBulkDeleteConfirm(true);
  };

  const confirmBulkDelete = () => {
    bulkDelete.mutate(Array.from(selectedIds));
    setSelectedIds(new Set());
    setSelectionColumn(null);
    setBulkDeleteConfirm(false);
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
    setSelectionColumn(null);
  };

  // Drag handlers
  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { over } = event;
    
    if (over) {
      const overId = over.id as string;
      if (overId.startsWith('column-')) {
        const level = overId.replace('column-', '') as PrivacyLevel;
        setOverColumn(level);
      } else {
        // Over another card - find its column
        const targetItem = filteredMedia.find(m => m.id === overId);
        if (targetItem) {
          setOverColumn(targetItem.privacy_level);
        }
      }
    } else {
      setOverColumn(null);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    
    setActiveId(null);
    setOverColumn(null);

    if (!over) return;

    const activeMedia = filteredMedia.find(m => m.id === active.id);
    if (!activeMedia) return;

    let targetLevel: PrivacyLevel | null = null;

    const overId = over.id as string;
    if (overId.startsWith('column-')) {
      targetLevel = overId.replace('column-', '') as PrivacyLevel;
    } else {
      // Dropped on another card
      const targetItem = filteredMedia.find(m => m.id === overId);
      if (targetItem) {
        targetLevel = targetItem.privacy_level;
      }
    }

    if (targetLevel && targetLevel !== activeMedia.privacy_level) {
      handleMove(activeMedia.id, targetLevel);
    }
  };

  return (
    <div className="p-3 sm:p-4 lg:p-6 pb-28 lg:pb-6 max-w-full overflow-x-hidden">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-5 sm:mb-6">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-foreground mb-1.5 sm:mb-2">
            Minhas Mídias
          </h1>
          <p className="text-sm text-muted-foreground">
            Organize seu conteúdo por nível de privacidade. Arraste e solte para mover entre categorias.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full lg:w-auto">
          <div className="text-[11px] sm:text-xs text-muted-foreground bg-muted/50 rounded-lg px-2.5 py-1.5 sm:px-3 sm:py-2 flex items-center gap-1 whitespace-nowrap">
            <Info className="h-3 w-3 shrink-0" />
            <span>Vídeos: {limits.videoLimit} · Fotos: {limits.imageLimit}</span>
          </div>
          <Button
            size="sm"
            onClick={() => { setUploadInitialPrivacy('public'); setUploadModalOpen(true); }}
            className="gap-1.5 flex-1 sm:flex-none min-w-0"
          >
            <Upload className="h-4 w-4 shrink-0" />
            <span className="truncate">Enviar Mídia</span>
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => window.location.href = '/vip-downloads'}
            className="gap-1.5 flex-1 sm:flex-none min-w-0"
          >
            <Download className="h-4 w-4 shrink-0" />
            <span className="truncate">
              <span className="sm:hidden">Downloads VIP</span>
              <span className="hidden sm:inline">Meus downloads VIP</span>
            </span>
          </Button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center gap-2 mb-5 sm:mb-6">
        <Button
          size="sm"
          variant={filter === 'all' ? 'default' : 'outline'}
          onClick={() => setFilter('all')}
          className="gap-2"
        >
          <LayoutGrid className="h-4 w-4" />
          Tudo
        </Button>
        <Button
          size="sm"
          variant={filter === 'photos' ? 'default' : 'outline'}
          onClick={() => setFilter('photos')}
          className="gap-2"
        >
          <ImageIcon className="h-4 w-4" />
          Fotos
        </Button>
        <Button
          size="sm"
          variant={filter === 'videos' ? 'default' : 'outline'}
          onClick={() => setFilter('videos')}
          className="gap-2"
        >
          <Video className="h-4 w-4" />
          Vídeos
        </Button>

        <div className="flex-1 min-w-0" />
        {isSelectionMode && (
          <span className="text-[11px] sm:text-xs text-muted-foreground truncate max-w-full">
            Selecionando em <strong className={privacyConfig[selectionColumn!].color}>{privacyConfig[selectionColumn!].label}</strong>
          </span>
        )}
      </div>


      {/* Bulk Actions Bar */}
      {isSelectionMode && (
        <div className="fixed bottom-20 lg:bottom-6 left-1/2 -translate-x-1/2 z-50 w-[min(96vw,640px)] bg-card border border-border shadow-xl rounded-2xl sm:rounded-full px-3 sm:px-5 py-2.5 sm:py-3 flex flex-wrap items-center justify-center gap-2 sm:gap-3">
          <span className="text-xs sm:text-sm font-medium whitespace-nowrap">
            {selectedIds.size} selecionado(s)
          </span>

          <div className="hidden sm:block h-4 w-px bg-border" />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="gap-1.5">
                <ArrowRight className="h-4 w-4" />
                <span>Mover para...</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="max-w-[calc(100vw-2rem)]">
              {(['public', 'friends', 'vip', 'hidden'] as PrivacyLevel[])
                .filter((level) => level !== selectionColumn)
                .map((level) => {
                const config = privacyConfig[level];
                const Icon = config.icon;
                return (
                  <DropdownMenuItem
                    key={level}
                    onClick={() => handleBulkMove(level)}
                    className={config.color}
                  >
                    <Icon className="h-4 w-4 mr-2 shrink-0" />
                    <span className="truncate">{config.label}</span>
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            size="sm"
            variant="destructive"
            onClick={handleBulkDelete}
            className="gap-1.5"
          >
            <Trash2 className="h-4 w-4" />
            <span>Excluir</span>
          </Button>
        </div>
      )}

      {/* Kanban Columns with DnD */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-5">
          {(['public', 'friends', 'vip', 'hidden'] as PrivacyLevel[]).map((level) => (
            <DroppableMediaColumn
              key={level}
              level={level}
              items={mediaByLevel[level]}
              selectedIds={selectedIds}
              onSelect={handleSelect}
              onEdit={handleEdit}
              onMove={handleMove}
              onDelete={handleDelete}
              onExpand={handleExpand}
              onDownloadRequest={handleDownloadRequest}
              unlockedDownloads={new Set([...Array.from(unlockedDownloads), ...Array.from(persistentlyUnlockedIds)])}
              onExpandColumn={setExpandedColumn}
              onUpload={(lvl) => { setUploadInitialPrivacy(lvl); setUploadModalOpen(true); }}
              isSelectionMode={selectionColumn === level}
              onToggleSelection={(lvl) => {
                if (selectionColumn === lvl) {
                  setSelectionColumn(null);
                  setSelectedIds(new Set());
                } else {
                  setSelectionColumn(lvl);
                  setSelectedIds(new Set());
                }
              }}
              isLoading={isLoading}
              isOver={overColumn === level}
            />
          ))}
        </div>

        <DragOverlay>
          {activeItem && <MediaCardOverlay item={activeItem} />}
        </DragOverlay>
      </DndContext>

      {/* Edit Media Modal */}
      <EditMediaModal
        open={!!editingMedia}
        onOpenChange={(open) => !open && setEditingMedia(null)}
        media={editingMedia}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteConfirmId} onOpenChange={() => setDeleteConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir mídia?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. A mídia será permanentemente removida.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Delete Confirmation Dialog */}
      <AlertDialog open={bulkDeleteConfirm} onOpenChange={setBulkDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir {selectedIds.size} mídias?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Todas as mídias selecionadas serão permanentemente removidas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmBulkDelete} className="bg-destructive text-destructive-foreground">
              Excluir {selectedIds.size} mídias
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Upload Modal */}
      <MediaUploadModal
        open={uploadModalOpen}
        onOpenChange={setUploadModalOpen}
        initialPrivacy={uploadInitialPrivacy}
        onSuccess={({ uploadedTypes }) => {
          if (filter === 'all') return;
          // Garante que o usuário VEJA a mídia recém-enviada,
          // mesmo que o filtro atual não corresponda ao tipo enviado.
          if (uploadedTypes.length > 0 && !uploadedTypes.some((t) => (filter === 'videos' ? t === 'video' : t === 'image'))) {
            setFilter(uploadedTypes.includes('video') ? 'videos' : 'photos');
          }
        }}
      />

      <PaidVideoDownloadCheckoutModal
        open={!!checkoutMedia}
        onOpenChange={(open) => !open && setCheckoutMedia(null)}
        videoTitle={checkoutMedia?.content_text}
        price={checkoutMedia?.paid_price || 0}
        onConfirmMockPayment={async () => {
          if (!checkoutMedia) return;
          await unlockVipDownload.mutateAsync(checkoutMedia);
          setUnlockedDownloads(prev => new Set(prev).add(checkoutMedia.id));
          triggerVideoDownload(checkoutMedia);
        }}
        onBackToMedia={() => checkoutMedia && setExpandedMedia(checkoutMedia)}
      />

      <Dialog open={!!expandedColumn} onOpenChange={(open) => !open && setExpandedColumn(null)}>
        <DialogContent className="w-[96vw] max-w-6xl h-[92dvh] max-h-[92dvh] overflow-hidden flex flex-col p-0">
          {expandedColumn && (
            <>
              <DialogHeader className="px-5 py-4 border-b border-border/60 shrink-0">
                <DialogTitle className={cn("flex items-center gap-2", privacyConfig[expandedColumn].color)}>
                  {privacyConfig[expandedColumn].label}
                  <Badge variant="outline" className={privacyConfig[expandedColumn].borderColor}>
                    {mediaByLevel[expandedColumn].length} itens
                  </Badge>
                </DialogTitle>
              </DialogHeader>
              <div className="flex-1 overflow-y-auto scrollbar-hide p-5">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                  {mediaByLevel[expandedColumn].map((item) => {
                    const isVideo = item.media_type === 'video' || isVideoUrl(item.media_url);
                    return (
                      <div key={item.id} className={cn("relative aspect-square rounded-xl overflow-hidden border-2 group", privacyConfig[item.privacy_level].borderColor)}>
                        {isVideo ? (
                          <VideoThumb thumbnailUrl={item.thumbnail_url} mediaUrl={item.media_url} orientation="square" showPlayIcon={false} alt={item.content_text || 'Capa do vídeo'} />
                        ) : (
                          <img src={item.media_url || ''} alt={item.content_text || 'Media'} loading="lazy" decoding="async" className="w-full h-full object-cover" />
                        )}
                        <div className="absolute inset-0 bg-background/70 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                          <Button size="icon" variant="secondary" onClick={() => handleExpand(item)}><Expand className="h-4 w-4" /></Button>
                          <Button size="icon" variant="secondary" onClick={() => handleEdit(item)}><Pencil className="h-4 w-4" /></Button>
                          <Button size="icon" variant="destructive" onClick={() => handleDelete(item.id)}><Trash2 className="h-4 w-4" /></Button>
                        </div>
                        <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-background/90 to-transparent text-xs text-foreground/80">
                          ❤️ {item.likes_count} · 💬 {item.comments_count}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Fullscreen Gallery Modal */}
      {expandedMedia && (
        <MediaGalleryModal
          open={!!expandedMedia}
          onClose={() => setExpandedMedia(null)}
          media={expandedMedia}
          allMedia={filteredMedia}
          onNavigate={setExpandedMedia}
        />
      )}

      {/* VIP Price Prompt — pedido quando uma mídia é movida para Conteúdo VIP sem preço definido */}
      <AlertDialog open={!!vipPricePrompt} onOpenChange={(open) => { if (!open) setVipPricePrompt(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Definir preço VIP</AlertDialogTitle>
            <AlertDialogDescription>
              {vipPricePrompt?.ids.length === 1
                ? 'Informe o valor (em R$) para desbloquear esta mídia. Somente usuários que pagarem terão acesso; no feed ela aparecerá com blur, cadeado e preço.'
                : `Informe o valor (em R$) que será aplicado às ${vipPricePrompt?.ids.length} mídias selecionadas. Somente usuários que pagarem terão acesso.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2">
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="1"
              autoFocus
              value={vipPriceInput}
              onChange={(e) => setVipPriceInput(e.target.value)}
              placeholder="Ex: 19,90"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setVipPricePrompt(null)}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const price = parseFloat(vipPriceInput.replace(',', '.'));
                if (!Number.isFinite(price) || price <= 0) {
                  toast({ title: 'Preço inválido', description: 'Informe um valor maior que zero.', variant: 'destructive' });
                  return;
                }
                const ids = vipPricePrompt?.ids || [];
                if (ids.length === 1) {
                  moveMedia.mutate({ mediaId: ids[0], newPrivacyLevel: 'vip', price });
                } else if (ids.length > 1) {
                  bulkMove.mutate({ mediaIds: ids, newPrivacyLevel: 'vip', price });
                  setSelectedIds(new Set());
                }
                setVipPricePrompt(null);
              }}
            >
              Aplicar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

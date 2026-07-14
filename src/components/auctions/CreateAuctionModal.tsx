import { useState, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ImagePlus, Gavel, Video, Phone, X, Loader2 } from "lucide-react";
import { useCreateAuction } from "@/hooks/useAuctions";
import { supabase } from "@/lib/supabaseExternal";
import { toast } from "sonner";
import { EXTERNAL_SUPABASE_URL } from '@/lib/appConfig';

interface CreateAuctionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const DURATION_OPTIONS = [
  { value: "1", label: "1 hora" },
  { value: "3", label: "3 horas" },
  { value: "6", label: "6 horas" },
  { value: "12", label: "12 horas" },
  { value: "24", label: "24 horas" },
  { value: "48", label: "2 dias" },
  { value: "72", label: "3 dias" },
];

const MEDIA_TYPES = [
  { value: "image", label: "Foto", icon: ImagePlus },
  { value: "video", label: "Vídeo", icon: Video },
  { value: "call_promise", label: "Chamada", icon: Phone },
];

export function CreateAuctionModal({ open, onOpenChange }: CreateAuctionModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [mediaType, setMediaType] = useState("image");
  const [mediaUrl, setMediaUrl] = useState("");
  const [mediaPreview, setMediaPreview] = useState("");
  const [startingPrice, setStartingPrice] = useState("10");
  const [minIncrement, setMinIncrement] = useState("5");
  const [durationHours, setDurationHours] = useState("24");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const createAuction = useCreateAuction();

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
      toast.error("Formato não suportado");
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      toast.error("Arquivo muito grande (máx. 50MB)");
      return;
    }

    setIsUploading(true);
    setUploadProgress(5);

    try {
      const previewUrl = URL.createObjectURL(file);
      setMediaPreview(previewUrl);

      const fileExt = file.name.split(".").pop();
      const fileName = `auction_${Date.now()}.${fileExt}`;
      const filePath = `auctions/${fileName}`;

      // Simulated progress while upload runs (Supabase JS doesn't expose progress)
      const progressTimer = setInterval(() => {
        setUploadProgress((p) => (p < 85 ? p + 7 : p));
      }, 220);

      const { error: uploadError } = await supabase.storage
        .from("media")
        .upload(filePath, file, { cacheControl: "3600", upsert: false });

      clearInterval(progressTimer);

      if (uploadError) throw uploadError;

      setUploadProgress(100);
      const publicUrl = `${EXTERNAL_SUPABASE_URL}/storage/v1/object/public/media/${filePath}`;
      setMediaUrl(publicUrl);
      toast.success("Mídia enviada!");
    } catch (error: any) {
      toast.error(`Erro ao carregar: ${error.message}`);
      setMediaPreview("");
      setUploadProgress(0);
    } finally {
      setIsUploading(false);
      setTimeout(() => setUploadProgress(0), 1200);
    }
  };

  const handleSubmit = async () => {
    if (!title.trim()) return toast.error("Título é obrigatório");
    if (!mediaUrl && mediaType !== "call_promise") return toast.error("Faça upload de uma mídia");

    const starting = parseFloat(startingPrice.replace(",", "."));
    const increment = parseFloat(minIncrement.replace(",", "."));

    if (isNaN(starting) || starting < 1) return toast.error("Lance inicial mínimo: R$ 1,00");
    if (isNaN(increment) || increment < 1) return toast.error("Incremento mínimo: R$ 1,00");

    try {
      await createAuction.mutateAsync({
        title: title.trim(),
        description: description.trim() || undefined,
        media_url:
          mediaType === "call_promise"
            ? "https://placehold.co/400x400/1a1a1a/gold?text=📞+Videochamada"
            : mediaUrl,
        media_type: mediaType,
        starting_price: starting,
        min_increment: increment,
        duration_hours: parseInt(durationHours),
      });

      setTitle("");
      setDescription("");
      setMediaUrl("");
      setMediaPreview("");
      setStartingPrice("10");
      setMinIncrement("5");
      setDurationHours("24");
      onOpenChange(false);
    } catch {
      // Error handled by mutation
    }
  };

  const removeMedia = () => {
    setMediaUrl("");
    setMediaPreview("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="
          p-0 gap-0 border-border bg-background
          w-[100vw] max-w-[100vw] h-[100dvh] max-h-[100dvh] rounded-none
          sm:w-auto sm:max-w-lg sm:h-auto sm:max-h-[92vh] sm:rounded-2xl
          flex flex-col overflow-hidden
        "
      >
        <DialogHeader className="px-4 py-3 border-b border-border/60 shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Gavel className="h-5 w-5 text-primary" />
            Criar Leilão
          </DialogTitle>
          <DialogDescription className="text-xs">
            Conteúdo exclusivo para seus fãs disputarem.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto scrollbar-hide overscroll-contain">
          <div className="space-y-4 px-4 py-4">
            <div>
              <Label htmlFor="title">Título do Leilão *</Label>
              <Input
                id="title"
                placeholder="Ex: Foto exclusiva de ensaio"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={100}
              />
            </div>

            <div>
              <Label htmlFor="description">Descrição (opcional)</Label>
              <Textarea
                id="description"
                placeholder="Descreva o conteúdo que será entregue ao vencedor..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                maxLength={500}
              />
            </div>

            <div>
              <Label>Tipo de Conteúdo</Label>
              <div className="grid grid-cols-3 gap-2 mt-1">
                {MEDIA_TYPES.map((type) => {
                  const Icon = type.icon;
                  return (
                    <Button
                      key={type.value}
                      type="button"
                      variant={mediaType === type.value ? "default" : "outline"}
                      className="flex flex-col h-auto py-3 gap-1"
                      onClick={() => setMediaType(type.value)}
                    >
                      <Icon className="h-5 w-5" />
                      <span className="text-xs">{type.label}</span>
                    </Button>
                  );
                })}
              </div>
            </div>

            {mediaType !== "call_promise" && (
              <div>
                <Label>Upload da Mídia *</Label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={mediaType === "video" ? "video/*" : "image/*"}
                  onChange={handleFileSelect}
                  className="hidden"
                />

                {mediaPreview ? (
                  <div className="relative mt-2 rounded-lg overflow-hidden">
                    {mediaType === "video" ? (
                      <video preload="none" src={mediaPreview} className="w-full max-h-48 object-cover" controls />
                    ) : (
                      <img loading="lazy" decoding="async" src={mediaPreview} alt="Preview" className="w-full max-h-48 object-cover" />
                    )}
                    {!isUploading && (
                      <Button
                        size="icon"
                        variant="destructive"
                        className="absolute top-2 right-2"
                        onClick={removeMedia}
                       aria-label="Fechar">
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full h-32 mt-1 border-dashed"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                  >
                    {isUploading ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <div className="flex flex-col items-center gap-2">
                        <ImagePlus className="h-8 w-8 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">Clique para fazer upload</span>
                      </div>
                    )}
                  </Button>
                )}

                {(isUploading || uploadProgress > 0) && (
                  <div className="mt-2 space-y-1">
                    <Progress value={uploadProgress} className="h-2" />
                    <p className="text-[11px] text-muted-foreground text-right">
                      {uploadProgress < 100 ? `Enviando... ${uploadProgress}%` : "Concluído!"}
                    </p>
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Lance Inicial (R$)</Label>
                <Input
                  type="text"
                  inputMode="decimal"
                  placeholder="10,00"
                  value={startingPrice}
                  onChange={(e) => setStartingPrice(e.target.value.replace(/[^\d,.]/, ""))}
                />
              </div>
              <div>
                <Label>Incremento (R$)</Label>
                <Input
                  type="text"
                  inputMode="decimal"
                  placeholder="5,00"
                  value={minIncrement}
                  onChange={(e) => setMinIncrement(e.target.value.replace(/[^\d,.]/, ""))}
                />
              </div>
            </div>

            <div>
              <Label>Duração</Label>
              <Select value={durationHours} onValueChange={setDurationHours}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DURATION_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <div className="px-4 py-3 border-t border-border/60 shrink-0 bg-background">
          <Button
            className="w-full"
            size="lg"
            onClick={handleSubmit}
            disabled={createAuction.isPending || isUploading}
          >
            {createAuction.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Criando leilão...
              </>
            ) : (
              <>
                <Gavel className="h-4 w-4 mr-2" />
                Criar Leilão
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

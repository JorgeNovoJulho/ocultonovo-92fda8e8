import { useState, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Calendar,
  Clock,
  MapPin,
  Users,
  DollarSign,
  Tag,
  X,
  Loader2,
  ImagePlus,
  Trash2,
} from "lucide-react";
import { useCreateEvent } from "@/hooks/useEvents";
import { uploadEventImage } from "@/hooks/useEventFeatures";
import { useToast } from "@/hooks/use-toast";

interface CreateEventModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateEventModal({ open, onOpenChange }: CreateEventModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [eventTime, setEventTime] = useState("");
  const [maxAttendees, setMaxAttendees] = useState("");
  const [price, setPrice] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [imageUrl, setImageUrl] = useState("");
  const [imagePreview, setImagePreview] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const createEvent = useCreateEvent();
  const { toast } = useToast();

  const handleAddTag = () => {
    if (tagInput.trim() && !tags.includes(tagInput.trim())) {
      setTags([...tags, tagInput.trim()]);
      setTagInput("");
    }
  };

  const handleRemoveTag = (tag: string) => setTags(tags.filter((t) => t !== tag));

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast({ title: "Arquivo inválido", description: "Selecione uma imagem.", variant: "destructive" });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "Arquivo muito grande", description: "Máx. 5MB.", variant: "destructive" });
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => setImagePreview(ev.target?.result as string);
    reader.readAsDataURL(file);

    setUploading(true);
    setUploadProgress(5);
    const progressTimer = setInterval(() => {
      setUploadProgress((p) => (p < 85 ? p + 8 : p));
    }, 200);

    try {
      const url = await uploadEventImage(file);
      clearInterval(progressTimer);
      setUploadProgress(100);
      setImageUrl(url);
      toast({ title: "Imagem enviada!", description: "Arte do evento carregada." });
    } catch (error: any) {
      clearInterval(progressTimer);
      toast({
        title: "Erro no upload",
        description: error?.message || "Não foi possível enviar a imagem.",
        variant: "destructive",
      });
      setImagePreview("");
      setUploadProgress(0);
    } finally {
      setUploading(false);
      setTimeout(() => setUploadProgress(0), 1200);
    }
  };

  const handleRemoveImage = () => {
    setImageUrl("");
    setImagePreview("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createEvent.mutateAsync({
        title,
        description: description || undefined,
        location,
        event_date: eventDate,
        event_time: eventTime,
        max_attendees: maxAttendees ? parseInt(maxAttendees) : undefined,
        price: price || undefined,
        tags: tags.length > 0 ? tags : undefined,
        image_url: imageUrl || undefined,
      });
      setTitle("");
      setDescription("");
      setLocation("");
      setEventDate("");
      setEventTime("");
      setMaxAttendees("");
      setPrice("");
      setTags([]);
      setImageUrl("");
      setImagePreview("");
      onOpenChange(false);
    } catch {
      // handled by mutation
    }
  };

  const isValid = title && location && eventDate && eventTime;

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
            <span className="text-xl">🎉</span>
            Criar Novo Evento
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto scrollbar-hide overscroll-contain">
            <div className="space-y-4 px-4 py-4">
              {/* Image Upload */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <ImagePlus className="h-4 w-4" />
                  Arte do Evento
                </Label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageSelect}
                  className="hidden"
                />
                {imagePreview ? (
                  <div className="relative rounded-lg overflow-hidden">
                    <img loading="lazy" decoding="async" src={imagePreview} alt="Preview" className="w-full h-40 object-cover" />
                    {uploading && (
                      <div className="absolute inset-0 bg-background/80 flex items-center justify-center">
                        <Loader2 className="h-6 w-6 animate-spin" />
                      </div>
                    )}
                    {!uploading && (
                      <Button
                        type="button"
                        size="icon"
                        variant="destructive"
                        className="absolute top-2 right-2 h-8 w-8"
                        onClick={handleRemoveImage}
                       aria-label="Excluir">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full h-32 border-2 border-dashed border-border rounded-lg flex flex-col items-center justify-center gap-2 hover:border-primary/50 hover:bg-muted/50 transition-colors"
                  >
                    <ImagePlus className="h-8 w-8 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Clique para adicionar uma imagem</span>
                  </button>
                )}
                {(uploading || uploadProgress > 0) && (
                  <div className="space-y-1">
                    <Progress value={uploadProgress} className="h-2" />
                    <p className="text-[11px] text-muted-foreground text-right">
                      {uploadProgress < 100 ? `Enviando... ${uploadProgress}%` : "Concluído!"}
                    </p>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="title">Título do Evento *</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ex: Noite de Máscaras"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Descrição</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Descreva o evento, dress code, regras..."
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="location" className="flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  Local *
                </Label>
                <Input
                  id="location"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Ex: Club Privé - São Paulo, SP"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="date" className="flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    Data *
                  </Label>
                  <Input id="date" type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="time" className="flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    Horário *
                  </Label>
                  <Input id="time" type="time" value={eventTime} onChange={(e) => setEventTime(e.target.value)} required />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="maxAttendees" className="flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Vagas
                  </Label>
                  <Input
                    id="maxAttendees"
                    type="number"
                    inputMode="numeric"
                    value={maxAttendees}
                    onChange={(e) => setMaxAttendees(e.target.value)}
                    placeholder="Ex: 50"
                    min="1"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="price" className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4" />
                    Preço
                  </Label>
                  <Input
                    id="price"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder="Ex: R$ 350/casal"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Tag className="h-4 w-4" />
                  Tags
                </Label>
                <div className="flex gap-2">
                  <Input
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    placeholder="Ex: Swing, Fetiche..."
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddTag();
                      }
                    }}
                  />
                  <Button type="button" variant="outline" onClick={handleAddTag}>
                    Adicionar
                  </Button>
                </div>
                {tags.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {tags.map((tag) => (
                      <Badge key={tag} variant="secondary" className="gap-1">
                        {tag}
                        <button
                          type="button"
                          onClick={() => handleRemoveTag(tag)}
                          className="hover:text-destructive"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex gap-3 px-4 py-3 border-t border-border/60 shrink-0 bg-background">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={!isValid || createEvent.isPending || uploading}
              className="flex-1 bg-gradient-to-r from-primary to-secondary"
            >
              {createEvent.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Criando...
                </>
              ) : (
                "Criar Evento"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

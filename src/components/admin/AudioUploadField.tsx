import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, X, Music, Play, Pause, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabaseExternal";
import { toast } from "sonner";
import { EXTERNAL_SUPABASE_URL } from '@/lib/appConfig';

interface AudioUploadFieldProps {
  value: string | null;
  onChange: (url: string | null) => void;
  label: string;
  bucket?: string;
}

export function AudioUploadField({ 
  value, 
  onChange, 
  label,
  bucket = "hero-audio"
}: AudioUploadFieldProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (file: File) => {
    if (!file) return;

    // Validate file type
    const validTypes = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/x-m4a', 'audio/mp4'];
    if (!validTypes.includes(file.type)) {
      toast.error("Formato inválido. Use MP3, WAV, OGG ou M4A.");
      return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Arquivo muito grande. Máximo 10MB.");
      return;
    }

    setIsUploading(true);

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) throw uploadError;

      const publicUrl = `${EXTERNAL_SUPABASE_URL}/storage/v1/object/public/${bucket}/${fileName}`;
      onChange(publicUrl);
      toast.success("Áudio enviado com sucesso!");
    } catch (error: unknown) {
      console.error("Upload error:", error);
      const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
      toast.error(`Erro ao enviar áudio: ${errorMessage}`);
    } finally {
      setIsUploading(false);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileChange(e.dataTransfer.files[0]);
    }
  };

  const handleRemove = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
    }
    onChange(null);
  };

  const togglePlay = () => {
    if (!audioRef.current || !value) return;

    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value || null);
  };

  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium">{label}</Label>

      {/* Audio Preview with Player */}
      {value && (
        <div className="relative p-3 bg-muted/50 rounded-lg border border-border/50">
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-10 w-10 rounded-full bg-primary/20 hover:bg-primary/30"
              onClick={togglePlay}
            >
              {isPlaying ? (
                <Pause className="h-5 w-5 text-primary" />
              ) : (
                <Play className="h-5 w-5 text-primary" />
              )}
            </Button>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <Music className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <span className="text-sm text-foreground truncate">
                  {value.split('/').pop() || "Áudio"}
                </span>
              </div>
              {isPlaying && (
                <div className="flex items-center gap-1 mt-1">
                  {[...Array(5)].map((_, i) => (
                    <div
                      key={i}
                      className="w-1 bg-primary rounded-full animate-pulse"
                      style={{
                        height: `${8 + Math.random() * 12}px`,
                        animationDelay: `${i * 0.1}s`
                      }}
                    />
                  ))}
                </div>
              )}
            </div>

            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-destructive hover:bg-destructive/10"
              onClick={handleRemove}
             aria-label="Fechar">
              <X className="h-4 w-4" />
            </Button>
          </div>

          <audio
            ref={audioRef}
            src={value}
            onEnded={() => setIsPlaying(false)}
            className="hidden"
          />
        </div>
      )}

      {/* Upload Area */}
      {!value && (
        <div
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          className={`
            relative p-6 rounded-lg border-2 border-dashed transition-all cursor-pointer
            ${dragActive 
              ? 'border-primary bg-primary/10' 
              : 'border-border/50 hover:border-primary/50 hover:bg-muted/30'
            }
          `}
          onClick={() => inputRef.current?.click()}
        >
          <input
            ref={inputRef}
            type="file"
            accept="audio/mpeg,audio/mp3,audio/wav,audio/ogg,audio/x-m4a,audio/mp4"
            onChange={(e) => e.target.files?.[0] && handleFileChange(e.target.files[0])}
            className="hidden"
          />

          <div className="flex flex-col items-center gap-2 text-center">
            {isUploading ? (
              <>
                <Loader2 className="h-8 w-8 text-primary animate-spin" />
                <span className="text-sm text-muted-foreground">Enviando...</span>
              </>
            ) : (
              <>
                <div className="p-3 rounded-full bg-primary/10">
                  <Upload className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium">Arraste um arquivo de áudio</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    ou clique para selecionar (MP3, WAV, OGG - máx 10MB)
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* URL Input */}
      <div className="flex items-center gap-2">
        <Input
          placeholder="Ou cole uma URL de áudio..."
          value={value || ""}
          onChange={handleInputChange}
          className="text-sm"
        />
      </div>
    </div>
  );
}

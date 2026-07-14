import { useState, useRef, useEffect } from 'react';
import { Upload, X, Loader2, Image as ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useUploadSiteImage } from '@/hooks/useSiteEditor';
import { cn } from '@/lib/utils';

interface ImageUploadFieldProps {
  value: string;
  onChange: (url: string) => void;
  label: string;
  sectionId?: string;
  imageKey?: string;
  className?: string;
}

export function ImageUploadField({
  value,
  onChange,
  label,
  sectionId,
  imageKey = 'section-image',
  className,
}: ImageUploadFieldProps) {
  const uploadImage = useUploadSiteImage();
  const [preview, setPreview] = useState(value);
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const blobPreviewRef = useRef<string | null>(null);

  useEffect(() => {
    setPreview(value);
  }, [value]);

  useEffect(() => {
    return () => {
      if (blobPreviewRef.current) {
        URL.revokeObjectURL(blobPreviewRef.current);
        blobPreviewRef.current = null;
      }
    };
  }, []);

  const handleFileChange = async (file: File) => {
    if (!file) return;

    if (!file.type.startsWith('image/')) return;

    // Preview IMEDIATO antes do upload
    if (blobPreviewRef.current) URL.revokeObjectURL(blobPreviewRef.current);
    const localUrl = URL.createObjectURL(file);
    blobPreviewRef.current = localUrl;
    setPreview(localUrl);

    try {
      const result = await uploadImage.mutateAsync({
        file,
        imageKey: imageKey,
        sectionId,
      });

      onChange(result.image_url);
      setPreview(result.image_url);

      if (blobPreviewRef.current) {
        URL.revokeObjectURL(blobPreviewRef.current);
        blobPreviewRef.current = null;
      }
    } catch {
      // mantém preview local para evitar UX quebrada em mobile
    } finally {
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileChange(file);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
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
    if (blobPreviewRef.current) {
      URL.revokeObjectURL(blobPreviewRef.current);
      blobPreviewRef.current = null;
    }
    setPreview('');
    onChange('');
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  };

  return (
    <div className={cn("space-y-2", className)}>
      <Label>{label}</Label>
      
      <div className="flex gap-4">
        {/* Preview da imagem */}
        {preview && (
          <div className="relative w-24 h-24 rounded-lg overflow-hidden border border-border/50 flex-shrink-0">
            <img loading="lazy" decoding="async"
              src={preview}
              alt="Preview"
              className="w-full h-full object-cover"
            />
            <Button
              type="button"
              variant="destructive"
              size="icon"
              className="absolute top-1 right-1 h-6 w-6"
              onClick={handleRemove}
             aria-label="Fechar">
              <X className="h-3 w-3" />
            </Button>
          </div>
        )}

        {/* Área de upload */}
        <div className="flex-1 space-y-2">
          <div
            className={cn(
              "relative border-2 border-dashed rounded-lg p-4 transition-colors cursor-pointer",
              dragActive
                ? "border-[#FF007F] bg-[#FF007F]/5"
                : "border-border/50 hover:border-[#FF007F]/50",
              uploadImage.isPending && "opacity-50 pointer-events-none"
            )}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
          >
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              onChange={handleInputChange}
              className="hidden"
            />

            <div className="flex flex-col items-center gap-2 text-center">
              {uploadImage.isPending ? (
                <Loader2 className="h-6 w-6 text-[#FF007F] animate-spin" />
              ) : (
                <Upload className="h-6 w-6 text-muted-foreground" />
              )}
              <div className="text-xs text-muted-foreground">
                {uploadImage.isPending ? (
                  'Enviando...'
                ) : (
                  <>
                    <span className="font-medium text-[#FF007F]">Clique para enviar</span>
                    {' '}ou arraste aqui
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Input de URL */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <ImageIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                value={value}
                onChange={(e) => {
                  onChange(e.target.value);
                  setPreview(e.target.value);
                }}
                placeholder="Ou cole uma URL de imagem"
                className="pl-9 text-sm"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
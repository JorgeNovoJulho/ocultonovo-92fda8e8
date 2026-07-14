/**
 * CameraCapture — Abre a câmera do dispositivo diretamente via getUserMedia.
 * Captura uma foto e retorna como File.
 */
import { useRef, useState, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Camera, X, RefreshCw } from 'lucide-react';

interface Props {
  facing: 'user' | 'environment';
  onCapture: (file: File) => void;
  onCancel: () => void;
  /** Tipo de guia a exibir sobre o vídeo */
  guide?: 'document' | 'selfie';
  /** Texto de instrução exibido sobre a câmera (ex: "Frente do RG") */
  hint?: string;
}

export function CameraCapture({ facing, onCapture, onCancel, guide, hint }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }, []);

  const startCamera = useCallback(async () => {
    setError(null);
    setReady(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 960 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setReady(true);
      }
    } catch (err: any) {
      console.error('Camera error:', err);
      setError('Não foi possível acessar a câmera. Verifique as permissões do navegador.');
    }
  }, [facing]);

  useEffect(() => {
    startCamera();
    return () => stopStream();
  }, [startCamera, stopStream]);

  const handleCapture = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Espelhar selfie
    if (facing === 'user') {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0);

    stopStream();

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], `capture_${Date.now()}.webp`, { type: 'image/webp' });
        onCapture(file);
      },
      'image/webp',
      0.85
    );
  };

  const handleCancel = () => {
    stopStream();
    onCancel();
  };

  return (
    <div className="space-y-3">
      <div className="relative rounded-xl overflow-hidden bg-black aspect-[4/3]">
        <video preload="none"
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover"
          style={facing === 'user' ? { transform: 'scaleX(-1)' } : undefined}
        />

        {/* Guias de enquadramento */}
        {ready && guide && (
          <div className="pointer-events-none absolute inset-0">
            {/* Máscara escurecida ao redor */}
            <div
              className="absolute inset-0"
              style={{
                background:
                  guide === 'document'
                    ? 'radial-gradient(rgba(0,0,0,0) 55%, rgba(0,0,0,0.55) 100%)'
                    : 'radial-gradient(circle at center, rgba(0,0,0,0) 35%, rgba(0,0,0,0.55) 70%)',
              }}
            />
            {guide === 'document' ? (
              <div
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 border-2 border-primary rounded-lg"
                style={{ width: '82%', aspectRatio: '85.6 / 53.98' }}
              >
                {/* Cantos */}
                <span className="absolute -top-1 -left-1 w-5 h-5 border-t-4 border-l-4 border-primary rounded-tl-lg" />
                <span className="absolute -top-1 -right-1 w-5 h-5 border-t-4 border-r-4 border-primary rounded-tr-lg" />
                <span className="absolute -bottom-1 -left-1 w-5 h-5 border-b-4 border-l-4 border-primary rounded-bl-lg" />
                <span className="absolute -bottom-1 -right-1 w-5 h-5 border-b-4 border-r-4 border-primary rounded-br-lg" />
              </div>
            ) : (
              <div
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 border-2 border-primary rounded-full"
                style={{ width: '60%', aspectRatio: '3 / 4' }}
              />
            )}

            {hint && (
              <div className="absolute top-2 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-background/70 backdrop-blur text-foreground text-xs font-medium">
                {hint}
              </div>
            )}
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-background/60 backdrop-blur text-foreground text-[11px] text-center max-w-[90%]">
              {guide === 'document'
                ? 'Encaixe o documento dentro do quadro, sem reflexos.'
                : 'Centralize o rosto no oval, com boa iluminação.'}
            </div>
          </div>
        )}

        {!ready && !error && (
          <div className="absolute inset-0 flex items-center justify-center">
            <RefreshCw className="h-6 w-6 text-white animate-spin" />
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center p-4 text-center">
            <p className="text-sm text-destructive bg-black/70 p-3 rounded-lg">{error}</p>
          </div>
        )}
      </div>

      <canvas ref={canvasRef} className="hidden" />

      <div className="flex gap-2">
        <Button variant="outline" size="sm" className="flex-1" onClick={handleCancel}>
          <X className="h-4 w-4 mr-1" /> Cancelar
        </Button>
        {ready && (
          <Button
            size="sm"
            className="flex-1 bg-gradient-to-r from-primary to-secondary gap-1.5"
            onClick={handleCapture}
          >
            <Camera className="h-4 w-4" /> Capturar
          </Button>
        )}
        {error && (
          <Button variant="outline" size="sm" className="flex-1" onClick={startCamera}>
            <RefreshCw className="h-4 w-4 mr-1" /> Tentar novamente
          </Button>
        )}
      </div>
    </div>
  );
}

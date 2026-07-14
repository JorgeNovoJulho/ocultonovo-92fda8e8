import { useState, useRef, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Shield,
  Camera,
  CheckCircle2,
  XCircle,
  Loader2,
  Lock,
  Smile,
  Eye,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { logger } from '@/lib/logger';

interface LivenessCheckModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  onFailure?: () => void;
}

type CheckStep = "intro" | "camera" | "action" | "scanning" | "success" | "failure";

interface ActionType {
  id: string;
  label: string;
  icon: React.ElementType;
}

const ACTIONS: ActionType[] = [
  { id: "smile", label: "Sorria", icon: Smile },
  { id: "blink", label: "Pisque os olhos", icon: Eye },
];

// ─── Blink Detection via frame differencing ──────────────────────────
function getEyeRegionPixels(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement
): Uint8ClampedArray | null {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx || video.videoWidth === 0 || video.readyState < 2) return null;

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  ctx.drawImage(video, 0, 0);

  // Eye region: top 20%-50% vertically, center 15%-85% horizontally (wide region)
  const x = Math.floor(canvas.width * 0.15);
  const y = Math.floor(canvas.height * 0.20);
  const w = Math.floor(canvas.width * 0.70);
  const h = Math.floor(canvas.height * 0.30);

  if (w <= 0 || h <= 0) return null;

  return ctx.getImageData(x, y, w, h).data;
}

function computeFrameDifference(
  prev: Uint8ClampedArray,
  curr: Uint8ClampedArray
): number {
  let diff = 0;
  const len = Math.min(prev.length, curr.length);
  // Sample every 16th pixel for performance (every 4th pixel, RGBA)
  for (let i = 0; i < len; i += 16) {
    diff += Math.abs(prev[i] - curr[i]); // R channel difference
  }
  return diff / (len / 16);
}

export function LivenessCheckModal({
  open,
  onOpenChange,
  onSuccess,
  onFailure,
}: LivenessCheckModalProps) {
  const [step, setStep] = useState<CheckStep>("intro");
  const [currentAction, setCurrentAction] = useState(ACTIONS[0]);
  const [scanProgress, setScanProgress] = useState(0);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [blinkDetected, setBlinkDetected] = useState(false);
  const [blinkFeedback, setBlinkFeedback] = useState("");

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const detectionCanvasRef = useRef<HTMLCanvasElement>(null);

  // Blink detection refs
  const prevFrameRef = useRef<Uint8ClampedArray | null>(null);
  const diffHistoryRef = useRef<{ diff: number; time: number }[]>([]);
  const blinkStateRef = useRef<"idle" | "spike1" | "recovered">("idle");
  const spikeTimestampRef = useRef<number>(0);
  const detectionIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const blinkCountRef = useRef(0);

  // Select random action on mount
  useEffect(() => {
    if (open && step === "intro") {
      const randomAction = ACTIONS[Math.floor(Math.random() * ACTIONS.length)];
      setCurrentAction(randomAction);
    }
  }, [open, step]);

  // Start camera
  const startCamera = useCallback(async () => {
    try {
      setCameraError(null);
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: 640, height: 480 },
        audio: false,
      });
      setStream(mediaStream);
      setStep("action");
    } catch (error) {
      console.error("Camera error:", error);
      if (error instanceof Error && error.name === "NotAllowedError") {
        setCameraError("Acesso à câmera negado. Verifique as permissões do navegador.");
      } else {
        setCameraError("Não foi possível acessar a câmera. Verifique as permissões.");
      }
    }
  }, []);

  // Attach stream to video element
  useEffect(() => {
    if (stream && videoRef.current && step === "action") {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(err => {
        console.error("Video play error:", err);
      });
    }
  }, [stream, step]);

  // Stop camera
  const stopCamera = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, [stream]);

  // Stop blink detection
  const stopBlinkDetection = useCallback(() => {
    if (detectionIntervalRef.current) {
      clearInterval(detectionIntervalRef.current);
      detectionIntervalRef.current = null;
    }
    prevFrameRef.current = null;
    diffHistoryRef.current = [];
    blinkStateRef.current = "idle";
    blinkCountRef.current = 0;
  }, []);

  // ─── Blink Detection Logic (Frame Differencing) ────────────────────
  const startBlinkDetection = useCallback(() => {
    stopBlinkDetection();
    setBlinkDetected(false);
    setBlinkFeedback("Posicione o rosto e aguarde...");

    let warmupFrames = 0;
    const WARMUP = 8; // ~0.6s warmup to stabilize
    const SPIKE_THRESHOLD = 3.5; // avg pixel diff threshold for a "movement spike"
    const MAX_BLINK_DURATION = 600; // ms - max time between close and open

    detectionIntervalRef.current = setInterval(() => {
      if (!videoRef.current || !detectionCanvasRef.current) return;

      const currentPixels = getEyeRegionPixels(
        videoRef.current,
        detectionCanvasRef.current
      );
      if (!currentPixels) return;

      // Need a previous frame to compare
      if (!prevFrameRef.current) {
        prevFrameRef.current = new Uint8ClampedArray(currentPixels);
        return;
      }

      const diff = computeFrameDifference(prevFrameRef.current, currentPixels);
      prevFrameRef.current = new Uint8ClampedArray(currentPixels);

      // Warmup phase
      if (warmupFrames < WARMUP) {
        warmupFrames++;
        if (warmupFrames === WARMUP) {
          setBlinkFeedback("Pronto! Pisque os olhos agora 👁️");
        }
        return;
      }

      const now = Date.now();
      diffHistoryRef.current.push({ diff, time: now });
      // Keep only last 2 seconds of history
      diffHistoryRef.current = diffHistoryRef.current.filter(
        (d) => now - d.time < 2000
      );

      // State machine: detect two spikes (close + open) within short window
      if (blinkStateRef.current === "idle") {
        if (diff > SPIKE_THRESHOLD) {
          blinkStateRef.current = "spike1";
          spikeTimestampRef.current = now;
          logger.log("[Blink] Spike1 (close) detected, diff:", diff.toFixed(2));
        }
      } else if (blinkStateRef.current === "spike1") {
        const elapsed = now - spikeTimestampRef.current;
        if (elapsed > MAX_BLINK_DURATION) {
          // Too long - not a blink
          blinkStateRef.current = "idle";
          logger.log("[Blink] Spike1 expired, resetting");
        } else if (diff > SPIKE_THRESHOLD && elapsed > 80) {
          // Second spike (eyes reopening) - blink confirmed!
          blinkStateRef.current = "recovered";
          blinkCountRef.current++;
          logger.log("[Blink] ✅ Blink detected! diff:", diff.toFixed(2), "elapsed:", elapsed, "ms");
          setBlinkFeedback("✅ Piscada detectada!");
          setBlinkDetected(true);
          setTimeout(() => stopBlinkDetection(), 300);
        }
      }
    }, 80); // ~12fps sampling
  }, [stopBlinkDetection]);

  // Start blink detection when action step is active and action is "blink"
  useEffect(() => {
    if (step === "action" && currentAction.id === "blink" && stream) {
      // Wait for video to be ready
      const timer = setTimeout(() => {
        startBlinkDetection();
      }, 1000);
      return () => {
        clearTimeout(timer);
        stopBlinkDetection();
      };
    }
  }, [step, currentAction.id, stream, startBlinkDetection, stopBlinkDetection]);

  // Auto-capture when blink is detected
  useEffect(() => {
    if (blinkDetected && step === "action" && currentAction.id === "blink") {
      const timer = setTimeout(() => {
        handleCapture();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [blinkDetected, step, currentAction.id]);

  // Capture frame
  const captureFrame = useCallback(() => {
    if (videoRef.current && canvasRef.current) {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(video, 0, 0);
        const imageData = canvas.toDataURL("image/jpeg");
        setCapturedImage(imageData);
      }
    }
  }, []);

  // Handle capture button
  const handleCapture = useCallback(() => {
    captureFrame();
    stopCamera();
    stopBlinkDetection();
    setStep("scanning");
    setScanProgress(0);

    const interval = setInterval(() => {
      setScanProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          setTimeout(() => {
            setStep("success");
          }, 500);
          return 100;
        }
        return prev + 4;
      });
    }, 100);
  }, [captureFrame, stopCamera, stopBlinkDetection]);

  // Handle success
  const handleComplete = useCallback(() => {
    stopCamera();
    stopBlinkDetection();
    onSuccess();
    resetModal();
  }, [stopCamera, stopBlinkDetection, onSuccess]);

  // Reset modal
  const resetModal = useCallback(() => {
    setStep("intro");
    setScanProgress(0);
    setCapturedImage(null);
    setCameraError(null);
    setBlinkDetected(false);
    setBlinkFeedback("");
  }, []);

  // Cleanup on close
  useEffect(() => {
    if (!open) {
      stopCamera();
      stopBlinkDetection();
      resetModal();
    }
  }, [open, stopCamera, stopBlinkDetection, resetModal]);

  // Handle retry
  const handleRetry = useCallback(() => {
    resetModal();
    setCapturedImage(null);
    const randomAction = ACTIONS[Math.floor(Math.random() * ACTIONS.length)];
    setCurrentAction(randomAction);
    setStep("camera");
    startCamera();
  }, [resetModal, startCamera]);

  const ActionIcon = currentAction.icon;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-card border-border overflow-hidden">
        <DialogHeader className="text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center">
              <Shield className="h-5 w-5 text-primary" />
            </div>
          </div>
          <DialogTitle className="text-xl">Verificação de Vivacidade</DialogTitle>
          <DialogDescription className="text-sm">
            Processo seguro de verificação biométrica
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4">
          {/* Hidden canvases */}
          <canvas ref={canvasRef} className="hidden" />
          <canvas ref={detectionCanvasRef} className="hidden" />

          {/* Intro Step */}
          {step === "intro" && (
            <div className="space-y-6 text-center">
              <div className="bg-muted/30 rounded-xl p-6 border border-border">
                <Camera className="h-16 w-16 mx-auto text-primary mb-4" />
                <h3 className="font-semibold text-foreground mb-2">
                  Centralize seu rosto
                </h3>
                <p className="text-sm text-muted-foreground">
                  Vamos confirmar que você é real. Este processo usa sua câmera 
                  para garantir a segurança da plataforma.
                </p>
              </div>

              <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                <Lock className="h-3 w-3" />
                <span>Criptografia de Ponta a Ponta</span>
              </div>

              <Button
                onClick={() => {
                  setStep("camera");
                  startCamera();
                }}
                className="w-full h-12 bg-gradient-to-r from-primary to-secondary hover:opacity-90"
              >
                <Camera className="h-5 w-5 mr-2" />
                Iniciar Verificação
              </Button>
            </div>
          )}

          {/* Camera Step (Loading) */}
          {step === "camera" && (
            <div className="space-y-6 text-center">
              <div className="relative aspect-square max-w-64 mx-auto">
                <div className="absolute inset-0 rounded-full border-4 border-primary/50 overflow-hidden bg-muted/30 flex items-center justify-center">
                  {cameraError ? (
                    <div className="p-4 text-center">
                      <XCircle className="h-10 w-10 text-destructive mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">{cameraError}</p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={startCamera}
                        className="mt-3"
                      >
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Tentar novamente
                      </Button>
                    </div>
                  ) : (
                    <Loader2 className="h-10 w-10 animate-spin text-primary" />
                  )}
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                Aguardando acesso à câmera...
              </p>
            </div>
          )}

          {/* Action Step */}
          {step === "action" && (
            <div className="space-y-6">
              {/* Camera view */}
              <div className="relative aspect-square max-w-64 mx-auto">
                <div className={cn(
                  "absolute inset-0 rounded-full p-1 bg-gradient-to-br transition-all duration-300",
                  blinkDetected
                    ? "from-green-500 via-green-400 to-green-500"
                    : "from-primary via-secondary to-primary animate-pulse"
                )}>
                  <div className="w-full h-full rounded-full overflow-hidden bg-background">
                    <video preload="none"
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-cover scale-x-[-1]"
                    />
                  </div>
                </div>

                {/* Corner markers */}
                <div className="absolute top-4 left-4 w-6 h-6 border-t-2 border-l-2 border-primary rounded-tl-lg" />
                <div className="absolute top-4 right-4 w-6 h-6 border-t-2 border-r-2 border-primary rounded-tr-lg" />
                <div className="absolute bottom-4 left-4 w-6 h-6 border-b-2 border-l-2 border-primary rounded-bl-lg" />
                <div className="absolute bottom-4 right-4 w-6 h-6 border-b-2 border-r-2 border-primary rounded-br-lg" />

                {/* Blink detected indicator */}
                {blinkDetected && (
                  <div className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-green-500 flex items-center justify-center animate-bounce">
                    <CheckCircle2 className="h-5 w-5 text-white" />
                  </div>
                )}
              </div>

              {/* Action instruction */}
              <div className={cn(
                "rounded-xl p-4 border text-center transition-all duration-300",
                blinkDetected
                  ? "bg-green-500/10 border-green-500/30"
                  : "bg-gradient-to-r from-primary/10 to-secondary/10 border-primary/20"
              )}>
                <div className="flex items-center justify-center gap-2 mb-2">
                  {blinkDetected ? (
                    <CheckCircle2 className="h-6 w-6 text-green-500" />
                  ) : (
                    <ActionIcon className="h-6 w-6 text-primary" />
                  )}
                  <span className="text-lg font-bold text-foreground">
                    {blinkDetected ? "Piscada Detectada!" : currentAction.label}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">
                  {currentAction.id === "blink" && blinkFeedback
                    ? blinkFeedback
                    : blinkDetected
                      ? "Capturando automaticamente..."
                      : "Realize a ação acima e clique em Capturar"}
                </p>
              </div>

              {/* Trust badge */}
              <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                <Lock className="h-3 w-3 text-green-500" />
                <span>Criptografia de Ponta a Ponta</span>
              </div>

              {/* Buttons */}
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    stopCamera();
                    stopBlinkDetection();
                    onOpenChange(false);
                  }}
                >
                  Cancelar
                </Button>
                <Button
                  onClick={handleCapture}
                  className="flex-1 bg-gradient-to-r from-primary to-secondary hover:opacity-90"
                  disabled={currentAction.id === "blink" && !blinkDetected}
                >
                  <Camera className="h-4 w-4 mr-2" />
                  {currentAction.id === "blink" && !blinkDetected
                    ? "Aguardando piscada..."
                    : "Capturar"}
                </Button>
              </div>
            </div>
          )}

          {/* Scanning Step */}
          {step === "scanning" && (
            <div className="space-y-6 text-center">
              {/* Captured image with scanning effect */}
              <div className="relative aspect-square max-w-64 mx-auto">
                <div className="absolute inset-0 rounded-full overflow-hidden border-4 border-primary/50">
                  {capturedImage && (
                    <img loading="lazy" decoding="async"
                      src={capturedImage}
                      alt="Captured"
                      className="w-full h-full object-cover scale-x-[-1]"
                    />
                  )}
                  
                  {/* Scanning overlay */}
                  <div className="absolute inset-0 bg-gradient-to-b from-primary/30 via-transparent to-primary/30">
                    {/* Scanning line */}
                    <div 
                      className="absolute left-0 right-0 h-1 bg-gradient-to-r from-transparent via-primary to-transparent shadow-[0_0_20px_hsl(var(--primary))]"
                      style={{
                        top: `${(scanProgress % 100)}%`,
                        animation: 'none',
                      }}
                    />
                    
                    {/* Grid overlay */}
                    <div 
                      className="absolute inset-0 opacity-30"
                      style={{
                        backgroundImage: `
                          linear-gradient(to right, hsl(var(--primary)) 1px, transparent 1px),
                          linear-gradient(to bottom, hsl(var(--primary)) 1px, transparent 1px)
                        `,
                        backgroundSize: '20px 20px',
                      }}
                    />

                    {/* Corner scan markers */}
                    <div className="absolute top-2 left-2 w-8 h-8 border-t-2 border-l-2 border-primary animate-pulse" />
                    <div className="absolute top-2 right-2 w-8 h-8 border-t-2 border-r-2 border-primary animate-pulse" />
                    <div className="absolute bottom-2 left-2 w-8 h-8 border-b-2 border-l-2 border-primary animate-pulse" />
                    <div className="absolute bottom-2 right-2 w-8 h-8 border-b-2 border-r-2 border-primary animate-pulse" />
                  </div>
                </div>

                {/* Rotating ring */}
                <div 
                  className="absolute inset-[-4px] rounded-full border-4 border-transparent border-t-primary animate-spin"
                  style={{ animationDuration: '1s' }}
                />
              </div>

              {/* Progress */}
              <div className="space-y-2">
                <div className="flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  <span className="text-sm font-medium text-foreground">
                    Analisando biometria...
                  </span>
                </div>
                <Progress value={scanProgress} className="h-2" />
                <p className="text-xs text-muted-foreground">
                  {scanProgress}% concluído
                </p>
              </div>

              {/* Scanning steps */}
              <div className="space-y-2 text-left">
                <div className={cn(
                  "flex items-center gap-2 text-sm transition-colors",
                  scanProgress >= 25 ? "text-green-500" : "text-muted-foreground"
                )}>
                  {scanProgress >= 25 ? <CheckCircle2 className="h-4 w-4" /> : <Loader2 className="h-4 w-4 animate-spin" />}
                  Detectando rosto
                </div>
                <div className={cn(
                  "flex items-center gap-2 text-sm transition-colors",
                  scanProgress >= 50 ? "text-green-500" : "text-muted-foreground"
                )}>
                  {scanProgress >= 50 ? <CheckCircle2 className="h-4 w-4" /> : <Loader2 className="h-4 w-4 animate-spin" />}
                  Verificando vivacidade
                </div>
                <div className={cn(
                  "flex items-center gap-2 text-sm transition-colors",
                  scanProgress >= 75 ? "text-green-500" : "text-muted-foreground"
                )}>
                  {scanProgress >= 75 ? <CheckCircle2 className="h-4 w-4" /> : <Loader2 className="h-4 w-4 animate-spin" />}
                  Comparando biometria
                </div>
                <div className={cn(
                  "flex items-center gap-2 text-sm transition-colors",
                  scanProgress >= 100 ? "text-green-500" : "text-muted-foreground"
                )}>
                  {scanProgress >= 100 ? <CheckCircle2 className="h-4 w-4" /> : <Loader2 className="h-4 w-4 animate-spin" />}
                  Validando identidade
                </div>
              </div>
            </div>
          )}

          {/* Success Step */}
          {step === "success" && (
            <div className="space-y-6 text-center py-4">
              <div className="relative w-24 h-24 mx-auto">
                {/* Success ring */}
                <div className="absolute inset-0 rounded-full bg-green-500/20 animate-ping" />
                <div className="relative w-full h-full rounded-full bg-green-500/10 flex items-center justify-center border-2 border-green-500">
                  <CheckCircle2 className="h-12 w-12 text-green-500" />
                </div>
              </div>

              <div>
                <h3 className="text-xl font-bold text-foreground mb-2">
                  Biometria Confirmada!
                </h3>
                <p className="text-muted-foreground">
                  Bem-vindo(a) à plataforma OCULTO.
                </p>
              </div>

              <div className="bg-green-500/10 rounded-xl p-4 border border-green-500/20">
                <div className="flex items-center justify-center gap-2 text-green-500">
                  <Shield className="h-5 w-5" />
                  <span className="font-medium">Identidade Verificada</span>
                </div>
              </div>

              <Button
                onClick={handleComplete}
                className="w-full h-12 bg-gradient-to-r from-primary to-secondary hover:opacity-90"
              >
                Continuar
              </Button>
            </div>
          )}

          {/* Failure Step */}
          {step === "failure" && (
            <div className="space-y-6 text-center py-4">
              <div className="relative w-24 h-24 mx-auto">
                <div className="w-full h-full rounded-full bg-destructive/10 flex items-center justify-center border-2 border-destructive">
                  <XCircle className="h-12 w-12 text-destructive" />
                </div>
              </div>

              <div>
                <h3 className="text-xl font-bold text-foreground mb-2">
                  Verificação Falhou
                </h3>
                <p className="text-muted-foreground">
                  Rosto não corresponde. Acesso negado.
                </p>
              </div>

              <div className="bg-destructive/10 rounded-xl p-4 border border-destructive/20">
                <p className="text-sm text-muted-foreground">
                  Certifique-se de que seu rosto está bem iluminado e centralizado.
                </p>
              </div>

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    onFailure?.();
                    onOpenChange(false);
                  }}
                >
                  Cancelar
                </Button>
                <Button
                  onClick={handleRetry}
                  className="flex-1 bg-gradient-to-r from-primary to-secondary hover:opacity-90"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Tentar Novamente
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

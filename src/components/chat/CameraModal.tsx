import React, { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, RotateCcw, Square, Check, SwitchCamera, Maximize2, Minimize2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { toast } from 'sonner';

type CameraMode = 'photo' | 'video';

interface CameraModalProps {
  open: boolean;
  onClose: () => void;
  onCapture: (file: File, type: 'image' | 'video') => void;
}

const MAX_VIDEO_DURATION = 180; // 3 min

export function CameraModal({ open, onClose, onCapture }: CameraModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [mode, setMode] = useState<CameraMode>('photo');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [capturedPreview, setCapturedPreview] = useState<string | null>(null);
  const [capturedFile, setCapturedFile] = useState<File | null>(null);
  const [capturedType, setCapturedType] = useState<'image' | 'video'>('image');
  const [isStarting, setIsStarting] = useState(false);
  const [previewRotation, setPreviewRotation] = useState(0);
  const [previewFit, setPreviewFit] = useState<'contain' | 'cover'>('contain');

  // ─── Stop ALL media tracks and clean up ────────────────────────────────────
  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => {
        t.enabled = false;
        t.stop();
      });
      streamRef.current = null;
    }
    // Detach from video element
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // ─── Start camera stream ────────────────────────────────────────────────────
  const startCamera = useCallback(async (facing: 'user' | 'environment', captureMode: CameraMode) => {
    // Always stop previous stream first
    stopStream();
    setIsStarting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: facing,
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: captureMode === 'video',
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        // Wait for metadata before playing (fixes grey preview)
        video.onloadedmetadata = () => {
          video.play().catch(err => console.warn('Video play error:', err));
          setIsStarting(false);
        };
      } else {
        setIsStarting(false);
      }
    } catch (err: any) {
      console.error('Camera error:', err);
      setIsStarting(false);
      const msg = err?.name === 'NotAllowedError'
        ? 'Permissão de câmera negada. Verifique as configurações do navegador.'
        : 'Não foi possível acessar a câmera.';
      toast.error(msg);
      onClose();
    }
  }, [stopStream, onClose]);

  // ─── Open / close modal ─────────────────────────────────────────────────────
  useEffect(() => {
    if (open) {
      setCapturedPreview(null);
      setCapturedFile(null);
      setIsRecording(false);
      setRecordingTime(0);
      setMode('photo');
      setFacingMode('environment');
      setPreviewRotation(0);
      setPreviewFit('contain');
      startCamera('environment', 'photo');
    } else {
      stopStream();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // ─── Unmount safety: always release camera/mic ──────────────────────────────
  useEffect(() => {
    return () => {
      stopStream();
    };
  }, [stopStream]);

  // ─── Flip camera ────────────────────────────────────────────────────────────
  const handleFlipCamera = useCallback(() => {
    const newFacing = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(newFacing);
    if (!capturedPreview) {
      startCamera(newFacing, mode);
    }
  }, [facingMode, capturedPreview, mode, startCamera]);

  // ─── Switch mode (photo ↔ video) ─────────────────────────────────────────
  const handleSetMode = useCallback((newMode: CameraMode) => {
    if (isRecording) return;
    setMode(newMode);
    if (!capturedPreview) {
      startCamera(facingMode, newMode);
    }
  }, [isRecording, capturedPreview, facingMode, startCamera]);

  // ─── Take photo ─────────────────────────────────────────────────────────────
  const handleTakePhoto = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (facingMode === 'user') {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0);

    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], `photo_${Date.now()}.jpg`, { type: 'image/jpeg' });
      const url = URL.createObjectURL(blob);
      setCapturedPreview(url);
      setCapturedFile(file);
      setCapturedType('image');
      stopStream();
    }, 'image/jpeg', 0.9);
  }, [facingMode, stopStream]);

  // ─── Video recording ─────────────────────────────────────────────────────
  const handleStartRecording = useCallback(() => {
    if (!streamRef.current) return;
    chunksRef.current = [];

    try {
      const mr = new MediaRecorder(streamRef.current, {
        mimeType: MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
          ? 'video/webm;codecs=vp9'
          : 'video/webm',
      });

      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'video/webm' });
        const file = new File([blob], `video_${Date.now()}.webm`, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        setCapturedPreview(url);
        setCapturedFile(file);
        setCapturedType('video');
        stopStream();
      };

      mr.start(1000);
      mediaRecorderRef.current = mr;
      setIsRecording(true);
      setRecordingTime(0);

      timerRef.current = setInterval(() => {
        setRecordingTime(prev => {
          if (prev + 1 >= MAX_VIDEO_DURATION) {
            handleStopRecording();
            return prev;
          }
          return prev + 1;
        });
      }, 1000);
    } catch (err) {
      console.error('Recording error:', err);
      toast.error('Erro ao iniciar gravação');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopStream]);

  const handleStopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setIsRecording(false);
  }, []);

  const handleConfirm = useCallback(() => {
    if (capturedFile) {
      onCapture(capturedFile, capturedType);
    }
    onClose();
  }, [capturedFile, capturedType, onCapture, onClose]);

  const handleRetake = useCallback(() => {
    if (capturedPreview) URL.revokeObjectURL(capturedPreview);
    setCapturedPreview(null);
    setCapturedFile(null);
    startCamera(facingMode, mode);
  }, [capturedPreview, facingMode, mode, startCamera]);

  const handleCloseModal = useCallback(() => {
    if (isRecording) handleStopRecording();
    stopStream();
    if (capturedPreview) URL.revokeObjectURL(capturedPreview);
    setCapturedPreview(null);
    setCapturedFile(null);
    onClose();
  }, [isRecording, handleStopRecording, stopStream, capturedPreview, onClose]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    return `${m}:${(s % 60).toString().padStart(2, '0')}`;
  };

  if (!open) return null;

  const modal = (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex flex-col overflow-y-auto overflow-x-hidden bg-background scrollbar-hide"
    >
      {/* Hidden canvas for photo capture */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Top bar */}
      <div className="relative z-10 flex shrink-0 items-center justify-between bg-background p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <button
          onClick={handleCloseModal}
          className="w-10 h-10 rounded-full bg-black/50 flex items-center justify-center active:scale-95 transition-transform"
        >
          <X className="h-5 w-5 text-white" />
        </button>

        {isRecording && (
          <div className="flex items-center gap-2 bg-destructive/90 rounded-full px-3 py-1">
            <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
            <span className="text-white text-sm font-mono">{formatTime(recordingTime)}</span>
          </div>
        )}

        <div className="flex items-center gap-2">
          <button
            onClick={() => setPreviewFit(prev => prev === 'contain' ? 'cover' : 'contain')}
            className="w-10 h-10 rounded-full bg-black/50 flex items-center justify-center active:scale-95 transition-transform"
            title={previewFit === 'contain' ? 'Preencher preview' : 'Ajustar preview inteiro'}
          >
            {previewFit === 'contain' ? <Maximize2 className="h-5 w-5 text-white" /> : <Minimize2 className="h-5 w-5 text-white" />}
          </button>
          <button
            onClick={() => setPreviewRotation(prev => (prev + 90) % 360)}
            className="w-10 h-10 rounded-full bg-black/50 flex items-center justify-center active:scale-95 transition-transform"
            title="Girar preview"
          >
            <RotateCcw className="h-5 w-5 text-white" />
          </button>
          {!capturedPreview && !isRecording && (
            <button
              onClick={handleFlipCamera}
              className="w-10 h-10 rounded-full bg-black/50 flex items-center justify-center active:scale-95 transition-transform"
              title="Alternar câmera frontal/traseira"
            >
              <SwitchCamera className="h-5 w-5 text-white" />
            </button>
          )}
        </div>
      </div>

      {/* Camera preview / captured preview */}
      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-background">
        {capturedPreview ? (
          capturedType === 'image' ? (
            <img loading="lazy" decoding="async" src={capturedPreview} alt="Captured" className={cn("h-full w-full", previewFit === 'contain' ? 'object-contain' : 'object-cover')} style={{ transform: `rotate(${previewRotation}deg)` }} />
          ) : (
            <video preload="none"
              src={capturedPreview}
              className={cn("h-full w-full", previewFit === 'contain' ? 'object-contain' : 'object-cover')}
              style={{ transform: `rotate(${previewRotation}deg)` }}
              controls
              autoPlay
              loop
              playsInline
              controlsList="nodownload nofullscreen noremoteplayback"
              disablePictureInPicture
              onContextMenu={e => e.preventDefault()}
            />
          )
        ) : (
          <video preload="none"
            ref={videoRef}
            className={cn(
              "h-full w-full",
              previewFit === 'contain' ? 'object-contain' : 'object-cover',
              facingMode === 'user' && "scale-x-[-1]"
            )}
            style={{ transform: `${facingMode === 'user' ? 'scaleX(-1) ' : ''}rotate(${previewRotation}deg)` }}
            autoPlay
            playsInline
            muted
          />
        )}

        {isStarting && !capturedPreview && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80">
            <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          </div>
        )}
      </div>

      {/* Bottom controls */}
      <div className="relative z-10 shrink-0 bg-background px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-4">
        {capturedPreview ? (
          <div className="flex items-center justify-center gap-8">
            <button
              onClick={handleRetake}
              className="w-14 h-14 rounded-full bg-white/10 border-2 border-white/30 flex items-center justify-center active:scale-95 transition-transform"
            >
              <RotateCcw className="h-6 w-6 text-white" />
            </button>
            <button
              onClick={handleConfirm}
              className="w-16 h-16 rounded-full bg-primary flex items-center justify-center active:scale-95 transition-transform shadow-lg"
            >
              <Check className="h-7 w-7 text-primary-foreground" />
            </button>
          </div>
        ) : (
          <>
            {/* Mode selector */}
            <div className="flex items-center justify-center gap-6 mb-4">
              <button
                onClick={() => handleSetMode('photo')}
                className={cn(
                  "text-sm font-medium px-3 py-1 rounded-full transition-colors",
                  mode === 'photo' ? "bg-white/20 text-white" : "text-white/50"
                )}
              >
                Foto
              </button>
              <button
                onClick={() => handleSetMode('video')}
                className={cn(
                  "text-sm font-medium px-3 py-1 rounded-full transition-colors",
                  mode === 'video' ? "bg-white/20 text-white" : "text-white/50"
                )}
              >
                Vídeo
              </button>
            </div>

            {/* Capture button */}
            <div className="flex items-center justify-center">
              {mode === 'photo' ? (
                <button
                  onClick={handleTakePhoto}
                  disabled={isStarting}
                  className="w-[72px] h-[72px] rounded-full border-4 border-white flex items-center justify-center active:scale-90 transition-transform disabled:opacity-50"
                >
                  <div className="w-[60px] h-[60px] rounded-full bg-white" />
                </button>
              ) : isRecording ? (
                <button
                  onClick={handleStopRecording}
                  className="w-[72px] h-[72px] rounded-full border-4 border-destructive flex items-center justify-center active:scale-90 transition-transform"
                >
                  <Square className="h-7 w-7 text-destructive fill-destructive" />
                </button>
              ) : (
                <button
                  onClick={handleStartRecording}
                  disabled={isStarting}
                  className="w-[72px] h-[72px] rounded-full border-4 border-destructive flex items-center justify-center active:scale-90 transition-transform disabled:opacity-50"
                >
                  <div className="w-[60px] h-[60px] rounded-full bg-destructive" />
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </motion.div>
  );

  return createPortal(modal, document.body);
}

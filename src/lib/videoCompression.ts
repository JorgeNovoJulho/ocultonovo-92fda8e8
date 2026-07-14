import { logger } from '@/lib/logger';
/**
 * Client-side video compression utility.
 * Uses canvas + MediaRecorder to re-encode videos at lower bitrate.
 * Optimized for low-RAM devices (Realme C55 <4GB).
 *
 * Falls back gracefully if APIs aren't available.
 */

interface CompressOptions {
  maxSizeMB?: number;
  maxDuration?: number;
  onProgress?: (percent: number) => void;
}

/**
 * Compress a video file by re-encoding via canvas at reduced resolution/bitrate.
 * Returns null if compression is not supported or the file is already small enough.
 */
export async function compressVideo(
  file: File,
  options: CompressOptions = {}
): Promise<File | null> {
  const { maxSizeMB = 15, onProgress } = options;

  // Skip if already small enough
  if (file.size <= maxSizeMB * 1024 * 1024) {
    return null; // null = use original
  }

  // Check for MediaRecorder support
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported('video/webm;codecs=vp8')) {
    console.warn('[videoCompression] MediaRecorder/VP8 not supported, skipping compression');
    return null;
  }

  try {
    onProgress?.(5);

    // Load video metadata
    const videoEl = document.createElement('video');
    videoEl.muted = true;
    videoEl.playsInline = true;
    videoEl.preload = 'auto';

    const videoUrl = URL.createObjectURL(file);
    videoEl.src = videoUrl;

    await new Promise<void>((resolve, reject) => {
      videoEl.onloadedmetadata = () => resolve();
      videoEl.onerror = () => reject(new Error('Failed to load video'));
      setTimeout(() => reject(new Error('Timeout loading video')), 15000);
    });

    const origWidth = videoEl.videoWidth;
    const origHeight = videoEl.videoHeight;
    const duration = videoEl.duration;

    // Target: 720p max, keeping aspect ratio
    const maxDim = 720;
    let targetWidth = origWidth;
    let targetHeight = origHeight;

    if (origWidth > maxDim || origHeight > maxDim) {
      const scale = Math.min(maxDim / origWidth, maxDim / origHeight);
      targetWidth = Math.round(origWidth * scale);
      targetHeight = Math.round(origHeight * scale);
      // Ensure even dimensions (required for encoding)
      targetWidth = targetWidth % 2 === 0 ? targetWidth : targetWidth - 1;
      targetHeight = targetHeight % 2 === 0 ? targetHeight : targetHeight - 1;
    }

    onProgress?.(15);

    // Create canvas for re-encoding
    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d')!;

    // Target bitrate: ~1.5 Mbps for 720p
    const targetBitrate = Math.min(1_500_000, Math.round((maxSizeMB * 8_000_000) / duration));

    const stream = canvas.captureStream(24); // 24fps
    const recorder = new MediaRecorder(stream, {
      mimeType: 'video/webm;codecs=vp8',
      videoBitsPerSecond: targetBitrate,
    });

    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    // Start playback and recording
    videoEl.currentTime = 0;
    await videoEl.play();
    recorder.start(500); // Collect chunks every 500ms

    onProgress?.(25);

    // Draw frames to canvas
    await new Promise<void>((resolve) => {
      let lastProgress = 25;
      const drawFrame = () => {
        if (videoEl.ended || videoEl.paused) {
          recorder.stop();
          resolve();
          return;
        }

        ctx.drawImage(videoEl, 0, 0, targetWidth, targetHeight);

        // Update progress (25-90%)
        if (duration > 0) {
          const p = 25 + (videoEl.currentTime / duration) * 65;
          if (p - lastProgress > 2) {
            lastProgress = p;
            onProgress?.(Math.round(p));
          }
        }

        requestAnimationFrame(drawFrame);
      };

      videoEl.onended = () => {
        recorder.stop();
        resolve();
      };

      drawFrame();
    });

    // Wait for recorder to finalize
    await new Promise<void>((resolve) => {
      if (recorder.state === 'inactive') {
        resolve();
      } else {
        recorder.onstop = () => resolve();
      }
    });

    // Cleanup
    videoEl.pause();
    URL.revokeObjectURL(videoUrl);

    onProgress?.(95);

    const blob = new Blob(chunks, { type: 'video/webm' });

    // Only use compressed version if it's actually smaller
    if (blob.size >= file.size * 0.9) {
      logger.log('[videoCompression] Compressed not smaller, using original');
      return null;
    }

    onProgress?.(100);
    logger.log(`[videoCompression] ${(file.size / 1024 / 1024).toFixed(1)}MB → ${(blob.size / 1024 / 1024).toFixed(1)}MB`);

    return new File([blob], file.name.replace(/\.[^.]+$/, '.webm'), { type: 'video/webm' });
  } catch (err) {
    console.warn('[videoCompression] Compression failed, using original:', err);
    return null;
  }
}

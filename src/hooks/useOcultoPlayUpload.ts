/**
 * uploadOcultoPlayFileWithProgress — XHR direto ao Supabase Storage REST
 * para obter eventos de progresso reais. Mantém a mesma assinatura/path do
 * helper uploadOcultoPlayFile, e usa a sessão atual para autenticação.
 *
 * Inclui:
 *  - Normalização do Content-Type (sem ";codecs=...") em todos os uploads.
 *  - Retry com backoff exponencial + jitter para falhas intermitentes
 *    (network errors, 408, 429, 5xx) — não retenta em 4xx ou abort do usuário.
 */
import { supabase } from '@/lib/supabaseExternal';
import { EXTERNAL_SUPABASE_URL, EXTERNAL_SUPABASE_ANON_KEY } from '@/lib/appConfig';

const BUCKET = 'oculto-play-media';

export interface ProgressUploadResult {
  publicUrl: string;
  path: string;
}

export class UploadAbortedError extends Error {
  constructor() { super('upload_aborted'); this.name = 'UploadAbortedError'; }
}

/**
 * Remove parâmetros (ex.: `;codecs=...`) e devolve um MIME base válido.
 * Quando o blob não traz `type`, infere a partir da pasta + extensão.
 */
export function normalizeUploadContentType(
  rawType: string | undefined,
  folder: 'video' | 'image' | 'audio',
  ext: string,
): string {
  const base = (rawType || '').split(';')[0].trim().toLowerCase();
  // Aceita apenas MIMEs base coerentes com a pasta. Qualquer coisa estranha
  // (ex.: 'application/octet-stream' num upload de vídeo) cai no fallback.
  const looksValid =
    (folder === 'video' && base.startsWith('video/')) ||
    (folder === 'audio' && base.startsWith('audio/')) ||
    (folder === 'image' && base.startsWith('image/'));
  if (looksValid) return base;

  const e = (ext || '').toLowerCase();
  if (folder === 'video') {
    if (e === 'webm') return 'video/webm';
    if (e === 'mov' || e === 'qt') return 'video/quicktime';
    if (e === 'm4v') return 'video/x-m4v';
    if (e === 'ogv' || e === 'ogg') return 'video/ogg';
    return 'video/mp4';
  }
  if (folder === 'audio') {
    if (e === 'wav') return 'audio/wav';
    if (e === 'webm') return 'audio/webm';
    if (e === 'ogg' || e === 'oga') return 'audio/ogg';
    if (e === 'aac') return 'audio/aac';
    if (e === 'm4a') return 'audio/mp4';
    return 'audio/mpeg';
  }
  if (e === 'png') return 'image/png';
  if (e === 'webp') return 'image/webp';
  if (e === 'gif') return 'image/gif';
  if (e === 'avif') return 'image/avif';
  return 'image/jpeg';
}

interface XhrAttemptResult {
  ok: boolean;
  status: number;
  responseText: string;
  aborted: boolean;
  networkError: boolean;
}

function isRetriableStatus(status: number): boolean {
  return status === 0 || status === 408 || status === 429 || (status >= 500 && status < 600);
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function uploadOcultoPlayFileProgress(
  file: Blob,
  userId: string,
  folder: 'video' | 'image' | 'audio',
  filename: string | undefined,
  onProgress?: (pct: number) => void,
  signal?: AbortSignal,
): Promise<ProgressUploadResult> {
  const ext = (filename || (file as File).name || 'bin').split('.').pop()?.toLowerCase() || 'bin';
  const path = `${userId}/${folder}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const url = `${EXTERNAL_SUPABASE_URL}/storage/v1/object/${BUCKET}/${encodeURI(path)}`;
  const contentType = normalizeUploadContentType(file.type, folder, ext);

  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token ?? EXTERNAL_SUPABASE_ANON_KEY;

  const MAX_ATTEMPTS = 4;
  const BASE_DELAY_MS = 800;
  const MAX_DELAY_MS = 6000;

  let lastErr: Error | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (signal?.aborted) throw new UploadAbortedError();

    const result: XhrAttemptResult = await new Promise((resolve) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', url, true);
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.setRequestHeader('apikey', EXTERNAL_SUPABASE_ANON_KEY);
      xhr.setRequestHeader('x-upsert', 'false');
      xhr.setRequestHeader('Content-Type', contentType);
      xhr.setRequestHeader('Cache-Control', '3600');

      const onAbort = () => { try { xhr.abort(); } catch { /* noop */ } };
      if (signal) signal.addEventListener('abort', onAbort, { once: true });

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) {
          const pct = Math.max(1, Math.min(99, Math.round((e.loaded / e.total) * 100)));
          onProgress(pct);
        }
      };
      xhr.onload = () => {
        signal?.removeEventListener('abort', onAbort);
        resolve({
          ok: xhr.status >= 200 && xhr.status < 300,
          status: xhr.status,
          responseText: xhr.responseText || '',
          aborted: false,
          networkError: false,
        });
      };
      xhr.onerror = () => {
        signal?.removeEventListener('abort', onAbort);
        resolve({ ok: false, status: 0, responseText: '', aborted: false, networkError: true });
      };
      xhr.onabort = () => {
        signal?.removeEventListener('abort', onAbort);
        resolve({ ok: false, status: 0, responseText: '', aborted: true, networkError: false });
      };
      xhr.send(file);
    });

    if (result.aborted) throw new UploadAbortedError();

    if (result.ok) {
      onProgress?.(100);
      const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
      return { publicUrl: data.publicUrl, path };
    }

    const retriable = result.networkError || isRetriableStatus(result.status);
    lastErr = new Error(
      result.networkError
        ? 'upload_network_error'
        : `upload_failed_${result.status}: ${result.responseText.slice(0, 200)}`,
    );

    if (!retriable || attempt === MAX_ATTEMPTS) break;

    // Reseta progresso visual ao retentar (mantém leve, sem ruído de UI).
    onProgress?.(1);
    const delay = Math.min(BASE_DELAY_MS * Math.pow(2, attempt - 1), MAX_DELAY_MS);
    const jitter = delay * 0.25 * Math.random();
    await sleep(delay + jitter);
  }

  throw lastErr ?? new Error('upload_failed_unknown');
}

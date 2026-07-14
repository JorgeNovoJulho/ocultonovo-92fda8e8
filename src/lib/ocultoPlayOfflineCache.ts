/**
 * Oculto Play — cache offline de áudios.
 *
 * Estratégia:
 *  - Baixa o arquivo de áudio uma única vez via fetch e armazena o Blob em
 *    IndexedDB, embaralhado por XOR com uma chave derivada do usuário logado.
 *  - O Blob é totalmente "scrambled" — não é um arquivo MP3/OGG válido fora
 *    do app; só o player do Oculto Play sabe decifrar em memória.
 *  - O áudio é reproduzido via ObjectURL temporário, revogado assim que o
 *    elemento é desmontado. Nunca expomos o blob para download direto.
 *  - Sem service-worker, sem rota de "exportar" — não há como o usuário
 *    extrair o arquivo do sistema sem ferramentas externas de devtools.
 *
 * IMPORTANTE: não é DRM real. É uma camada de obfuscação que torna o
 * arquivo inutilizável fora do contexto do Oculto Play do próprio usuário.
 */

const DB_NAME = 'oculto-play-offline';
const STORE = 'audios';
const DB_VERSION = 1;

interface OfflineRecord {
  id: string;
  user_id: string;
  scrambled: Uint8Array;
  mime: string;
  saved_at: number;
  duration_sec: number | null;
  title: string | null;
  thumb_url: string | null;
  bytes: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB indisponível'));
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function deriveKey(userId: string): Uint8Array {
  const salt = 'oculto-play::offline::v1';
  const src = `${salt}::${userId}`;
  // Hash determinístico simples (não-criptográfico) expandido para 64 bytes.
  const out = new Uint8Array(64);
  let h1 = 0x811c9dc5 >>> 0;
  let h2 = 0xdeadbeef >>> 0;
  for (let i = 0; i < src.length; i++) {
    const c = src.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
    h2 = Math.imul(h2 ^ c, 2246822519) >>> 0;
  }
  for (let i = 0; i < 64; i++) {
    h1 = Math.imul(h1 ^ (h1 >>> 13), 2654435761) >>> 0;
    h2 = Math.imul(h2 ^ (h2 >>> 11), 40503) >>> 0;
    out[i] = (h1 ^ h2) & 0xff;
  }
  return out;
}

function scramble(bytes: Uint8Array, key: Uint8Array): Uint8Array {
  const out = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    out[i] = bytes[i] ^ key[i % key.length];
  }
  return out;
}

const memCache = new Map<string, OfflineRecord>();

async function getStored(id: string): Promise<OfflineRecord | null> {
  if (memCache.has(id)) return memCache.get(id)!;
  try {
    const db = await openDb();
    return await new Promise<OfflineRecord | null>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(id);
      req.onsuccess = () => {
        const r = req.result as OfflineRecord | undefined;
        if (r) memCache.set(id, r);
        resolve(r ?? null);
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

export interface OfflineMeta {
  duration_sec?: number | null;
  title?: string | null;
  thumb_url?: string | null;
  mime?: string | null;
}

export async function isAudioOffline(id: string): Promise<boolean> {
  const r = await getStored(id);
  return !!r;
}

export async function listOfflineAudios(userId?: string | null): Promise<OfflineRecord[]> {
  try {
    const db = await openDb();
    const all = await new Promise<OfflineRecord[]>((resolve) => {
      const tx = db.transaction(STORE, 'readonly');
      const out: OfflineRecord[] = [];
      const req = tx.objectStore(STORE).openCursor();
      req.onsuccess = () => {
        const cur = req.result;
        if (cur) {
          out.push(cur.value as OfflineRecord);
          cur.continue();
        } else {
          resolve(out);
        }
      };
      req.onerror = () => resolve([]);
    });
    // Se o usuário atual está identificado, preferimos suas faixas; caso
    // contrário (offline/sem sessão) devolvemos tudo que está local — o
    // dispositivo é o escopo de privacidade aqui.
    if (!userId) return all;
    const mine = all.filter((r) => r.user_id === userId);
    return mine.length > 0 ? mine : all;
  } catch (err) {
    console.warn('[oculto-play offline] listOfflineAudios falhou', err);
    return [];
  }
}

async function downloadBytes(
  url: string,
  onProgress?: (loaded: number, total: number | null) => void,
): Promise<{ buf: Uint8Array; mime: string }> {
  // 1) Tenta fetch (streaming + progresso real)
  try {
    const resp = await fetch(url, { mode: 'cors', cache: 'no-store' });
    if (!resp.ok || !resp.body) throw new Error(`HTTP ${resp.status}`);
    const totalHeader = resp.headers.get('content-length');
    const total = totalHeader ? Number(totalHeader) : null;
    const reader = resp.body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        received += value.length;
        try { onProgress?.(received, total); } catch { /* noop */ }
      }
    }
    const buf = new Uint8Array(received);
    let off = 0;
    for (const c of chunks) { buf.set(c, off); off += c.length; }
    return { buf, mime: resp.headers.get('content-type') || 'audio/mpeg' };
  } catch (fetchErr) {
    // 2) Fallback XHR — alguns CDNs/hosts bloqueiam o fetch streaming mas
    // respondem a XHR com responseType=blob (sem range).
    return await new Promise((resolve, reject) => {
      try {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', url, true);
        xhr.responseType = 'blob';
        xhr.onprogress = (e) => {
          try { onProgress?.(e.loaded, e.lengthComputable ? e.total : null); } catch { /* noop */ }
        };
        xhr.onerror = () => reject(new Error('Sem acesso ao arquivo (CORS/rede)'));
        xhr.onload = async () => {
          if (xhr.status < 200 || xhr.status >= 300) {
            reject(new Error(`HTTP ${xhr.status}`));
            return;
          }
          try {
            const blob: Blob = xhr.response;
            const ab = await blob.arrayBuffer();
            resolve({ buf: new Uint8Array(ab), mime: blob.type || 'audio/mpeg' });
          } catch (e: any) {
            reject(new Error(e?.message || 'Falha ao ler resposta'));
          }
        };
        xhr.send();
      } catch (e: any) {
        reject(new Error(e?.message || (fetchErr as any)?.message || 'Erro de rede'));
      }
    });
  }
}

export async function saveAudioOffline(
  id: string,
  userId: string,
  audioUrl: string,
  meta: OfflineMeta = {},
  onProgress?: (loaded: number, total: number | null) => void,
): Promise<OfflineRecord> {
  if (!id || !userId || !audioUrl) throw new Error('Parâmetros inválidos');
  const existing = await getStored(id);
  if (existing && existing.user_id === userId) return existing;

  const { buf, mime } = await downloadBytes(audioUrl, onProgress);

  const key = deriveKey(userId);
  const scrambled = scramble(buf, key);

  const record: OfflineRecord = {
    id,
    user_id: userId,
    scrambled,
    mime: meta.mime || mime,
    saved_at: Date.now(),
    duration_sec: meta.duration_sec ?? null,
    title: meta.title ?? null,
    thumb_url: meta.thumb_url ?? null,
    bytes: scrambled.length,
  };

  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  memCache.set(id, record);
  return record;
}

export async function deleteAudioOffline(id: string): Promise<void> {
  memCache.delete(id);
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch { /* noop */ }
}

/**
 * Decifra em memória e devolve um ObjectURL temporário pronto para tocar.
 * O caller é responsável por revogar via `revokeOfflineUrl` quando desmontar.
 *
 * Não retorna o blob bruto — somente o URL "blob:" que só funciona enquanto
 * a aba do Oculto Play estiver aberta.
 */
export async function getOfflinePlaybackUrl(
  id: string,
  userId?: string | null,
): Promise<string | null> {
  const r = await getStored(id);
  if (!r) return null;
  // Decifra usando o user_id salvo no próprio registro (sempre o correto).
  const keyId = r.user_id || userId || '';
  try {
    const key = deriveKey(keyId);
    const clear = scramble(r.scrambled, key);
    const blob = new Blob([clear.buffer as ArrayBuffer], { type: r.mime });
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}

export function revokeOfflineUrl(url: string | null | undefined) {
  if (!url) return;
  try { URL.revokeObjectURL(url); } catch { /* noop */ }
}

// Eventos simples para que UIs distintas se mantenham sincronizadas.
type Listener = (id: string, state: 'saved' | 'deleted') => void;
const listeners = new Set<Listener>();
export function subscribeOfflineChanges(l: Listener) {
  listeners.add(l);
  return () => { listeners.delete(l); };
}
export function emitOfflineChange(id: string, state: 'saved' | 'deleted') {
  for (const l of Array.from(listeners)) {
    try { l(id, state); } catch { /* noop */ }
  }
}

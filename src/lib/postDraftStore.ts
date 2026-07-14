/**
 * Persistência temporária do rascunho de post via IndexedDB.
 *
 * Por quê: em mobile (especialmente iOS Safari) o sistema pode despejar
 * a aba enquanto o seletor nativo de arquivos está aberto. Quando o
 * usuário volta, a aba recarrega e tudo que estava em React state
 * (texto + arquivo recém-escolhido) seria perdido. Salvamos um snapshot
 * leve aqui e restauramos ao reabrir o CreatePostModal.
 *
 * Escopo: somente o fluxo de criação (não modo edição).
 * Limpeza: após postar com sucesso, ou ao fechar explicitamente o modal.
 */

const DB_NAME = "oculto_post_draft";
const STORE = "draft";
const KEY = "current";
const VERSION = 1;

export interface PostDraftSnapshot {
  /** Texto do textarea. */
  content: string;
  /** Arquivo escolhido aguardando edição (carrossel/vídeo NÃO entram aqui). */
  pendingImageFile?: {
    blob: Blob;
    name: string;
    type: string;
  } | null;
  /** Vídeo escolhido aguardando publicação (mantém o anexo após retorno do seletor no mobile). */
  pendingVideoFile?: {
    blob: Blob;
    name: string;
    type: string;
  } | null;
  /** O editor estava aberto quando o snapshot foi gravado? */
  editorOpen: boolean;
  /** Timestamp para auto-expirar drafts antigos. */
  savedAt: number;
}


/** Drafts mais velhos que isso são descartados (24h). */
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === "undefined") {
      resolve(null);
      return;
    }
    try {
      const req = indexedDB.open(DB_NAME, VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function savePostDraft(snapshot: PostDraftSnapshot): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(snapshot, KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
  db.close();
}

export async function loadPostDraft(): Promise<PostDraftSnapshot | null> {
  const db = await openDb();
  if (!db) return null;
  const result = await new Promise<PostDraftSnapshot | null>((resolve) => {
    try {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(KEY);
      req.onsuccess = () => {
        const v = req.result as PostDraftSnapshot | undefined;
        if (!v) return resolve(null);
        if (Date.now() - v.savedAt > MAX_AGE_MS) return resolve(null);
        resolve(v);
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  db.close();
  return result;
}

export async function clearPostDraft(): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
  db.close();
}

/** Converte File em snapshot serializável (mantém o Blob direto — IDB aceita). */
export function fileToDraftField(
  file: File | null,
  fallbackType = "image/jpeg",
): PostDraftSnapshot["pendingImageFile"] {
  if (!file) return null;
  return { blob: file, name: file.name, type: file.type || fallbackType };
}

/** Reconstrói File a partir do snapshot. */
export function draftFieldToFile(
  field: PostDraftSnapshot["pendingImageFile"]
): File | null {
  if (!field) return null;
  try {
    return new File([field.blob], field.name, { type: field.type });
  } catch {
    return null;
  }
}


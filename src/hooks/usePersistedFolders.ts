/**
 * Persists folder handles using IndexedDB (via the File System Access API).
 * FileSystemDirectoryHandle objects cannot be stored in localStorage (not serializable),
 * but they CAN be stored in IndexedDB.
 *
 * For fallback browsers (Brave/Firefox/Safari) that don't support the File System Access API,
 * we store folder names in localStorage so the user knows which folders to re-open.
 */

// IMPORTANT: this DB is shared with `useCollections.ts`. Both must agree on
// the version number, otherwise whichever module opens with the older
// number will get a VersionError once the DB has been upgraded by the
// other. We bump in lockstep with the highest version any caller needs
// (currently 2, set by useCollections). The `onupgradeneeded` handler is
// idempotent: it only creates stores that don't already exist, so it's
// safe to run from either module first.
const DB_NAME = 'videoplayer-db';
const DB_VERSION = 2;
const STORE_NAME = 'folder-handles';
const FALLBACK_KEY = 'videoplayer-fallback-folders';

// Open IndexedDB. The upgrade handler creates BOTH the folder-handles
// store (this module) and the collections store (useCollections.ts) — even
// though we only read folder-handles here. This guarantees that whichever
// hook initialises the DB first leaves it in a state both can read.
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('collections')) {
        db.createObjectStore('collections', { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export interface PersistedFolder {
  id: string;
  name: string;
  handle?: FileSystemDirectoryHandle;
}

// Save a folder handle to IndexedDB
export async function saveFolderHandle(id: string, name: string, handle: FileSystemDirectoryHandle): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put({ id, name, handle });
    await new Promise<void>((res, rej) => {
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
    db.close();
  } catch (e) {
    console.warn('Could not save folder handle to IndexedDB:', e);
  }
}

// Remove a folder handle from IndexedDB
export async function removeFolderHandle(id: string): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    await new Promise<void>((res, rej) => {
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
    db.close();
  } catch (e) {
    console.warn('Could not remove folder handle from IndexedDB:', e);
  }
}

// Load all saved folder handles from IndexedDB
export async function loadFolderHandles(): Promise<PersistedFolder[]> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const result = await new Promise<PersistedFolder[]>((res, rej) => {
      const req = tx.objectStore(STORE_NAME).getAll();
      req.onsuccess = () => res(req.result as PersistedFolder[]);
      req.onerror = () => rej(req.error);
    });
    db.close();
    return result;
  } catch (e) {
    console.warn('Could not load folder handles from IndexedDB:', e);
    return [];
  }
}

// --- Fallback: localStorage for browsers without File System Access API ---

export interface FallbackFolderInfo {
  id: string;
  name: string;
}

export function saveFallbackFolders(folders: FallbackFolderInfo[]): void {
  try {
    localStorage.setItem(FALLBACK_KEY, JSON.stringify(folders));
  } catch (e) {
    console.warn('Could not save to localStorage:', e);
  }
}

export function loadFallbackFolders(): FallbackFolderInfo[] {
  try {
    const raw = localStorage.getItem(FALLBACK_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as FallbackFolderInfo[];
  } catch {
    return [];
  }
}

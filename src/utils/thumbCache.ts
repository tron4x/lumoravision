/**
 * thumbCache.ts — IndexedDB-backed thumbnail cache
 *
 * Stores base64 JPEG thumbnails keyed by video ID so they survive page reloads.
 * Falls back to an in-memory Map if IndexedDB is unavailable.
 */

const DB_NAME = 'lumoravision-thumbs';
const STORE   = 'thumbnails';
const DB_VER  = 1;

// ── Singleton DB promise ──────────────────────────────────────────────────────
let _db: Promise<IDBDatabase> | null = null;

function getDB(): Promise<IDBDatabase> {
  if (_db) return _db;
  _db = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => { _db = null; reject(req.error); };
  });
  return _db;
}

// ── In-memory fallback ────────────────────────────────────────────────────────
const memCache = new Map<string, string>();

// ── Public API ────────────────────────────────────────────────────────────────

/** Read a thumbnail from IndexedDB (or memory fallback). Returns null on miss. */
export async function thumbGet(id: string): Promise<string | null> {
  const mem = memCache.get(id);
  if (mem) return mem;
  try {
    const db = await getDB();
    return await new Promise<string | null>((resolve, reject) => {
      const tx  = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(id);
      req.onsuccess = () => resolve((req.result as string) ?? null);
      req.onerror   = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

/** Write a thumbnail to IndexedDB (and memory). Fire-and-forget. */
export function thumbPut(id: string, dataUrl: string): void {
  memCache.set(id, dataUrl);
  getDB().then(db => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(dataUrl, id);
  }).catch(() => { /* ignore write errors */ });
}

/** Check memory cache synchronously (no DB round-trip). */
export function thumbGetSync(id: string): string | null {
  return memCache.get(id) ?? null;
}

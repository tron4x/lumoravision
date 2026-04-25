/**
 * Persists and restores video playback positions using IndexedDB.
 * Key: video file id  →  Value: last playback time in seconds
 */

const DB_NAME = 'lumoravision-positions';
const STORE_NAME = 'positions';
const DB_VERSION = 1;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function savePosition(videoId: string, time: number): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(time, videoId);
    await new Promise<void>((res, rej) => {
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
    db.close();
  } catch {
    // Silently ignore – position saving is best-effort
  }
}

export async function loadPosition(videoId: string): Promise<number> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const result = await new Promise<number>((resolve) => {
      const req = tx.objectStore(STORE_NAME).get(videoId);
      req.onsuccess = () => resolve(typeof req.result === 'number' ? req.result : 0);
      req.onerror = () => resolve(0);
    });
    db.close();
    return result;
  } catch {
    return 0;
  }
}

export async function clearPosition(videoId: string): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(videoId);
    db.close();
  } catch {
    // ignore
  }
}

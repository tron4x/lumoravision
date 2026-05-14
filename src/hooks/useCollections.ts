/**
 * useCollections – Virtual Collections / Smart Folders
 *
 * A Collection is a named group of video/image IDs that can span multiple
 * real folders. The collection metadata (name, color, icon, member IDs) is
 * persisted in IndexedDB so it survives page reloads.
 *
 * Collections never move or copy files – they only store references (IDs).
 */

import { useState, useCallback, useEffect } from 'react';

// ── IndexedDB helpers ─────────────────────────────────────────────────────────

// IMPORTANT: this DB is shared with `usePersistedFolders.ts`. Both must
// agree on the version number — see the comment in that file. The upgrade
// handler creates BOTH stores (this module's "collections" + the other's
// "folder-handles") so the DB ends up in the same state regardless of
// which hook initialises it first.
const DB_NAME = 'videoplayer-db';
const DB_VERSION = 2;
const STORE_NAME = 'collections';

function openCollectionsDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      // Idempotent: only create stores that don't already exist
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('folder-handles')) {
        db.createObjectStore('folder-handles', { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbGetAll(): Promise<Collection[]> {
  try {
    const db = await openCollectionsDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const result = await new Promise<Collection[]>((res, rej) => {
      const req = tx.objectStore(STORE_NAME).getAll();
      req.onsuccess = () => res(req.result as Collection[]);
      req.onerror = () => rej(req.error);
    });
    db.close();
    return result;
  } catch {
    return [];
  }
}

async function dbPut(col: Collection): Promise<void> {
  try {
    const db = await openCollectionsDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(col);
    await new Promise<void>((res, rej) => {
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
    db.close();
  } catch (e) {
    console.warn('useCollections: could not save to IndexedDB', e);
  }
}

async function dbDelete(id: string): Promise<void> {
  try {
    const db = await openCollectionsDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    await new Promise<void>((res, rej) => {
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
    db.close();
  } catch (e) {
    console.warn('useCollections: could not delete from IndexedDB', e);
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type CollectionColor =
  | 'cyan'
  | 'purple'
  | 'amber'
  | 'emerald'
  | 'rose'
  | 'blue'
  | 'orange';

export interface Collection {
  id: string;
  name: string;
  color: CollectionColor;
  /** File IDs (VideoFile.id or ImageFile.id) that belong to this collection */
  memberIds: string[];
  createdAt: number;
}

export interface UseCollectionsReturn {
  collections: Collection[];
  /** Create a new empty collection */
  createCollection: (name: string, color: CollectionColor) => Collection;
  /** Delete a collection (does NOT delete the actual files) */
  deleteCollection: (id: string) => void;
  /** Rename a collection */
  renameCollection: (id: string, name: string) => void;
  /** Change the accent color of a collection */
  recolorCollection: (id: string, color: CollectionColor) => void;
  /** Add a file ID to a collection */
  addToCollection: (collectionId: string, fileId: string) => void;
  /** Remove a file ID from a collection */
  removeFromCollection: (collectionId: string, fileId: string) => void;
  /** Toggle membership of a file in a collection */
  toggleInCollection: (collectionId: string, fileId: string) => void;
  /** True if a file is in a given collection */
  isInCollection: (collectionId: string, fileId: string) => boolean;
  /** All collection IDs a file belongs to */
  collectionsForFile: (fileId: string) => Collection[];
}

// ── Color helpers ─────────────────────────────────────────────────────────────

export const COLLECTION_COLORS: Record<CollectionColor, { bg: string; text: string; border: string; dot: string }> = {
  cyan:    { bg: 'bg-cyan-600/20',    text: 'text-cyan-400',    border: 'border-cyan-500/40',    dot: 'bg-cyan-500'    },
  purple:  { bg: 'bg-purple-600/20',  text: 'text-purple-400',  border: 'border-purple-500/40',  dot: 'bg-purple-500'  },
  amber:   { bg: 'bg-amber-600/20',   text: 'text-amber-400',   border: 'border-amber-500/40',   dot: 'bg-amber-500'   },
  emerald: { bg: 'bg-emerald-600/20', text: 'text-emerald-400', border: 'border-emerald-500/40', dot: 'bg-emerald-500' },
  rose:    { bg: 'bg-rose-600/20',    text: 'text-rose-400',    border: 'border-rose-500/40',    dot: 'bg-rose-500'    },
  blue:    { bg: 'bg-blue-600/20',    text: 'text-blue-400',    border: 'border-blue-500/40',    dot: 'bg-blue-500'    },
  orange:  { bg: 'bg-orange-600/20',  text: 'text-orange-400',  border: 'border-orange-500/40',  dot: 'bg-orange-500'  },
};

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useCollections(): UseCollectionsReturn {
  const [collections, setCollections] = useState<Collection[]>([]);

  // Load from IndexedDB on mount
  useEffect(() => {
    dbGetAll().then(saved => {
      if (saved.length > 0) {
        setCollections(saved.sort((a, b) => a.createdAt - b.createdAt));
      }
    });
  }, []);

  const persist = useCallback((col: Collection) => {
    dbPut(col);
  }, []);

  const createCollection = useCallback((name: string, color: CollectionColor): Collection => {
    const col: Collection = {
      id: `col-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: name.trim() || 'New Collection',
      color,
      memberIds: [],
      createdAt: Date.now(),
    };
    setCollections(prev => [...prev, col]);
    persist(col);
    return col;
  }, [persist]);

  const deleteCollection = useCallback((id: string) => {
    setCollections(prev => prev.filter(c => c.id !== id));
    dbDelete(id);
  }, []);

  const renameCollection = useCallback((id: string, name: string) => {
    setCollections(prev => prev.map(c => {
      if (c.id !== id) return c;
      const updated = { ...c, name: name.trim() || c.name };
      persist(updated);
      return updated;
    }));
  }, [persist]);

  const recolorCollection = useCallback((id: string, color: CollectionColor) => {
    setCollections(prev => prev.map(c => {
      if (c.id !== id) return c;
      const updated = { ...c, color };
      persist(updated);
      return updated;
    }));
  }, [persist]);

  const addToCollection = useCallback((collectionId: string, fileId: string) => {
    setCollections(prev => prev.map(c => {
      if (c.id !== collectionId) return c;
      if (c.memberIds.includes(fileId)) return c;
      const updated = { ...c, memberIds: [...c.memberIds, fileId] };
      persist(updated);
      return updated;
    }));
  }, [persist]);

  const removeFromCollection = useCallback((collectionId: string, fileId: string) => {
    setCollections(prev => prev.map(c => {
      if (c.id !== collectionId) return c;
      const updated = { ...c, memberIds: c.memberIds.filter(id => id !== fileId) };
      persist(updated);
      return updated;
    }));
  }, [persist]);

  const toggleInCollection = useCallback((collectionId: string, fileId: string) => {
    setCollections(prev => prev.map(c => {
      if (c.id !== collectionId) return c;
      const has = c.memberIds.includes(fileId);
      const updated = {
        ...c,
        memberIds: has
          ? c.memberIds.filter(id => id !== fileId)
          : [...c.memberIds, fileId],
      };
      persist(updated);
      return updated;
    }));
  }, [persist]);

  const isInCollection = useCallback((collectionId: string, fileId: string): boolean => {
    return collections.find(c => c.id === collectionId)?.memberIds.includes(fileId) ?? false;
  }, [collections]);

  const collectionsForFile = useCallback((fileId: string): Collection[] => {
    return collections.filter(c => c.memberIds.includes(fileId));
  }, [collections]);

  return {
    collections,
    createCollection,
    deleteCollection,
    renameCollection,
    recolorCollection,
    addToCollection,
    removeFromCollection,
    toggleInCollection,
    isInCollection,
    collectionsForFile,
  };
}

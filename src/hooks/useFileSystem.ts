import { useState, useCallback, useRef, useEffect } from 'react';
import type { VideoFile, ImageFile } from '../types/video';
import { SUPPORTED_VIDEO_FORMATS, SUPPORTED_IMAGE_FORMATS } from '../types/video';
import {
  saveFolderHandle,
  removeFolderHandle,
  loadFolderHandles,
  saveFallbackFolders,
  loadFallbackFolders,
} from './usePersistedFolders';

export interface VideoFolder {
  id: string;
  name: string;
  videos: VideoFile[];
  images: ImageFile[];
  needsReopen?: boolean;
}

interface UseFileSystemReturn {
  folders: VideoFolder[];
  activeFolderId: string | null;
  activeFolder: VideoFolder | null;
  isLoading: boolean;
  error: string | null;
  addFolder: () => Promise<void>;
  addFolderFallback: (files: FileList) => void;
  removeFolder: (id: string) => void;
  rescanFolder: (id: string) => Promise<void>;
  setActiveFolderId: (id: string) => void;
  supportsFileSystemAPI: boolean;
}

function isVideoFile(name: string): boolean {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return SUPPORTED_VIDEO_FORMATS.includes(ext);
}

function isImageFile(name: string): boolean {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return SUPPORTED_IMAGE_FORMATS.includes(ext);
}

function formatExtension(name: string): string {
  return name.split('.').pop()?.toLowerCase() ?? '';
}

function checkFileSystemAPISupport(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

function generateFolderId(): string {
  return `folder-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

async function readFilesFromHandle(
  dirHandle: FileSystemDirectoryHandle,
  folderId: string,
  urlsMap: Map<string, string[]>
): Promise<{ videos: VideoFile[]; images: ImageFile[] }> {
  const folderUrls: string[] = [];
  const foundVideos: VideoFile[] = [];
  const foundImages: ImageFile[] = [];

  async function readDir(handle: FileSystemDirectoryHandle, depth = 0) {
    if (depth > 3) return;
    for await (const [name, entry] of handle.entries()) {
      if (entry.kind === 'file') {
        if (isVideoFile(name)) {
          const fileHandle = entry as FileSystemFileHandle;
          const file = await fileHandle.getFile();
          const url = URL.createObjectURL(file);
          folderUrls.push(url);
          foundVideos.push({
            id: `${folderId}-v-${name}-${file.lastModified}-${file.size}`,
            name,
            extension: formatExtension(name),
            size: file.size,
            lastModified: file.lastModified,
            file,
            url,
          });
        } else if (isImageFile(name)) {
          const fileHandle = entry as FileSystemFileHandle;
          const file = await fileHandle.getFile();
          const url = URL.createObjectURL(file);
          folderUrls.push(url);
          foundImages.push({
            id: `${folderId}-i-${name}-${file.lastModified}-${file.size}`,
            name,
            extension: formatExtension(name),
            size: file.size,
            lastModified: file.lastModified,
            file,
            url,
          });
        }
      } else if (entry.kind === 'directory' && depth < 3) {
        await readDir(entry as FileSystemDirectoryHandle, depth + 1);
      }
    }
  }

  await readDir(dirHandle);
  foundVideos.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
  foundImages.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
  urlsMap.set(folderId, folderUrls);
  return { videos: foundVideos, images: foundImages };
}

export function useFileSystem(): UseFileSystemReturn {
  const [folders, setFolders] = useState<VideoFolder[]>([]);
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const urlsRef = useRef<Map<string, string[]>>(new Map());
  const supportsFileSystemAPI = checkFileSystemAPISupport();

  const activeFolder = folders.find(f => f.id === activeFolderId) ?? null;

  // On mount: restore saved folders
  useEffect(() => {
    async function restore() {
      if (supportsFileSystemAPI) {
        const saved = await loadFolderHandles();
        if (saved.length === 0) return;

        setIsLoading(true);
        const restoredFolders: VideoFolder[] = [];

        for (const entry of saved) {
          if (!entry.handle) continue;
          try {
            // Try to read directly – works in Chrome/Edge where permission persists.
            // In Brave, this may throw or return empty; we catch and mark needsReopen.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const h = entry.handle as any;
            // Request permission if needed (Chrome/Edge supports this silently)
            if (typeof h.requestPermission === 'function') {
              const perm = await h.requestPermission({ mode: 'read' });
              if (perm !== 'granted') {
                restoredFolders.push({ id: entry.id, name: entry.name, videos: [], images: [], needsReopen: true });
                continue;
              }
            }
            const { videos, images } = await readFilesFromHandle(entry.handle, entry.id, urlsRef.current);
            restoredFolders.push({ id: entry.id, name: entry.name, videos, images });
          } catch {
            restoredFolders.push({ id: entry.id, name: entry.name, videos: [], images: [], needsReopen: true });
          }
        }

        if (restoredFolders.length > 0) {
          setFolders(restoredFolders);
          const first = restoredFolders.find(f => f.videos.length > 0 || f.images.length > 0) ?? restoredFolders[0];
          setActiveFolderId(first.id);
        }
        setIsLoading(false);
      } else {
        const saved = loadFallbackFolders();
        if (saved.length === 0) return;
        const restoredFolders: VideoFolder[] = saved.map(f => ({
          id: f.id,
          name: f.name,
          videos: [],
          images: [],
          needsReopen: true,
        }));
        setFolders(restoredFolders);
        setActiveFolderId(restoredFolders[0].id);
      }
    }
    restore();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const removeFolder = useCallback((id: string) => {
    const urls = urlsRef.current.get(id) ?? [];
    urls.forEach(url => URL.revokeObjectURL(url));
    urlsRef.current.delete(id);

    setFolders(prev => {
      const next = prev.filter(f => f.id !== id);
      if (supportsFileSystemAPI) {
        removeFolderHandle(id);
      } else {
        saveFallbackFolders(next.map(f => ({ id: f.id, name: f.name })));
      }
      return next;
    });
    setActiveFolderId(prev => {
      if (prev !== id) return prev;
      const remaining = folders.filter(f => f.id !== id);
      return remaining.length > 0 ? remaining[remaining.length - 1].id : null;
    });
  }, [folders, supportsFileSystemAPI]);

  // Fallback for Brave/Firefox/Safari
  const addFolderFallback = useCallback((files: FileList) => {
    if (!files || files.length === 0) return;

    setIsLoading(true);
    setError(null);

    const firstFile = files[0];
    const pathParts = (firstFile.webkitRelativePath || firstFile.name).split('/');
    const folderName = pathParts.length > 1 ? pathParts[0] : 'Selected Files';

    // Reuse the existing folder ID if a folder with the same name already exists
    // (even if it was marked needsReopen). This keeps collection member IDs stable.
    const existingFolder = folders.find(f => f.name === folderName);
    const folderId = existingFolder ? existingFolder.id : generateFolderId();

    const folderUrls: string[] = [];
    const foundVideos: VideoFile[] = [];
    const foundImages: ImageFile[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (isVideoFile(file.name)) {
        const url = URL.createObjectURL(file);
        folderUrls.push(url);
        foundVideos.push({
          id: `${folderId}-v-${file.name}-${file.lastModified}-${file.size}`,
          name: file.name,
          extension: formatExtension(file.name),
          size: file.size,
          lastModified: file.lastModified,
          file,
          url,
        });
      } else if (isImageFile(file.name)) {
        const url = URL.createObjectURL(file);
        folderUrls.push(url);
        foundImages.push({
          id: `${folderId}-i-${file.name}-${file.lastModified}-${file.size}`,
          name: file.name,
          extension: formatExtension(file.name),
          size: file.size,
          lastModified: file.lastModified,
          file,
          url,
        });
      }
    }

    foundVideos.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
    foundImages.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
    urlsRef.current.set(folderId, folderUrls);

    const newFolder: VideoFolder = { id: folderId, name: folderName, videos: foundVideos, images: foundImages };

    setFolders(prev => {
      const existing = prev.findIndex(f => f.name === folderName);
      let next: VideoFolder[];
      if (existing >= 0) {
        next = [...prev];
        next[existing] = newFolder;
      } else {
        next = [...prev, newFolder];
      }
      saveFallbackFolders(next.map(f => ({ id: f.id, name: f.name })));
      return next;
    });
    setActiveFolderId(folderId);
    setIsLoading(false);

    if (foundVideos.length === 0 && foundImages.length === 0) {
      setError(`No videos or images found in "${folderName}".`);
    } else {
      setError(null);
    }
  }, [folders]);

  // Rescan an existing folder by id – re-reads files from the stored handle
  const rescanFolder = useCallback(async (id: string) => {
    if (!supportsFileSystemAPI) return;
    const saved = await loadFolderHandles();
    const entry = saved.find(s => s.id === id);
    if (!entry?.handle) return;

    setIsLoading(true);
    setError(null);
    try {
      // Revoke old object URLs to avoid memory leaks
      const oldUrls = urlsRef.current.get(id) ?? [];
      oldUrls.forEach(url => URL.revokeObjectURL(url));

      const { videos, images } = await readFilesFromHandle(entry.handle, id, urlsRef.current);
      setFolders(prev => prev.map(f => f.id === id ? { ...f, videos, images, needsReopen: false } : f));
      setError(null);
    } catch (err) {
      console.error('rescanFolder error:', err);
      setError('Could not rescan folder.');
    } finally {
      setIsLoading(false);
    }
  }, [supportsFileSystemAPI]);

  // Modern File System Access API (Chrome, Edge)
  const addFolder = useCallback(async () => {
    if (!supportsFileSystemAPI) return;

    try {
      setIsLoading(true);
      setError(null);

      const dirHandle = await (window as Window & typeof globalThis & {
        showDirectoryPicker: (options?: { mode?: string }) => Promise<FileSystemDirectoryHandle>;
      }).showDirectoryPicker({ mode: 'read' });

      // Look up the stable ID from IndexedDB first (most reliable source).
      // This ensures collection member IDs remain valid after reload + reopen.
      const savedHandles = await loadFolderHandles();
      const savedEntry = savedHandles.find(s => s.name === dirHandle.name);

      // Also check current state as fallback
      const folderId = savedEntry?.id
        ?? folders.find(f => f.name === dirHandle.name)?.id
        ?? generateFolderId();

      // Revoke old URLs if we're replacing an existing folder
      const oldUrls = urlsRef.current.get(folderId) ?? [];
      oldUrls.forEach(url => URL.revokeObjectURL(url));

      const { videos, images } = await readFilesFromHandle(dirHandle, folderId, urlsRef.current);

      // Save updated handle (same ID, new handle object)
      await saveFolderHandle(folderId, dirHandle.name, dirHandle);

      const newFolder: VideoFolder = { id: folderId, name: dirHandle.name, videos, images };

      setFolders(prev => {
        const idx = prev.findIndex(f => f.id === folderId || f.name === dirHandle.name);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = newFolder;
          return next;
        }
        return [...prev, newFolder];
      });
      setActiveFolderId(folderId);

      if (videos.length === 0 && images.length === 0) {
        setError(`No videos or images found in "${dirHandle.name}".`);
      } else {
        setError(null);
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setError('Error reading folder.');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, [supportsFileSystemAPI, folders]);

  return {
    folders,
    activeFolderId,
    activeFolder,
    isLoading,
    error,
    addFolder,
    addFolderFallback,
    removeFolder,
    rescanFolder,
    setActiveFolderId,
    supportsFileSystemAPI,
  };
}

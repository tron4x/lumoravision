import { useState, useMemo, useCallback, useRef, useEffect, lazy, Suspense } from 'react';
import { useFileSystem } from './hooks/useFileSystem';
import { useSort } from './hooks/useSort';
import { useCollections } from './hooks/useCollections';
import type { CollectionColor } from './hooks/useCollections';
import { VideoCard } from './components/VideoCard';
import { VideoListRow } from './components/VideoListRow';
import { ImageCard } from './components/ImageCard';
import { SplashScreen } from './components/SplashScreen';
import { Toolbar } from './components/Toolbar';
import { Sidebar, NewCollectionDialog } from './components/Sidebar';
import { PlaylistItem } from './components/PlaylistItem';
import { formatFileSize } from './utils/format';
import type { VideoFile, ImageFile, ViewMode } from './types/video';

// ── Lazy-loaded heavy modal-only components ──────────────────────────────
// These only render in response to a user action (open a video, open the
// editor, etc.), so we ship them as separate chunks that download on demand
// instead of bloating the initial bundle. Each `lazy()` call creates its
// own JS chunk. Components that are exported as named exports are wrapped
// in tiny adapters because React.lazy expects a module with a `default`.
const VideoPlayer       = lazy(() => import('./components/VideoPlayer').then(m => ({ default: m.VideoPlayer })));
const ImageViewer       = lazy(() => import('./components/ImageViewer').then(m => ({ default: m.ImageViewer })));
const InfoModal         = lazy(() => import('./components/InfoModal').then(m => ({ default: m.InfoModal })));
const ShortcutsModal    = lazy(() => import('./components/ShortcutsModal').then(m => ({ default: m.ShortcutsModal })));
const CollectionModal   = lazy(() => import('./components/CollectionModal').then(m => ({ default: m.CollectionModal })));
const Storyboard        = lazy(() => import('./components/Storyboard').then(m => ({ default: m.Storyboard })));
const SplitscreenPlayer = lazy(() => import('./components/SplitscreenPlayer').then(m => ({ default: m.SplitscreenPlayer })));
const DirectorMode      = lazy(() => import('./components/DirectorMode').then(m => ({ default: m.DirectorMode })));
const Slideshow         = lazy(() => import('./components/Slideshow').then(m => ({ default: m.Slideshow })));
const EasterEgg         = lazy(() => import('./components/EasterEgg').then(m => ({ default: m.EasterEgg })));
const LockScreen        = lazy(() => import('./components/LockScreen').then(m => ({ default: m.LockScreen })));

export default function App() {
  const [splashDone, setSplashDone] = useState(false);
  const {
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
  } = useFileSystem();

  // ── Collections ────────────────────────────────────────────────────────────
  const {
    collections,
    createCollection,
    deleteCollection,
    renameCollection,
    recolorCollection,
    toggleInCollection,
  } = useCollections();

  const [activeCollectionId, setActiveCollectionId] = useState<string | null>(null);
  const [showNewCollectionDialog, setShowNewCollectionDialog] = useState(false);
  const [editingCollectionId, setEditingCollectionId] = useState<string | null>(null);

  // All videos/images across ALL loaded folders (for collection management)
  const allVideos = useMemo(() =>
    folders.flatMap(f => f.videos),
    [folders]
  );
  const allImages = useMemo(() =>
    folders.flatMap(f => f.images),
    [folders]
  );

  // Active collection object
  const activeCollection = useMemo(() =>
    collections.find(c => c.id === activeCollectionId) ?? null,
    [collections, activeCollectionId]
  );

  // Editing collection object
  const editingCollection = useMemo(() =>
    collections.find(c => c.id === editingCollectionId) ?? null,
    [collections, editingCollectionId]
  );

  // ── Folder-based content ───────────────────────────────────────────────────
  const videos = useMemo(() => activeFolder?.videos ?? [], [activeFolder]);
  const images = useMemo(() => activeFolder?.images ?? [], [activeFolder]);
  const { sortedVideos, sortedImages, sortConfig, toggleSort } = useSort(videos, images);

  const [activeVideo, setActiveVideo] = useState<VideoFile | null>(null);
  const [activeImage, setActiveImage] = useState<ImageFile | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [durations, setDurations] = useState<Record<string, number>>({});
  const [viewMode, setViewMode] = useState<ViewMode>('grid');

  // Playlist state
  const [playlist, setPlaylist] = useState<VideoFile[]>([]);
  const [playlistOpen, setPlaylistOpen] = useState(false);

  // Storyboard & Splitscreen & Director & Slideshow state
  const [storyboardVideo, setStoryboardVideo] = useState<VideoFile | null>(null);
  const [splitscreenLeft, setSplitscreenLeft] = useState<VideoFile | null>(null);
  const [splitscreenRight, setSplitscreenRight] = useState<VideoFile | null>(null);
  const [directorOpen, setDirectorOpen] = useState(false);
  const [slideshowStartIndex, setSlideshowStartIndex] = useState<number | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Shortcuts modal
  const [showShortcuts, setShowShortcuts] = useState(false);

  // Easter Egg
  const [showEasterEgg, setShowEasterEgg] = useState(false);
  const secretRef = useRef('');
  const SECRET = 'tron4x';

  // Lock Screen
  const [isLocked, setIsLocked] = useState(() => {
    // Check if permanently locked on startup
    return localStorage.getItem('lumoravision_permanent_lock') === 'true';
  });
  const lockCodeRef = useRef('');
  const LOCK_CODE = 'lockme';

  // Global keyboard shortcut: ? opens shortcuts modal + secret word + lock code
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      // Don't fire when typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === '?') setShowShortcuts(prev => !prev);

      // Secret word detection for Easter Egg
      if (e.key.length === 1) {
        secretRef.current = (secretRef.current + e.key.toLowerCase()).slice(-SECRET.length);
        if (secretRef.current === SECRET) {
          secretRef.current = '';
          setShowEasterEgg(true);
        }

        // Lock code detection
        lockCodeRef.current = (lockCodeRef.current + e.key.toLowerCase()).slice(-LOCK_CODE.length);
        if (lockCodeRef.current === LOCK_CODE) {
          lockCodeRef.current = '';
          setIsLocked(true);
        }
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  // Drag & drop folder support
  const [isDragging, setIsDragging] = useState(false);
  const dragCounterRef = useRef(0);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current++;
    if (e.dataTransfer.types.includes('Files')) setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current = 0;
    setIsDragging(false);

    const items = Array.from(e.dataTransfer.items);

    // Collect all files recursively from the dropped items
    const files: File[] = [];
    const collectFiles = async (entry: FileSystemEntry): Promise<void> => {
      if (entry.isFile) {
        await new Promise<void>(resolve => {
          (entry as FileSystemFileEntry).file(f => { files.push(f); resolve(); });
        });
      } else if (entry.isDirectory) {
        const reader = (entry as FileSystemDirectoryEntry).createReader();
        await new Promise<void>(resolve => {
          reader.readEntries(async entries => {
            for (const ent of entries) await collectFiles(ent);
            resolve();
          });
        });
      }
    };

    for (const item of items) {
      if (item.kind === 'file') {
        const entry = item.webkitGetAsEntry();
        if (entry) await collectFiles(entry);
      }
    }

    if (files.length > 0) {
      const dt = new DataTransfer();
      files.forEach(f => dt.items.add(f));
      addFolderFallback(dt.files);
    }
  }, [addFolderFallback]);

  // ── Collection selection ───────────────────────────────────────────────────
  const handleSelectCollection = useCallback((id: string) => {
    setActiveCollectionId(id);
    setActiveFolderId(null as unknown as string); // deselect folder
    setSearchQuery('');
    setActiveVideo(null);
    setActiveImage(null);
  }, [setActiveFolderId]);

  const handleSelectFolder = useCallback((id: string) => {
    setActiveFolderId(id);
    setActiveCollectionId(null);
    setSearchQuery('');
    setActiveVideo(null);
    setActiveImage(null);
  }, [setActiveFolderId]);

  const handleCreateCollection = useCallback((name: string, color: CollectionColor) => {
    createCollection(name, color);
    setShowNewCollectionDialog(false);
  }, [createCollection]);

  const videosWithDuration = useMemo(() =>
    sortedVideos.map(v => ({ ...v, duration: durations[v.id] ?? v.duration })),
    [sortedVideos, durations]
  );

  // ── Filtered content: folder view OR collection view ───────────────────────
  const collectionMemberSet = useMemo(() =>
    activeCollection ? new Set(activeCollection.memberIds) : null,
    [activeCollection]
  );

  const filteredVideos = useMemo(() => {
    // Collection view: show matching videos from ALL folders
    if (collectionMemberSet) {
      const q = searchQuery.toLowerCase();
      return allVideos
        .filter(v => collectionMemberSet.has(v.id))
        .filter(v => !q || v.name.toLowerCase().includes(q))
        .map(v => ({ ...v, duration: durations[v.id] ?? v.duration }));
    }
    // Folder view
    if (!searchQuery.trim()) return videosWithDuration;
    const q = searchQuery.toLowerCase();
    return videosWithDuration.filter(v => v.name.toLowerCase().includes(q));
  }, [collectionMemberSet, allVideos, videosWithDuration, searchQuery, durations]);

  const filteredImages = useMemo(() => {
    // Collection view
    if (collectionMemberSet) {
      const q = searchQuery.toLowerCase();
      return allImages
        .filter(img => collectionMemberSet.has(img.id))
        .filter(img => !q || img.name.toLowerCase().includes(q));
    }
    // Folder view
    if (!searchQuery.trim()) return sortedImages;
    const q = searchQuery.toLowerCase();
    return sortedImages.filter(img => img.name.toLowerCase().includes(q));
  }, [collectionMemberSet, allImages, sortedImages, searchQuery]);

  const handleDurationLoaded = useCallback((id: string, duration: number) => {
    setDurations(prev => {
      if (prev[id] === duration) return prev;
      return { ...prev, [id]: duration };
    });
  }, []);

  // Playlist helpers
  const addToPlaylist = useCallback((video: VideoFile) => {
    setPlaylist(prev => prev.find(v => v.id === video.id) ? prev : [...prev, video]);
  }, []);

  const removeFromPlaylist = useCallback((id: string) => {
    setPlaylist(prev => prev.filter(v => v.id !== id));
  }, []);

  const clearPlaylist = useCallback(() => setPlaylist([]), []);

  const playPlaylist = useCallback(() => {
    if (playlist.length > 0) setActiveVideo(playlist[0]);
  }, [playlist]);

  const playQueue = useMemo(() =>
    playlist.length > 0 ? playlist : filteredVideos,
    [playlist, filteredVideos]
  );

  const activeIndex = activeVideo
    ? playQueue.findIndex(v => v.id === activeVideo.id)
    : -1;

  const handlePrev = useCallback(() => {
    if (activeIndex > 0) setActiveVideo(playQueue[activeIndex - 1]);
  }, [activeIndex, playQueue]);

  const handleNext = useCallback(() => {
    if (activeIndex < playQueue.length - 1) setActiveVideo(playQueue[activeIndex + 1]);
  }, [activeIndex, playQueue]);

  const handleClose = useCallback(() => setActiveVideo(null), []);

  const handleAddFolder = useCallback(() => {
    if (supportsFileSystemAPI) addFolder();
    else fileInputRef.current?.click();
  }, [supportsFileSystemAPI, addFolder]);

  const handleReopenFolder = useCallback(() => {
    if (supportsFileSystemAPI) addFolder();
    else fileInputRef.current?.click();
  }, [supportsFileSystemAPI, addFolder]);

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) addFolderFallback(files);
    e.target.value = '';
  }, [addFolderFallback]);

  const hasContent = filteredVideos.length > 0 || filteredImages.length > 0;
  const hasAnyContent = videos.length > 0 || images.length > 0;

  // True when at least one folder needs to be reopened (after page reload in fallback mode)
  const hasNeedsReopenFolders = folders.some(f => f.needsReopen);
  // True when collections have members but no files are loaded yet
  // This covers both: folders present but need reopen, AND no folders loaded at all (fallback mode after reload)
  const collectionsNeedFolders = collections.some(c => c.memberIds.length > 0)
    && allVideos.length === 0
    && allImages.length === 0
    && (hasNeedsReopenFolders || folders.length === 0);

  return (
    <div
      className={`flex flex-col h-screen bg-[#0a0a0f] text-slate-200 overflow-hidden relative ${isDragging ? 'ring-2 ring-inset ring-cyan-500' : ''}`}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <div className="ambient-orb-1" />
      <div className="ambient-orb-2" />

      {/* Drag & drop overlay */}
      {isDragging && (
        <div className="absolute inset-0 z-[300] flex items-center justify-center bg-cyan-950/80 backdrop-blur-sm pointer-events-none">
          <div className="flex flex-col items-center gap-4 text-cyan-300">
            <svg className="w-16 h-16" fill="currentColor" viewBox="0 0 24 24">
              <path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>
            </svg>
            <p className="text-xl font-semibold">Drop folder here</p>
            <p className="text-sm text-cyan-400/70">Videos and images will be loaded automatically</p>
          </div>
        </div>
      )}

      {!splashDone && <SplashScreen onDone={() => setSplashDone(true)} />}

      {/* Hidden fallback file input for Brave/Firefox */}
      <input
        ref={fileInputRef}
        type="file"
        // @ts-expect-error - webkitdirectory is not in standard TS types
        webkitdirectory=""
        multiple
        accept="video/*,image/*,.mp4,.mov,.webm,.mkv,.avi,.ogv,.ogg,.m4v,.wmv,.flv,.3gp,.ts,.mts,.m2ts,.jpg,.jpeg,.png,.gif,.webp,.avif,.bmp,.tiff,.tif,.svg,.heic,.heif"
        onChange={handleFileInputChange}
        className="hidden"
        aria-hidden="true"
      />

      <Toolbar
        sortConfig={sortConfig}
        onSort={toggleSort}
        videoCount={filteredVideos.length}
        folderName={activeCollection ? null : (activeFolder?.name ?? null)}
        collectionName={activeCollection?.name ?? null}
        collectionColor={activeCollection?.color ?? null}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onRescan={activeFolderId && !activeCollection
          ? supportsFileSystemAPI
            ? () => rescanFolder(activeFolderId)
            : () => fileInputRef.current?.click()
          : undefined}
        onInfo={() => setShowInfo(true)}
        onDirector={filteredVideos.length > 0 ? () => setDirectorOpen(true) : undefined}
      />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          folders={folders}
          activeFolderId={activeFolderId}
          onSelectFolder={handleSelectFolder}
          onRemoveFolder={removeFolder}
          onAddFolder={handleAddFolder}
          onReopenFolder={handleReopenFolder}
          isLoading={isLoading}
          collections={collections}
          activeCollectionId={activeCollectionId}
          onSelectCollection={handleSelectCollection}
          onCreateCollection={() => setShowNewCollectionDialog(true)}
          onOpenCollectionModal={setEditingCollectionId}
        />

        <main className="flex-1 overflow-y-auto">

          {/* Loading */}
          {isLoading && (
            <div className="flex flex-col items-center justify-center h-full gap-4">
              <div className="w-10 h-10 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-slate-400 text-sm">Reading folder...</p>
            </div>
          )}

          {/* Error */}
          {!isLoading && error && (
            <div className="flex flex-col items-center justify-center h-full gap-4 px-8">
              <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center">
                <svg className="w-6 h-6 text-red-400" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
                </svg>
              </div>
              <p className="text-slate-300 text-sm text-center">{error}</p>
              <button onClick={handleAddFolder} className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-sm rounded-lg transition-colors">
                Choose another folder
              </button>
            </div>
          )}

          {/* Empty state – no folders (only when no collection is active) */}
          {!isLoading && !error && folders.length === 0 && !activeCollection && (
            <div className="flex flex-col items-center justify-center h-full gap-6 px-8">
              <div className="relative">
                <div className="w-24 h-24 rounded-2xl bg-slate-800/60 flex items-center justify-center border border-slate-700/50">
                  <svg className="w-12 h-12 text-slate-600" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z" />
                  </svg>
                </div>
                <div className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-cyan-600 flex items-center justify-center">
                  <svg className="w-3.5 h-3.5 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                </div>
              </div>
              <div className="text-center">
                <h2 className="text-xl font-semibold text-slate-200 mb-2">Welcome to Lumoravision</h2>
                <p className="text-slate-500 text-sm max-w-sm">Add folders with videos and images. Both are shown together.</p>
              </div>
              <button onClick={handleAddFolder} className="flex items-center gap-2 px-5 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white font-medium rounded-xl transition-all hover:shadow-lg hover:shadow-cyan-500/25">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" /></svg>
                Open First Folder
              </button>
            </div>
          )}

          {/* Empty state – folder has nothing */}
          {!isLoading && !error && folders.length > 0 && activeFolder && !hasAnyContent && (
            <div className="flex flex-col items-center justify-center h-full gap-3">
              <svg className="w-10 h-10 text-slate-700" fill="currentColor" viewBox="0 0 24 24">
                <path d="M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z" />
              </svg>
              <p className="text-slate-500 text-sm">No videos or images found in this folder</p>
            </div>
          )}

          {/* No folder selected (only when no collection is active either) */}
          {!isLoading && !error && folders.length > 0 && !activeFolder && !activeCollection && (
            <div className="flex flex-col items-center justify-center h-full gap-3">
              <svg className="w-10 h-10 text-slate-700" fill="currentColor" viewBox="0 0 24 24">
                <path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" />
              </svg>
              <p className="text-slate-500 text-sm">Select a folder from the sidebar</p>
            </div>
          )}

          {/* Collection active but empty */}
          {!isLoading && !error && activeCollection && filteredVideos.length === 0 && filteredImages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full gap-4 px-8">

              {/* Special case: folders need to be reopened after page reload */}
              {collectionsNeedFolders ? (
                <>
                  <div className="w-16 h-16 rounded-2xl bg-amber-900/30 flex items-center justify-center border border-amber-700/40">
                    <svg className="w-8 h-8 text-amber-400" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
                    </svg>
                  </div>
                  <div className="text-center max-w-sm">
                    <p className="text-amber-300 font-semibold mb-1">Folders need to be reopened</p>
                    <p className="text-slate-500 text-sm leading-relaxed">
                      After a page reload, your browser requires you to reopen the folders so the files can be accessed again.
                      Your collection assignments are still saved.
                    </p>
                  </div>
                  <div className="flex flex-col gap-2 w-full max-w-xs">
                    {folders.filter(f => f.needsReopen).length > 0
                      ? folders.filter(f => f.needsReopen).map(f => (
                          <button
                            key={f.id}
                            onClick={handleReopenFolder}
                            className="flex items-center gap-3 px-4 py-2.5 bg-amber-600/15 hover:bg-amber-600/30 text-amber-300 border border-amber-500/30 rounded-xl text-sm font-medium transition-colors"
                          >
                            <svg className="w-4 h-4 flex-none" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>
                            </svg>
                            <span className="truncate">↺ Reopen "{f.name}"</span>
                          </button>
                        ))
                      : (
                          <button
                            onClick={handleAddFolder}
                            className="flex items-center gap-3 px-4 py-2.5 bg-amber-600/15 hover:bg-amber-600/30 text-amber-300 border border-amber-500/30 rounded-xl text-sm font-medium transition-colors"
                          >
                            <svg className="w-4 h-4 flex-none" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>
                            </svg>
                            <span>Open folder with your files</span>
                          </button>
                        )
                    }
                  </div>
                </>
              ) : (
                <>
                  <div className="w-16 h-16 rounded-2xl bg-slate-800/60 flex items-center justify-center border border-slate-700/50">
                    <svg className="w-8 h-8 text-slate-600" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M20 6h-2.18c.07-.44.18-.88.18-1.36C18 2.53 15.47 0 12.36 0c-1.73 0-3.24.87-4.19 2.19L7 3 5.82 2.19C4.87.87 3.36 0 1.64 0H0v2h1.64c.9 0 1.72.45 2.22 1.14L5 4.5 3.86 5.86C3.36 6.55 2.54 7 1.64 7H0v2h1.64c1.73 0 3.24-.87 4.19-2.19L7 5.5l1.17 1.31C9.12 8.13 10.63 9 12.36 9H20c1.1 0 2 .9 2 2v9c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2v-5H0v5c0 2.21 1.79 4 4 4h16c2.21 0 4-1.79 4-4V11c0-2.21-1.79-4-4-4z"/>
                    </svg>
                  </div>
                  <div className="text-center">
                    <p className="text-slate-300 font-medium mb-1">Collection is empty</p>
                    <p className="text-slate-500 text-sm">Open the collection editor to add videos and images.</p>
                  </div>
                  <button
                    onClick={() => setEditingCollectionId(activeCollection.id)}
                    className="flex items-center gap-2 px-4 py-2 bg-purple-600/20 hover:bg-purple-600/40 text-purple-300 border border-purple-500/30 rounded-xl text-sm font-medium transition-colors"
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
                    </svg>
                    Open Collection Editor
                  </button>
                </>
              )}
            </div>
          )}

          {/* No search results */}
          {!isLoading && !error && hasAnyContent && !hasContent && (
            <div className="flex flex-col items-center justify-center h-full gap-3">
              <svg className="w-10 h-10 text-slate-700" fill="currentColor" viewBox="0 0 24 24">
                <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
              </svg>
              <p className="text-slate-500 text-sm">Nothing found for &ldquo;{searchQuery}&rdquo;</p>
              <button onClick={() => setSearchQuery('')} className="text-cyan-400 text-sm hover:text-cyan-300">Clear search</button>
            </div>
          )}

          {/* Content */}
          {!isLoading && hasContent && (
            <div className="p-5 space-y-8">

              {/* Videos */}
              {filteredVideos.length > 0 && (
                <section>
                  <div className="flex items-center gap-2 mb-4">
                    <svg className="w-4 h-4 text-cyan-400" fill="currentColor" viewBox="0 0 24 24"><path d="M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z" /></svg>
                    <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Videos</h2>
                    <span className="text-xs text-slate-600 bg-slate-800 px-2 py-0.5 rounded-full">{filteredVideos.length}</span>
                    <button
                      onClick={() => setPlaylistOpen(o => !o)}
                      className={`ml-auto flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-colors ${playlistOpen ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-cyan-400'}`}
                    >
                      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z"/>
                      </svg>
                      Playlist {playlist.length > 0 && `(${playlist.length})`}
                    </button>
                  </div>

                  {viewMode === 'grid' && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-4">
                      {filteredVideos.map(video => (
                        <div key={video.id} className="stagger-item">
                          <VideoCard
                            video={video}
                            onPlay={setActiveVideo}
                            onDurationLoaded={handleDurationLoaded}
                            onAddToPlaylist={addToPlaylist}
                            inPlaylist={playlist.some(v => v.id === video.id)}
                            onStoryboard={setStoryboardVideo}
                            onSplitscreen={setSplitscreenLeft}
                          />
                        </div>
                      ))}
                    </div>
                  )}

                  {viewMode === 'list' && (
                    <div className="flex flex-col gap-1">
                      {filteredVideos.map((video, i) => (
                        <VideoListRow
                          key={video.id}
                          video={video}
                          index={i}
                          duration={durations[video.id]}
                          inPlaylist={playlist.some(v => v.id === video.id)}
                          isActive={activeVideo?.id === video.id}
                          onPlay={setActiveVideo}
                          onAddToPlaylist={addToPlaylist}
                        />
                      ))}
                    </div>
                  )}
                </section>
              )}

              {filteredVideos.length > 0 && filteredImages.length > 0 && (
                <div className="border-t border-slate-800" />
              )}

              {/* Images */}
              {filteredImages.length > 0 && (
                <section>
                  <div className="flex items-center gap-2 mb-4">
                    <svg className="w-4 h-4 text-emerald-400" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/>
                    </svg>
                    <h2 className="text-sm font-semibold text-emerald-400 uppercase tracking-wider">Images</h2>
                    <span className="text-xs text-slate-600 bg-slate-800 px-2 py-0.5 rounded-full">{filteredImages.length}</span>
                    <button
                      onClick={() => setSlideshowStartIndex(0)}
                      className="ml-auto flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium bg-slate-800 text-slate-400 hover:text-emerald-400 transition-colors"
                      title="Start Slideshow"
                    >
                      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 3c1.93 0 3.5 1.57 3.5 3.5S13.93 13 12 13s-3.5-1.57-3.5-3.5S10.07 6 12 6zm7 13H5v-.23c0-.62.28-1.2.76-1.58C7.47 15.82 9.64 15 12 15s4.53.82 6.24 2.19c.48.38.76.97.76 1.58V19z"/>
                      </svg>
                      Slideshow
                    </button>
                  </div>
                  {viewMode === 'grid' ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-4">
                      {filteredImages.map(image => (
                        <div key={image.id} className="stagger-item">
                          <ImageCard image={image} onOpen={setActiveImage} />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col gap-1">
                      {filteredImages.map((image, i) => (
                        <div
                          key={image.id}
                          className="stagger-item group flex items-center gap-3 px-3 py-2 rounded-xl bg-slate-900/60 hover:bg-slate-800/80 border border-transparent hover:border-emerald-700/40 cursor-pointer transition-all"
                          onClick={() => setActiveImage(image)}
                        >
                          <span className="text-slate-600 text-xs w-5 text-right flex-none select-none">{i + 1}</span>
                          <div className="relative w-20 h-12 rounded-lg overflow-hidden flex-none bg-slate-800">
                            <img
                              src={image.url}
                              alt={image.name}
                              className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                              loading="lazy"
                              draggable={false}
                            />
                            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                              <div className="w-7 h-7 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center">
                                <svg className="w-3.5 h-3.5 text-white" fill="currentColor" viewBox="0 0 24 24">
                                  <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
                                </svg>
                              </div>
                            </div>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-slate-200 text-sm truncate group-hover:text-white">{image.name.replace(/\.[^/.]+$/, '')}</p>
                            <p className="text-slate-600 text-xs mt-0.5">{image.extension.toUpperCase()} · {formatFileSize(image.size)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              )}
            </div>
          )}
        </main>

        {/* Playlist Panel */}
        {playlistOpen && (
          <aside className="w-72 flex-none flex flex-col border-l border-slate-800/60 bg-slate-950/80 backdrop-blur-xl">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800/60">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-cyan-400" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z"/>
                </svg>
                <span className="text-sm font-semibold text-slate-200">Playlist</span>
                <span className="text-xs text-slate-600 bg-slate-800 px-1.5 py-0.5 rounded-full">{playlist.length}</span>
              </div>
              <div className="flex items-center gap-1">
                {playlist.length > 0 && (
                  <>
                    <button onClick={playPlaylist} className="flex items-center gap-1 px-2.5 py-1 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium rounded-lg transition-colors">
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                      Play
                    </button>
                    <button onClick={clearPlaylist} className="w-7 h-7 flex items-center justify-center text-slate-500 hover:text-red-400 rounded-lg transition-colors" title="Clear">
                      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
                    </button>
                  </>
                )}
                <button onClick={() => setPlaylistOpen(false)} className="w-7 h-7 flex items-center justify-center text-slate-500 hover:text-slate-300 rounded-lg transition-colors">
                  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto py-2">
              {playlist.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-3 px-4 text-center">
                  <svg className="w-8 h-8 text-slate-700" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z"/>
                  </svg>
                  <p className="text-slate-600 text-xs">No videos in playlist.<br/>Use + to add videos.</p>
                </div>
              ) : (
                playlist.map((video, i) => (
                  <PlaylistItem
                    key={video.id}
                    video={video}
                    index={i}
                    isActive={activeVideo?.id === video.id}
                    onPlay={() => setActiveVideo(video)}
                    onRemove={() => removeFromPlaylist(video.id)}
                  />
                ))
              )}
            </div>
            {playlist.length > 0 && (
              <div className="px-4 py-2 border-t border-slate-800/60">
                <button
                  onClick={() => filteredVideos.forEach(addToPlaylist)}
                  className="w-full text-xs text-slate-500 hover:text-cyan-400 py-1 transition-colors"
                >
                  + Add all {filteredVideos.length} videos
                </button>
              </div>
            )}
          </aside>
        )}
      </div>

      {/* All lazy-loaded modals share one Suspense boundary. The fallback is
          a tiny full-screen spinner — most chunks are <100 kB so it appears
          for only a single frame after first user click. */}
      <Suspense
        fallback={
          <div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/60 backdrop-blur-sm pointer-events-none">
            <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
          </div>
        }
      >
        {/* Video Player */}
        {activeVideo && (
          <VideoPlayer
            key={activeVideo.id}
            video={activeVideo}
            onClose={handleClose}
            onPrev={handlePrev}
            onNext={handleNext}
            hasPrev={activeIndex > 0}
            hasNext={activeIndex < playQueue.length - 1}
          />
        )}

        {/* Image Viewer */}
        {activeImage && (
          <ImageViewer
            image={activeImage}
            images={filteredImages}
            onClose={() => setActiveImage(null)}
            onNavigate={setActiveImage}
          />
        )}

        {showInfo && <InfoModal onClose={() => setShowInfo(false)} />}

        {/* Storyboard View */}
        {storyboardVideo && (
          <Storyboard
            video={storyboardVideo}
            onClose={() => setStoryboardVideo(null)}
            onSeekTo={() => {
              setActiveVideo(storyboardVideo);
            }}
          />
        )}

        {/* Splitscreen Player */}
        {splitscreenLeft && (
          <SplitscreenPlayer
            videoLeft={splitscreenLeft}
            videoRight={splitscreenRight}
            allVideos={filteredVideos}
            onClose={() => {
              setSplitscreenLeft(null);
              setSplitscreenRight(null);
            }}
            onSelectRight={setSplitscreenRight}
          />
        )}

        {/* Director Mode */}
        {directorOpen && (
          <DirectorMode
            videos={filteredVideos}
            onClose={() => setDirectorOpen(false)}
          />
        )}

        {/* Slideshow */}
        {slideshowStartIndex !== null && filteredImages.length > 0 && (
          <Slideshow
            images={filteredImages}
            startIndex={slideshowStartIndex}
            onClose={() => setSlideshowStartIndex(null)}
          />
        )}

        {/* Collection Modal – manage members of a collection */}
        {editingCollection && (
          <CollectionModal
            collection={editingCollection}
            allVideos={allVideos}
            allImages={allImages}
            onClose={() => setEditingCollectionId(null)}
            onRename={renameCollection}
            onRecolor={recolorCollection}
            onToggle={toggleInCollection}
            onDelete={(id) => {
              deleteCollection(id);
              if (activeCollectionId === id) setActiveCollectionId(null);
            }}
          />
        )}

        {/* Keyboard Shortcuts Modal */}
        {showShortcuts && <ShortcutsModal onClose={() => setShowShortcuts(false)} />}

        {/* Easter Egg – Konami Code */}
        {showEasterEgg && <EasterEgg onClose={() => setShowEasterEgg(false)} />}

        {/* Lock Screen - blocks everything */}
        {isLocked && <LockScreen onUnlock={() => {
          // Clear lock state from localStorage on successful unlock
          localStorage.removeItem('lumoravision_permanent_lock');
          localStorage.removeItem('lumoravision_permanent_lock_attempts');
          setIsLocked(false);
        }} />}
      </Suspense>

      {/* New Collection Dialog — kept eagerly loaded because it's tiny and
          shares the Sidebar.tsx chunk anyway (NewCollectionDialog is also
          a named export from that file). */}
      {showNewCollectionDialog && (
        <NewCollectionDialog
          onConfirm={handleCreateCollection}
          onCancel={() => setShowNewCollectionDialog(false)}
        />
      )}
    </div>
  );
}

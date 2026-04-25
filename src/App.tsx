import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useFileSystem } from './hooks/useFileSystem';
import { useSort } from './hooks/useSort';
import { VideoCard } from './components/VideoCard';
import { VideoListRow } from './components/VideoListRow';
import { VideoPlayer } from './components/VideoPlayer';
import { ImageCard } from './components/ImageCard';
import { ImageViewer } from './components/ImageViewer';
import { SplashScreen } from './components/SplashScreen';
import { InfoModal } from './components/InfoModal';
import { ShortcutsModal } from './components/ShortcutsModal';
import { Toolbar } from './components/Toolbar';
import { Sidebar } from './components/Sidebar';
import { Storyboard } from './components/Storyboard';
import { SplitscreenPlayer } from './components/SplitscreenPlayer';
import { DirectorMode } from './components/DirectorMode';
import { PlaylistItem } from './components/PlaylistItem';
import { formatFileSize } from './utils/format';
import type { VideoFile, ImageFile, ViewMode } from './types/video';

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

  const videos = useMemo(() => activeFolder?.videos ?? [], [activeFolder]);
  const images = useMemo(() => activeFolder?.images ?? [], [activeFolder]);
  const { sortedVideos, sortConfig, toggleSort } = useSort(videos);

  const [activeVideo, setActiveVideo] = useState<VideoFile | null>(null);
  const [activeImage, setActiveImage] = useState<ImageFile | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [durations, setDurations] = useState<Record<string, number>>({});
  const [viewMode, setViewMode] = useState<ViewMode>('grid');

  // Playlist state
  const [playlist, setPlaylist] = useState<VideoFile[]>([]);
  const [playlistOpen, setPlaylistOpen] = useState(false);

  // Storyboard & Splitscreen & Director state
  const [storyboardVideo, setStoryboardVideo] = useState<VideoFile | null>(null);
  const [splitscreenLeft, setSplitscreenLeft] = useState<VideoFile | null>(null);
  const [splitscreenRight, setSplitscreenRight] = useState<VideoFile | null>(null);
  const [directorOpen, setDirectorOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Shortcuts modal
  const [showShortcuts, setShowShortcuts] = useState(false);

  // Global keyboard shortcut: ? opens shortcuts modal
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      // Don't fire when typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === '?') setShowShortcuts(prev => !prev);
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

  const handleSelectFolder = useCallback((id: string) => {
    setActiveFolderId(id);
    setSearchQuery('');
    setActiveVideo(null);
    setActiveImage(null);
  }, [setActiveFolderId]);

  const videosWithDuration = useMemo(() =>
    sortedVideos.map(v => ({ ...v, duration: durations[v.id] ?? v.duration })),
    [sortedVideos, durations]
  );

  const filteredVideos = useMemo(() => {
    if (!searchQuery.trim()) return videosWithDuration;
    const q = searchQuery.toLowerCase();
    return videosWithDuration.filter(v => v.name.toLowerCase().includes(q));
  }, [videosWithDuration, searchQuery]);

  const filteredImages = useMemo(() => {
    if (!searchQuery.trim()) return images;
    const q = searchQuery.toLowerCase();
    return images.filter(img => img.name.toLowerCase().includes(q));
  }, [images, searchQuery]);

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
        folderName={activeFolder?.name ?? null}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onRescan={activeFolderId
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

          {/* Empty state – no folders */}
          {!isLoading && !error && folders.length === 0 && (
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

          {/* No folder selected */}
          {!isLoading && !error && folders.length > 0 && !activeFolder && (
            <div className="flex flex-col items-center justify-center h-full gap-3">
              <svg className="w-10 h-10 text-slate-700" fill="currentColor" viewBox="0 0 24 24">
                <path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" />
              </svg>
              <p className="text-slate-500 text-sm">Select a folder from the sidebar</p>
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

      {/* Keyboard Shortcuts Modal */}
      {showShortcuts && <ShortcutsModal onClose={() => setShowShortcuts(false)} />}
    </div>
  );
}

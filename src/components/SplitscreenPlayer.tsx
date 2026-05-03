import { useRef, useState, useEffect, useCallback } from 'react';
import type { VideoFile } from '../types/video';
import { formatDuration } from '../utils/format';

// Thumbnail cache for video selector – capped at 200 entries to prevent memory leaks
const CACHE_MAX = 200;
const thumbnailCache = new Map<string, string>();
function cachePut(id: string, dataUrl: string) {
  if (thumbnailCache.size >= CACHE_MAX) {
    // Evict the oldest entry (Map preserves insertion order)
    thumbnailCache.delete(thumbnailCache.keys().next().value!);
  }
  thumbnailCache.set(id, dataUrl);
}

function generateThumbnail(url: string, videoId: string): Promise<string> {
  // Return cached thumbnail if available
  if (thumbnailCache.has(videoId)) {
    return Promise.resolve(thumbnailCache.get(videoId)!);
  }

  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    // Do NOT set crossOrigin on blob: URLs – it causes CORS errors with local files

    let seeked = false;

    const cleanup = () => {
      video.src = '';
      video.load();
    };

    const captureFrame = () => {
      if (seeked) return;
      seeked = true;
      clearTimeout(timeout);
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 160;
        canvas.height = 90;
        const ctx = canvas.getContext('2d');
        if (!ctx) { cleanup(); reject(new Error('No canvas context')); return; }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
        cachePut(videoId, dataUrl);
        cleanup();
        resolve(dataUrl);
      } catch (e) {
        cleanup();
        reject(e);
      }
    };

    video.onloadeddata = () => {
      // Seek to 10% of duration for a representative frame
      const duration = video.duration;
      const seekTo = isFinite(duration) && duration > 0 ? duration * 0.1 : 0;
      if (seekTo > 0) {
        video.currentTime = seekTo;
      } else {
        // Duration unknown – capture current frame immediately
        captureFrame();
      }
    };

    video.onseeked = captureFrame;

    video.onerror = () => { cleanup(); reject(new Error('Video load error')); };

    const timeout = setTimeout(() => { cleanup(); reject(new Error('Timeout')); }, 15000);

    video.src = url;
    video.load();
  });
}

// Video selector item component with lazy thumbnail loading
function VideoSelectorItem({ video, isSelected, onSelect }: { video: VideoFile; isSelected: boolean; onSelect: () => void }) {
  // Initialise directly from cache so we never need to call setState inside an effect
  const [thumbnail, setThumbnail] = useState<string | null>(() => thumbnailCache.get(video.id) ?? null);
  const [isLoading, setIsLoading] = useState(() => !thumbnailCache.has(video.id));

  useEffect(() => {
    // Cache hit – state was already initialised correctly, nothing to do
    if (thumbnailCache.has(video.id)) return;

    let cancelled = false;
    generateThumbnail(video.url, video.id)
      .then(url => { if (!cancelled) { setThumbnail(url); setIsLoading(false); } })
      .catch(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [video.id, video.url]);

  return (
    <button
      onClick={onSelect}
      className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-slate-800 transition-colors ${
        isSelected ? 'bg-purple-600/20 border border-purple-500/30' : ''
      }`}
    >
      <div className="w-24 h-14 rounded-lg bg-slate-800 flex items-center justify-center overflow-hidden flex-none">
        {thumbnail ? (
          <img src={thumbnail} alt="" className="w-full h-full object-cover" />
        ) : isLoading ? (
          <div className="w-5 h-5 border-2 border-slate-600 border-t-slate-400 rounded-full animate-spin" />
        ) : (
          <svg className="w-6 h-6 text-slate-600" fill="currentColor" viewBox="0 0 24 24">
            <path d="M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z"/>
          </svg>
        )}
      </div>
      <div className="flex-1 text-left min-w-0">
        <p className="text-slate-200 text-sm truncate">{video.name}</p>
        <p className="text-slate-600 text-xs">{video.extension.toUpperCase()} {video.duration ? `· ${formatDuration(video.duration)}` : ''}</p>
      </div>
      {isSelected && (
        <svg className="w-5 h-5 text-purple-400 flex-none" fill="currentColor" viewBox="0 0 24 24">
          <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
        </svg>
      )}
    </button>
  );
}

interface SplitscreenPlayerProps {
  videoLeft: VideoFile;
  videoRight: VideoFile | null;
  allVideos: VideoFile[];
  onClose: () => void;
  onSelectRight: (video: VideoFile) => void;
}

type LayoutMode = 'side-by-side' | 'top-bottom' | 'pip-left' | 'pip-right';

export function SplitscreenPlayer({ 
  videoLeft, 
  videoRight, 
  allVideos,
  onClose, 
  onSelectRight 
}: SplitscreenPlayerProps) {
  const leftRef = useRef<HTMLVideoElement>(null);
  const rightRef = useRef<HTMLVideoElement>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isSynced, setIsSynced] = useState(true);
  const [isLooping, setIsLooping] = useState(false);
  const [layout, setLayout] = useState<LayoutMode>('side-by-side');
  const [showControls, setShowControls] = useState(true);
  const [showVideoSelector, setShowVideoSelector] = useState(false);

  // Left video state
  const [leftTime, setLeftTime] = useState(0);
  const [leftDuration, setLeftDuration] = useState(0);
  const [leftVolume, setLeftVolume] = useState(1);
  const [leftMuted, setLeftMuted] = useState(false);

  // Right video state
  const [rightTime, setRightTime] = useState(0);
  const [rightDuration, setRightDuration] = useState(0);
  const [rightVolume, setRightVolume] = useState(0);
  const [rightMuted, setRightMuted] = useState(true);

  const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetControlsTimer = useCallback(() => {
    setShowControls(true);
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    controlsTimerRef.current = setTimeout(() => {
      if (isPlaying) setShowControls(false);
    }, 3000);
  }, [isPlaying]);

  useEffect(() => {
    return () => {
      if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    };
  }, []);

  // Sync playback
  const togglePlay = useCallback(() => {
    const left = leftRef.current;
    const right = rightRef.current;
    
    if (isPlaying) {
      left?.pause();
      right?.pause();
      setIsPlaying(false);
    } else {
      left?.play();
      if (videoRight) right?.play();
      setIsPlaying(true);
    }
    resetControlsTimer();
  }, [isPlaying, videoRight, resetControlsTimer]);

  // Sync seeking
  const handleSeek = useCallback((time: number, source: 'left' | 'right') => {
    if (isSynced) {
      if (leftRef.current) leftRef.current.currentTime = time;
      if (rightRef.current) rightRef.current.currentTime = time;
    } else {
      if (source === 'left' && leftRef.current) {
        leftRef.current.currentTime = time;
      } else if (source === 'right' && rightRef.current) {
        rightRef.current.currentTime = time;
      }
    }
  }, [isSynced]);

  const handleProgressClick = useCallback((e: React.MouseEvent<HTMLDivElement>, source: 'left' | 'right') => {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    const duration = source === 'left' ? leftDuration : rightDuration;
    handleSeek(ratio * duration, source);
  }, [leftDuration, rightDuration, handleSeek]);

  const skip = useCallback((seconds: number) => {
    if (isSynced) {
      if (leftRef.current) leftRef.current.currentTime += seconds;
      if (rightRef.current) rightRef.current.currentTime += seconds;
    } else {
      if (leftRef.current) leftRef.current.currentTime += seconds;
    }
  }, [isSynced]);

  // Keyboard shortcuts – all stable callbacks are in deps
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Close selector first; only close the whole player if selector is already closed
        setShowVideoSelector(prev => { if (prev) return false; onClose(); return false; });
        return;
      }
      if (e.key === ' ' || e.key === 'k') { e.preventDefault(); togglePlay(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); skip(-10); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); skip(10); }
      else if (e.key === 's') setIsSynced(prev => !prev);
      else if (e.key === 'l') setIsLooping(prev => !prev);
      else if (e.key === '1') setLayout('side-by-side');
      else if (e.key === '2') setLayout('top-bottom');
      else if (e.key === '3') setLayout('pip-left');
      else if (e.key === '4') setLayout('pip-right');
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [togglePlay, skip, onClose]); // togglePlay & skip are useCallback – no stale closure

  const leftProgress = leftDuration > 0 ? (leftTime / leftDuration) * 100 : 0;
  const rightProgress = rightDuration > 0 ? (rightTime / rightDuration) * 100 : 0;

  const layoutClasses: Record<LayoutMode, string> = {
    'side-by-side': 'flex-row',
    'top-bottom': 'flex-col',
    'pip-left': 'flex-row',
    'pip-right': 'flex-row',
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex flex-col bg-black"
      onMouseMove={resetControlsTimer}
    >
      {/* Header */}
      <div 
        className={`flex items-center gap-3 px-4 py-2 bg-slate-900/90 border-b border-slate-800/60 transition-opacity duration-300 ${
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-purple-400" fill="currentColor" viewBox="0 0 24 24">
            <path d="M3 5v14h8V5H3zm10 14h8V5h-8v14zM5 7h4v10H5V7zm10 0h4v10h-4V7z"/>
          </svg>
          <span className="text-slate-200 font-semibold">Splitscreen</span>
        </div>

        <span className={`text-xs px-2 py-0.5 rounded-full ${isSynced ? 'bg-cyan-500/20 text-cyan-400' : 'bg-orange-500/20 text-orange-400'}`}>
          {isSynced ? '🔗 Synced' : '🔓 Independent'}
        </span>

        <div className="flex-1" />

        {/* Layout selector */}
        <div className="flex items-center gap-1 bg-slate-800/60 rounded-lg p-1">
          {(['side-by-side', 'top-bottom', 'pip-left', 'pip-right'] as LayoutMode[]).map((l, i) => (
            <button
              key={l}
              onClick={() => setLayout(l)}
              className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                layout === l ? 'bg-cyan-600 text-white' : 'text-slate-500 hover:text-slate-300'
              }`}
              title={`Layout ${i + 1} (${i + 1})`}
            >
              {l === 'side-by-side' && (
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M3 5v14h8V5H3zm10 0v14h8V5h-8z"/></svg>
              )}
              {l === 'top-bottom' && (
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M3 3v8h18V3H3zm0 10v8h18v-8H3z"/></svg>
              )}
              {l === 'pip-left' && (
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M19 7h-8v6h8V7zm-6 8H5v2h8v-2zm8-10H3v14h18V5h-2zm0 12H5V7h2v8h10v-4h2v6z"/></svg>
              )}
              {l === 'pip-right' && (
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M5 7h8v6H5V7zm6 8h8v2h-8v-2zM3 5v14h18V5H3zm16 12h-2v-6H7V7h12v10z"/></svg>
              )}
            </button>
          ))}
        </div>

        <button
          onClick={() => setIsSynced(prev => !prev)}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            isSynced ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-300'
          }`}
        >
          {isSynced ? '🔗 Sync On' : '🔓 Sync Off'}
        </button>

        <button
          onClick={onClose}
          className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center transition-colors"
        >
          <svg className="w-4 h-4 text-slate-400" fill="currentColor" viewBox="0 0 24 24">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
          </svg>
        </button>
      </div>

      {/* Video Area */}
      <div className={`flex-1 flex ${layoutClasses[layout]} gap-1 p-1 min-h-0`}>
        {/* Left Video */}
        <div className={`relative bg-black ${
          layout === 'pip-left' ? 'flex-1' : 
          layout === 'pip-right' ? 'absolute bottom-20 left-4 w-72 z-10 rounded-xl overflow-hidden shadow-2xl border border-slate-700' : 
          'flex-1'
        }`}>
          <video
            ref={leftRef}
            src={videoLeft.url}
            loop={isLooping}
            className="w-full h-full object-contain"
            onTimeUpdate={() => {
              const v = leftRef.current;
              if (v && Math.abs(v.currentTime - leftTime) > 0.25) setLeftTime(v.currentTime);
            }}
            onLoadedMetadata={() => setLeftDuration(leftRef.current?.duration ?? 0)}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onClick={togglePlay}
          />
          
          {/* Left label */}
          <div className="absolute top-3 left-3 bg-black/70 backdrop-blur-sm px-2 py-1 rounded-lg">
            <span className="text-white text-xs font-medium truncate max-w-48 block">
              {videoLeft.name.replace(/\.[^/.]+$/, '')}
            </span>
          </div>

          {/* Left volume */}
          <div className={`absolute bottom-3 left-3 flex items-center gap-2 bg-black/70 backdrop-blur-sm px-2 py-1 rounded-lg transition-opacity ${showControls ? 'opacity-100' : 'opacity-0'}`}>
            <button onClick={() => {
              const next = !leftMuted;
              setLeftMuted(next);
              if (leftRef.current) leftRef.current.muted = next;
            }} className="text-white">
              {leftMuted ? '🔇' : '🔊'}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={leftMuted ? 0 : leftVolume}
              onChange={e => {
                const v = parseFloat(e.target.value);
                setLeftVolume(v);
                setLeftMuted(v === 0);
                if (leftRef.current) {
                  leftRef.current.volume = v;
                  leftRef.current.muted = v === 0;
                }
              }}
              className="w-16 accent-cyan-500"
            />
          </div>
        </div>

        {/* Right Video or Selector */}
        <div className={`relative bg-slate-900 ${
          layout === 'pip-right' ? 'flex-1' : 
          layout === 'pip-left' ? 'absolute bottom-20 right-4 w-72 z-10 rounded-xl overflow-hidden shadow-2xl border border-slate-700' : 
          'flex-1'
        }`}>
          {videoRight ? (
            <>
              <video
                ref={rightRef}
                src={videoRight.url}
                loop={isLooping}
                className="w-full h-full object-contain"
                onTimeUpdate={() => {
                  const v = rightRef.current;
                  if (v && Math.abs(v.currentTime - rightTime) > 0.25) setRightTime(v.currentTime);
                }}
                onLoadedMetadata={() => setRightDuration(rightRef.current?.duration ?? 0)}
                onClick={togglePlay}
                muted={rightMuted}
              />
              
              {/* Right label */}
              <div className="absolute top-3 left-3 bg-black/70 backdrop-blur-sm px-2 py-1 rounded-lg">
                <span className="text-white text-xs font-medium truncate max-w-48 block">
                  {videoRight.name.replace(/\.[^/.]+$/, '')}
                </span>
              </div>

              {/* Right volume */}
              <div className={`absolute bottom-3 left-3 flex items-center gap-2 bg-black/70 backdrop-blur-sm px-2 py-1 rounded-lg transition-opacity ${showControls ? 'opacity-100' : 'opacity-0'}`}>
                <button onClick={() => {
                  const next = !rightMuted;
                  setRightMuted(next);
                  if (rightRef.current) rightRef.current.muted = next;
                }} className="text-white">
                  {rightMuted ? '🔇' : '🔊'}
                </button>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={rightMuted ? 0 : rightVolume}
                  onChange={e => {
                    const v = parseFloat(e.target.value);
                    setRightVolume(v);
                    setRightMuted(v === 0);
                    if (rightRef.current) {
                      rightRef.current.volume = v;
                      rightRef.current.muted = v === 0;
                    }
                  }}
                  className="w-16 accent-cyan-500"
                />
              </div>

              {/* Change video button */}
              <button
                onClick={() => setShowVideoSelector(true)}
                className="absolute top-3 right-3 w-8 h-8 rounded-lg bg-black/70 hover:bg-black/90 flex items-center justify-center transition-colors"
              >
                <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
                </svg>
              </button>
            </>
          ) : (
            <button
              onClick={() => setShowVideoSelector(true)}
              className="w-full h-full flex flex-col items-center justify-center gap-4 text-slate-500 hover:text-slate-300 transition-colors"
            >
              <div className="w-16 h-16 rounded-2xl bg-slate-800 flex items-center justify-center">
                <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
                </svg>
              </div>
              <span className="text-sm">Select second video</span>
            </button>
          )}
        </div>
      </div>

      {/* Controls */}
      <div 
        className={`flex-none bg-slate-900/90 px-4 py-3 border-t border-slate-800/60 transition-opacity duration-300 ${
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        {/* Progress bars */}
        <div className="flex gap-4 mb-3">
          {/* Left progress */}
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-cyan-400 text-xs font-medium">LEFT</span>
              <span className="text-slate-500 text-xs font-mono">{formatDuration(leftTime)} / {formatDuration(leftDuration)}</span>
            </div>
            <div 
              className="h-1.5 bg-slate-700 rounded-full cursor-pointer hover:h-2 transition-all"
              onClick={e => handleProgressClick(e, 'left')}
            >
              <div className="h-full bg-cyan-500 rounded-full" style={{ width: `${leftProgress}%` }} />
            </div>
          </div>

          {/* Right progress */}
          {videoRight && (
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-purple-400 text-xs font-medium">RIGHT</span>
                <span className="text-slate-500 text-xs font-mono">{formatDuration(rightTime)} / {formatDuration(rightDuration)}</span>
              </div>
              <div 
                className="h-1.5 bg-slate-700 rounded-full cursor-pointer hover:h-2 transition-all"
                onClick={e => handleProgressClick(e, 'right')}
              >
                <div className="h-full bg-purple-500 rounded-full" style={{ width: `${rightProgress}%` }} />
              </div>
            </div>
          )}
        </div>

        {/* Control buttons */}
        <div className="flex items-center gap-2">
          <button onClick={() => skip(-10)} className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center transition-colors">
            <svg className="w-4 h-4 text-slate-300" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/>
            </svg>
          </button>

          <button 
            onClick={togglePlay}
            className="w-10 h-10 rounded-lg bg-cyan-600 hover:bg-cyan-500 flex items-center justify-center transition-colors"
          >
            {isPlaying ? (
              <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
              </svg>
            ) : (
              <svg className="w-5 h-5 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z"/>
              </svg>
            )}
          </button>

          <button onClick={() => skip(10)} className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center transition-colors">
            <svg className="w-4 h-4 text-slate-300" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 5V1l5 5-5 5V7c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6h2c0 4.42-3.58 8-8 8s-8-3.58-8-8 3.58-8 8-8z"/>
            </svg>
          </button>

          {/* Loop toggle */}
          <button
            onClick={() => setIsLooping(prev => !prev)}
            title="Loop (L)"
            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
              isLooping ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-300'
            }`}
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8zm-1 9v-2H9v2h2zm4 0v-2h-2v2h2z"/>
            </svg>
          </button>

          <div className="flex-1" />

          <span className="text-slate-600 text-xs">
            Shortcuts: Space (play) · ← → (±10s) · S (sync) · L (loop) · 1-4 (layout)
          </span>
        </div>
      </div>

      {/* Video Selector Modal */}
      {showVideoSelector && (
        <div 
          className="fixed inset-0 z-[200] bg-black/80 flex items-center justify-center p-4"
          onClick={() => setShowVideoSelector(false)}
        >
          <div 
            className="bg-slate-900 rounded-2xl border border-slate-800 w-full max-w-2xl max-h-[70vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
              <span className="text-slate-200 font-semibold">Select Video for Right Panel</span>
              <button
                onClick={() => setShowVideoSelector(false)}
                className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center"
              >
                <svg className="w-4 h-4 text-slate-400" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                </svg>
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-2">
              {allVideos.filter(v => v.id !== videoLeft.id).map(video => (
                <VideoSelectorItem
                  key={video.id}
                  video={video}
                  isSelected={videoRight?.id === video.id}
                  onSelect={() => {
                    onSelectRight(video);
                    setShowVideoSelector(false);
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import { useRef, useState, useCallback, useEffect } from 'react';
import type { VideoFile } from '../types/video';
import { formatFileSize, formatDuration } from '../utils/format';
import { runThumbJob } from '../utils/thumbQueue';

interface VideoListRowProps {
  video: VideoFile;
  index: number;
  duration?: number;
  inPlaylist?: boolean;
  isActive?: boolean;
  onPlay: (video: VideoFile) => void;
  onAddToPlaylist: (video: VideoFile) => void;
}

// Shared thumbnail cache with VideoCard
const thumbnailCache = new Map<string, string>();

function generateThumbnail(url: string): Promise<{ dataUrl: string; duration: number }> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'metadata';
    video.crossOrigin = 'anonymous';
    const cleanup = () => { video.src = ''; video.load(); };
    video.onloadedmetadata = () => {
      const dur = video.duration;
      video.currentTime = isFinite(dur) && dur > 0 ? dur * 0.1 : 1;
    };
    video.onseeked = () => {
      try {
        const canvas = document.createElement('canvas');
        const maxW = 320;
        const scale = video.videoWidth > maxW ? maxW / video.videoWidth : 1;
        canvas.width = Math.round(video.videoWidth * scale) || 320;
        canvas.height = Math.round(video.videoHeight * scale) || 180;
        const ctx = canvas.getContext('2d');
        if (!ctx) { cleanup(); reject(new Error('No canvas context')); return; }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        cleanup();
        resolve({ dataUrl, duration: video.duration });
      } catch (e) { cleanup(); reject(e); }
    };
    video.onerror = () => { cleanup(); reject(new Error('Video load error')); };
    const timeout = setTimeout(() => { cleanup(); reject(new Error('Timeout')); }, 12000);
    video.addEventListener('seeked', () => clearTimeout(timeout), { once: true });
    video.src = url;
    video.load();
  });
}

export function VideoListRow({
  video,
  index,
  duration,
  inPlaylist,
  isActive,
  onPlay,
  onAddToPlaylist,
}: VideoListRowProps) {
  const rowRef = useRef<HTMLDivElement>(null);
  const hoverVideoRef = useRef<HTMLVideoElement>(null);
  const [thumbnail, setThumbnail] = useState<string | null>(thumbnailCache.get(video.id) ?? null);
  const [thumbnailError, setThumbnailError] = useState(false);
  const [inViewport, setInViewport] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const generatingRef = useRef(false);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Intersection Observer
  useEffect(() => {
    const el = rowRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setInViewport(true); },
      { rootMargin: '200px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Generate thumbnail (throttled via shared queue)
  useEffect(() => {
    if (!inViewport || thumbnail || thumbnailError || generatingRef.current) return;
    generatingRef.current = true;
    runThumbJob(() =>
      generateThumbnail(video.url)
        .then(({ dataUrl }) => {
          thumbnailCache.set(video.id, dataUrl);
          setThumbnail(dataUrl);
        })
        .catch(() => setThumbnailError(true))
        .finally(() => { generatingRef.current = false; })
    );
  }, [inViewport, thumbnail, thumbnailError, video.id, video.url]);

  const handleMouseEnter = useCallback(() => {
    hoverTimerRef.current = setTimeout(() => {
      setIsHovering(true);
      const vid = hoverVideoRef.current;
      if (vid) { vid.currentTime = 0; vid.play().catch(() => {}); }
    }, 200);
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (hoverTimerRef.current) { clearTimeout(hoverTimerRef.current); hoverTimerRef.current = null; }
    setIsHovering(false);
    const vid = hoverVideoRef.current;
    if (vid) { vid.pause(); vid.currentTime = 0; }
  }, []);

  const dur = duration ?? video.duration;

  return (
    <div
      ref={rowRef}
      className={`stagger-item group flex items-center gap-3 px-3 py-2 rounded-xl border cursor-pointer transition-all ${
        isActive
          ? 'bg-cyan-600/10 border-cyan-500/30'
          : 'bg-slate-900/60 border-transparent hover:bg-slate-800/80 hover:border-slate-700/50'
      }`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={() => onPlay(video)}
    >
      {/* Index */}
      <span className="text-slate-600 text-xs w-5 text-right flex-none select-none">{index + 1}</span>

      {/* Thumbnail preview */}
      <div className="relative w-20 h-12 rounded-lg overflow-hidden flex-none bg-slate-800">
        {thumbnail && !isHovering && (
          <img src={thumbnail} alt="" className="absolute inset-0 w-full h-full object-cover" draggable={false} />
        )}
        {!thumbnail && !thumbnailError && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-4 h-4 border-2 border-slate-700 border-t-slate-500 rounded-full animate-spin" />
          </div>
        )}
        {thumbnailError && !isHovering && (
          <div className="absolute inset-0 flex items-center justify-center">
            <svg className="w-5 h-5 text-slate-700" fill="currentColor" viewBox="0 0 24 24">
              <path d="M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z" />
            </svg>
          </div>
        )}
        {/* Hover video preview */}
        <video
          ref={hoverVideoRef}
          src={isHovering ? video.url : undefined}
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-150 ${isHovering ? 'opacity-100' : 'opacity-0'}`}
          muted
          playsInline
          loop
          preload="none"
        />
        {/* Play icon overlay */}
        <div className={`absolute inset-0 flex items-center justify-center transition-opacity duration-150 ${isHovering ? 'opacity-100' : 'opacity-0'}`}>
          <div className="w-7 h-7 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center">
            <svg className="w-3.5 h-3.5 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
          </div>
        </div>
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className={`text-sm truncate transition-colors ${isActive ? 'text-cyan-300' : 'text-slate-200 group-hover:text-white'}`}>
          {video.name.replace(/\.[^/.]+$/, '')}
        </p>
        <p className="text-xs text-slate-600 mt-0.5">{video.extension.toUpperCase()} · {formatFileSize(video.size)}</p>
      </div>

      {/* Duration */}
      {dur && (
        <span className="text-slate-500 text-xs flex-none font-mono w-12 text-right">
          {formatDuration(dur)}
        </span>
      )}

      {/* Add to playlist */}
      <button
        onClick={e => { e.stopPropagation(); onAddToPlaylist(video); }}
        className={`flex-none w-7 h-7 rounded-lg flex items-center justify-center transition-all ${
          inPlaylist
            ? 'text-cyan-400 bg-cyan-400/10'
            : 'text-slate-600 hover:text-cyan-400 opacity-0 group-hover:opacity-100'
        }`}
        title={inPlaylist ? 'In playlist' : 'Add to playlist'}
      >
        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
          {inPlaylist
            ? <path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z"/>
            : <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
          }
        </svg>
      </button>
    </div>
  );
}

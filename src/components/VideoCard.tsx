import { useRef, useState, useCallback, useEffect } from 'react';
import type { VideoFile } from '../types/video';
import { formatFileSize, formatDuration, formatDate } from '../utils/format';

interface VideoCardProps {
  video: VideoFile;
  onPlay: (video: VideoFile) => void;
  onDurationLoaded: (id: string, duration: number) => void;
  onAddToPlaylist?: (video: VideoFile) => void;
  inPlaylist?: boolean;
  onStoryboard?: (video: VideoFile) => void;
  onSplitscreen?: (video: VideoFile) => void;
}

const extColors: Record<string, string> = {
  mp4: 'bg-blue-600',
  mov: 'bg-purple-600',
  webm: 'bg-green-600',
  mkv: 'bg-orange-600',
  avi: 'bg-red-600',
};

/**
 * Generate a high-quality thumbnail from a video file using Canvas.
 * Seeks to 10% of the video duration and captures the frame.
 * Returns a data URL (PNG).
 */
function generateThumbnail(url: string): Promise<{ dataUrl: string; duration: number }> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'metadata';
    video.crossOrigin = 'anonymous';

    const cleanup = () => {
      video.src = '';
      video.load();
    };

    video.onloadedmetadata = () => {
      const duration = video.duration;
      // Seek to 10% of the video for a meaningful frame
      video.currentTime = isFinite(duration) && duration > 0 ? duration * 0.1 : 1;
    };

    video.onseeked = () => {
      try {
        const canvas = document.createElement('canvas');
        // Use native video resolution for best quality (cap at 1280px wide)
        const maxW = 1280;
        const scale = video.videoWidth > maxW ? maxW / video.videoWidth : 1;
        canvas.width = Math.round(video.videoWidth * scale) || 640;
        canvas.height = Math.round(video.videoHeight * scale) || 360;
        const ctx = canvas.getContext('2d');
        if (!ctx) { cleanup(); reject(new Error('No canvas context')); return; }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.92); // JPEG 92% quality
        cleanup();
        resolve({ dataUrl, duration: video.duration });
      } catch (e) {
        cleanup();
        reject(e);
      }
    };

    video.onerror = () => { cleanup(); reject(new Error('Video load error')); };

    // Timeout fallback
    const timeout = setTimeout(() => { cleanup(); reject(new Error('Timeout')); }, 15000);
    video.addEventListener('seeked', () => clearTimeout(timeout), { once: true });

    video.src = url;
    video.load();
  });
}

// Simple in-memory thumbnail cache (survives re-renders, cleared on page reload)
const thumbnailCache = new Map<string, string>();

export function VideoCard({ video, onPlay, onDurationLoaded, onAddToPlaylist, inPlaylist, onStoryboard, onSplitscreen }: VideoCardProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isHovering, setIsHovering] = useState(false);
  const [inViewport, setInViewport] = useState(false);
  const [thumbnail, setThumbnail] = useState<string | null>(thumbnailCache.get(video.id) ?? null);
  const [thumbnailError, setThumbnailError] = useState(false);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const generatingRef = useRef(false);

  // Intersection Observer: generate thumbnail when card enters viewport
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setInViewport(true); },
      { rootMargin: '300px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Generate thumbnail when in viewport and not yet generated
  useEffect(() => {
    if (!inViewport || thumbnail || thumbnailError || generatingRef.current) return;
    generatingRef.current = true;

    generateThumbnail(video.url)
      .then(({ dataUrl, duration }) => {
        thumbnailCache.set(video.id, dataUrl);
        setThumbnail(dataUrl);
        if (duration && isFinite(duration)) {
          onDurationLoaded(video.id, duration);
        }
      })
      .catch(() => {
        setThumbnailError(true);
      })
      .finally(() => {
        generatingRef.current = false;
      });
  }, [inViewport, thumbnail, thumbnailError, video.id, video.url, onDurationLoaded]);

  const handleMouseEnter = useCallback(() => {
    hoverTimerRef.current = setTimeout(() => {
      setIsHovering(true);
      const vid = videoRef.current;
      if (vid) {
        vid.currentTime = 0;
        vid.play().catch(() => {});
      }
    }, 150);
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    setIsHovering(false);
    const vid = videoRef.current;
    if (!vid) return;
    vid.pause();
    vid.currentTime = 0;
  }, []);

  const extColor = extColors[video.extension] ?? 'bg-slate-600';

  return (
    <div
      ref={containerRef}
      className="group relative bg-slate-900 rounded-xl overflow-hidden cursor-pointer border border-slate-800 hover:border-cyan-500/60 transition-all duration-300 hover:shadow-lg hover:shadow-cyan-500/10 hover:-translate-y-0.5"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={() => onPlay(video)}
    >
      <div className="relative aspect-video bg-slate-950 overflow-hidden">

        {/* Thumbnail image (canvas-generated, best quality) */}
        {thumbnail && !isHovering && (
          <img
            src={thumbnail}
            alt={video.name}
            className="absolute inset-0 w-full h-full object-cover"
            draggable={false}
          />
        )}

        {/* Placeholder while thumbnail is generating */}
        {!thumbnail && !thumbnailError && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-900">
            <div className="w-6 h-6 border-2 border-slate-700 border-t-slate-500 rounded-full animate-spin" />
          </div>
        )}

        {/* Fallback icon if thumbnail generation failed */}
        {thumbnailError && !isHovering && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-900">
            <svg className="w-10 h-10 text-slate-700" fill="currentColor" viewBox="0 0 24 24">
              <path d="M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z" />
            </svg>
          </div>
        )}

        {/* Video element for hover preview – only loaded when hovering */}
        <video
          ref={videoRef}
          src={isHovering ? video.url : undefined}
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-200 ${isHovering ? 'opacity-100' : 'opacity-0'}`}
          muted
          playsInline
          loop
          preload="none"
        />

        {/* Overlay gradient */}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

        {/* Play button overlay on hover */}
        <div className={`absolute inset-0 flex items-center justify-center transition-opacity duration-300 ${isHovering ? 'opacity-100' : 'opacity-0'}`}>
          <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center border border-white/30 shadow-lg">
            <svg className="w-5 h-5 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>

        {/* Duration badge */}
        {video.duration && (
          <div className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-1.5 py-0.5 rounded font-mono z-20">
            {formatDuration(video.duration)}
          </div>
        )}

        {/* Format badge */}
        <div className={`absolute top-2 left-2 ${extColor} text-white text-xs px-2 py-0.5 rounded-md font-bold uppercase z-20`}>
          {video.extension}
        </div>

        {/* Action buttons — top right overlay, visible on hover */}
        <div className="absolute top-2 right-2 flex items-center gap-1 z-20 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          {onStoryboard && (
            <button
              onClick={e => { e.stopPropagation(); onStoryboard(video); }}
              className="w-7 h-7 rounded-lg bg-black/60 backdrop-blur-sm flex items-center justify-center text-white hover:bg-emerald-600 transition-colors"
              title="Storyboard"
            >
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H8V4h12v12z"/>
              </svg>
            </button>
          )}
          {onSplitscreen && (
            <button
              onClick={e => { e.stopPropagation(); onSplitscreen(video); }}
              className="w-7 h-7 rounded-lg bg-black/60 backdrop-blur-sm flex items-center justify-center text-white hover:bg-purple-600 transition-colors"
              title="Splitscreen"
            >
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M3 5v14h8V5H3zm10 0v14h8V5h-8z"/>
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Info */}
      <div className="p-3">
        <h3
          className="text-sm font-medium text-slate-200 truncate group-hover:text-white transition-colors"
          title={video.name}
        >
          {video.name.replace(/\.[^/.]+$/, '')}
        </h3>
        <div className="flex items-center justify-between mt-1.5">
          <span className="text-xs text-slate-500">{formatFileSize(video.size)}</span>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-600">{formatDate(video.lastModified)}</span>
            {onAddToPlaylist && (
              <button
                onClick={e => { e.stopPropagation(); onAddToPlaylist(video); }}
                className={`w-6 h-6 rounded-lg flex items-center justify-center transition-all ${inPlaylist ? 'text-cyan-400 bg-cyan-500/10' : 'text-slate-600 opacity-0 group-hover:opacity-100 hover:text-cyan-400 hover:bg-slate-800'}`}
                title={inPlaylist ? 'In playlist' : 'Add to playlist'}
              >
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                  {inPlaylist
                    ? <path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z"/>
                    : <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
                  }
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

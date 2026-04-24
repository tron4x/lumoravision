import { useState, useEffect } from 'react';
import type { VideoFile } from '../types/video';
import { formatDuration } from '../utils/format';

// Shared thumbnail cache
const thumbnailCache = new Map<string, string>();

function generateThumbnail(url: string, videoId: string): Promise<string> {
  if (thumbnailCache.has(videoId)) {
    return Promise.resolve(thumbnailCache.get(videoId)!);
  }

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
      video.currentTime = isFinite(duration) && duration > 0 ? duration * 0.1 : 1;
    };

    video.onseeked = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 120;
        canvas.height = 68;
        const ctx = canvas.getContext('2d');
        if (!ctx) { cleanup(); reject(new Error('No context')); return; }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
        thumbnailCache.set(videoId, dataUrl);
        cleanup();
        resolve(dataUrl);
      } catch (e) {
        cleanup();
        reject(e);
      }
    };

    video.onerror = () => { cleanup(); reject(new Error('Error')); };
    
    const timeout = setTimeout(() => { cleanup(); reject(new Error('Timeout')); }, 8000);
    video.addEventListener('seeked', () => clearTimeout(timeout), { once: true });

    video.src = url;
    video.load();
  });
}

interface PlaylistItemProps {
  video: VideoFile;
  index: number;
  isActive: boolean;
  onPlay: () => void;
  onRemove: () => void;
}

export function PlaylistItem({ video, index, isActive, onPlay, onRemove }: PlaylistItemProps) {
  const [thumbnail, setThumbnail] = useState<string | null>(thumbnailCache.get(video.id) ?? null);
  const [isLoading, setIsLoading] = useState(!thumbnailCache.has(video.id));

  useEffect(() => {
    if (thumbnail) return;
    let cancelled = false;
    generateThumbnail(video.url, video.id)
      .then(url => { if (!cancelled) setThumbnail(url); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [video.url, video.id, thumbnail]);

  return (
    <div
      className={`group flex items-center gap-2 mx-2 px-2 py-1.5 rounded-lg cursor-pointer transition-all hover:bg-slate-800/60 ${
        isActive ? 'bg-cyan-600/10 border border-cyan-500/20' : ''
      }`}
      onClick={onPlay}
    >
      {/* Index */}
      <span className="text-slate-600 text-xs w-4 text-right flex-none">{index + 1}</span>
      
      {/* Thumbnail */}
      <div className="w-14 h-8 rounded bg-slate-800 flex items-center justify-center overflow-hidden flex-none relative">
        {thumbnail ? (
          <img src={thumbnail} alt="" className="w-full h-full object-cover" draggable={false} />
        ) : isLoading ? (
          <div className="w-4 h-4 border-2 border-slate-600 border-t-slate-400 rounded-full animate-spin" />
        ) : (
          <svg className="w-4 h-4 text-slate-600" fill="currentColor" viewBox="0 0 24 24">
            <path d="M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z"/>
          </svg>
        )}
        
        {/* Play indicator overlay for active */}
        {isActive && thumbnail && (
          <div className="absolute inset-0 bg-cyan-500/30 flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z"/>
            </svg>
          </div>
        )}
      </div>
      
      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className={`text-xs truncate ${isActive ? 'text-cyan-300' : 'text-slate-300 group-hover:text-white'}`}>
          {video.name.replace(/\.[^/.]+$/, '')}
        </p>
        <p className="text-[10px] text-slate-600">
          {video.extension.toUpperCase()}
          {video.duration ? ` · ${formatDuration(video.duration)}` : ''}
        </p>
      </div>
      
      {/* Remove button */}
      <button
        onClick={e => { e.stopPropagation(); onRemove(); }}
        className="flex-none opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center text-slate-500 hover:text-red-400 rounded transition-all"
        title="Remove from playlist"
      >
        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
          <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
        </svg>
      </button>
    </div>
  );
}

import { useState, useEffect, useRef, useCallback } from 'react';
import type { VideoFile } from '../types/video';
import { formatDuration } from '../utils/format';

interface StoryboardProps {
  video: VideoFile;
  onClose: () => void;
  onSeekTo?: (time: number) => void;
}

interface StoryboardFrame {
  time: number;
  thumbnail: string;
}

export function Storyboard({ video, onClose, onSeekTo }: StoryboardProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const previewRef = useRef<HTMLVideoElement>(null);
  const [frames, setFrames] = useState<StoryboardFrame[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [selectedFrame, setSelectedFrame] = useState<number | null>(null);
  const [frameCount, setFrameCount] = useState(20);
  const [gridCols, setGridCols] = useState(5);
  const [showPreview, setShowPreview] = useState(false);
  const [previewPlaying, setPreviewPlaying] = useState(false);

  const generateStoryboard = useCallback(async () => {
    const vid = videoRef.current;
    if (!vid || vid.duration === 0) return;

    setIsGenerating(true);
    setProgress(0);
    setFrames([]);

    const totalDuration = vid.duration;
    const interval = totalDuration / frameCount;
    const newFrames: StoryboardFrame[] = [];

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    
    // Thumbnail size
    const thumbWidth = 192;
    const thumbHeight = Math.round((vid.videoHeight / vid.videoWidth) * thumbWidth);
    canvas.width = thumbWidth;
    canvas.height = thumbHeight;

    for (let i = 0; i < frameCount; i++) {
      const time = i * interval;
      vid.currentTime = time;

      await new Promise<void>(resolve => {
        const onSeeked = () => {
          vid.removeEventListener('seeked', onSeeked);
          resolve();
        };
        vid.addEventListener('seeked', onSeeked);
      });

      ctx.drawImage(vid, 0, 0, thumbWidth, thumbHeight);
      const thumbnail = canvas.toDataURL('image/jpeg', 0.7);
      
      newFrames.push({ time, thumbnail });
      setProgress(((i + 1) / frameCount) * 100);
    }

    setFrames(newFrames);
    setIsGenerating(false);
  }, [frameCount]);

  useEffect(() => {
    const vid = videoRef.current;
    if (!vid) return;

    const onLoaded = () => {
      setDuration(vid.duration);
      generateStoryboard();
    };

    if (vid.readyState >= 1) {
      setDuration(vid.duration);
      generateStoryboard();
    } else {
      vid.addEventListener('loadedmetadata', onLoaded);
    }

    return () => {
      vid.removeEventListener('loadedmetadata', onLoaded);
    };
  }, [generateStoryboard]);

  const handleFrameClick = (frame: StoryboardFrame, index: number) => {
    setSelectedFrame(index);
    setShowPreview(true);
    
    // Set preview video to selected time
    const preview = previewRef.current;
    if (preview) {
      preview.currentTime = frame.time;
      preview.pause();
      setPreviewPlaying(false);
    }
  };

  const togglePreviewPlay = () => {
    const preview = previewRef.current;
    if (!preview) return;
    
    if (previewPlaying) {
      preview.pause();
      setPreviewPlaying(false);
    } else {
      preview.play();
      setPreviewPlaying(true);
    }
  };

  const handleOpenInPlayer = () => {
    if (selectedFrame !== null && frames[selectedFrame]) {
      onSeekTo?.(frames[selectedFrame].time);
    }
  };

  const handleSaveFrame = async (frame: StoryboardFrame, index: number) => {
    // Use the hidden video element to capture full resolution frame
    const vid = videoRef.current;
    if (!vid) return;

    // Seek to the frame time
    vid.currentTime = frame.time;
    
    await new Promise<void>(resolve => {
      const onSeeked = () => {
        vid.removeEventListener('seeked', onSeeked);
        resolve();
      };
      vid.addEventListener('seeked', onSeeked);
    });

    // Create full resolution canvas
    const canvas = document.createElement('canvas');
    canvas.width = vid.videoWidth || 1920;
    canvas.height = vid.videoHeight || 1080;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(vid, 0, 0, canvas.width, canvas.height);
    
    // Export as high-quality PNG
    canvas.toBlob(blob => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const videoName = video.name.replace(/\.[^/.]+$/, '');
      const timestamp = formatDuration(frame.time).replace(/:/g, '-');
      link.download = `${videoName}_frame${index + 1}_${timestamp}.png`;
      link.click();
      URL.revokeObjectURL(url);
    }, 'image/png');
  };

  const handleExportStoryboard = () => {
    if (frames.length === 0) return;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    
    const thumbWidth = 192;
    const thumbHeight = Math.round(thumbWidth * (9 / 16));
    const padding = 8;
    const cols = gridCols;
    const rows = Math.ceil(frames.length / cols);
    
    canvas.width = cols * (thumbWidth + padding) + padding;
    canvas.height = rows * (thumbHeight + padding + 24) + padding;
    
    // Background
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw frames
    const images = frames.map(f => {
      const img = new Image();
      img.src = f.thumbnail;
      return img;
    });

    Promise.all(images.map(img => new Promise(resolve => {
      img.onload = resolve;
      if (img.complete) resolve(null);
    }))).then(() => {
      frames.forEach((frame, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = padding + col * (thumbWidth + padding);
        const y = padding + row * (thumbHeight + padding + 24);
        
        // Border
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(x - 2, y - 2, thumbWidth + 4, thumbHeight + 4);
        
        // Image
        ctx.drawImage(images[i], x, y, thumbWidth, thumbHeight);
        
        // Timestamp
        ctx.fillStyle = '#94a3b8';
        ctx.font = '12px monospace';
        ctx.fillText(formatDuration(frame.time), x, y + thumbHeight + 16);
      });

      // Title
      ctx.fillStyle = '#e2e8f0';
      ctx.font = 'bold 14px sans-serif';
      ctx.fillText(video.name, padding, canvas.height - padding);

      canvas.toBlob(blob => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `storyboard_${video.name.replace(/\.[^/.]+$/, '')}.png`;
        a.click();
        URL.revokeObjectURL(url);
      }, 'image/png');
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={onClose}>
      <div 
        className="relative flex flex-col bg-slate-950 rounded-2xl overflow-hidden shadow-2xl shadow-black/60 border border-slate-800/60 w-full max-w-6xl max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Hidden video element for frame extraction */}
        <video
          ref={videoRef}
          src={video.url}
          className="hidden"
          preload="metadata"
          crossOrigin="anonymous"
        />

        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 bg-slate-900/80 border-b border-slate-800/60 flex-none">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-cyan-400" fill="currentColor" viewBox="0 0 24 24">
              <path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H8V4h12v12zM10 9h8v2h-8zm0 3h4v2h-4zm0-6h8v2h-8z"/>
            </svg>
            <span className="text-slate-200 font-semibold">Storyboard</span>
          </div>
          
          <p className="text-slate-500 text-sm truncate flex-1 ml-2">
            {video.name}
          </p>

          <span className="text-slate-600 text-xs">
            {formatDuration(duration)}
          </span>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center transition-colors"
          >
            <svg className="w-4 h-4 text-slate-400" fill="currentColor" viewBox="0 0 24 24">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
          </button>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-4 px-4 py-2 bg-slate-900/50 border-b border-slate-800/40 flex-none">
          <div className="flex items-center gap-2">
            <label className="text-slate-500 text-xs">Frames:</label>
            <select
              value={frameCount}
              onChange={e => setFrameCount(Number(e.target.value))}
              className="bg-slate-800 text-slate-300 text-xs rounded-lg px-2 py-1 border border-slate-700"
              disabled={isGenerating}
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={30}>30</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-slate-500 text-xs">Columns:</label>
            <select
              value={gridCols}
              onChange={e => setGridCols(Number(e.target.value))}
              className="bg-slate-800 text-slate-300 text-xs rounded-lg px-2 py-1 border border-slate-700"
            >
              <option value={3}>3</option>
              <option value={4}>4</option>
              <option value={5}>5</option>
              <option value={6}>6</option>
              <option value={8}>8</option>
              <option value={10}>10</option>
            </select>
          </div>

          <button
            onClick={generateStoryboard}
            disabled={isGenerating}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-700 text-white text-xs font-medium rounded-lg transition-colors"
          >
            <svg className={`w-3.5 h-3.5 ${isGenerating ? 'animate-spin' : ''}`} fill="currentColor" viewBox="0 0 24 24">
              <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
            </svg>
            {isGenerating ? 'Generating...' : 'Regenerate'}
          </button>

          <div className="flex-1" />

          <button
            onClick={handleExportStoryboard}
            disabled={frames.length === 0 || isGenerating}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 text-white text-xs font-medium rounded-lg transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M19 12v7H5v-7H3v7c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-7h-2zm-6 .67l2.59-2.58L17 11.5l-5 5-5-5 1.41-1.41L11 12.67V3h2v9.67z"/>
            </svg>
            Export PNG
          </button>
        </div>

        {/* Progress bar */}
        {isGenerating && (
          <div className="h-1 bg-slate-800 flex-none">
            <div 
              className="h-full bg-cyan-500 transition-all duration-150"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}

        {/* Storyboard Grid */}
        <div className="flex-1 overflow-y-auto p-4">
          {frames.length === 0 && !isGenerating ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-slate-500">
              <svg className="w-12 h-12" fill="currentColor" viewBox="0 0 24 24">
                <path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H8V4h12v12z"/>
              </svg>
              <p className="text-sm">Generating storyboard...</p>
            </div>
          ) : (
            <div 
              className="grid gap-3"
              style={{ gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))` }}
            >
              {frames.map((frame, index) => (
                <div
                  key={index}
                  className={`group relative rounded-xl overflow-hidden transition-all hover:ring-2 hover:ring-cyan-500 ${
                    selectedFrame === index ? 'ring-2 ring-cyan-500' : ''
                  }`}
                >
                  <button
                    onClick={() => handleFrameClick(frame, index)}
                    className="w-full"
                  >
                    <img
                      src={frame.thumbnail}
                      alt={`Frame at ${formatDuration(frame.time)}`}
                      className="w-full aspect-video object-cover bg-slate-800"
                      draggable={false}
                    />
                  </button>
                  
                  {/* Frame number badge */}
                  <div className="absolute top-1.5 left-1.5 bg-black/70 backdrop-blur-sm text-white text-xs px-1.5 py-0.5 rounded-md font-mono">
                    #{index + 1}
                  </div>

                  {/* Save button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSaveFrame(frame, index);
                    }}
                    className="absolute top-1.5 right-1.5 w-7 h-7 rounded-lg bg-emerald-600 hover:bg-emerald-500 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all shadow-lg"
                    title="Save as PNG"
                  >
                    <svg className="w-3.5 h-3.5 text-white" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M19 12v7H5v-7H3v7c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-7h-2zm-6 .67l2.59-2.58L17 11.5l-5 5-5-5 1.41-1.41L11 12.67V3h2v9.67z"/>
                    </svg>
                  </button>
                  
                  {/* Timestamp */}
                  <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent px-2 py-1.5">
                    <span className="text-white text-xs font-mono">
                      {formatDuration(frame.time)}
                    </span>
                  </div>

                  {/* Hover overlay - play button */}
                  <button
                    onClick={() => handleFrameClick(frame, index)}
                    className="absolute inset-0 bg-cyan-500/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none"
                  >
                    <div className="w-10 h-10 rounded-full bg-cyan-500/80 flex items-center justify-center">
                      <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z"/>
                      </svg>
                    </div>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Preview Panel */}
        {showPreview && selectedFrame !== null && frames[selectedFrame] && (
          <div className="flex-none bg-slate-900/90 border-t border-slate-800/60 p-4">
            <div className="flex gap-4">
              {/* Preview Video */}
              <div className="relative w-80 aspect-video bg-black rounded-xl overflow-hidden flex-none">
                <video
                  ref={previewRef}
                  src={video.url}
                  className="w-full h-full object-contain"
                  onPlay={() => setPreviewPlaying(true)}
                  onPause={() => setPreviewPlaying(false)}
                />
                
                {/* Play/Pause overlay */}
                <button
                  onClick={togglePreviewPlay}
                  className="absolute inset-0 flex items-center justify-center bg-black/20 hover:bg-black/30 transition-colors"
                >
                  <div className="w-12 h-12 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center">
                    {previewPlaying ? (
                      <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
                      </svg>
                    ) : (
                      <svg className="w-5 h-5 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z"/>
                      </svg>
                    )}
                  </div>
                </button>
              </div>
              
              {/* Preview Info & Actions */}
              <div className="flex-1 flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <span className="text-cyan-400 font-bold text-lg">Frame #{selectedFrame + 1}</span>
                  <span className="text-slate-500 text-sm font-mono">{formatDuration(frames[selectedFrame].time)}</span>
                </div>
                
                <p className="text-slate-400 text-sm">
                  Klicke auf Play um von dieser Position aus eine Vorschau zu sehen.
                </p>
                
                <div className="flex items-center gap-2 mt-auto">
                  <button
                    onClick={togglePreviewPlay}
                    className="flex items-center gap-1.5 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    {previewPlaying ? (
                      <>
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
                        </svg>
                        Pause
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M8 5v14l11-7z"/>
                        </svg>
                        Preview
                      </>
                    )}
                  </button>
                  
                  <button
                    onClick={() => handleSaveFrame(frames[selectedFrame], selectedFrame)}
                    className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M19 12v7H5v-7H3v7c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-7h-2zm-6 .67l2.59-2.58L17 11.5l-5 5-5-5 1.41-1.41L11 12.67V3h2v9.67z"/>
                    </svg>
                    Save PNG
                  </button>
                  
                  <button
                    onClick={handleOpenInPlayer}
                    className="flex items-center gap-1.5 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/>
                    </svg>
                    Open in Player
                  </button>
                  
                  <div className="flex-1" />
                  
                  <button
                    onClick={() => setShowPreview(false)}
                    className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center transition-colors"
                    title="Close preview"
                  >
                    <svg className="w-4 h-4 text-slate-400" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-2 bg-slate-900/80 border-t border-slate-800/60 flex-none">
          <span className="text-slate-600 text-xs">
            {frames.length} frames · {formatDuration(duration / frameCount)} interval
          </span>
          <span className="text-slate-600 text-xs">
            Click a frame to preview · Hover for save option
          </span>
        </div>
      </div>
    </div>
  );
}

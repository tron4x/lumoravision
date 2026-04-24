import { useState, useRef, useCallback, useEffect } from 'react';
import type { ImageFile } from '../types/video';
import { formatFileSize } from '../utils/format';

interface ImageViewerProps {
  image: ImageFile;
  images: ImageFile[];
  onClose: () => void;
  onNavigate: (image: ImageFile) => void;
}

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 10;

function clampZoom(z: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
}

/** Inner viewer – remounted via key when image changes, so state resets automatically */
function ImageViewerInner({ image, images, onClose, onNavigate, isMaximized, setIsMaximized }: ImageViewerProps & {
  isMaximized: boolean;
  setIsMaximized: (v: boolean) => void;
}) {
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [imgNaturalSize, setImgNaturalSize] = useState<{ w: number; h: number } | null>(null);
  const dragStart = useRef<{ mx: number; my: number; ox: number; oy: number } | null>(null);

  const idx = images.findIndex(i => i.id === image.id);
  const hasPrev = idx > 0;
  const hasNext = idx < images.length - 1;

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom(z => clampZoom(z * delta));
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    dragStart.current = { mx: e.clientX, my: e.clientY, ox: offset.x, oy: offset.y };
    setIsDragging(true);
  }, [offset]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragStart.current) return;
    setOffset({
      x: dragStart.current.ox + (e.clientX - dragStart.current.mx),
      y: dragStart.current.oy + (e.clientY - dragStart.current.my),
    });
  }, []);

  const handleMouseUp = useCallback(() => {
    dragStart.current = null;
    setIsDragging(false);
  }, []);

  const handleDoubleClick = useCallback(() => {
    if (zoom !== 1) { setZoom(1); setOffset({ x: 0, y: 0 }); }
    else setZoom(2);
  }, [zoom]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft' && hasPrev) onNavigate(images[idx - 1]);
      else if (e.key === 'ArrowRight' && hasNext) onNavigate(images[idx + 1]);
      else if (e.key === '+' || e.key === '=') setZoom(z => clampZoom(z * 1.2));
      else if (e.key === '-') setZoom(z => clampZoom(z / 1.2));
      else if (e.key === '0') { setZoom(1); setOffset({ x: 0, y: 0 }); }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [hasPrev, hasNext, idx, images, onClose, onNavigate]);

  const zoomPct = Math.round(zoom * 100);

  return (
    <>
      {/* Title bar */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-900/80 border-b border-slate-800/60 flex-none rounded-t-2xl">
        <button onClick={onClose} className="w-3 h-3 rounded-full bg-red-500 hover:bg-red-400 flex-none" title="Close (Esc)" />
        <div className="w-3 h-3 rounded-full bg-slate-700 flex-none" />
        <div className="w-3 h-3 rounded-full bg-slate-700 flex-none" />

        <div className="flex items-center gap-1 ml-2">
          <svg className="w-3.5 h-3.5 text-emerald-400" fill="currentColor" viewBox="0 0 24 24">
            <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/>
          </svg>
          <span className="text-xs font-bold text-emerald-400 uppercase tracking-wide">IMAGE</span>
        </div>

        <p className="flex-1 text-slate-300 text-sm font-medium truncate ml-1" title={image.name}>{image.name}</p>

        {imgNaturalSize && (
          <span className="text-xs text-slate-500 flex-none">{imgNaturalSize.w} × {imgNaturalSize.h}px</span>
        )}
        <span className="text-xs text-slate-500 flex-none">{formatFileSize(image.size)}</span>
        <span className="text-xs font-bold uppercase px-2 py-0.5 rounded bg-emerald-800/60 text-emerald-300 flex-none">{image.extension}</span>

        <div className="flex items-center gap-1 flex-none">
          <button onClick={() => hasPrev && onNavigate(images[idx - 1])} disabled={!hasPrev}
            className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-30 flex items-center justify-center transition-colors" title="Previous (←)">
            <svg className="w-3.5 h-3.5 text-slate-300" fill="currentColor" viewBox="0 0 24 24"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>
          </button>
          <span className="text-xs text-slate-600 tabular-nums">{idx + 1}/{images.length}</span>
          <button onClick={() => hasNext && onNavigate(images[idx + 1])} disabled={!hasNext}
            className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-30 flex items-center justify-center transition-colors" title="Next (→)">
            <svg className="w-3.5 h-3.5 text-slate-300" fill="currentColor" viewBox="0 0 24 24"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
          </button>
        </div>

        <button onClick={() => setIsMaximized(!isMaximized)}
          className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${isMaximized ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-500 hover:bg-slate-700 hover:text-slate-300'}`}
          title="Maximize">
          {isMaximized
            ? <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/></svg>
            : <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>
          }
        </button>

        <button onClick={onClose} className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center transition-colors flex-none">
          <svg className="w-3.5 h-3.5 text-slate-400" fill="currentColor" viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
        </button>
      </div>

      {/* Image canvas */}
      <div
        className="flex-1 overflow-hidden relative bg-[#0a0a0f] select-none"
        style={{ cursor: isDragging ? 'grabbing' : zoom > 1 ? 'grab' : 'default' }}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onDoubleClick={handleDoubleClick}
      >
        {/* Checkerboard for transparent images */}
        <div className="absolute inset-0"
          style={{ backgroundImage: 'repeating-conic-gradient(#1e293b 0% 25%, #0f172a 0% 50%)', backgroundSize: '20px 20px' }}
        />

        <img
          src={image.url}
          alt={image.name}
          draggable={false}
          onLoad={e => {
            const img = e.currentTarget;
            setImgNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
          }}
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px)) scale(${zoom})`,
            transformOrigin: 'center center',
            maxWidth: '100%',
            maxHeight: '100%',
            objectFit: 'contain',
            transition: isDragging ? 'none' : 'transform 0.05s ease-out',
            imageRendering: zoom > 2 ? 'pixelated' : 'auto',
          }}
        />

        {hasPrev && (
          <button
            className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/50 hover:bg-black/70 text-white flex items-center justify-center transition-colors z-10"
            onClick={e => { e.stopPropagation(); onNavigate(images[idx - 1]); }}
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>
          </button>
        )}
        {hasNext && (
          <button
            className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/50 hover:bg-black/70 text-white flex items-center justify-center transition-colors z-10"
            onClick={e => { e.stopPropagation(); onNavigate(images[idx + 1]); }}
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
          </button>
        )}
      </div>

      {/* Zoom controls */}
      <div className="flex-none bg-slate-900/90 px-4 py-2.5 border-t border-slate-800/60 flex items-center gap-3">
        <button onClick={() => setZoom(z => clampZoom(z / 1.2))}
          className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center transition-colors" title="Zoom out (-)">
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14zM7 9h5v1H7z"/></svg>
        </button>

        <input
          type="range" min={10} max={1000} step={1} value={zoomPct}
          onChange={e => setZoom(parseInt(e.target.value) / 100)}
          className="flex-1 accent-emerald-500 cursor-pointer"
        />

        <button onClick={() => setZoom(z => clampZoom(z * 1.2))}
          className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center transition-colors" title="Zoom in (+)">
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14zm4-4h-3V7H9v3H6v1h3v3h1v-3h3v-1z"/></svg>
        </button>

        <button onClick={() => { setZoom(1); setOffset({ x: 0, y: 0 }); }}
          className="w-14 text-center text-xs font-mono text-slate-300 bg-slate-800 hover:bg-slate-700 px-2 py-1 rounded-lg transition-colors" title="Reset zoom (0)">
          {zoomPct}%
        </button>

        <button onClick={() => { setZoom(1); setOffset({ x: 0, y: 0 }); }}
          className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 text-xs transition-colors">Fit</button>
        <button onClick={() => { setZoom(1); setOffset({ x: 0, y: 0 }); }}
          className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 text-xs transition-colors">100%</button>
        <button onClick={() => { setZoom(2); setOffset({ x: 0, y: 0 }); }}
          className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 text-xs transition-colors">200%</button>

        <div className="flex-1" />
        <span className="text-slate-700 text-xs hidden sm:block">Scroll to zoom · Drag to pan · Double-click to toggle · ← → navigate</span>
      </div>
    </>
  );
}

/** Outer shell – keeps isMaximized state across image navigation */
export function ImageViewer({ image, images, onClose, onNavigate }: ImageViewerProps) {
  const [isMaximized, setIsMaximized] = useState(false);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className={`relative flex flex-col bg-slate-950 border border-slate-800/60 shadow-2xl shadow-black/60 transition-all duration-300 ${isMaximized ? 'w-full h-full rounded-none' : 'rounded-2xl max-w-5xl w-full'}`}
        style={{ height: isMaximized ? '100vh' : 'calc(100vh - 2rem)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* key=image.id causes ImageViewerInner to remount → zoom/pan reset automatically */}
        <ImageViewerInner
          key={image.id}
          image={image}
          images={images}
          onClose={onClose}
          onNavigate={onNavigate}
          isMaximized={isMaximized}
          setIsMaximized={setIsMaximized}
        />
      </div>
    </div>
  );
}

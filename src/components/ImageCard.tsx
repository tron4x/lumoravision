import { useRef, useState, useEffect, memo } from 'react';
import type { ImageFile } from '../types/video';
import { formatFileSize, formatDate } from '../utils/format';

interface ImageCardProps {
  image: ImageFile;
  onOpen: (image: ImageFile) => void;
}

const extColors: Record<string, string> = {
  jpg: 'bg-amber-600',
  jpeg: 'bg-amber-600',
  png: 'bg-emerald-600',
  gif: 'bg-pink-600',
  webp: 'bg-teal-600',
  avif: 'bg-violet-600',
  bmp: 'bg-slate-500',
  tiff: 'bg-slate-500',
  tif: 'bg-slate-500',
  svg: 'bg-orange-500',
  heic: 'bg-blue-500',
  heif: 'bg-blue-500',
};

export const ImageCard = memo(function ImageCard({ image, onOpen }: ImageCardProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [inViewport, setInViewport] = useState(false);

  // Lazy load: only render <img> when in viewport
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

  const extColor = extColors[image.extension] ?? 'bg-slate-600';

  return (
    <div
      ref={containerRef}
      className="group relative bg-slate-900 rounded-xl overflow-hidden cursor-pointer border-2 border-emerald-800/60 hover:border-emerald-400/80 transition-all duration-300 hover:shadow-lg hover:shadow-emerald-500/10 hover:-translate-y-0.5"
      onClick={() => onOpen(image)}
      title={image.name}
    >
      {/* IMAGE badge – deutlich sichtbar */}
      <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-2 py-1 bg-emerald-900/80 backdrop-blur-sm border-b border-emerald-700/50">
        <div className="flex items-center gap-1">
          <svg className="w-3 h-3 text-emerald-400" fill="currentColor" viewBox="0 0 24 24">
            <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/>
          </svg>
          <span className="text-emerald-300 text-xs font-bold tracking-wide">IMAGE</span>
        </div>
        <span className={`${extColor} text-white text-xs px-1.5 py-0.5 rounded font-bold uppercase`}>
          {image.extension}
        </span>
      </div>

      {/* Image preview */}
      <div className="relative aspect-video bg-slate-950 overflow-hidden">
        {inViewport ? (
          <img
            src={image.url}
            alt={image.name}
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
            draggable={false}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-900">
            <div className="w-6 h-6 border-2 border-slate-700 border-t-emerald-500 rounded-full animate-spin" />
          </div>
        )}

        {/* Hover overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-900/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

        {/* Zoom icon on hover */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          <div className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center border border-white/30">
            <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14zm2.5-4h-2v2H9v-2H7V9h2V7h1v2h2v1z"/>
            </svg>
          </div>
        </div>
      </div>

      {/* Info */}
      <div className="p-3 border-t border-emerald-900/40">
        <h3
          className="text-sm font-medium text-slate-200 truncate group-hover:text-white transition-colors"
          title={image.name}
        >
          {image.name.replace(/\.[^/.]+$/, '')}
        </h3>
        <div className="flex items-center justify-between mt-1.5">
          <span className="text-xs text-slate-500">{formatFileSize(image.size)}</span>
          <span className="text-xs text-slate-600">{formatDate(image.lastModified)}</span>
        </div>
      </div>
    </div>
  );
});

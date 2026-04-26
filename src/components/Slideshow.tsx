import { useState, useEffect, useCallback, useRef } from 'react';
import type { ImageFile } from '../types/video';

interface SlideshowProps {
  images: ImageFile[];
  startIndex?: number;
  onClose: () => void;
}

const INTERVALS = [2, 3, 5, 8, 10] as const;
type Interval = typeof INTERVALS[number];

const TRANSITIONS = ['fade', 'slide', 'zoom'] as const;
type Transition = typeof TRANSITIONS[number];

export function Slideshow({ images, startIndex = 0, onClose }: SlideshowProps) {
  const [index, setIndex] = useState(startIndex);
  const [isPlaying, setIsPlaying] = useState(true);
  const [interval, setInterval_] = useState<Interval>(5);
  const [transition, setTransition] = useState<Transition>('fade');
  const [showControls, setShowControls] = useState(true);
  const [animating, setAnimating] = useState(false);
  const [direction, setDirection] = useState<'next' | 'prev'>('next');
  const [showSettings, setShowSettings] = useState(false);

  const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const current = images[index];
  const total = images.length;

  // Auto-hide controls
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
      if (playTimerRef.current) clearTimeout(playTimerRef.current);
    };
  }, []);

  // Transition helper
  const goTo = useCallback((nextIndex: number, dir: 'next' | 'prev') => {
    if (animating) return;
    setDirection(dir);
    setAnimating(true);
    setTimeout(() => {
      setIndex(nextIndex);
      setAnimating(false);
    }, 350);
  }, [animating]);

  const goNext = useCallback(() => {
    goTo((index + 1) % total, 'next');
  }, [goTo, index, total]);

  const goPrev = useCallback(() => {
    goTo((index - 1 + total) % total, 'prev');
  }, [goTo, index, total]);

  // Auto-play
  useEffect(() => {
    if (!isPlaying) return;
    playTimerRef.current = setTimeout(() => {
      goNext();
    }, interval * 1000);
    return () => { if (playTimerRef.current) clearTimeout(playTimerRef.current); };
  }, [isPlaying, interval, index, goNext]);

  // Keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); goNext(); }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); goPrev(); }
      if (e.key === ' ') { e.preventDefault(); setIsPlaying(p => !p); }
      if (e.key === 'f' || e.key === 'F') {
        if (document.fullscreenElement) document.exitFullscreen();
        else document.documentElement.requestFullscreen().catch(() => {});
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goNext, goPrev, onClose]);

  // CSS classes for transition
  const getImgClass = () => {
    if (!animating) return 'opacity-100 translate-x-0 scale-100';
    if (transition === 'fade') return 'opacity-0 translate-x-0 scale-100';
    if (transition === 'slide') return direction === 'next' ? 'opacity-0 -translate-x-8' : 'opacity-0 translate-x-8';
    if (transition === 'zoom') return 'opacity-0 scale-110';
    return 'opacity-100';
  };

  return (
    <div
      className="fixed inset-0 z-[100] bg-black flex flex-col"
      onMouseMove={resetControlsTimer}
      onClick={() => setShowControls(p => !p)}
    >
      {/* Image */}
      <div className="flex-1 relative flex items-center justify-center overflow-hidden">
        <img
          key={index}
          src={current.url}
          alt={current.name}
          draggable={false}
          className={`max-w-full max-h-full object-contain select-none transition-all duration-350 ease-in-out ${getImgClass()}`}
          style={{ transitionDuration: '350ms' }}
        />

        {/* Prev / Next click zones */}
        <button
          className="absolute left-0 top-0 h-full w-1/4 flex items-center justify-start pl-4 opacity-0 hover:opacity-100 transition-opacity"
          onClick={e => { e.stopPropagation(); goPrev(); }}
          aria-label="Previous"
        >
          <div className="w-10 h-10 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center border border-white/20">
            <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>
          </div>
        </button>
        <button
          className="absolute right-0 top-0 h-full w-1/4 flex items-center justify-end pr-4 opacity-0 hover:opacity-100 transition-opacity"
          onClick={e => { e.stopPropagation(); goNext(); }}
          aria-label="Next"
        >
          <div className="w-10 h-10 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center border border-white/20">
            <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
          </div>
        </button>
      </div>

      {/* Top bar */}
      <div
        className={`absolute top-0 left-0 right-0 flex items-center gap-3 px-4 py-3 bg-gradient-to-b from-black/80 to-transparent transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={e => e.stopPropagation()}
      >
        {/* Title */}
        <div className="flex-1 min-w-0">
          <p className="text-white text-sm font-medium truncate">{current.name.replace(/\.[^/.]+$/, '')}</p>
          <p className="text-slate-400 text-xs">{index + 1} / {total}</p>
        </div>

        {/* Settings toggle */}
        <button
          onClick={() => setShowSettings(p => !p)}
          className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${showSettings ? 'bg-emerald-600 text-white' : 'bg-black/50 text-slate-300 hover:text-white'}`}
          title="Settings"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
          </svg>
        </button>

        {/* Fullscreen */}
        <button
          onClick={() => {
            if (document.fullscreenElement) document.exitFullscreen();
            else document.documentElement.requestFullscreen().catch(() => {});
          }}
          className="w-8 h-8 rounded-lg bg-black/50 text-slate-300 hover:text-white flex items-center justify-center transition-colors"
          title="Fullscreen (F)"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/>
          </svg>
        </button>

        {/* Close */}
        <button
          onClick={onClose}
          className="w-8 h-8 rounded-lg bg-black/50 text-slate-300 hover:text-white flex items-center justify-center transition-colors"
          title="Close (Esc)"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
        </button>
      </div>

      {/* Settings panel */}
      {showSettings && showControls && (
        <div
          className="absolute top-14 right-4 bg-slate-900/95 backdrop-blur-sm border border-slate-700 rounded-xl p-4 w-56 space-y-4 z-10"
          onClick={e => e.stopPropagation()}
        >
          {/* Interval */}
          <div>
            <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-2">Interval</p>
            <div className="flex gap-1 flex-wrap">
              {INTERVALS.map(s => (
                <button
                  key={s}
                  onClick={() => setInterval_(s)}
                  className={`px-2 py-1 rounded-lg text-xs font-medium transition-colors ${interval === s ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
                >
                  {s}s
                </button>
              ))}
            </div>
          </div>

          {/* Transition */}
          <div>
            <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-2">Transition</p>
            <div className="flex gap-1">
              {TRANSITIONS.map(t => (
                <button
                  key={t}
                  onClick={() => setTransition(t)}
                  className={`px-2 py-1 rounded-lg text-xs font-medium capitalize transition-colors ${transition === t ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Bottom controls */}
      <div
        className={`absolute bottom-0 left-0 right-0 flex flex-col gap-2 px-4 pb-4 pt-8 bg-gradient-to-t from-black/80 to-transparent transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={e => e.stopPropagation()}
      >
        {/* Progress dots (max 20 shown) */}
        <div className="flex items-center justify-center gap-1 mb-1">
          {total <= 20 ? (
            images.map((_, i) => (
              <button
                key={i}
                onClick={() => goTo(i, i > index ? 'next' : 'prev')}
                className={`rounded-full transition-all ${i === index ? 'w-4 h-2 bg-emerald-400' : 'w-2 h-2 bg-white/30 hover:bg-white/60'}`}
              />
            ))
          ) : (
            <div className="h-1 w-48 bg-white/20 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-400 rounded-full transition-all"
                style={{ width: `${((index + 1) / total) * 100}%` }}
              />
            </div>
          )}
        </div>

        {/* Playback controls */}
        <div className="flex items-center justify-center gap-3">
          {/* Prev */}
          <button
            onClick={goPrev}
            className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
          >
            <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>
          </button>

          {/* Play / Pause */}
          <button
            onClick={() => setIsPlaying(p => !p)}
            className="w-11 h-11 rounded-xl bg-emerald-600 hover:bg-emerald-500 flex items-center justify-center transition-colors"
          >
            {isPlaying ? (
              <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
            ) : (
              <svg className="w-5 h-5 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
            )}
          </button>

          {/* Next */}
          <button
            onClick={goNext}
            className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
          >
            <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
          </button>
        </div>

        {/* Shortcuts hint */}
        <p className="text-center text-slate-600 text-xs">
          Space (play) · ← → (navigate) · F (fullscreen) · Esc (close)
        </p>
      </div>
    </div>
  );
}

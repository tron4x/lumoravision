/**
 * FrameScrubber.tsx — reusable filmstrip + draggable IN/OUT scrubber
 * ──────────────────────────────────────────────────────────────────
 *
 * Originally lived inline inside DirectorMode for trimming clips. Extracted
 * here so the regular VideoPlayer's GIF-export panel can use the exact same
 * UI when the user wants frame-precise control over the GIF range.
 *
 * What it does:
 *   • Renders a 16-thumbnail filmstrip across the full clip duration (lazily
 *     generated off-screen).
 *   • Two draggable markers (IN / OUT) sit on top of the strip; the area
 *     outside the IN/OUT range is dimmed.
 *   • Clicking or dragging on the strip itself scrubs a *given* video
 *     element (so the big preview moves with the user's cursor) and shows
 *     a cyan playhead line.
 *   • Frame-step buttons (±1 s and ±1 frame at 30 fps) and dedicated
 *     "Set IN / Set OUT" buttons pin the markers to the current scrub
 *     position.
 *
 * Inputs:
 *   • `videoUrl` — the source the filmstrip is generated from. Independent
 *     of the preview video, since callers may want the strip to reflect the
 *     entire video while the preview shows only the selected range.
 *   • `videoRef` — the *preview* <video> element to seek as the user scrubs.
 *   • `dur` — total duration of the source.
 *   • `inT`, `outT` — current marker times (controlled component).
 *   • `onSetIn`, `onSetOut` — change handlers for the marker times.
 *
 * The component is intentionally stateless about the IN/OUT values — the
 * parent owns them — so the same data can flow into other UI bits (sliders,
 * scene-pick buttons, etc.) without sync drift.
 */

import { useRef, useState, useEffect, useCallback } from 'react';
import { formatDuration } from '../utils/format';

const FRAME_STEP = 1 / 30;
const STRIP_THUMBS = 16;

export interface FrameScrubberProps {
  /** Source URL the filmstrip is generated from. */
  videoUrl: string;
  /** Total duration of the source video in seconds. */
  dur: number;
  /** Current IN time. */
  inT: number;
  /** Current OUT time. */
  outT: number;
  /** Called when the user drags the IN marker or clicks "Set IN". */
  onSetIn: (t: number) => void;
  /** Called when the user drags the OUT marker or clicks "Set OUT". */
  onSetOut: (t: number) => void;
  /** The preview <video> element to seek live as the user scrubs. */
  videoRef: React.RefObject<HTMLVideoElement | null>;
  /** Optional accent colour for buttons / "Set IN/OUT" badges. */
  accent?: 'amber' | 'purple' | 'cyan';
}

export function FrameScrubber({
  videoUrl,
  dur,
  inT,
  outT,
  onSetIn,
  onSetOut,
  videoRef,
  accent = 'amber',
}: FrameScrubberProps) {
  const stripRef = useRef<HTMLDivElement>(null);
  const thumbVideoRef = useRef<HTMLVideoElement | null>(null);
  const [thumbs, setThumbs] = useState<string[]>([]);
  const [scrubTime, setScrubTime] = useState(inT);
  const [dragging, setDragging] = useState<'in' | 'out' | 'scrub' | null>(null);
  const dragRef = useRef<'in' | 'out' | 'scrub' | null>(null);

  // Seek pump — coalesces rapid scrubs so the underlying preview <video>
  // never gets a backlog of seeks; we always honour the most recent one.
  const seekingRef = useRef(false);
  const pendingSeekRef = useRef<number | null>(null);
  const seekMain = useCallback((t: number) => {
    const main = videoRef.current;
    if (!main) return;
    if (!main.paused) main.pause();
    const run = (target: number) => {
      const m = videoRef.current;
      if (!m) return;
      if (seekingRef.current) {
        pendingSeekRef.current = target;
        return;
      }
      seekingRef.current = true;
      const onSeeked = () => {
        m.removeEventListener('seeked', onSeeked);
        const next = pendingSeekRef.current;
        pendingSeekRef.current = null;
        seekingRef.current = false;
        if (next !== null) run(next);
      };
      m.addEventListener('seeked', onSeeked);
      try { m.currentTime = Math.max(0, Math.min(dur, target)); } catch { seekingRef.current = false; }
    };
    run(t);
  }, [videoRef, dur]);

  // ── Build filmstrip thumbnails (lazy, off-screen video) ─────────────
  useEffect(() => {
    let cancelled = false;
    // Reset thumbs immediately on source change so the previous strip
    // doesn't linger while the new one is being built.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setThumbs([]);

    const v = document.createElement('video');
    v.muted = true; v.playsInline = true; v.preload = 'auto';
    v.src = videoUrl; v.load();
    thumbVideoRef.current = v;

    const dispose = () => {
      try { v.pause(); v.removeAttribute('src'); v.load(); } catch { /* ignore */ }
      thumbVideoRef.current = null;
    };

    const generate = async () => {
      if (v.readyState < 1) {
        await new Promise<void>(r => {
          const onMeta = () => { v.removeEventListener('loadedmetadata', onMeta); r(); };
          v.addEventListener('loadedmetadata', onMeta);
        });
      }
      if (cancelled) return;

      const c = document.createElement('canvas');
      c.width = 96; c.height = 54;
      const ctx = c.getContext('2d');
      if (!ctx) { dispose(); return; }

      const result: string[] = new Array(STRIP_THUMBS).fill('');
      for (let i = 0; i < STRIP_THUMBS; i++) {
        if (cancelled) { dispose(); return; }
        const t = (i / (STRIP_THUMBS - 1)) * Math.max(0.1, dur - 0.1);
        await new Promise<void>(resolve => {
          let done = false;
          const finish = () => {
            if (done) return;
            done = true;
            v.removeEventListener('seeked', onSeeked);
            clearTimeout(timer);
            resolve();
          };
          const onSeeked = () => finish();
          const timer = setTimeout(finish, 3000);
          v.addEventListener('seeked', onSeeked);
          try { v.currentTime = t; } catch { finish(); }
        });
        if (cancelled) { dispose(); return; }
        try {
          ctx.drawImage(v, 0, 0, c.width, c.height);
          result[i] = c.toDataURL('image/jpeg', 0.65);
          if (!cancelled) setThumbs([...result]);
        } catch { /* skip this frame */ }
      }
      dispose();
    };

    generate();
    return () => { cancelled = true; dispose(); };
  }, [videoUrl, dur]);

  // Initial scrub position when source changes
  const lastUrlRef = useRef<string>('');
  useEffect(() => {
    if (lastUrlRef.current === videoUrl) return;
    lastUrlRef.current = videoUrl;
    setScrubTime(inT);
    seekMain(inT);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoUrl]);

  const pct = (t: number) => `${(t / Math.max(0.001, dur)) * 100}%`;

  const timeFromClientX = useCallback((clientX: number): number => {
    const el = stripRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return ratio * dur;
  }, [dur]);

  // Global mousemove/up while dragging
  useEffect(() => {
    if (!dragging) return;
    const onMove = (ev: MouseEvent) => {
      const t = timeFromClientX(ev.clientX);
      const which = dragRef.current;
      if (which === 'in') {
        const clamped = Math.max(0, Math.min(t, outT - FRAME_STEP));
        onSetIn(clamped);
        setScrubTime(clamped);
        seekMain(clamped);
      } else if (which === 'out') {
        const clamped = Math.max(inT + FRAME_STEP, Math.min(t, dur));
        onSetOut(clamped);
        setScrubTime(clamped);
        seekMain(clamped);
      } else if (which === 'scrub') {
        setScrubTime(t);
        seekMain(t);
      }
    };
    const onUp = () => { dragRef.current = null; setDragging(null); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [dragging, timeFromClientX, onSetIn, onSetOut, inT, outT, dur, seekMain]);

  const onStripMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const t = timeFromClientX(e.clientX);
    setScrubTime(t);
    seekMain(t);
    dragRef.current = 'scrub';
    setDragging('scrub');
  };

  const startDragMarker = useCallback((which: 'in' | 'out') => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = which;
    setDragging(which);
  }, []);

  const step = (delta: number) => {
    const next = Math.max(0, Math.min(dur, scrubTime + delta));
    setScrubTime(next);
    seekMain(next);
  };

  // ── Accent helpers (Tailwind needs static class names) ─────────────
  const accentBtn = {
    amber:  'bg-amber-600/20 hover:bg-amber-600/40 text-amber-400 border-amber-500/30',
    purple: 'bg-purple-600/20 hover:bg-purple-600/40 text-purple-300 border-purple-500/30',
    cyan:   'bg-cyan-600/20 hover:bg-cyan-600/40 text-cyan-300 border-cyan-500/30',
  }[accent];
  const accentRegion = {
    amber:  'border-amber-500/80',
    purple: 'border-purple-500/80',
    cyan:   'border-cyan-500/80',
  }[accent];

  return (
    <div className="rounded-xl overflow-hidden border border-slate-700/60 bg-slate-900">
      {/* Filmstrip */}
      <div className="relative select-none" style={{ height: '64px' }}>
        <div
          ref={stripRef}
          className="absolute inset-0 flex bg-black cursor-crosshair"
          onMouseDown={onStripMouseDown}
        >
          {Array.from({ length: STRIP_THUMBS }).map((_, i) => (
            <div
              key={i}
              className="flex-1 h-full overflow-hidden border-r border-black/40 last:border-r-0"
              style={{ backgroundColor: '#0f172a' }}
            >
              {thumbs[i]
                ? <img src={thumbs[i]} alt="" draggable={false} className="w-full h-full object-cover" />
                : <div className="w-full h-full flex items-center justify-center"><div className="w-2 h-2 rounded-full bg-slate-700 animate-pulse" /></div>
              }
            </div>
          ))}
        </div>

        {/* Dimmed area BEFORE IN */}
        <div className="absolute top-0 bottom-0 left-0 bg-black/60 pointer-events-none" style={{ width: pct(inT) }} />
        {/* Dimmed area AFTER OUT */}
        <div className="absolute top-0 bottom-0 right-0 bg-black/60 pointer-events-none" style={{ left: pct(outT) }} />

        {/* IN/OUT highlighted region */}
        <div
          className={`absolute top-0 bottom-0 border-y-2 ${accentRegion} pointer-events-none`}
          style={{ left: pct(inT), width: `calc(${pct(outT)} - ${pct(inT)})` }}
        />

        {/* Scrub head (current frame) */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-cyan-400 pointer-events-none shadow-[0_0_4px_rgba(34,211,238,0.8)]"
          style={{ left: pct(scrubTime) }}
        />

        {/* IN marker */}
        <div
          onMouseDown={startDragMarker('in')}
          className="absolute top-0 bottom-0 w-3 cursor-ew-resize z-10"
          style={{ left: `calc(${pct(inT)} - 6px)` }}
          title={`IN: ${formatDuration(inT)}`}
        >
          <div className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-1 bg-green-500" />
          <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-3 h-3 rounded-sm bg-green-500 shadow-md" />
          <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-3 h-3 rounded-sm bg-green-500 shadow-md" />
        </div>

        {/* OUT marker */}
        <div
          onMouseDown={startDragMarker('out')}
          className="absolute top-0 bottom-0 w-3 cursor-ew-resize z-10"
          style={{ left: `calc(${pct(outT)} - 6px)` }}
          title={`OUT: ${formatDuration(outT)}`}
        >
          <div className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-1 bg-red-500" />
          <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-3 h-3 rounded-sm bg-red-500 shadow-md" />
          <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-3 h-3 rounded-sm bg-red-500 shadow-md" />
        </div>
      </div>

      {/* Timecode + step controls */}
      <div className="flex items-center gap-2 px-3 py-2 bg-slate-900/80 border-t border-slate-800">
        <div className="flex items-center gap-1 text-xs font-mono">
          <span className="text-green-400">IN {formatDuration(inT)}</span>
          <span className="text-slate-600">·</span>
          <span className="text-cyan-400">@ {formatDuration(scrubTime)}</span>
          <span className="text-slate-600">·</span>
          <span className="text-red-400">OUT {formatDuration(outT)}</span>
        </div>

        <div className="flex-1" />

        <button onClick={() => step(-1)} className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-400 text-xs rounded-lg transition-colors" title="-1s">−1s</button>
        <button onClick={() => step(-FRAME_STEP)} className="w-7 h-7 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg flex items-center justify-center transition-colors" title="Previous frame">
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/></svg>
        </button>
        <button onClick={() => step(FRAME_STEP)} className="w-7 h-7 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg flex items-center justify-center transition-colors" title="Next frame">
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>
        </button>
        <button onClick={() => step(1)} className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-400 text-xs rounded-lg transition-colors" title="+1s">+1s</button>

        <div className="w-px h-5 bg-slate-700 mx-1" />

        <button
          onClick={() => onSetIn(scrubTime)}
          className={`flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded-lg border transition-colors ${accentBtn}`}
          title="Set IN to current scrub position"
        >
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/></svg>
          Set IN
        </button>
        <button
          onClick={() => onSetOut(scrubTime)}
          className={`flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded-lg border transition-colors ${accentBtn}`}
          title="Set OUT to current scrub position"
        >
          Set OUT
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>
        </button>
      </div>
    </div>
  );
}

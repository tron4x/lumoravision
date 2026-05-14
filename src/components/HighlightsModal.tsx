/**
 * HighlightsModal
 * ───────────────
 * Lets the user pick one source video from the library, runs the
 * `detectHighlights` analyzer (audio-energy + motion + scene boundaries),
 * shows an interactive heat-map preview of the score over time and the
 * picked highlight ranges, then hands the resulting list of {start,end}
 * back to the parent (typically DirectorMode → appended to its timeline).
 *
 * UI safety:
 *   - Heavy analysis is wrapped in a useRef-backed `cancelRef` so closing
 *     the modal aborts the in-flight loop within one frame.
 *   - The modal is unmount-safe: an `aliveRef` guards every async setState.
 *   - All controls disable themselves while `analyzing === true`.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { VideoFile } from '../types/video';
import { formatDuration } from '../utils/format';
import { detectHighlights, type HighlightRange, type HighlightResult } from '../utils/highlightDetection';
import { runThumbJob } from '../utils/thumbQueue';

// ── Internal thumbnail helper (mirrors DirectorMode's, keeps modal standalone) ─
const THUMB_CACHE_MAX = 100;
const thumbCache = new Map<string, string>();
function thumbCachePut(id: string, dataUrl: string) {
  if (thumbCache.size >= THUMB_CACHE_MAX && !thumbCache.has(id)) {
    const firstKey = thumbCache.keys().next().value;
    if (firstKey !== undefined) thumbCache.delete(firstKey);
  }
  thumbCache.set(id, dataUrl);
}
function getThumb(video: VideoFile, cb: (url: string) => void) {
  if (thumbCache.has(video.id)) { cb(thumbCache.get(video.id)!); return; }
  runThumbJob(() => new Promise<void>(resolve => {
    const v = document.createElement('video');
    v.muted = true; v.preload = 'auto'; v.playsInline = true;
    let done = false;
    const finish = () => { if (done) return; done = true; clearTimeout(t); v.src = ''; v.load(); resolve(); };
    const t = setTimeout(finish, 8000);
    const capture = () => {
      v.removeEventListener('seeked', capture);
      if (done) return;
      const c = document.createElement('canvas'); c.width = 160; c.height = 90;
      const ctx = c.getContext('2d'); if (!ctx) { finish(); return; }
      ctx.drawImage(v, 0, 0, 160, 90);
      const url = c.toDataURL('image/jpeg', 0.7);
      thumbCachePut(video.id, url);
      cb(url);
      finish();
    };
    v.onloadeddata = () => { if (isFinite(v.duration) && v.duration > 0) v.currentTime = v.duration * 0.1; else capture(); };
    v.addEventListener('seeked', capture, { once: true });
    v.onerror = () => finish();
    v.src = video.url; v.load();
  }));
}
function useThumb(video: VideoFile | null) {
  const [thumb, setThumb] = useState<string | null>(video ? thumbCache.get(video.id) ?? null : null);
  const aliveRef = useRef(true);
  useEffect(() => { aliveRef.current = true; return () => { aliveRef.current = false; }; }, []);
  useEffect(() => {
    // Sync the locally-displayed thumbnail with whichever video is now
    // selected. Setting state synchronously here is intentional: the cache
    // hit path produces no extra render once the value is stable, and the
    // miss path falls through to the async loader which only setStates
    // inside its callback. Bounded to a single render per `video` change.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!video) { setThumb(null); return; }
    if (thumbCache.has(video.id)) { setThumb(thumbCache.get(video.id)!); return; }
    getThumb(video, url => { if (aliveRef.current) setThumb(url); });
  }, [video]);
  return thumb;
}

interface HighlightsModalProps {
  videos: VideoFile[];
  /** Optional preselected video (e.g. the currently active clip's source) */
  initialVideo?: VideoFile | null;
  onClose: () => void;
  /**
   * Called with the chosen source video and the picked ranges.
   * Parent decides what to do (append to timeline, replace, export, …).
   */
  onConfirm: (source: VideoFile, ranges: HighlightRange[]) => void;
}

export function HighlightsModal({ videos, initialVideo, onClose, onConfirm }: HighlightsModalProps) {
  const [source, setSource] = useState<VideoFile | null>(initialVideo ?? videos[0] ?? null);
  const [pickerOpen, setPickerOpen] = useState(false);

  // ── Tunables ──────────────────────────────────────────────────────────────
  const [targetDuration, setTargetDuration] = useState(60);  // total reel length (s)
  const [clipDuration, setClipDuration] = useState(4);       // each highlight length (s)
  const [motionWeight, setMotionWeight] = useState(0.5);     // 0 = audio only, 1 = motion only

  // ── Analysis state ────────────────────────────────────────────────────────
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState('');
  const [result, setResult] = useState<HighlightResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cancelRef = useRef(false);
  const aliveRef = useRef(true);

  // ── Source duration (probed once when the picked video changes) ───────────
  const [sourceDuration, setSourceDuration] = useState(0);

  useEffect(() => {
    aliveRef.current = true;
    return () => { aliveRef.current = false; cancelRef.current = true; };
  }, []);

  useEffect(() => {
    // When the source video changes we must wipe the previous analysis
    // result – it's no longer applicable. These setStates run exactly once
    // per `source` change (the deps array is just [source]) so they don't
    // produce a render loop; the warning is a false positive in this case.
    /* eslint-disable react-hooks/set-state-in-effect */
    setResult(null);
    setError(null);
    setProgress(0);
    setPhase('');
    if (!source) { setSourceDuration(0); return; }
    if (source.duration && isFinite(source.duration) && source.duration > 0) {
      setSourceDuration(source.duration);
      return;
    }
    /* eslint-enable react-hooks/set-state-in-effect */
    // Probe duration via a transient <video>. We *also* set a short
    // watchdog so the Analyse button can't stay disabled forever if the
    // browser refuses to fire `loadedmetadata` (happens with some WebM /
    // MOV containers on Brave/Firefox). After 3 s we just unblock the UI;
    // `runAnalysis` itself will probe again before doing real work.
    const v = document.createElement('video');
    v.preload = 'metadata'; v.muted = true;
    let cancelled = false;
    const watchdog = setTimeout(() => {
      if (!cancelled && aliveRef.current) {
        // Unblock the Analyse button with a sentinel of 1 — the real
        // duration will be re-probed inside runAnalysis.
        setSourceDuration(d => d > 0 ? d : 1);
      }
    }, 3000);
    const finalize = (d: number) => {
      if (cancelled || !aliveRef.current) return;
      clearTimeout(watchdog);
      const safe = isFinite(d) && d > 0 ? d : 0;
      setSourceDuration(safe || 1);   // 1 = "unknown but allow click"
      v.src = ''; try { v.load(); } catch { /* ignore */ }
    };
    v.onloadedmetadata = () => finalize(v.duration);
    v.onerror = () => finalize(0);
    v.src = source.url; v.load();
    return () => { cancelled = true; clearTimeout(watchdog); try { v.src = ''; v.load(); } catch { /* ignore */ } };
  }, [source]);

  // ── Run analysis ──────────────────────────────────────────────────────────
  async function runAnalysis() {
    if (!source || analyzing) return;
    cancelRef.current = false;
    setAnalyzing(true);
    setError(null);
    setResult(null);
    setProgress(0);
    setPhase('Probing video…');

    // If we still don't have a real duration (probe-watchdog set the
    // sentinel `1`), retry one more time inside the analysis flow with a
    // longer timeout. This recovers the case where the user clicked
    // Analyse before the original metadata load resolved.
    let dur = sourceDuration;
    if (dur <= 1) {
      dur = await new Promise<number>(resolve => {
        const v = document.createElement('video');
        v.preload = 'metadata'; v.muted = true;
        const t = setTimeout(() => { v.src = ''; resolve(0); }, 8000);
        v.onloadedmetadata = () => {
          clearTimeout(t);
          const d = isFinite(v.duration) && v.duration > 0 ? v.duration : 0;
          v.src = ''; resolve(d);
        };
        v.onerror = () => { clearTimeout(t); v.src = ''; resolve(0); };
        v.src = source.url; v.load();
      });
      if (dur > 0 && aliveRef.current) setSourceDuration(dur);
    }

    if (!dur) {
      if (aliveRef.current) {
        setError('Could not read video duration. The format may be unsupported in this browser.');
        setAnalyzing(false);
        setPhase('');
      }
      return;
    }

    try {
      const r = await detectHighlights(source.url, dur, {
        targetDuration,
        clipDuration,
        motionWeight,
        onProgress: (p, ph) => {
          if (!aliveRef.current) return;
          setProgress(p); setPhase(ph);
        },
        cancelRef,
      });
      if (!aliveRef.current || cancelRef.current) return;
      setResult(r);
    } catch (e) {
      if (cancelRef.current) return; // user-cancelled, no toast
      const msg = e instanceof Error ? e.message : String(e);
      if (aliveRef.current) setError(msg);
    } finally {
      if (aliveRef.current) setAnalyzing(false);
    }
  }

  function cancelAnalysis() {
    cancelRef.current = true;
    setAnalyzing(false);
    setPhase('Cancelled');
  }

  // ── Apply ─────────────────────────────────────────────────────────────────
  function apply() {
    if (!source || !result || result.ranges.length === 0) return;
    onConfirm(source, result.ranges);
  }

  const sourceThumb = useThumb(source);

  // Heat-map normalisation for the visual strip
  const heatMax = useMemo(() => {
    if (!result || result.perSecondScores.length === 0) return 1;
    return Math.max(...result.perSecondScores) || 1;
  }, [result]);

  const reelLength = result ? result.totalDuration : 0;

  return (
    <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-slate-950 rounded-2xl border border-slate-800/60 w-full max-w-3xl max-h-[88vh] flex flex-col shadow-2xl shadow-black/60"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-800/60 flex-none">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-fuchsia-500 to-amber-500 flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>
          </div>
          <div className="flex-1">
            <h2 className="text-slate-100 font-semibold text-sm">Auto-Highlights</h2>
            <p className="text-slate-500 text-xs">AI-picked best moments — runs locally, no upload</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center transition-colors">
            <svg className="w-3.5 h-3.5 text-slate-400" fill="currentColor" viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">

          {/* Source picker */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Source video</label>
            <button
              onClick={() => setPickerOpen(p => !p)}
              disabled={analyzing}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl border transition-colors text-left ${pickerOpen ? 'bg-slate-800 border-fuchsia-500/40' : 'bg-slate-900 border-slate-800 hover:border-slate-700'} disabled:opacity-50`}
            >
              <div className="w-16 h-10 rounded-lg bg-slate-800 overflow-hidden flex-none flex items-center justify-center">
                {sourceThumb
                  ? <img src={sourceThumb} alt="" className="w-full h-full object-cover" />
                  : <div className="w-3 h-3 border border-slate-700 border-t-slate-500 rounded-full animate-spin" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-slate-200 text-sm truncate">{source ? source.name.replace(/\.[^/.]+$/, '') : 'No video selected'}</p>
                <p className="text-slate-500 text-xs">
                  {source ? `${source.extension.toUpperCase()} · ${sourceDuration > 0 ? formatDuration(sourceDuration) : '—'}` : 'Click to choose'}
                </p>
              </div>
              <svg className={`w-4 h-4 text-slate-500 transition-transform ${pickerOpen ? 'rotate-180' : ''}`} fill="currentColor" viewBox="0 0 24 24"><path d="M7 10l5 5 5-5z"/></svg>
            </button>

            {pickerOpen && (
              <div className="mt-1 max-h-56 overflow-y-auto rounded-xl border border-slate-800 bg-slate-950 divide-y divide-slate-800/60">
                {videos.length === 0 ? (
                  <div className="px-3 py-4 text-xs text-slate-500 text-center">No videos in library</div>
                ) : videos.map(v => (
                  <button
                    key={v.id}
                    onClick={() => { setSource(v); setPickerOpen(false); }}
                    className={`w-full text-left px-3 py-1.5 hover:bg-slate-800/60 transition-colors flex items-center gap-2 text-xs ${source?.id === v.id ? 'bg-fuchsia-600/10' : ''}`}
                  >
                    <span className="flex-1 truncate text-slate-200">{v.name.replace(/\.[^/.]+$/, '')}</span>
                    <span className="text-slate-600 font-mono">{v.extension.toUpperCase()}</span>
                    {v.duration ? <span className="text-slate-600 font-mono">{formatDuration(v.duration)}</span> : null}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Tunables */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="flex items-center justify-between text-xs text-slate-500 mb-1">
                <span>Reel length</span>
                <span className="text-slate-300 font-mono">{targetDuration}s</span>
              </label>
              <input type="range" min={20} max={180} step={10}
                value={targetDuration}
                disabled={analyzing}
                onChange={e => setTargetDuration(parseInt(e.target.value))}
                className="w-full accent-fuchsia-500 cursor-pointer disabled:opacity-50" />
            </div>
            <div>
              <label className="flex items-center justify-between text-xs text-slate-500 mb-1">
                <span>Clip length</span>
                <span className="text-slate-300 font-mono">{clipDuration}s</span>
              </label>
              <input type="range" min={2} max={10} step={1}
                value={clipDuration}
                disabled={analyzing}
                onChange={e => setClipDuration(parseInt(e.target.value))}
                className="w-full accent-fuchsia-500 cursor-pointer disabled:opacity-50" />
            </div>
            <div>
              <label className="flex items-center justify-between text-xs text-slate-500 mb-1">
                <span>Audio ↔ Motion</span>
                <span className="text-slate-300 font-mono">{Math.round(motionWeight * 100)}% motion</span>
              </label>
              <input type="range" min={0} max={1} step={0.05}
                value={motionWeight}
                disabled={analyzing}
                onChange={e => setMotionWeight(parseFloat(e.target.value))}
                className="w-full accent-fuchsia-500 cursor-pointer disabled:opacity-50" />
            </div>
          </div>

          {/* Action row */}
          <div className="flex items-center gap-2">
            {!analyzing ? (
              <button
                onClick={runAnalysis}
                disabled={!source}
                className="flex items-center gap-2 px-4 py-2 bg-fuchsia-600 hover:bg-fuchsia-500 disabled:bg-slate-800 disabled:text-slate-600 text-white text-sm font-semibold rounded-xl transition-colors shadow-lg shadow-fuchsia-500/20"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>
                Analyse video
              </button>
            ) : (
              <button
                onClick={cancelAnalysis}
                className="flex items-center gap-2 px-4 py-2 bg-red-600/20 hover:bg-red-600/40 text-red-400 text-sm font-semibold rounded-xl border border-red-500/30 transition-colors"
              >
                Cancel
              </button>
            )}
            {sourceDuration > 0 && (
              <span className="text-xs text-slate-500">
                Source: {formatDuration(sourceDuration)} → reel ≈ {targetDuration}s ({Math.max(1, Math.round(targetDuration / clipDuration))} clips)
              </span>
            )}
          </div>

          {/* Progress */}
          {analyzing && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-fuchsia-400 font-medium">{phase}</span>
                <span className="text-xs text-slate-400 font-mono">{progress}%</span>
              </div>
              <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-fuchsia-500 to-amber-500 transition-all" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}

          {/* Error */}
          {error && !analyzing && (
            <div className="px-3 py-2 rounded-xl bg-red-600/10 border border-red-500/30 text-red-400 text-xs">
              {error}
            </div>
          )}

          {/* Result */}
          {result && !analyzing && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  {result.ranges.length} highlight{result.ranges.length !== 1 ? 's' : ''} · {formatDuration(reelLength)} total
                </span>
                <span className="text-xs text-slate-600">Heat-map shows interest score over time</span>
              </div>

              {/* Heat-map strip with overlaid picked ranges */}
              <div className="relative h-12 rounded-lg overflow-hidden bg-slate-900 border border-slate-800">
                {/* Score bars */}
                <div className="absolute inset-0 flex items-end">
                  {result.perSecondScores.map((s, i) => {
                    const h = Math.max(2, Math.round((s / heatMax) * 100));
                    return (
                      <div
                        key={i}
                        className="flex-1 bg-gradient-to-t from-fuchsia-600/40 to-amber-400/80"
                        style={{ height: `${h}%` }}
                      />
                    );
                  })}
                </div>
                {/* Picked range overlays */}
                {result.ranges.map((r, i) => {
                  const left = (r.startTime / sourceDuration) * 100;
                  const width = ((r.endTime - r.startTime) / sourceDuration) * 100;
                  return (
                    <div
                      key={i}
                      className="absolute top-0 bottom-0 border-2 border-fuchsia-400 bg-fuchsia-500/15 rounded"
                      style={{ left: `${left}%`, width: `${width}%` }}
                      title={`${formatDuration(r.startTime)} – ${formatDuration(r.endTime)} (score ${(r.score * 100).toFixed(0)})`}
                    />
                  );
                })}
              </div>

              {/* Range list */}
              <div className="max-h-44 overflow-y-auto rounded-xl border border-slate-800 bg-slate-950 divide-y divide-slate-800/60">
                {result.ranges.map((r, i) => (
                  <div key={i} className="px-3 py-1.5 flex items-center gap-3 text-xs">
                    <span className="w-6 text-slate-600 font-mono text-right">#{i + 1}</span>
                    <span className="text-slate-200 font-mono">{formatDuration(r.startTime)} → {formatDuration(r.endTime)}</span>
                    <span className="text-slate-600">·</span>
                    <span className="text-slate-500">{(r.endTime - r.startTime).toFixed(1)}s</span>
                    <div className="flex-1" />
                    <span className="text-amber-400/80" title="Audio score">🔊 {(r.audioScore * 100).toFixed(0)}</span>
                    <span className="text-fuchsia-400/80" title="Motion score">🎬 {(r.motionScore * 100).toFixed(0)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-slate-800/60 flex-none">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition-colors"
          >
            Close
          </button>
          <button
            onClick={apply}
            disabled={!result || result.ranges.length === 0 || analyzing}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:bg-slate-800 disabled:text-slate-600 text-white text-xs font-semibold transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
            Add {result?.ranges.length ?? 0} clips to timeline
          </button>
        </div>
      </div>
    </div>
  );
}

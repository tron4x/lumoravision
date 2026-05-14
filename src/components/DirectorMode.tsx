import { useRef, useState, useEffect, useCallback } from 'react';
import type { VideoFile } from '../types/video';
import { formatDuration } from '../utils/format';
import { detectScenes } from '../utils/sceneDetection';
import type { SceneChapter } from '../utils/sceneDetection';
import GIF from 'gif.js';
import { downloadBlob } from '../utils/gifExport';
import { exportClipsToWebM } from '../utils/webmExport';
import { runThumbJob } from '../utils/thumbQueue';
import { HighlightsModal } from './HighlightsModal';
import type { HighlightRange } from '../utils/highlightDetection';
import { FrameScrubber } from './FrameScrubber';

type TransitionType = 'cut' | 'fade' | 'dissolve' | 'zoom' | 'slide-left' | 'slide-right' | 'flash';

interface Clip {
  id: string;
  video: VideoFile;
  startTime: number;
  endTime: number;   // 0 = use full duration
  transition: TransitionType;
}

interface DirectorModeProps {
  videos: VideoFile[];
  onClose: () => void;
}

// ── thumbnail cache (capped to avoid unbounded memory growth) ────────────────
const THUMB_CACHE_MAX = 200;
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
    const finishOnce = () => { if (done) return; done = true; clearTimeout(timeoutId); v.src = ''; v.load(); resolve(); };
    const capture = () => {
      v.removeEventListener('seeked', capture);
      if (done) return;
      const c = document.createElement('canvas'); c.width = 160; c.height = 90;
      const ctx = c.getContext('2d'); if (!ctx) { finishOnce(); return; }
      ctx.drawImage(v, 0, 0, 160, 90);
      const url = c.toDataURL('image/jpeg', 0.75);
      thumbCachePut(video.id, url);
      cb(url);
      finishOnce();
    };
    // Watchdog – if the browser never fires seeked/loadeddata (corrupt or
    // unsupported codec), free resources after 10s instead of leaking.
    const timeoutId = setTimeout(finishOnce, 10000);
    v.onloadeddata = () => { if (isFinite(v.duration) && v.duration > 0) v.currentTime = v.duration * 0.1; else capture(); };
    v.addEventListener('seeked', capture, { once: true });
    v.onerror = () => { finishOnce(); };
    v.src = video.url; v.load();
  }));
}

function useThumb(video: VideoFile) {
  const [thumb, setThumb] = useState<string | null>(thumbCache.get(video.id) ?? null);
  const mountedRef = useRef(true);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);
  useEffect(() => {
    if (!thumb) getThumb(video, (url) => { if (mountedRef.current) setThumb(url); });
  }, [video, thumb]);
  return thumb;
}

// ── Video picker row ──────────────────────────────────────────────────────────
function PickerRow({ video, onAdd }: { video: VideoFile; onAdd: () => void }) {
  const thumb = useThumb(video);
  return (
    <button
      onClick={onAdd}
      className="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-slate-800 transition-colors text-left group"
    >
      <div className="w-20 h-12 rounded-lg bg-slate-800 overflow-hidden flex-none flex items-center justify-center">
        {thumb
          ? <img src={thumb} alt="" className="w-full h-full object-cover" />
          : <div className="w-4 h-4 border-2 border-slate-600 border-t-slate-400 rounded-full animate-spin" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-slate-200 text-sm truncate">{video.name.replace(/\.[^/.]+$/, '')}</p>
        <p className="text-slate-500 text-xs">{video.extension.toUpperCase()}{video.duration ? ` · ${formatDuration(video.duration)}` : ''}</p>
      </div>
      <svg className="w-5 h-5 text-amber-500 flex-none opacity-0 group-hover:opacity-100 transition-opacity" fill="currentColor" viewBox="0 0 24 24">
        <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
      </svg>
    </button>
  );
}

// ── Clip duration display ─────────────────────────────────────────────────────
function ClipDur({ clip }: { clip: Clip }) {
  const [dur, setDur] = useState(clip.video.duration ?? 0);
  const mountedRef = useRef(true);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);
  useEffect(() => {
    if (dur > 0) return;
    const v = document.createElement('video'); v.preload = 'metadata'; v.muted = true;
    v.onloadedmetadata = () => {
      if (mountedRef.current) setDur(v.duration);
      v.src = ''; v.load();
    };
    v.src = clip.video.url; v.load();
    return () => { v.onloadedmetadata = null; v.src = ''; v.load(); };
  }, [clip.video.url, dur]);
  const end = clip.endTime > 0 ? clip.endTime : dur;
  return <span className="text-slate-500 text-xs font-mono">{formatDuration(Math.max(0, end - clip.startTime))}</span>;
}

// ── Frame Scrubber ────────────────────────────────────────────────────────────
// The reusable filmstrip component now lives in ./FrameScrubber so the
// VideoPlayer's GIF-export panel can share it. The frame-step constant
// (~1/30 s) stays here because it's also used by the Set-IN/OUT clamping
// logic in <TrimPanel> below.
const FRAME_STEP = 1 / 30;


// ── Trim panel with Scene Detection ──────────────────────────────────────────
function TrimPanel({ clip, idx, onUpdate, videoRef }: { clip: Clip; idx: number; onUpdate: (idx: number, patch: Partial<Clip>) => void; videoRef: React.RefObject<HTMLVideoElement | null> }) {
  const [dur, setDur] = useState(clip.video.duration ?? 0);
  const [chapters, setChapters] = useState<SceneChapter[]>([]);
  const [showChapters, setShowChapters] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeProgress, setAnalyzeProgress] = useState(0);
  const [analyzed, setAnalyzed] = useState(false);
  const [showScrubber, setShowScrubber] = useState(false);
  const trimVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (dur > 0) return;
    const v = document.createElement('video'); v.preload = 'metadata'; v.muted = true;
    v.onloadedmetadata = () => { setDur(v.duration); v.src = ''; v.load(); };
    v.src = clip.video.url; v.load();
  }, [clip.video.url, dur]);

  const runDetect = async () => {
    const vid = trimVideoRef.current;
    if (!vid || analyzing || analyzed) return;
    setAnalyzing(true); setAnalyzeProgress(0);
    try {
      const result = await detectScenes(vid, {
        sampleInterval: 2, threshold: 28, maxChapters: 20,
        onProgress: (p: number) => setAnalyzeProgress(p),
      });
      setChapters(result.chapters);
    } catch { /* ignore */ }
    finally { setAnalyzing(false); setAnalyzed(true); }
  };

  const end = clip.endTime > 0 ? clip.endTime : dur;
  if (dur === 0) return null;

  return (
    <div className="mt-3 pt-3 border-t border-slate-800/60 space-y-2">
      {/* Hidden video for scene detection */}
      <video ref={trimVideoRef} src={clip.video.url} className="hidden" preload="auto" muted playsInline />

      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Trim Clip {idx + 1}</p>
        <div className="flex items-center gap-1.5">
          {/* Frame scrubber toggle */}
          <button
            onClick={() => setShowScrubber(p => !p)}
            className={`flex items-center gap-1 px-2 py-0.5 text-xs rounded-lg border transition-colors ${showScrubber ? 'bg-amber-600/30 text-amber-400 border-amber-500/40' : 'bg-slate-800 text-slate-500 border-slate-700 hover:text-slate-300'}`}
            title="Frame-by-frame scrubber"
          >
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M18 3v2h-2V3H8v2H6V3H4v18h2v-2h2v2h8v-2h2v2h2V3h-2zM8 17H6v-2h2v2zm0-4H6v-2h2v2zm0-4H6V7h2v2zm10 8h-2v-2h2v2zm0-4h-2v-2h2v2zm0-4h-2V7h2v2z"/></svg>
            Frames
          </button>
          {!analyzed && !analyzing && (
            <button onClick={runDetect}
              className="flex items-center gap-1 px-2 py-0.5 bg-cyan-600/20 hover:bg-cyan-600/40 text-cyan-400 text-xs rounded-lg border border-cyan-500/30 transition-colors">
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-1 9H9V9h10v2zm-4 4H9v-2h6v2zm4-8H9V5h10v2z"/></svg>
              Scenes
            </button>
          )}
          {analyzing && <span className="text-xs text-cyan-400">{analyzeProgress}%</span>}

          {/* Show / Hide detected scenes */}
          {chapters.length > 1 && (
            <button
              onClick={() => setShowChapters(p => !p)}
              className={`flex items-center gap-1 px-2 py-0.5 text-xs rounded-lg border transition-colors ${showChapters ? 'bg-cyan-600/30 text-cyan-300 border-cyan-500/40' : 'bg-slate-800 text-slate-500 border-slate-700 hover:text-slate-300'}`}
              title={showChapters ? 'Hide scene list' : 'Show scene list'}
            >
              {showChapters ? (
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>
              ) : (
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78 3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z"/></svg>
              )}
              {showChapters ? 'Hide' : 'Show'}
            </button>
          )}
        </div>
      </div>

      {/* Frame scrubber – uses the main preview video for the live frame */}
      {showScrubber && dur > 0 && (
        <FrameScrubber
          videoUrl={clip.video.url}
          dur={dur}
          inT={clip.startTime}
          outT={end}
          videoRef={videoRef}
          accent="amber"
          onSetIn={t => {
            onUpdate(idx, { startTime: Math.min(t, end - FRAME_STEP) });
          }}
          onSetOut={t => {
            onUpdate(idx, { endTime: Math.max(t, clip.startTime + FRAME_STEP) });
          }}
        />
      )}

      {/* Chapter thumbnails */}
      {chapters.length > 1 && showChapters && (
        <div>
          <p className="text-xs text-slate-600 mb-1.5">Select scene as IN/OUT:</p>
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {chapters.map((ch, ci) => {
              const nextCh = chapters[ci + 1];
              const chEnd = nextCh ? nextCh.time : dur;
              const isIn = Math.abs(clip.startTime - ch.time) < 0.5;
              const isOut = Math.abs((clip.endTime > 0 ? clip.endTime : dur) - chEnd) < 0.5;
              return (
                <div key={ch.time} className="flex-none flex flex-col gap-0.5">
                  <button
                    onClick={() => {
                      onUpdate(idx, { startTime: ch.time, endTime: nextCh ? nextCh.time : 0 });
                      const vid = videoRef.current;
                      if (vid) {
                        vid.currentTime = ch.time;
                        vid.play().catch(() => {});
                      }
                    }}
                    className={`w-16 h-10 rounded-lg overflow-hidden border-2 transition-all relative ${isIn && isOut ? 'border-amber-500' : 'border-slate-700 hover:border-amber-400'}`}
                    title={`Scene ${ci + 1}: ${formatDuration(ch.time)} – ${formatDuration(chEnd)}`}
                  >
                    {ch.thumbnail
                      ? <img src={ch.thumbnail} alt="" className="w-full h-full object-cover" />
                      : <div className="w-full h-full bg-slate-800 flex items-center justify-center"><span className="text-slate-600 text-xs">{ci + 1}</span></div>}
                    {(isIn && isOut) && (
                      <div className="absolute inset-0 bg-amber-500/20 flex items-center justify-center">
                        <svg className="w-4 h-4 text-amber-400" fill="currentColor" viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
                      </div>
                    )}
                  </button>
                  <span className="text-xs text-slate-600 font-mono text-center">{formatDuration(ch.time)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Manual sliders */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-600 w-7">IN</span>
        <input type="range" min={0} max={dur} step={0.5} value={clip.startTime}
          onChange={e => onUpdate(idx, { startTime: parseFloat(e.target.value) })}
          className="flex-1 accent-amber-500 cursor-pointer" />
        <span className="text-xs text-slate-400 font-mono w-12 text-right">{formatDuration(clip.startTime)}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-600 w-7">OUT</span>
        <input type="range" min={0} max={dur} step={0.5} value={end}
          onChange={e => onUpdate(idx, { endTime: parseFloat(e.target.value) })}
          className="flex-1 accent-amber-500 cursor-pointer" />
        <span className="text-xs text-slate-400 font-mono w-12 text-right">{formatDuration(end)}</span>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function DirectorMode({ videos, onClose }: DirectorModeProps) {
  const [clips, setClips] = useState<Clip[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [clipDuration, setClipDuration] = useState(0);
  const [showPicker, setShowPicker] = useState(false);
  const [opacity, setOpacity] = useState(1);
  const [videoStyle, setVideoStyle] = useState<React.CSSProperties>({});
  const [flashOverlay, setFlashOverlay] = useState(false);

  // ── Export state (shared between GIF + WebM exporters) ────────────────────
  type ExportFormat = 'gif' | 'webm';
  const [showExport, setShowExport] = useState(false);
  const [exportFormat, setExportFormat] = useState<ExportFormat>('webm');
  const [gifFps, setGifFps] = useState(10);
  const [gifWidth, setGifWidth] = useState(480);
  const [gifMaxSec] = useState(180); // max 3 minutes per clip (GIF only)
  // WebM defaults – higher fps/width are fine for video
  const [webmFps, setWebmFps] = useState(30);
  const [webmWidth, setWebmWidth] = useState(1280);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportClipIdx, setExportClipIdx] = useState(0);
  const exportCancelRef = useRef(false);

  // ── Auto-Highlights modal ────────────────────────────────────────────────
  const [showHighlights, setShowHighlights] = useState(false);

  const handleExportWebM = useCallback(async () => {
    if (clips.length === 0 || exporting) return;
    setExporting(true);
    setExportProgress(0);
    setExportClipIdx(0);
    exportCancelRef.current = false;

    try {
      const blob = await exportClipsToWebM(
        clips.map(c => ({
          url: c.video.url,
          startTime: c.startTime,
          endTime: c.endTime,
        })),
        {
          width: webmWidth,
          fps: webmFps,
          onProgress: (p) => setExportProgress(p),
          cancelRef: exportCancelRef,
        },
      );
      if (!exportCancelRef.current) {
        downloadBlob(blob, `editor-export-${Date.now()}.webm`);
      }
    } catch (e) {
      console.error('WebM export failed', e);
      alert(`Export failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setExporting(false);
      setExportProgress(0);
    }
  }, [clips, exporting, webmFps, webmWidth]);

  const handleExportGif = useCallback(async () => {
    if (clips.length === 0 || exporting) return;
    setExporting(true);
    setExportProgress(0);
    setExportClipIdx(0);
    exportCancelRef.current = false;

    try {
      // ── 1. Load all videos and compute frame ranges ──────────────────────
      type FrameData = { video: HTMLVideoElement; start: number; end: number; frameCount: number; w: number; h: number };
      const clipFrameData: FrameData[] = [];
      let totalFrames = 0;

      for (const clip of clips) {
        const v = document.createElement('video');
        v.muted = true;
        v.playsInline = true;
        v.preload = 'metadata';
        await new Promise<void>((res, rej) => {
          v.onloadedmetadata = () => res();
          v.onerror = () => rej(new Error(`Failed to load: ${clip.video.name}`));
          v.src = clip.video.url;
          v.load();
        });
        const dur = isFinite(v.duration) && v.duration > 0 ? v.duration : 10;
        const start = Math.max(0, clip.startTime);
        const rawEnd = clip.endTime > 0 ? Math.min(clip.endTime, dur) : dur;
        const end = Math.min(rawEnd, start + gifMaxSec);
        const frameCount = Math.max(1, Math.ceil((end - start) * gifFps));
        const aspect = v.videoHeight > 0 ? v.videoHeight / v.videoWidth : 9 / 16;
        const h = Math.round(gifWidth * aspect) || Math.round(gifWidth * 9 / 16);
        totalFrames += frameCount;
        clipFrameData.push({ video: v, start, end, frameCount, w: gifWidth, h });
      }

      // Use height from first clip for the GIF
      const gifHeight = clipFrameData[0]?.h ?? Math.round(gifWidth * 9 / 16);

      const gif = new GIF({
        workers: 2,
        quality: 10,
        width: gifWidth,
        height: gifHeight,
        workerScript: '/gif.worker.js',
      });

      const canvas = document.createElement('canvas');
      canvas.width = gifWidth;
      canvas.height = gifHeight;
      const ctx = canvas.getContext('2d')!;
      const frameDelay = Math.round(1000 / gifFps);
      let framesAdded = 0;

      // ── 2. Capture frames ────────────────────────────────────────────────
      for (let ci = 0; ci < clipFrameData.length; ci++) {
        if (exportCancelRef.current) break;
        setExportClipIdx(ci);
        const { video: v, start, end, frameCount } = clipFrameData[ci];

        for (let fi = 0; fi < frameCount; fi++) {
          if (exportCancelRef.current) break;
          const t = start + fi / gifFps;
          if (t >= end) break;

          // Seek to frame
          await new Promise<void>(res => {
            const onSeeked = () => { v.removeEventListener('seeked', onSeeked); res(); };
            v.addEventListener('seeked', onSeeked);
            v.currentTime = t;
          });

          // Small settle delay for browser to decode frame
          await new Promise(r => setTimeout(r, 40));

          // Draw with letterbox if aspect differs
          ctx.fillStyle = '#000';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          const vAspect = v.videoHeight / v.videoWidth;
          const cAspect = canvas.height / canvas.width;
          let dx = 0, dy = 0, dw = canvas.width, dh = canvas.height;
          if (vAspect > cAspect) {
            dw = canvas.height / vAspect;
            dx = (canvas.width - dw) / 2;
          } else {
            dh = canvas.width * vAspect;
            dy = (canvas.height - dh) / 2;
          }
          ctx.drawImage(v, dx, dy, dw, dh);
          gif.addFrame(ctx, { copy: true, delay: frameDelay });
          framesAdded++;
          setExportProgress(Math.round((framesAdded / totalFrames) * 60));
        }

        // Release video element
        v.src = '';
        v.load();
      }

      if (exportCancelRef.current) { setExporting(false); return; }

      // ── 3. Render GIF ────────────────────────────────────────────────────
      const blob = await new Promise<Blob>((resolve, reject) => {
        gif.on('progress', (p: number) => setExportProgress(60 + Math.round(p * 40)));
        gif.on('finished', (b: Blob) => resolve(b));
        gif.on('error', (err: unknown) => reject(err));
        gif.render();
      });

      downloadBlob(blob, `editor-export-${Date.now()}.gif`);
    } catch (e) {
      console.error('GIF export failed', e);
      alert(`Export failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setExporting(false);
      setExportProgress(0);
    }
  }, [clips, exporting, gifFps, gifWidth, gifMaxSec]);

  const videoRef = useRef<HTMLVideoElement>(null);
  const isPlayingRef = useRef(false);
  const chainingRef = useRef(false); // true while transitioning between clips
  const activeIdxRef = useRef(activeIdx);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => { activeIdxRef.current = activeIdx; }, [activeIdx]);

  // Throttle time updates to ~4x/s (same as VideoPlayer)
  const lastTimeUpdateRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  useEffect(() => () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); }, []);

  const activeClip = clips[activeIdx] ?? null;

  // ── load clip whenever activeIdx or the clip's url changes ─────────────────
  const activeClipUrl = activeClip?.video.url ?? null;
  useEffect(() => {
    if (!activeClip || !activeClipUrl) return;
    const vid = videoRef.current;
    if (!vid) return;

    const wasPlaying = isPlayingRef.current;
    vid.pause();
    vid.src = activeClipUrl;
    vid.load();
    setCurrentTime(0);

    const onMeta = () => {
      const d = vid.duration;
      const end = activeClip.endTime > 0 ? Math.min(activeClip.endTime, d) : d;
      setClipDuration(Math.max(0, end - activeClip.startTime));
      vid.currentTime = activeClip.startTime;
      // Always auto-play if we were playing (chain playback)
      if (wasPlaying) {
        vid.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
      }
    };

    if (vid.readyState >= 1) {
      onMeta();
    } else {
      vid.addEventListener('loadedmetadata', onMeta, { once: true });
    }
  }, [activeIdx, activeClipUrl, activeClip]);

  // ── update clipDuration when trim points change ─────────────────────────────
  useEffect(() => {
    const clip = clips[activeIdx];
    const vid = videoRef.current;
    if (!clip || !vid || vid.readyState < 1) return;
    const d = vid.duration;
    if (!isFinite(d) || d === 0) return;
    const end = clip.endTime > 0 ? Math.min(clip.endTime, d) : d;
    setClipDuration(Math.max(0, end - clip.startTime));
  }, [activeIdx, clips]);

  // Keep a ref to clips so callbacks always see the latest array without stale closures
  const clipsRef = useRef(clips);
  useEffect(() => { clipsRef.current = clips; }, [clips]);

  // ── clip end handler — reads from refs, never stale ────────────────────────
  const handleClipEnd = useCallback(() => {
    const vid = videoRef.current;
    if (!vid) return;
    const currentClips = clipsRef.current;
    const idx = activeIdxRef.current;
    const next = idx + 1;
    if (next >= currentClips.length) {
      vid.pause();
      setIsPlaying(false);
      return;
    }
    const { transition } = currentClips[next];
    chainingRef.current = true;
    isPlayingRef.current = true;
    vid.pause();

    if (transition === 'fade') {
      setOpacity(0);
      setTimeout(() => { setOpacity(1); chainingRef.current = false; setActiveIdx(next); }, 450);

    } else if (transition === 'dissolve') {
      setOpacity(0);
      setTimeout(() => { setOpacity(1); chainingRef.current = false; setActiveIdx(next); }, 300);

    } else if (transition === 'flash') {
      setFlashOverlay(true);
      setTimeout(() => { setFlashOverlay(false); chainingRef.current = false; setActiveIdx(next); }, 200);

    } else if (transition === 'zoom') {
      setVideoStyle({ transform: 'scale(1.15)', transition: 'transform 0.35s ease-in', opacity: 0.6 });
      setTimeout(() => {
        setVideoStyle({});
        chainingRef.current = false;
        setActiveIdx(next);
      }, 350);

    } else if (transition === 'slide-left') {
      setVideoStyle({ transform: 'translateX(-100%)', transition: 'transform 0.35s ease-in' });
      setTimeout(() => {
        setVideoStyle({ transform: 'translateX(100%)', transition: 'none' });
        chainingRef.current = false;
        setActiveIdx(next);
        requestAnimationFrame(() => requestAnimationFrame(() =>
          setVideoStyle({ transform: 'translateX(0)', transition: 'transform 0.35s ease-out' })
        ));
      }, 350);

    } else if (transition === 'slide-right') {
      setVideoStyle({ transform: 'translateX(100%)', transition: 'transform 0.35s ease-in' });
      setTimeout(() => {
        setVideoStyle({ transform: 'translateX(-100%)', transition: 'none' });
        chainingRef.current = false;
        setActiveIdx(next);
        requestAnimationFrame(() => requestAnimationFrame(() =>
          setVideoStyle({ transform: 'translateX(0)', transition: 'transform 0.35s ease-out' })
        ));
      }, 350);

    } else {
      // cut
      chainingRef.current = false;
      setActiveIdx(next);
    }
  // No deps — reads everything from refs
  }, []);

  // ── time update — throttled to ~4x/s, reads from refs, never stale ─────────
  const handleTimeUpdate = useCallback(() => {
    const now = performance.now();
    if (now - lastTimeUpdateRef.current < 250) return;
    lastTimeUpdateRef.current = now;
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const vid = videoRef.current;
      const idx = activeIdxRef.current;
      const clip = clipsRef.current[idx];
      if (!vid || !clip) return;
      const t = vid.currentTime;
      setCurrentTime(Math.max(0, t - clip.startTime));
      const end = clip.endTime > 0 ? clip.endTime : vid.duration;
      if (t >= end - 0.1) handleClipEnd();
    });
  // handleClipEnd is stable (no deps)
  }, [handleClipEnd]);

  // ── play / pause ───────────────────────────────────────────────────────────
  const togglePlay = useCallback(() => {
    const vid = videoRef.current;
    if (!vid || !activeClip) return;
    if (isPlaying) {
      vid.pause(); setIsPlaying(false);
    } else {
      const end = activeClip.endTime > 0 ? activeClip.endTime : vid.duration;
      if (vid.currentTime >= end - 0.1) vid.currentTime = activeClip.startTime;
      vid.play().then(() => setIsPlaying(true)).catch(() => {});
    }
  }, [isPlaying, activeClip]);

  // ── clip management ────────────────────────────────────────────────────────
  const addClip = useCallback((video: VideoFile) => {
    setClips(prev => [...prev, { id: `${video.id}-${Date.now()}`, video, startTime: 0, endTime: 0, transition: 'cut' }]);
    setShowPicker(false);
  }, []);

  const removeClip = useCallback((idx: number) => {
    setClips(prev => prev.filter((_, i) => i !== idx));
    setActiveIdx(prev => Math.max(0, prev > idx ? prev - 1 : prev === idx ? Math.max(0, idx - 1) : prev));
  }, []);

  const moveClip = useCallback((idx: number, dir: -1 | 1) => {
    setClips(prev => {
      const arr = [...prev]; const t = idx + dir;
      if (t < 0 || t >= arr.length) return prev;
      [arr[idx], arr[t]] = [arr[t], arr[idx]]; return arr;
    });
    setActiveIdx(prev => prev === idx ? idx + dir : prev);
  }, []);

  const updateClip = useCallback((idx: number, patch: Partial<Clip>) => {
    setClips(prev => prev.map((c, i) => i === idx ? { ...c, ...patch } : c));
  }, []);

  // ── Append a list of highlight ranges as new timeline clips ──────────────
  // We append (never replace) so the user can iterate: keep current edit,
  // run highlights again, get a longer reel.
  const appendHighlightClips = useCallback((source: VideoFile, ranges: HighlightRange[]) => {
    if (ranges.length === 0) return;
    const ts = Date.now();
    setClips(prev => {
      const newClips: Clip[] = ranges.map((r, i) => ({
        id: `${source.id}-hl-${ts}-${i}`,
        video: source,
        startTime: r.startTime,
        endTime: r.endTime,
        // First appended clip keeps a hard cut from whatever came before, the
        // rest get a smooth dissolve so the reel flows.
        transition: i === 0 ? 'cut' : 'dissolve',
      }));
      const merged = [...prev, ...newClips];
      // Jump to the first newly-added clip in the next tick so the user sees it.
      queueMicrotask(() => setActiveIdx(prev.length));
      return merged;
    });
    setShowHighlights(false);
  }, []);

  // ── keyboard ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if (e.key === 'Escape') { if (showPicker) setShowPicker(false); else onClose(); }
      if (e.key === ' ') { e.preventDefault(); togglePlay(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, togglePlay, showPicker]);

  const progress = clipDuration > 0 ? Math.min(100, (currentTime / clipDuration) * 100) : 0;
  const totalDur = clips.reduce((s, c) => {
    const d = c.video.duration ?? 0;
    return s + Math.max(0, (c.endTime > 0 ? c.endTime : d) - c.startTime);
  }, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative flex flex-col bg-slate-950 rounded-2xl overflow-hidden shadow-2xl shadow-black/60 border border-slate-800/60 w-full max-w-5xl"
        style={{ height: 'calc(100vh - 2rem)' }}
        onClick={e => e.stopPropagation()}
      >

        {/* ── Title bar ── */}
        <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-900/80 border-b border-slate-800/60 flex-none">
          <button onClick={onClose} className="w-3 h-3 rounded-full bg-red-500 hover:bg-red-400 flex-none" title="Close (Esc)" />
          <div className="w-3 h-3 rounded-full bg-slate-700 flex-none" />
          <div className="w-3 h-3 rounded-full bg-slate-700 flex-none" />
          <svg className="w-4 h-4 text-amber-400 ml-2 flex-none" fill="currentColor" viewBox="0 0 24 24">
            <path d="M18 3v2h-2V3H8v2H6V3H4v18h2v-2h2v2h8v-2h2v2h2V3h-2zM8 17H6v-2h2v2zm0-4H6v-2h2v2zm0-4H6V7h2v2zm10 8h-2v-2h2v2zm0-4h-2v-2h2v2zm0-4h-2V7h2v2z"/>
          </svg>
          <span className="text-slate-200 font-semibold text-sm ml-1">Editor</span>
          <span className="text-xs text-slate-500 bg-slate-800 px-2 py-0.5 rounded-full ml-1">
            {clips.length} Clips · {formatDuration(totalDur)}
          </span>
          <div className="flex-1" />
          <span className="text-slate-700 text-xs">Space · Esc</span>

          {/* Auto-Highlights button – always available */}
          <button
            onClick={() => setShowHighlights(true)}
            disabled={videos.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-fuchsia-500/30 bg-gradient-to-r from-fuchsia-600/20 to-amber-500/20 hover:from-fuchsia-600/40 hover:to-amber-500/40 text-fuchsia-300 transition-colors flex-none disabled:opacity-40"
            title="Auto-pick best moments from a video"
          >
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>
            </svg>
            Auto-Highlights
          </button>

          {/* Export button (opens GIF + WebM panel) */}
          {clips.length > 0 && (
            <button
              onClick={() => setShowExport(p => !p)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors flex-none ${showExport ? 'bg-emerald-600 text-white border-emerald-500' : 'bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 border-emerald-500/30'}`}
              title="Export"
            >
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M19 9h-4V3H9v6H5l7 7 7-7zm-8 2V5h2v6h1.17L12 13.17 9.83 11H11zm-6 7h14v2H5z"/>
              </svg>
              Export
            </button>
          )}

          <button onClick={onClose} className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center transition-colors ml-2">
            <svg className="w-3.5 h-3.5 text-slate-400" fill="currentColor" viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
          </button>
        </div>

        {/* ── Export panel (GIF + WebM) ── */}
        {showExport && (
          <div className="flex-none bg-slate-900/90 border-b border-slate-800/60 px-4 py-3">
            {exporting ? (
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-emerald-400 font-medium">
                      Exporting {exportFormat === 'webm' ? 'WebM' : 'GIF'}
                      {exportFormat === 'gif' ? `… Clip ${exportClipIdx + 1}/${clips.length}` : ''}
                    </span>
                    <span className="text-xs text-slate-400 font-mono">{exportProgress}%</span>
                  </div>
                  <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${exportProgress}%` }} />
                  </div>
                </div>
                <button
                  onClick={() => { exportCancelRef.current = true; }}
                  className="px-3 py-1.5 bg-red-600/20 hover:bg-red-600/40 text-red-400 text-xs rounded-lg border border-red-500/30 transition-colors flex-none"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-4 flex-wrap">
                {/* Format toggle */}
                <div className="flex items-center gap-1 bg-slate-800/60 rounded-lg p-0.5">
                  <button
                    onClick={() => setExportFormat('webm')}
                    className={`px-2.5 py-1 text-xs rounded-md transition-colors ${exportFormat === 'webm' ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
                    title="Export as WebM video"
                  >
                    WebM
                  </button>
                  <button
                    onClick={() => setExportFormat('gif')}
                    className={`px-2.5 py-1 text-xs rounded-md transition-colors ${exportFormat === 'gif' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
                    title="Export as animated GIF"
                  >
                    GIF
                  </button>
                </div>

                {exportFormat === 'gif' ? (
                  <>
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-slate-500">FPS</label>
                      <select value={gifFps} onChange={e => setGifFps(Number(e.target.value))}
                        className="text-xs bg-slate-800 border border-slate-700 text-slate-300 rounded px-2 py-1 cursor-pointer">
                        <option value={5}>5</option>
                        <option value={8}>8</option>
                        <option value={10}>10</option>
                        <option value={12}>12</option>
                        <option value={15}>15</option>
                        <option value={20}>20</option>
                        <option value={24}>24</option>
                        <option value={25}>25</option>
                        <option value={30}>30</option>
                      </select>
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-slate-500">Width</label>
                      <select value={gifWidth} onChange={e => setGifWidth(Number(e.target.value))}
                        className="text-xs bg-slate-800 border border-slate-700 text-slate-300 rounded px-2 py-1 cursor-pointer">
                        <option value={320}>320px</option>
                        <option value={480}>480px</option>
                        <option value={640}>640px</option>
                        <option value={800}>800px</option>
                      </select>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <div className="text-xs text-slate-600">
                        ~{clips.length} clip{clips.length !== 1 ? 's' : ''} · {gifFps} fps · {gifWidth}px · <span className="text-emerald-400">(max 3 min per clip)</span>
                      </div>
                      {gifFps >= 24 && (
                        <div className="flex items-center gap-1 text-xs text-amber-400">
                          <svg className="w-3 h-3 flex-none" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/>
                          </svg>
                          High FPS — export will be slow and file size large. 10–15 fps recommended for GIFs.
                        </div>
                      )}
                    </div>
                    <button
                      onClick={handleExportGif}
                      className="ml-auto flex items-center gap-1.5 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg transition-colors"
                    >
                      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M19 9h-4V3H9v6H5l7 7 7-7zm-8 2V5h2v6h1.17L12 13.17 9.83 11H11zm-6 7h14v2H5z"/>
                      </svg>
                      Start Export
                    </button>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-slate-500">FPS</label>
                      <select value={webmFps} onChange={e => setWebmFps(Number(e.target.value))}
                        className="text-xs bg-slate-800 border border-slate-700 text-slate-300 rounded px-2 py-1 cursor-pointer">
                        <option value={24}>24</option>
                        <option value={25}>25</option>
                        <option value={30}>30</option>
                        <option value={60}>60</option>
                      </select>
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-slate-500">Width</label>
                      <select value={webmWidth} onChange={e => setWebmWidth(Number(e.target.value))}
                        className="text-xs bg-slate-800 border border-slate-700 text-slate-300 rounded px-2 py-1 cursor-pointer">
                        <option value={640}>640p</option>
                        <option value={1280}>720p</option>
                        <option value={1920}>1080p</option>
                      </select>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <div className="text-xs text-slate-600">
                        VP9/VP8 · {webmFps} fps · {webmWidth}px · <span className="text-cyan-400">video-only (no audio)</span>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-amber-400/80">
                        <svg className="w-3 h-3 flex-none" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/>
                        </svg>
                        Real-time encode — output ≈ timeline duration.
                      </div>
                    </div>
                    <button
                      onClick={handleExportWebM}
                      className="ml-auto flex items-center gap-1.5 px-4 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold rounded-lg transition-colors"
                    >
                      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M19 9h-4V3H9v6H5l7 7 7-7zm-8 2V5h2v6h1.17L12 13.17 9.83 11H11zm-6 7h14v2H5z"/>
                      </svg>
                      Start Export
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Body ── */}
        <div className="flex flex-1 overflow-hidden">

          {/* Left: Timeline */}
          <div className="w-64 flex-none flex flex-col border-r border-slate-800/60 bg-slate-950/60">
            <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800/60">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Timeline</span>
              <button
                onClick={() => setShowPicker(p => !p)}
                className="flex items-center gap-1 px-2 py-1 bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium rounded-lg transition-colors"
              >
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
                Add Clip
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {clips.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-4">
                  <svg className="w-8 h-8 text-slate-700" fill="currentColor" viewBox="0 0 24 24"><path d="M18 3v2h-2V3H8v2H6V3H4v18h2v-2h2v2h8v-2h2v2h2V3h-2z"/></svg>
                  <p className="text-slate-600 text-xs">No clips yet.<br/>Click Add Clip.</p>
                </div>
              ) : clips.map((clip, i) => {
                const thumb = thumbCache.get(clip.video.id);
                const isActive = i === activeIdx;
                return (
                  <div key={clip.id}>
                    {/* Transition selector between clips */}
                    {i > 0 && (
                      <div className="flex items-center justify-center py-1">
                        <select
                          value={clip.transition}
                          onChange={e => updateClip(i, { transition: e.target.value as TransitionType })}
                          className="text-xs bg-slate-800 border border-slate-700 text-slate-500 rounded px-2 py-0.5 cursor-pointer"
                        >
                          <option value="cut">✂️ Cut</option>
                          <option value="fade">🌅 Fade</option>
                          <option value="dissolve">🔀 Dissolve</option>
                          <option value="zoom">🔍 Zoom In</option>
                          <option value="slide-left">⬅️ Slide Left</option>
                          <option value="slide-right">➡️ Slide Right</option>
                          <option value="flash">⚡ Flash</option>
                        </select>
                      </div>
                    )}
                    <div
                      className={`flex items-center gap-2 p-2 rounded-xl cursor-pointer transition-all ${isActive ? 'bg-amber-600/15 border border-amber-500/40' : 'border border-transparent hover:bg-slate-800/60'}`}
                      onClick={() => { videoRef.current?.pause(); setIsPlaying(false); setActiveIdx(i); }}
                    >
                      <div className={`w-12 h-8 rounded-lg overflow-hidden flex-none bg-slate-800 relative ${isActive ? 'ring-2 ring-amber-500' : ''}`}>
                        {thumb
                          ? <img src={thumb} alt="" className="w-full h-full object-cover" />
                          : <div className="w-full h-full flex items-center justify-center"><div className="w-3 h-3 border border-slate-600 border-t-slate-400 rounded-full animate-spin" /></div>}
                        <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded text-xs font-bold flex items-center justify-center ${isActive ? 'bg-amber-500 text-black' : 'bg-black/70 text-white'}`}>{i + 1}</div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-slate-300 truncate">{clip.video.name.replace(/\.[^/.]+$/, '')}</p>
                        <ClipDur clip={clip} />
                      </div>
                      <div className="flex flex-col gap-0.5" onClick={e => e.stopPropagation()}>
                        <button onClick={() => moveClip(i, -1)} disabled={i === 0} className="w-4 h-4 flex items-center justify-center text-slate-600 hover:text-slate-300 disabled:opacity-20 transition-colors">
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M7 14l5-5 5 5z"/></svg>
                        </button>
                        <button onClick={() => moveClip(i, 1)} disabled={i === clips.length - 1} className="w-4 h-4 flex items-center justify-center text-slate-600 hover:text-slate-300 disabled:opacity-20 transition-colors">
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M7 10l5 5 5-5z"/></svg>
                        </button>
                        <button onClick={() => removeClip(i)} className="w-4 h-4 flex items-center justify-center text-slate-600 hover:text-red-400 transition-colors">
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right: Preview + Controls */}
          <div className="flex-1 flex flex-col min-w-0">

            {/* Video preview */}
            <div className="flex-1 relative bg-black flex items-center justify-center min-h-0">
              {activeClip ? (
                <>
                  <video
                    ref={videoRef}
                    className="max-w-full max-h-full object-contain cursor-pointer"
                    style={{ opacity, transition: 'opacity 0.4s', ...videoStyle }}
                    playsInline
                    onTimeUpdate={handleTimeUpdate}
                    onPlay={() => setIsPlaying(true)}
                    onPause={() => { if (!chainingRef.current) setIsPlaying(false); }}
                    onClick={togglePlay}
                  />
                  {/* Flash overlay */}
                  {flashOverlay && (
                    <div className="absolute inset-0 bg-white pointer-events-none" style={{ animation: 'none' }} />
                  )}
                  <div className="absolute top-3 left-3 bg-black/70 backdrop-blur-sm px-3 py-1.5 rounded-xl pointer-events-none">
                    <p className="text-white text-xs font-medium">Clip {activeIdx + 1} / {clips.length}</p>
                    <p className="text-slate-400 text-xs truncate max-w-48">{activeClip.video.name.replace(/\.[^/.]+$/, '')}</p>
                  </div>
                  {!isPlaying && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="w-16 h-16 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center border border-white/20">
                        <svg className="w-7 h-7 text-white ml-1" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="flex flex-col items-center gap-4 text-slate-600">
                  <svg className="w-16 h-16" fill="currentColor" viewBox="0 0 24 24"><path d="M18 3v2h-2V3H8v2H6V3H4v18h2v-2h2v2h8v-2h2v2h2V3h-2z"/></svg>
                  <p className="text-slate-500 text-sm">Add videos to the timeline</p>
                  <button onClick={() => setShowPicker(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white text-sm font-medium rounded-xl transition-colors">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
                    Add Video
                  </button>
                </div>
              )}
            </div>

            {/* ── Chapter strip ── */}
            {clips.length > 1 && (
              <div className="flex-none bg-slate-900/60 border-t border-slate-800/40 px-3 py-2" style={{ overflowX: 'auto', overflowY: 'hidden' }}>
                <div className="flex gap-2 items-center">
                  {clips.map((clip, i) => {
                    const thumb = thumbCache.get(clip.video.id);
                    const isActive = i === activeIdx;
                    return (
                      <button
                        key={clip.id}
                        onClick={() => { videoRef.current?.pause(); setIsPlaying(false); setActiveIdx(i); }}
                        className={`flex-none flex flex-col items-center gap-1 transition-all ${isActive ? 'opacity-100' : 'opacity-50 hover:opacity-80'}`}
                      >
                        <div className={`w-20 h-12 rounded-lg overflow-hidden bg-slate-800 border-2 relative ${isActive ? 'border-amber-500' : 'border-slate-700'}`}>
                          {thumb
                            ? <img src={thumb} alt="" className="w-full h-full object-cover" />
                            : <div className="w-full h-full flex items-center justify-center"><div className="w-3 h-3 border border-slate-600 border-t-slate-400 rounded-full animate-spin" /></div>}
                          <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded text-xs font-bold flex items-center justify-center ${isActive ? 'bg-amber-500 text-black' : 'bg-black/70 text-white'}`}>{i + 1}</div>
                          {isActive && isPlaying && (
                            <div className="absolute bottom-0.5 right-0.5 w-3 h-3 rounded-full bg-amber-500 flex items-center justify-center">
                              <div className="w-1.5 h-1.5 rounded-full bg-black animate-pulse" />
                            </div>
                          )}
                        </div>
                        <span className="text-xs text-slate-500 font-mono max-w-20 truncate">{clip.video.name.replace(/\.[^/.]+$/, '')}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Controls */}
            {clips.length > 0 && (
              <div className="flex-none bg-slate-900/90 px-4 py-3 border-t border-slate-800/60 overflow-y-auto" style={{ maxHeight: '55vh' }}>
                {/* Progress bar */}
                <div
                  className="h-1.5 bg-slate-700 rounded-full mb-3 overflow-hidden cursor-pointer hover:h-2.5 transition-all"
                  onClick={e => {
                    const vid = videoRef.current; const clip = clips[activeIdx];
                    if (!vid || !clip) return;
                    const r = e.currentTarget.getBoundingClientRect();
                    vid.currentTime = clip.startTime + ((e.clientX - r.left) / r.width) * clipDuration;
                  }}
                >
                  <div className="h-full bg-amber-500 rounded-full" style={{ width: `${progress}%`, transition: 'width 0.1s linear' }} />
                </div>

                <div className="flex items-center gap-2">
                  {/* Restart */}
                  <button onClick={() => { videoRef.current?.pause(); setIsPlaying(false); setActiveIdx(0); }}
                    className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center transition-colors" title="Restart">
                    <svg className="w-4 h-4 text-slate-300" fill="currentColor" viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/></svg>
                  </button>
                  {/* Play/Pause */}
                  <button onClick={togglePlay} className="w-10 h-10 rounded-lg bg-amber-600 hover:bg-amber-500 flex items-center justify-center transition-colors">
                    {isPlaying
                      ? <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
                      : <svg className="w-5 h-5 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>}
                  </button>
                  <span className="text-slate-400 text-xs font-mono ml-1">{formatDuration(currentTime)} / {formatDuration(clipDuration)}</span>
                  <div className="flex-1" />
                  {/* Prev/Next clip */}
                  <button onClick={() => { videoRef.current?.pause(); setIsPlaying(false); setActiveIdx(i => Math.max(0, i - 1)); }}
                    disabled={activeIdx === 0}
                    className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-30 flex items-center justify-center transition-colors">
                    <svg className="w-4 h-4 text-slate-300" fill="currentColor" viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/></svg>
                  </button>
                  <span className="text-slate-500 text-xs font-mono">{activeIdx + 1}/{clips.length}</span>
                  <button onClick={() => { videoRef.current?.pause(); setIsPlaying(false); setActiveIdx(i => Math.min(clips.length - 1, i + 1)); }}
                    disabled={activeIdx === clips.length - 1}
                    className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-30 flex items-center justify-center transition-colors">
                    <svg className="w-4 h-4 text-slate-300" fill="currentColor" viewBox="0 0 24 24"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>
                  </button>
                </div>

                {/* Trim panel for active clip */}
                {activeClip && <TrimPanel key={activeClip.id} clip={activeClip} idx={activeIdx} onUpdate={updateClip} videoRef={videoRef} />}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Auto-Highlights Modal ── */}
      {showHighlights && (
        <HighlightsModal
          videos={videos}
          initialVideo={activeClip?.video ?? null}
          onClose={() => setShowHighlights(false)}
          onConfirm={appendHighlightClips}
        />
      )}

      {/* ── Video Picker Modal ── */}
      {showPicker && (
        <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowPicker(false)}>
          <div className="bg-slate-900 rounded-2xl border border-slate-800 w-full max-w-lg max-h-[70vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
              <span className="text-slate-200 font-semibold text-sm">Add Video to Timeline</span>
              <button onClick={() => setShowPicker(false)} className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center transition-colors">
                <svg className="w-3.5 h-3.5 text-slate-400" fill="currentColor" viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {videos.map(v => <PickerRow key={v.id} video={v} onAdd={() => addClip(v)} />)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

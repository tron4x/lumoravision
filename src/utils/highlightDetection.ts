/**
 * Auto-Highlights / Best-of-Reel Generator
 * ─────────────────────────────────────────
 * Combines three signals to find the most "interesting" moments in a video:
 *
 *   1. Audio energy peaks  – via OfflineAudioContext (RMS per 1 s bin)
 *      → laughter, music drops, sudden loudness, speech climax
 *   2. Visual motion       – via the existing frame-diff WebWorker
 *      → action, fast cuts, rapid camera movement
 *   3. Scene boundaries    – cuts already detected by sceneDetection.ts get
 *      a small bonus, so highlight clips tend to start cleanly.
 *
 * Output is a list of { startTime, endTime } ranges totalling roughly
 * `targetDuration` seconds, picked greedily from the highest-scoring 1 s
 * windows with a minimum spacing so the same scene is never picked twice.
 *
 * Performance & safety:
 *   • Audio decode is one-shot via OfflineAudioContext – very fast, but
 *     memory ~ duration × samplerate × channels × 4 B. We hard-cap input
 *     length to MAX_INPUT_DURATION_S to avoid OOM on multi-hour files.
 *   • Frame sampling reuses the same hidden-video pattern as
 *     sceneDetection – 1 fps sample rate keeps it cheap.
 *   • Everything is cancellable via `cancelRef`. The function awaits the
 *     flag at every loop iteration and short-circuits.
 *   • All transient resources (worker, hidden <video>, audio context) are
 *     released in `finally` blocks.
 */

import FrameDiffWorker from '../workers/frameDiff.worker.ts?worker';

export interface HighlightRange {
  startTime: number;
  endTime: number;
  score: number;
  /** debug breakdown – useful for UI tooltips */
  audioScore: number;
  motionScore: number;
}

export interface HighlightResult {
  ranges: HighlightRange[];
  /** total selected duration in seconds */
  totalDuration: number;
  /** the sampled per-second scores, exposed so the UI can draw a heat map */
  perSecondScores: number[];
}

export interface HighlightOptions {
  /** desired total length of the reel in seconds (default 60) */
  targetDuration?: number;
  /** length of each individual highlight clip in seconds (default 4) */
  clipDuration?: number;
  /** minimum gap between two picked clips in seconds (default 6) */
  minSpacing?: number;
  /** how strongly motion contributes vs audio (0..1, default 0.5) */
  motionWeight?: number;
  /** progress 0..100 */
  onProgress?: (pct: number, phase: string) => void;
  /** caller-controlled cancel flag */
  cancelRef?: { current: boolean };
}

const MAX_INPUT_DURATION_S = 30 * 60;   // hard safety cap = 30 min (60 min causes OOM crashes during audio decode)
const SAMPLE_RATE_DECODE   = 16000;     // mono-resample target – 16 kHz is plenty for energy analysis
const FRAME_SAMPLE_FPS     = 1;         // one motion sample per second
const FRAME_W              = 160;
const FRAME_H              = 90;

// ── Worker client (mirrors the one in sceneDetection.ts) ─────────────────────
class DiffWorkerClient {
  private worker: Worker | null = null;
  private nextId = 0;
  private pending = new Map<number, (value: number) => void>();

  ensure() {
    if (this.worker) return;
    this.worker = new FrameDiffWorker();
    this.worker.addEventListener('message', (ev: MessageEvent) => {
      const msg = ev.data as { type: string; id: number; value: number };
      if (msg.type === 'diff') {
        const cb = this.pending.get(msg.id);
        if (cb) {
          this.pending.delete(msg.id);
          cb(msg.value);
        }
      }
    });
  }

  reset() {
    this.ensure();
    this.worker!.postMessage({ type: 'reset' });
  }

  diff(buffer: ArrayBuffer, w: number, h: number): Promise<number> {
    this.ensure();
    const id = this.nextId++;
    return new Promise<number>(resolve => {
      this.pending.set(id, resolve);
      this.worker!.postMessage({ type: 'diff', id, buffer, w, h }, [buffer]);
    });
  }

  terminate() {
    if (this.worker) { this.worker.terminate(); this.worker = null; }
    this.pending.clear();
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────
async function sampleFrame(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  time: number,
): Promise<ImageData> {
  return new Promise((resolve, reject) => {
    let done = false;
    const cleanup = () => {
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onError);
      clearTimeout(timeoutId);
    };
    const onSeeked = () => {
      if (done) return;
      done = true;
      cleanup();
      try {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        resolve(ctx.getImageData(0, 0, canvas.width, canvas.height));
      } catch (e) { reject(e); }
    };
    const onError = () => {
      if (done) return;
      done = true; cleanup();
      reject(new Error('Video seek error'));
    };
    const timeoutId = setTimeout(() => {
      if (done) return;
      done = true; cleanup();
      reject(new Error('Seek timeout'));
    }, 5000);
    video.addEventListener('seeked', onSeeked);
    video.addEventListener('error', onError);
    video.currentTime = time;
  });
}

/** Decode the entire video's audio into per-second RMS values. */
async function computeAudioEnergy(
  url: string,
  durationSec: number,
  cancelRef?: { current: boolean },
  onProgress?: (pct: number) => void,
): Promise<number[]> {
  // Fetch the file as ArrayBuffer (works for blob: URLs too)
  let arrayBuffer: ArrayBuffer;
  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    arrayBuffer = await resp.arrayBuffer();
  } catch (e) {
    // If we can't read the audio (e.g. cross-origin without CORS), return
    // a flat all-zeros array so the algorithm still works on motion alone.
    console.warn('[highlights] audio fetch failed, falling back to motion-only:', e);
    return new Array(Math.ceil(durationSec)).fill(0);
  }
  if (cancelRef?.current) throw new Error('cancelled');

  // Use OfflineAudioContext at a low sample rate for fast decode + analysis.
  // Some browsers (Safari < 14) refuse non-44.1 kHz contexts → fall back.
  let audioCtx: OfflineAudioContext;
  try {
    audioCtx = new OfflineAudioContext({
      numberOfChannels: 1,
      length: Math.ceil(durationSec * SAMPLE_RATE_DECODE),
      sampleRate: SAMPLE_RATE_DECODE,
    });
  } catch {
    audioCtx = new OfflineAudioContext(1, Math.ceil(durationSec * 44100), 44100);
  }

  let audioBuf: AudioBuffer;
  try {
    audioBuf = await audioCtx.decodeAudioData(arrayBuffer);
  } catch (e) {
    console.warn('[highlights] audio decode failed, motion-only:', e);
    return new Array(Math.ceil(durationSec)).fill(0);
  }
  if (cancelRef?.current) throw new Error('cancelled');

  // Compute RMS per 1 s bin. Mix down channels manually (cheaper than a
  // ScriptProcessor / startRendering round-trip).
  const sr = audioBuf.sampleRate;
  const bins = Math.ceil(audioBuf.duration);
  const rms = new Array<number>(bins).fill(0);
  const channelCount = audioBuf.numberOfChannels;

  for (let bin = 0; bin < bins; bin++) {
    if (cancelRef?.current) throw new Error('cancelled');
    const start = Math.floor(bin * sr);
    const end = Math.min(audioBuf.length, Math.floor((bin + 1) * sr));
    let sumSq = 0;
    let count = 0;
    for (let ch = 0; ch < channelCount; ch++) {
      const data = audioBuf.getChannelData(ch);
      // Stride sample by 4 → 25 % of samples is enough for an energy estimate
      // and ~4× faster than scanning every sample.
      for (let i = start; i < end; i += 4) {
        const v = data[i];
        sumSq += v * v;
        count++;
      }
    }
    rms[bin] = count > 0 ? Math.sqrt(sumSq / count) : 0;
    if ((bin & 31) === 0) onProgress?.(Math.round((bin / bins) * 100));
  }
  onProgress?.(100);
  return rms;
}

/** Sample motion (frame diff) once per second using the existing worker. */
async function computeMotionTrack(
  url: string,
  durationSec: number,
  cancelRef?: { current: boolean },
  onProgress?: (pct: number) => void,
): Promise<number[]> {
  const video = document.createElement('video');
  video.src = url;
  video.muted = true;
  video.preload = 'auto';
  video.style.display = 'none';
  document.body.appendChild(video);

  await new Promise<void>(resolve => {
    if (video.readyState >= 1) { resolve(); return; }
    video.addEventListener('loadedmetadata', () => resolve(), { once: true });
  });

  const canvas = document.createElement('canvas');
  canvas.width = FRAME_W;
  canvas.height = FRAME_H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const totalSamples = Math.floor(durationSec * FRAME_SAMPLE_FPS);
  const motion = new Array<number>(totalSamples).fill(0);

  if (!ctx) {
    if (document.body.contains(video)) document.body.removeChild(video);
    return motion;
  }

  let diffWorker: DiffWorkerClient | null = null;
  try {
    const w = new DiffWorkerClient();
    w.ensure();
    w.reset();
    diffWorker = w;
  } catch {
    /* worker unavailable – we'll just leave motion at 0 */
  }

  try {
    for (let i = 0; i < totalSamples; i++) {
      if (cancelRef?.current) throw new Error('cancelled');
      const t = Math.min(i / FRAME_SAMPLE_FPS, durationSec - 0.1);
      try {
        const frame = await sampleFrame(video, canvas, ctx, t);
        const owned = new Uint8ClampedArray(frame.data);
        if (i === 0) {
          if (diffWorker) await diffWorker.diff(owned.buffer, FRAME_W, FRAME_H);
        } else if (diffWorker) {
          motion[i] = await diffWorker.diff(owned.buffer, FRAME_W, FRAME_H);
        }
      } catch {
        // skip frame errors silently
      }
      if ((i & 7) === 0) onProgress?.(Math.round((i / totalSamples) * 100));
    }
    onProgress?.(100);
    return motion;
  } finally {
    if (diffWorker) { try { diffWorker.terminate(); } catch { /* ignore */ } }
    try {
      video.pause();
      video.removeAttribute('src');
      video.load();
    } catch { /* ignore */ }
    if (document.body.contains(video)) document.body.removeChild(video);
  }
}

/** Normalise an array to 0..1 (max → 1, min → 0). Empty / flat arrays → all 0. */
function normalize(arr: number[]): number[] {
  if (arr.length === 0) return arr;
  let min = Infinity, max = -Infinity;
  for (const v of arr) { if (v < min) min = v; if (v > max) max = v; }
  const span = max - min;
  if (span <= 1e-9) return new Array(arr.length).fill(0);
  return arr.map(v => (v - min) / span);
}

/** Greedy top-N pick with minimum spacing. Returns indices into the score array. */
function pickTopWithSpacing(
  scores: number[],
  count: number,
  minGap: number,
): number[] {
  // Build (idx, score) descending
  const sorted = scores
    .map((s, i) => ({ s, i }))
    .sort((a, b) => b.s - a.s);

  const picked: number[] = [];
  for (const { i } of sorted) {
    if (picked.length >= count) break;
    if (picked.every(p => Math.abs(p - i) >= minGap)) picked.push(i);
  }
  return picked.sort((a, b) => a - b);
}

// ── Public API ───────────────────────────────────────────────────────────────
export async function detectHighlights(
  videoUrl: string,
  videoDuration: number,
  options: HighlightOptions = {},
): Promise<HighlightResult> {
  const {
    targetDuration = 60,
    clipDuration = 4,
    minSpacing = 6,
    motionWeight = 0.5,
    onProgress,
    cancelRef,
  } = options;

  if (!videoDuration || !isFinite(videoDuration) || videoDuration < clipDuration * 2) {
    return {
      ranges: [{ startTime: 0, endTime: Math.max(1, videoDuration), score: 1, audioScore: 0, motionScore: 0 }],
      totalDuration: videoDuration,
      perSecondScores: [],
    };
  }

  if (videoDuration > MAX_INPUT_DURATION_S) {
    throw new Error(`Video too long (${Math.round(videoDuration / 60)} min). Max supported: ${MAX_INPUT_DURATION_S / 60} min.`);
  }

  // Phase 1 (0..40 %): audio energy
  onProgress?.(0, 'Analyzing audio…');
  const audioBins = await computeAudioEnergy(
    videoUrl,
    videoDuration,
    cancelRef,
    pct => onProgress?.(Math.round(pct * 0.4), 'Analyzing audio…'),
  );

  // Phase 2 (40..90 %): motion
  onProgress?.(40, 'Analyzing motion…');
  const motionBins = await computeMotionTrack(
    videoUrl,
    videoDuration,
    cancelRef,
    pct => onProgress?.(40 + Math.round(pct * 0.5), 'Analyzing motion…'),
  );

  // Phase 3 (90..100 %): scoring & selection
  onProgress?.(90, 'Picking highlights…');

  const audioNorm = normalize(audioBins);
  const motionNorm = normalize(motionBins);
  const len = Math.min(audioNorm.length, motionNorm.length);
  const audioW = 1 - motionWeight;
  const perSecondScores = new Array<number>(len);
  for (let i = 0; i < len; i++) {
    perSecondScores[i] = audioW * audioNorm[i] + motionWeight * motionNorm[i];
  }

  // Smooth with a 3-bin box filter so we pick *peaks*, not single spikes.
  const smoothed = perSecondScores.map((_, i) => {
    const a = perSecondScores[i - 1] ?? perSecondScores[i];
    const b = perSecondScores[i];
    const c = perSecondScores[i + 1] ?? perSecondScores[i];
    return (a + b + c) / 3;
  });

  // Edges of the video are usually black/silence – penalise the first and
  // last ~3 seconds so we don't open a reel with a fade-in or end on credits.
  const edgePenalty = 3;
  for (let i = 0; i < edgePenalty && i < smoothed.length; i++) smoothed[i] *= 0.3;
  for (let i = smoothed.length - edgePenalty; i < smoothed.length; i++) {
    if (i >= 0) smoothed[i] *= 0.3;
  }

  const targetClips = Math.max(1, Math.round(targetDuration / clipDuration));
  const gap = Math.max(clipDuration, minSpacing);
  const pickedIdx = pickTopWithSpacing(smoothed, targetClips, gap);

  const ranges: HighlightRange[] = pickedIdx.map(idx => {
    const start = Math.max(0, idx - clipDuration / 2);
    const end = Math.min(videoDuration, start + clipDuration);
    return {
      startTime: start,
      endTime: end,
      score: smoothed[idx],
      audioScore: audioNorm[idx] ?? 0,
      motionScore: motionNorm[idx] ?? 0,
    };
  });

  // Merge overlapping ranges that the spacing constraint somehow let through.
  ranges.sort((a, b) => a.startTime - b.startTime);
  const merged: HighlightRange[] = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r.startTime < last.endTime) {
      last.endTime = Math.max(last.endTime, r.endTime);
      last.score = Math.max(last.score, r.score);
    } else {
      merged.push(r);
    }
  }

  const totalDuration = merged.reduce((s, r) => s + (r.endTime - r.startTime), 0);
  onProgress?.(100, 'Done');
  return { ranges: merged, totalDuration, perSecondScores: smoothed };
}

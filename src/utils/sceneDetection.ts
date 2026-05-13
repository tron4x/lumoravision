/**
 * Scene Detection & Auto-Chapters
 * Uses Canvas API to analyze video frames - runs 100% in the browser, no server needed.
 *
 * Strategy:
 * - Always generate exactly `maxChapters` chapters spread evenly across the full video duration
 * - Additionally detect real scene changes and snap chapter boundaries to them when close
 * - Result: 20 chapters covering the entire video, with boundaries aligned to actual scene cuts
 *
 * Performance: the per-frame pixel comparison (the only CPU-heavy step) is
 * offloaded to a WebWorker (`frameDiff.worker.ts`). The main thread only
 * handles the unavoidable HTMLVideoElement seeking + canvas draw, then
 * transfers the pixel buffer to the worker via postMessage(transferable).
 * This keeps the UI thread free for scrolling, hover and playback while
 * a long video is being analysed.
 */

// Vite-native worker import. The `?worker` suffix tells Vite to bundle the
// referenced file as a separate worker chunk and give us a constructor.
import FrameDiffWorker from '../workers/frameDiff.worker.ts?worker';

export interface SceneChapter {
  time: number;       // seconds
  thumbnail?: string; // base64 data URL of the frame
  label: string;      // "Chapter 1", "Chapter 2", ...
}

export interface SceneDetectionResult {
  chapters: SceneChapter[];
  totalScenes: number;
}

// ── Worker-backed diff helper ────────────────────────────────────────────────
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
      // Transfer the buffer (zero-copy) to the worker.
      this.worker!.postMessage({ type: 'diff', id, buffer, w, h }, [buffer]);
    });
  }

  terminate() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.pending.clear();
  }
}


// Sample a video frame at a given time and return ImageData.
// Includes a timeout to avoid hanging forever (and leaking listeners) if the
// browser fails to seek for whatever reason.
async function sampleFrame(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  time: number
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
      } catch (e) {
        reject(e);
      }
    };
    const onError = () => {
      if (done) return;
      done = true;
      cleanup();
      reject(new Error('Video seek error'));
    };
    const timeoutId = setTimeout(() => {
      if (done) return;
      done = true;
      cleanup();
      reject(new Error('Seek timeout'));
    }, 5000);
    video.addEventListener('seeked', onSeeked);
    video.addEventListener('error', onError);
    video.currentTime = time;
  });
}

function extractThumbnail(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL('image/jpeg', 0.65);
}

export async function detectScenes(
  sourceVideo: HTMLVideoElement,
  options: {
    sampleInterval?: number;   // seconds between analysis samples (default: 2)
    threshold?: number;        // scene change threshold 0-255 (default: 25)
    maxChapters?: number;      // exact number of chapters to generate (default: 20)
    onProgress?: (pct: number) => void;
  } = {}
): Promise<SceneDetectionResult> {
  const {
    sampleInterval = 2,
    threshold = 25,
    maxChapters = 20,
    onProgress,
  } = options;

  const duration = sourceVideo.duration;
  if (!duration || isNaN(duration) || duration < 2) {
    return { chapters: [{ time: 0, label: 'Chapter 1' }], totalScenes: 1 };
  }

  // Create a SEPARATE hidden video element so the visible player is not disturbed
  const video = document.createElement('video');
  video.src = sourceVideo.src;
  video.muted = true;
  video.preload = 'auto';
  video.style.display = 'none';
  document.body.appendChild(video);

  // Wait for seekable
  await new Promise<void>(resolve => {
    if (video.readyState >= 1) { resolve(); return; }
    video.addEventListener('loadedmetadata', () => resolve(), { once: true });
  });

  // Offscreen canvas (small = fast)
  const canvas = document.createElement('canvas');
  canvas.width = 160;
  canvas.height = 90;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    document.body.removeChild(video);
    return { chapters: [], totalScenes: 0 };
  }

  // Spin up a per-call worker for the diff stage. If construction fails (older
  // browsers, restrictive CSP) we transparently fall back to main-thread diffs.
  let diffWorker: DiffWorkerClient | null = null;
  try {
    const w = new DiffWorkerClient();
    w.ensure();
    w.reset();
    diffWorker = w;
  } catch {
    /* ignore – fallback path below handles null worker */
  }

  // Main-thread fallback diff (kept for browsers that fail to spawn workers)
  const fallbackDiff = (a: Uint8ClampedArray, b: Uint8ClampedArray): number => {
    const len = a.length;
    let diff = 0;
    for (let i = 0; i < len; i += 16) {
      const r1 = a[i], g1 = a[i + 1], b1 = a[i + 2];
      const r2 = b[i], g2 = b[i + 1], b2 = b[i + 2];
      diff += Math.abs(0.299 * (r1 - r2) + 0.587 * (g1 - g2) + 0.114 * (b1 - b2));
    }
    return diff / (len / 16);
  };

  try {
    // --- Phase 1: Detect scene changes by sampling every sampleInterval seconds ---
    const sceneChangeTimes = new Set<number>([0]);
    // Keep a copy of the previous frame's pixels for the fallback path. When
    // the worker is used we rely on the worker's internal `prev` instead.
    let prevFallback: Uint8ClampedArray | null = null;
    const totalSamples = Math.floor(duration / sampleInterval);
    const fW = canvas.width;
    const fH = canvas.height;

    for (let i = 0; i <= totalSamples; i++) {
      const t = Math.min(i * sampleInterval, duration - 0.1);
      try {
        const frame = await sampleFrame(video, canvas, ctx, t);
        // Take an owned copy of the pixel buffer so we can transfer it to the
        // worker without invalidating the underlying ImageData.
        const owned = new Uint8ClampedArray(frame.data);

        let diff = 0;
        if (i === 0) {
          // First frame – nothing to diff against, just seed the worker /
          // fallback "prev" state.
          if (diffWorker) {
            // Send so the worker stores it as its prev frame; ignore returned 0
            await diffWorker.diff(owned.buffer, fW, fH);
          } else {
            prevFallback = owned;
          }
        } else if (diffWorker) {
          diff = await diffWorker.diff(owned.buffer, fW, fH);
        } else if (prevFallback) {
          diff = fallbackDiff(prevFallback, owned);
          prevFallback = owned;
        }

        if (diff > threshold) sceneChangeTimes.add(t);
      } catch {
        // skip individual frame errors
      }
      onProgress?.(Math.round((i / totalSamples) * 50)); // first 50% = analysis
    }

    // --- Phase 2: Generate exactly maxChapters evenly spaced across full duration ---
    // Then snap each boundary to the nearest detected scene change (within a tolerance)
    const snapTolerance = duration / maxChapters / 2; // snap within half a chapter interval
    const sortedSceneTimes = Array.from(sceneChangeTimes).sort((a, b) => a - b);

    const chapterTimes: number[] = [];
    for (let i = 0; i < maxChapters; i++) {
      const idealTime = (i / maxChapters) * duration;

      // Find nearest scene change within tolerance
      let best = idealTime;
      let bestDist = snapTolerance;
      for (const st of sortedSceneTimes) {
        const dist = Math.abs(st - idealTime);
        if (dist < bestDist) {
          bestDist = dist;
          best = st;
        }
      }

      // Avoid duplicates
      if (chapterTimes.length === 0 || best - chapterTimes[chapterTimes.length - 1] > 0.5) {
        chapterTimes.push(best);
      } else {
        // Use ideal time if snapped position is duplicate
        const fallback = idealTime;
        if (chapterTimes.length === 0 || fallback - chapterTimes[chapterTimes.length - 1] > 0.5) {
          chapterTimes.push(fallback);
        }
      }
    }

    // --- Phase 3: Extract thumbnails for each chapter ---
    const chapters: SceneChapter[] = [];
    for (let i = 0; i < chapterTimes.length; i++) {
      const t = chapterTimes[i];
      let thumbnail: string | undefined;
      try {
        await sampleFrame(video, canvas, ctx, t);
        thumbnail = extractThumbnail(canvas);
      } catch {
        // no thumbnail
      }
      chapters.push({
        time: t,
        thumbnail,
        label: `Chapter ${i + 1}`,
      });
      onProgress?.(50 + Math.round((i / chapterTimes.length) * 50));
    }

    onProgress?.(100);
    return { chapters, totalScenes: chapters.length };
  } finally {
    // Always tear down the worker so we don't leak a thread.
    if (diffWorker) {
      try { diffWorker.terminate(); } catch { /* ignore */ }
    }
    // Always remove the hidden video element AND release its source so the
    // browser can free the decoded frame buffer immediately (otherwise it can
    // hold tens of MB until GC runs).
    try {
      video.pause();
      video.removeAttribute('src');
      video.load();
    } catch { /* ignore */ }
    if (document.body.contains(video)) document.body.removeChild(video);
  }
}

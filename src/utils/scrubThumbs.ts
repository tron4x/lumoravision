/**
 * scrubThumbs.ts — Smart-Scrub hover-thumbnail generator
 * ─────────────────────────────────────────────────────
 * For the VideoPlayer progress-bar hover preview. The user expects the
 * thumbnail to show *which frame* is at the hovered timecode, like in
 * YouTube/Premiere, but without uploading or pre-encoding.
 *
 * Design constraints:
 *   1. Generate frames on-demand, no full pre-pass (would be expensive on
 *      long videos and unnecessary for casual hovering).
 *   2. Coalesce rapid hover movement: only the *latest* requested time
 *      actually triggers a seek; intermediate ones are dropped.
 *   3. Cache previously-generated frames per (videoId, time-rounded-to-1s)
 *      so re-hover is instant.
 *   4. Reuse a single offscreen <video> element per session – creating one
 *      per hover would re-decode the file and is much slower.
 *   5. Tear down resources when the player closes (`releaseSession`).
 */

const THUMB_W = 160;
const THUMB_H = 90;

// Per-cache LRU max (rounded-second → dataURL). 600 entries at ~10 KB
// = 6 MB worst case per video; we evict oldest first.
const CACHE_MAX = 600;

class ScrubSession {
  readonly videoId: string;
  private video: HTMLVideoElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private cache = new Map<number, string>();
  private ready = false;
  private readyPromise: Promise<void>;
  // True while a seek+capture is in flight
  private busy = false;
  // The latest pending request; only this one will be honoured when the
  // current seek finishes.
  private pendingTime: number | null = null;
  private pendingResolve: ((url: string | null) => void) | null = null;
  private destroyed = false;

  constructor(videoId: string, url: string) {
    this.videoId = videoId;

    const v = document.createElement('video');
    v.muted = true;
    v.playsInline = true;
    v.preload = 'auto';
    v.style.display = 'none';
    v.src = url;
    document.body.appendChild(v);
    this.video = v;

    const c = document.createElement('canvas');
    c.width = THUMB_W;
    c.height = THUMB_H;
    this.canvas = c;
    this.ctx = c.getContext('2d', { willReadFrequently: true })!;

    this.readyPromise = new Promise<void>(resolve => {
      const done = () => {
        this.ready = true;
        resolve();
      };
      if (v.readyState >= 1) {
        done();
      } else {
        v.addEventListener('loadedmetadata', done, { once: true });
        v.addEventListener('error', done, { once: true });
      }
    });
  }

  /** Returns a base64 JPEG thumbnail for the requested time, or null on error. */
  async get(time: number): Promise<string | null> {
    if (this.destroyed) return null;

    const key = Math.round(time);
    const hit = this.cache.get(key);
    if (hit) return hit;

    if (!this.ready) await this.readyPromise;
    if (this.destroyed) return null;

    // Check cache again post-await
    const hit2 = this.cache.get(key);
    if (hit2) return hit2;

    return new Promise<string | null>((resolve) => {
      // Coalesce: if a seek is already running, just remember the latest
      // requested time and the latest resolver. Earlier resolvers get null
      // so they don't hang.
      if (this.busy) {
        if (this.pendingResolve) {
          // Drop the earlier pending resolver – it represents a stale hover
          this.pendingResolve(null);
        }
        this.pendingTime = time;
        this.pendingResolve = resolve;
        return;
      }
      this.runSeek(time, resolve);
    });
  }

  private runSeek(time: number, resolve: (url: string | null) => void) {
    this.busy = true;

    const v = this.video;
    let done = false;
    const cleanup = () => {
      v.removeEventListener('seeked', onSeeked);
      v.removeEventListener('error', onError);
      clearTimeout(timeoutId);
    };

    const finish = (result: string | null) => {
      if (done) return;
      done = true;
      cleanup();
      this.busy = false;
      resolve(result);
      // Drain the latest pending hover, if any
      const next = this.pendingTime;
      const nextRes = this.pendingResolve;
      this.pendingTime = null;
      this.pendingResolve = null;
      if (next !== null && nextRes && !this.destroyed) {
        this.runSeek(next, nextRes);
      }
    };

    const onSeeked = () => {
      try {
        this.ctx.drawImage(v, 0, 0, THUMB_W, THUMB_H);
        const url = this.canvas.toDataURL('image/jpeg', 0.7);
        const key = Math.round(time);
        if (this.cache.size >= CACHE_MAX && !this.cache.has(key)) {
          const firstKey = this.cache.keys().next().value;
          if (firstKey !== undefined) this.cache.delete(firstKey);
        }
        this.cache.set(key, url);
        finish(url);
      } catch {
        finish(null);
      }
    };
    const onError = () => finish(null);
    const timeoutId = setTimeout(() => finish(null), 4000);

    v.addEventListener('seeked', onSeeked);
    v.addEventListener('error', onError);
    try {
      // Clamp to seekable range
      const dur = isFinite(v.duration) && v.duration > 0 ? v.duration : 0;
      v.currentTime = Math.max(0, dur > 0 ? Math.min(time, dur - 0.05) : time);
    } catch {
      finish(null);
    }
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.pendingResolve) {
      this.pendingResolve(null);
      this.pendingResolve = null;
    }
    try {
      this.video.pause();
      this.video.removeAttribute('src');
      this.video.load();
    } catch { /* ignore */ }
    if (this.video.parentNode) this.video.parentNode.removeChild(this.video);
    this.cache.clear();
  }
}

// One session at a time is enough – the user can only hover one player.
let activeSession: ScrubSession | null = null;

/** Open or replace the currently-active scrub session for a given video. */
export function openSession(videoId: string, url: string): void {
  if (activeSession && activeSession.videoId === videoId) return;
  releaseSession();
  activeSession = new ScrubSession(videoId, url);
}

/** Get a thumbnail at `time` (seconds) for the currently-active session. */
export async function getScrubThumb(videoId: string, time: number): Promise<string | null> {
  if (!activeSession || activeSession.videoId !== videoId) return null;
  return activeSession.get(time);
}

/** Tear down the current scrub session and free its hidden <video>. */
export function releaseSession(): void {
  if (activeSession) {
    activeSession.destroy();
    activeSession = null;
  }
}

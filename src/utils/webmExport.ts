/**
 * webmExport.ts — In-browser timeline export to WebM
 * ──────────────────────────────────────────────────
 *
 * Renders the Director-Mode timeline (clips + trim points) to a single
 * WebM file by *playing* each clip in real time and recording the canvas
 * compositor with MediaRecorder.
 *
 * Why play instead of seek-loop?
 *   The previous implementation seeked frame-by-frame, but
 *   `canvas.captureStream(fps)` writes the timeline at real-time speed
 *   regardless of how fast we feed it — that produced slow-motion / stuttering
 *   output. By actually *playing* the source clip and pushing every frame
 *   onto the canvas via `requestVideoFrameCallback`, we feed the encoder at
 *   exactly the same cadence the user would see during normal playback.
 *
 * Limitations:
 *   • Video-only (no audio) — graceful audio routing across clip boundaries
 *     is a follow-up.
 *   • Export takes roughly the timeline's real duration (real-time encode).
 */

export interface WebMClipDef {
  url: string;
  startTime: number;
  endTime: number;
}

export interface WebMExportOptions {
  width: number;
  height?: number;
  fps?: number;            // requested capture fps (advisory; real fps follows source)
  bitsPerSecond?: number;
  onProgress?: (pct: number) => void;
  cancelRef?: { current: boolean };
}

const DEFAULT_BITRATE = 5_000_000;

function pickMimeType(): string {
  const candidates = [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ];
  for (const m of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) return m;
  }
  return 'video/webm';
}

function loadHiddenVideo(url: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const v = document.createElement('video');
    v.muted = true;
    v.playsInline = true;
    v.preload = 'auto';
    v.style.display = 'none';
    document.body.appendChild(v);
    v.onloadedmetadata = () => resolve(v);
    v.onerror = () => { v.remove(); reject(new Error(`Failed to load ${url}`)); };
    v.src = url;
    v.load();
  });
}

function disposeHiddenVideo(v: HTMLVideoElement) {
  try { v.pause(); v.removeAttribute('src'); v.load(); } catch { /* ignore */ }
  if (v.parentNode) v.parentNode.removeChild(v);
}

function fitRect(srcW: number, srcH: number, dstW: number, dstH: number) {
  if (srcW <= 0 || srcH <= 0) return { dx: 0, dy: 0, dw: dstW, dh: dstH };
  const srcAspect = srcW / srcH;
  const dstAspect = dstW / dstH;
  if (srcAspect > dstAspect) {
    const dh = Math.round(dstW / srcAspect);
    return { dx: 0, dy: Math.round((dstH - dh) / 2), dw: dstW, dh };
  } else {
    const dw = Math.round(dstH * srcAspect);
    return { dx: Math.round((dstW - dw) / 2), dy: 0, dw, dh: dstH };
  }
}

// Type-narrow shim for requestVideoFrameCallback (not yet in lib.dom for all TS versions)
type RVFCVideo = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: (now: number, meta: unknown) => void) => number;
  cancelVideoFrameCallback?: (id: number) => void;
};

export async function exportClipsToWebM(
  clips: WebMClipDef[],
  options: WebMExportOptions,
): Promise<Blob> {
  if (!clips.length) throw new Error('No clips to export');
  if (typeof MediaRecorder === 'undefined') throw new Error('MediaRecorder not supported');

  const {
    width,
    fps = 30,
    bitsPerSecond = DEFAULT_BITRATE,
    onProgress,
    cancelRef,
  } = options;

  // ── Set up canvas + stream + recorder ──────────────────────────────────
  const canvas = document.createElement('canvas');
  canvas.width = width;
  // Height resolved after first clip metadata
  const ctx = canvas.getContext('2d', { alpha: false })!;
  if (!ctx) throw new Error('No 2D context');

  // ── Pre-load all clips ─────────────────────────────────────────────────
  type Loaded = WebMClipDef & { video: HTMLVideoElement; duration: number; end: number };
  const loaded: Loaded[] = [];
  for (const clip of clips) {
    const v = await loadHiddenVideo(clip.url);
    const dur = isFinite(v.duration) && v.duration > 0 ? v.duration : 0;
    const end = Math.min(clip.endTime > 0 ? clip.endTime : dur, dur);
    loaded.push({ ...clip, video: v, duration: dur, end });
  }

  // Pick output height from first clip (or option override)
  const firstAspect = loaded[0].video.videoHeight / Math.max(1, loaded[0].video.videoWidth);
  const height = options.height ?? Math.max(1, Math.round(width * (firstAspect || 9 / 16)));
  canvas.height = height;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, width, height);

  // captureStream WITHOUT a fixed fps argument: the stream emits whenever the
  // canvas is repainted, which gives us real-time pacing instead of fixed-rate
  // sampling. This is the key difference vs. the previous broken version.
  const stream = canvas.captureStream();
  const mime = pickMimeType();
  const recorder = new MediaRecorder(stream, {
    mimeType: mime,
    videoBitsPerSecond: bitsPerSecond,
  });

  const chunks: Blob[] = [];
  recorder.ondataavailable = (ev) => { if (ev.data && ev.data.size > 0) chunks.push(ev.data); };
  const stopped = new Promise<void>((resolve, reject) => {
    recorder.onstop = () => resolve();
    recorder.onerror = (e) => reject(e instanceof Event ? new Error('Recorder error') : e);
  });
  recorder.start(500);

  // Total planned playback duration for progress
  const totalDuration = loaded.reduce(
    (s, l) => s + Math.max(0, l.end - Math.max(0, l.startTime)),
    0,
  );
  let elapsed = 0;

  // Helper: play one clip from start→end, drawing each decoded frame onto
  // the canvas. Uses requestVideoFrameCallback when available (perfect frame
  // pacing); falls back to rAF with a manual draw cadence.
  function playClip(l: Loaded): Promise<void> {
    return new Promise<void>((resolve) => {
      const v = l.video as RVFCVideo;
      const fit = fitRect(v.videoWidth, v.videoHeight, width, height);
      const startSec = Math.max(0, l.startTime);
      const endSec = l.end;
      let rafId: number | null = null;
      let rvfcId: number | null = null;
      let stopped = false;
      let hardTimeout: ReturnType<typeof setTimeout> | null = null;
      const baseElapsed = elapsed; // capture before play so progress is monotonic

      const cleanup = () => {
        stopped = true;
        if (rafId !== null) cancelAnimationFrame(rafId);
        if (rvfcId !== null && v.cancelVideoFrameCallback) v.cancelVideoFrameCallback(rvfcId);
        if (hardTimeout !== null) { clearTimeout(hardTimeout); hardTimeout = null; }
        v.onended = null;
        v.removeEventListener('timeupdate', onTimeCheck);
        v.pause();
      };

      const finish = () => {
        if (stopped) return;
        cleanup();
        elapsed = baseElapsed + Math.max(0, endSec - startSec);
        onProgress?.(Math.min(99, Math.round((elapsed / totalDuration) * 100)));
        resolve();
      };

      const drawFrame = () => {
        if (stopped) return;
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, width, height);
        try { ctx.drawImage(v, fit.dx, fit.dy, fit.dw, fit.dh); } catch { /* video not ready */ }
      };

      // Progress + end-of-trim watchdog (timeupdate fires ~4×/s)
      const onTimeCheck = () => {
        if (stopped) return;
        if (cancelRef?.current) { finish(); return; }
        if (v.currentTime >= endSec - 0.01) { finish(); return; }
        const localProgress = v.currentTime - startSec;
        const totalProgress = baseElapsed + Math.max(0, localProgress);
        onProgress?.(Math.min(99, Math.round((totalProgress / totalDuration) * 100)));
      };

      // Frame pump
      if (typeof v.requestVideoFrameCallback === 'function') {
        const onVideoFrame = () => {
          if (stopped) return;
          drawFrame();
          if (v.currentTime >= endSec - 0.01) { finish(); return; }
          rvfcId = v.requestVideoFrameCallback!(onVideoFrame);
        };
        rvfcId = v.requestVideoFrameCallback(onVideoFrame);
      } else {
        // Fallback: rAF draws ~display fps; encoder picks up via captureStream
        const interval = 1000 / fps;
        let lastDraw = 0;
        const tick = (now: number) => {
          if (stopped) return;
          if (now - lastDraw >= interval) {
            drawFrame();
            lastDraw = now;
          }
          if (v.currentTime >= endSec - 0.01) { finish(); return; }
          rafId = requestAnimationFrame(tick);
        };
        rafId = requestAnimationFrame(tick);
      }

      v.addEventListener('timeupdate', onTimeCheck);
      v.onended = () => finish();

      // Hard timeout: if for some reason play never completes, cap at 1.5x duration.
      // Cleared by `cleanup()` so it doesn't fire after a normal `finish()` either.
      hardTimeout = setTimeout(finish, Math.max(5000, (endSec - startSec) * 1500));

      // Seek to clip start, then play
      const seekStart = () => {
        const startPlay = () => {
          v.play().catch(() => finish());
        };
        if (Math.abs(v.currentTime - startSec) < 0.05) {
          startPlay();
        } else {
          const onSeeked = () => {
            v.removeEventListener('seeked', onSeeked);
            startPlay();
          };
          v.addEventListener('seeked', onSeeked);
          v.currentTime = startSec;
        }
      };
      // Ensure we have decoded data
      if (v.readyState >= 2) seekStart();
      else v.addEventListener('canplay', seekStart, { once: true });
    });
  }

  try {
    for (const l of loaded) {
      if (cancelRef?.current) break;
      await playClip(l);
    }
    recorder.stop();
    await stopped;
    onProgress?.(100);
    const raw = new Blob(chunks, { type: mime });
    // MediaRecorder writes a WebM without a Segment > Info > Duration field,
    // so players show "Infinity:NaN:NaN" and seeking is broken. We patch the
    // header in-place to inject the real duration in milliseconds.
    const fixed = await fixWebMDuration(raw, totalDuration * 1000);
    return fixed;
  } finally {
    loaded.forEach(l => disposeHiddenVideo(l.video));
    stream.getTracks().forEach(t => t.stop());
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// fixWebMDuration — inject `<Duration>` into a Segment > Info element so
// players correctly report the file length and allow seeking.
// Based on the well-known pattern by yusitnikov/fix-webm-duration (MIT) but
// inlined and trimmed to only what we need to avoid an extra dependency.
// ─────────────────────────────────────────────────────────────────────────────
async function fixWebMDuration(blob: Blob, durationMs: number): Promise<Blob> {
  if (!isFinite(durationMs) || durationMs <= 0) return blob;
  try {
    const buf = await blob.arrayBuffer();
    const view = new DataView(buf);
    const out = patchWebM(view, durationMs);
    if (!out) return blob;
    return new Blob([out.buffer as ArrayBuffer], { type: blob.type });
  } catch {
    return blob;
  }
}

// EBML helpers ───────────────────────────────────────────────────────────────
function readVInt(view: DataView, offset: number): { value: number; size: number } | null {
  if (offset >= view.byteLength) return null;
  const first = view.getUint8(offset);
  if (first === 0) return null;
  // Find length: number of leading zero bits + 1
  let mask = 0x80;
  let size = 1;
  while (!(first & mask) && size <= 8) { mask >>= 1; size++; }
  if (size > 8) return null;
  let value = first & (mask - 1);
  for (let i = 1; i < size; i++) {
    if (offset + i >= view.byteLength) return null;
    value = value * 256 + view.getUint8(offset + i);
  }
  return { value, size };
}

function readEBMLId(view: DataView, offset: number): { id: number; size: number } | null {
  if (offset >= view.byteLength) return null;
  const first = view.getUint8(offset);
  if (first === 0) return null;
  let mask = 0x80;
  let size = 1;
  while (!(first & mask) && size <= 4) { mask >>= 1; size++; }
  if (size > 4) return null;
  let id = first;
  for (let i = 1; i < size; i++) {
    if (offset + i >= view.byteLength) return null;
    id = id * 256 + view.getUint8(offset + i);
  }
  return { id, size };
}

const SEGMENT_ID = 0x18538067;
const INFO_ID = 0x1549a966;
const DURATION_ID = 0x4489;

function patchWebM(view: DataView, durationMs: number): Uint8Array | null {
  // Find top-level Segment
  let off = 0;
  while (off < view.byteLength) {
    const idR = readEBMLId(view, off);
    if (!idR) return null;
    const sizeR = readVInt(view, off + idR.size);
    if (!sizeR) return null;
    if (idR.id === SEGMENT_ID) {
      // Walk children of Segment to find Info
      const segContentStart = off + idR.size + sizeR.size;
      let p = segContentStart;
      const segEnd = view.byteLength;
      while (p < segEnd) {
        const cid = readEBMLId(view, p);
        if (!cid) break;
        const cs = readVInt(view, p + cid.size);
        if (!cs) break;
        if (cid.id === INFO_ID) {
          // Build a new Info element with Duration appended
          const infoStart = p;
          const infoHeaderLen = cid.size + cs.size;
          const infoContent = new Uint8Array(view.buffer, p + infoHeaderLen, cs.value);

          // Strip any existing Duration from infoContent
          const stripped = stripDuration(infoContent);

          // Build Duration element bytes
          const durBytes = encodeDurationElement(durationMs);

          // New Info content = stripped + durBytes
          const newContentLen = stripped.length + durBytes.length;
          const newSizeBytes = encodeVIntKnownLen(newContentLen, cs.size); // keep same size width if possible
          const newInfoLen = cid.size + newSizeBytes.length + newContentLen;

          // Assemble final buffer
          const out = new Uint8Array(view.byteLength - (infoHeaderLen + cs.value) + newInfoLen);
          // Copy bytes before Info
          out.set(new Uint8Array(view.buffer, 0, infoStart), 0);
          // Write Info ID
          out.set(new Uint8Array(view.buffer, infoStart, cid.size), infoStart);
          // Write new size
          out.set(newSizeBytes, infoStart + cid.size);
          // Write stripped content + duration
          out.set(stripped, infoStart + cid.size + newSizeBytes.length);
          out.set(durBytes, infoStart + cid.size + newSizeBytes.length + stripped.length);
          // Copy bytes after old Info
          const afterInfoOffset = infoStart + infoHeaderLen + cs.value;
          out.set(
            new Uint8Array(view.buffer, afterInfoOffset, view.byteLength - afterInfoOffset),
            infoStart + newInfoLen,
          );
          return out;
        }
        p += cid.size + cs.size + cs.value;
      }
      return null;
    }
    off += idR.size + sizeR.size + sizeR.value;
  }
  return null;
}

function stripDuration(content: Uint8Array): Uint8Array {
  // Walk content, drop any element whose id == DURATION_ID
  const dv = new DataView(content.buffer, content.byteOffset, content.byteLength);
  const keep: { start: number; len: number }[] = [];
  let p = 0;
  while (p < dv.byteLength) {
    const idR = readEBMLId(dv, p);
    if (!idR) break;
    const sR = readVInt(dv, p + idR.size);
    if (!sR) break;
    const total = idR.size + sR.size + sR.value;
    if (idR.id !== DURATION_ID) keep.push({ start: p, len: total });
    p += total;
  }
  let outLen = 0;
  for (const k of keep) outLen += k.len;
  const out = new Uint8Array(outLen);
  let w = 0;
  for (const k of keep) {
    out.set(content.subarray(k.start, k.start + k.len), w);
    w += k.len;
  }
  return out;
}

function encodeDurationElement(durationMs: number): Uint8Array {
  // Duration is a Float (8 bytes). The element is: [0x44, 0x89] + size + 8 bytes float64
  const out = new Uint8Array(2 /*id*/ + 1 /*size*/ + 8 /*float*/);
  out[0] = 0x44;
  out[1] = 0x89;
  out[2] = 0x88; // VINT = 8 bytes (0x80 | 8)
  new DataView(out.buffer).setFloat64(3, durationMs, false);
  return out;
}

// Encode an integer as a VINT, padded to `targetLen` bytes if possible (so
// we don't change the parent header's size width).
function encodeVIntKnownLen(value: number, targetLen: number): Uint8Array {
  // Determine minimum size needed
  let minSize = 1;
  while ((value >= (1 << (7 * minSize)) - 1) && minSize < 8) minSize++;
  const size = Math.max(minSize, targetLen);
  const out = new Uint8Array(size);
  // Marker: 1 followed by (size-1) zeros, in the first byte
  // Then `value` packed into the remaining bits, big-endian
  // First byte high bit pattern: bit at position (8 - size)
  let v = value;
  for (let i = size - 1; i > 0; i--) {
    out[i] = v & 0xff;
    v = Math.floor(v / 256);
  }
  out[0] = (1 << (8 - size)) | (v & ((1 << (8 - size)) - 1));
  return out;
}

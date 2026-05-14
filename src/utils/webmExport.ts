/**
 * webmExport.ts — In-browser timeline export to WebM
 * ──────────────────────────────────────────────────
 *
 * Renders the Director-Mode timeline (clips + trim points) to a single
 * WebM file by *playing* each clip in real time and recording the canvas
 * compositor with MediaRecorder.
 *
 * Why play instead of seek-loop?
 *   `canvas.captureStream(fps)` writes the timeline at real-time speed
 *   regardless of how fast we feed it — seeking frame-by-frame produced
 *   slow-motion / stuttering output. By actually *playing* the source clip
 *   and pushing every frame onto the canvas via `requestVideoFrameCallback`,
 *   we feed the encoder at exactly the same cadence the user would see
 *   during normal playback.
 *
 * Hardening (vs. the previous version that hung / errored):
 *   • Pre-flight MediaRecorder mime check (don't construct with unsupported type)
 *   • captureStream(fps) — guarantees a steady frame supply even when the
 *     canvas isn't being repainted (e.g. during seek) so MediaRecorder
 *     doesn't stall waiting for data
 *   • A driver rAF loop runs continuously and keeps re-painting the canvas
 *     with the latest decoded video frame. This means we are no longer
 *     dependent on requestVideoFrameCallback firing for the encoder to get
 *     fresh frames — RVFC remains an *optimisation* for end-detection
 *   • `recorder.start()` (no timeslice) — emit one big chunk on stop, which
 *     avoids race conditions where an empty timeslice arrives before any
 *     frames are produced
 *   • All async waits have explicit timeouts, so the export can never hang
 *     indefinitely; it will always either finish, or throw
 *   • Cancel cooperation — checking `cancelRef.current` everywhere a long
 *     wait could happen
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
  fps?: number;            // capture fps for the canvas stream
  bitsPerSecond?: number;
  onProgress?: (pct: number) => void;
  cancelRef?: { current: boolean };
}

const DEFAULT_BITRATE = 5_000_000;

function pickMimeType(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  const candidates = [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ];
  for (const m of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(m)) return m;
    } catch { /* ignore */ }
  }
  return null;
}

function loadHiddenVideo(url: string, timeoutMs = 15000): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const v = document.createElement('video');
    v.muted = true;
    v.playsInline = true;
    v.preload = 'auto';
    v.crossOrigin = 'anonymous';
    v.style.cssText = 'position:absolute;left:-9999px;top:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;';
    document.body.appendChild(v);

    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      try { v.remove(); } catch { /* ignore */ }
      reject(new Error(`Timeout loading ${url}`));
    }, timeoutMs);

    const onMeta = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      v.removeEventListener('loadedmetadata', onMeta);
      v.removeEventListener('error', onErr);
      resolve(v);
    };
    const onErr = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      v.removeEventListener('loadedmetadata', onMeta);
      v.removeEventListener('error', onErr);
      try { v.remove(); } catch { /* ignore */ }
      reject(new Error(`Failed to load ${url}`));
    };

    v.addEventListener('loadedmetadata', onMeta);
    v.addEventListener('error', onErr);
    v.src = url;
    try { v.load(); } catch { /* ignore */ }
  });
}

function disposeHiddenVideo(v: HTMLVideoElement) {
  try { v.pause(); } catch { /* ignore */ }
  try { v.removeAttribute('src'); v.load(); } catch { /* ignore */ }
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

// Wait for either an event, a predicate-true tick, or a timeout. Always resolves.
function waitForReady(v: HTMLVideoElement, timeoutMs: number): Promise<void> {
  return new Promise<void>((resolve) => {
    if (v.readyState >= 2) { resolve(); return; }
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      v.removeEventListener('canplay', finish);
      v.removeEventListener('loadeddata', finish);
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(finish, timeoutMs);
    v.addEventListener('canplay', finish, { once: true });
    v.addEventListener('loadeddata', finish, { once: true });
  });
}

function seekTo(v: HTMLVideoElement, t: number, timeoutMs = 5000): Promise<void> {
  return new Promise<void>((resolve) => {
    if (Math.abs(v.currentTime - t) < 0.05) { resolve(); return; }
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      v.removeEventListener('seeked', finish);
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(finish, timeoutMs);
    v.addEventListener('seeked', finish, { once: true });
    try {
      v.currentTime = t;
    } catch {
      finish();
    }
  });
}

export async function exportClipsToWebM(
  clips: WebMClipDef[],
  options: WebMExportOptions,
): Promise<Blob> {
  if (!clips.length) throw new Error('No clips to export');

  const mime = pickMimeType();
  if (!mime) {
    throw new Error('WebM recording is not supported in this browser. Try Chrome or Edge.');
  }

  const {
    width,
    fps = 30,
    bitsPerSecond = DEFAULT_BITRATE,
    onProgress,
    cancelRef,
  } = options;

  // ── Set up canvas (height resolved after first clip metadata) ─────────
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(2, Math.round(width));
  canvas.height = 2; // placeholder; real height set below
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Could not get 2D canvas context');

  // ── Pre-load all clips ────────────────────────────────────────────────
  type Loaded = WebMClipDef & { video: HTMLVideoElement; duration: number; start: number; end: number };
  const loaded: Loaded[] = [];
  try {
    for (const clip of clips) {
      if (cancelRef?.current) throw new Error('Export cancelled');
      const v = await loadHiddenVideo(clip.url);
      const dur = isFinite(v.duration) && v.duration > 0 ? v.duration : 0;
      const start = Math.max(0, Math.min(clip.startTime || 0, dur));
      const rawEnd = clip.endTime > 0 ? clip.endTime : dur;
      const end = Math.max(start + 0.1, Math.min(rawEnd, dur || rawEnd));
      loaded.push({ ...clip, video: v, duration: dur, start, end });
    }
  } catch (e) {
    loaded.forEach(l => disposeHiddenVideo(l.video));
    throw e;
  }

  // Pick output height from first clip (or option override)
  const firstW = Math.max(1, loaded[0].video.videoWidth);
  const firstH = Math.max(1, loaded[0].video.videoHeight);
  const height = options.height
    ?? Math.max(2, Math.round((width * firstH) / firstW));
  canvas.width = Math.max(2, Math.round(width));
  canvas.height = Math.max(2, Math.round(height));
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // ── Set up MediaRecorder with a steady-rate canvas stream ─────────────
  // captureStream(fps) guarantees the encoder gets frames at this cadence
  // even during seek/decoding lulls; without it MediaRecorder can stall.
  const stream = canvas.captureStream(fps);
  let recorder: MediaRecorder;
  try {
    recorder = new MediaRecorder(stream, {
      mimeType: mime,
      videoBitsPerSecond: bitsPerSecond,
    });
  } catch (e) {
    stream.getTracks().forEach(t => t.stop());
    loaded.forEach(l => disposeHiddenVideo(l.video));
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`MediaRecorder init failed: ${msg}`, { cause: e });
  }

  const chunks: Blob[] = [];
  let recorderError: Error | null = null;
  recorder.ondataavailable = (ev) => {
    if (ev.data && ev.data.size > 0) chunks.push(ev.data);
  };
  recorder.onerror = (ev) => {
    // ev.error is non-standard; fall back to a generic message
    const errLike = ev as unknown as { error?: { message?: string } };
    recorderError = new Error(errLike.error?.message || 'MediaRecorder error');
  };
  const stopped = new Promise<void>((resolve) => {
    recorder.onstop = () => resolve();
  });

  // Total planned playback duration for progress
  const totalDuration = loaded.reduce(
    (s, l) => s + Math.max(0, l.end - l.start),
    0,
  );
  let elapsed = 0;

  // ── Start a continuous canvas-paint loop ──────────────────────────────
  // This is what feeds MediaRecorder. It's independent from the per-clip
  // playback loop, so the encoder always has fresh content even between
  // clips (seeking, transitions, etc.). The loop reads `currentVideo`,
  // which `playClip()` swaps in for each clip.
  let currentVideo: HTMLVideoElement | null = null;
  let currentFit: { dx: number; dy: number; dw: number; dh: number } = { dx: 0, dy: 0, dw: canvas.width, dh: canvas.height };
  let stopPainter = false;

  const paintLoop = () => {
    if (stopPainter) return;
    const v = currentVideo;
    if (v && v.readyState >= 2 && v.videoWidth > 0) {
      try {
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(v, currentFit.dx, currentFit.dy, currentFit.dw, currentFit.dh);
      } catch { /* video not ready for draw */ }
    }
    requestAnimationFrame(paintLoop);
  };
  requestAnimationFrame(paintLoop);

  // Helper: play one clip from start→end. Resolves when the clip's `end`
  // is reached, when the video naturally ends, or when a watchdog fires.
  function playClip(l: Loaded): Promise<void> {
    return new Promise<void>((resolve) => {
      const v = l.video as RVFCVideo;
      currentFit = fitRect(v.videoWidth, v.videoHeight, canvas.width, canvas.height);
      currentVideo = v;
      const startSec = l.start;
      const endSec = l.end;
      const baseElapsed = elapsed;
      const clipDur = Math.max(0.05, endSec - startSec);

      let finished = false;
      let rvfcId: number | null = null;
      let progressTimer: ReturnType<typeof setInterval> | null = null;
      let hardTimeout: ReturnType<typeof setTimeout> | null = null;

      const cleanup = () => {
        if (rvfcId !== null && v.cancelVideoFrameCallback) {
          try { v.cancelVideoFrameCallback(rvfcId); } catch { /* ignore */ }
          rvfcId = null;
        }
        if (progressTimer !== null) { clearInterval(progressTimer); progressTimer = null; }
        if (hardTimeout !== null) { clearTimeout(hardTimeout); hardTimeout = null; }
        v.onended = null;
        v.onpause = null;
        try { v.pause(); } catch { /* ignore */ }
      };

      const finish = () => {
        if (finished) return;
        finished = true;
        cleanup();
        elapsed = baseElapsed + clipDur;
        if (totalDuration > 0) {
          onProgress?.(Math.min(99, Math.round((elapsed / totalDuration) * 100)));
        }
        resolve();
      };

      // Progress + end-of-trim watchdog (independent of timeupdate which is
      // throttled and unreliable across browsers)
      progressTimer = setInterval(() => {
        if (finished) return;
        if (cancelRef?.current) { finish(); return; }
        if (v.ended) { finish(); return; }
        if (v.currentTime >= endSec - 0.02) { finish(); return; }
        const local = Math.max(0, v.currentTime - startSec);
        if (totalDuration > 0) {
          const totalProg = baseElapsed + Math.min(local, clipDur);
          onProgress?.(Math.min(99, Math.round((totalProg / totalDuration) * 100)));
        }
      }, 200);

      // RVFC hook (if available) gives us the most precise end-of-frame moment
      if (typeof v.requestVideoFrameCallback === 'function') {
        const onVideoFrame = () => {
          if (finished) return;
          if (v.currentTime >= endSec - 0.02) { finish(); return; }
          rvfcId = v.requestVideoFrameCallback!(onVideoFrame);
        };
        rvfcId = v.requestVideoFrameCallback(onVideoFrame);
      }

      v.onended = () => finish();

      // Hard timeout: cap at max(8s, 2× the clip's own real duration). If
      // playback genuinely takes longer than that, the file is broken or
      // playback stalled — better to bail than hang.
      hardTimeout = setTimeout(finish, Math.max(8000, clipDur * 2000));

      // Begin: ensure decoded data, seek to start, then play
      (async () => {
        try {
          await waitForReady(v, 8000);
          if (finished || cancelRef?.current) { finish(); return; }
          await seekTo(v, startSec, 5000);
          if (finished || cancelRef?.current) { finish(); return; }
          try {
            await v.play();
          } catch (err) {
            // play() rejected (autoplay policy, decode error, etc.) — bail
            console.warn('[webmExport] play() rejected', err);
            finish();
          }
        } catch {
          finish();
        }
      })();
    });
  }

  // ── Run the recording ─────────────────────────────────────────────────
  let exportError: Error | null = null;
  try {
    recorder.start(); // single chunk on stop — avoids empty-timeslice races

    for (const l of loaded) {
      if (cancelRef?.current) break;
      if (recorderError) { exportError = recorderError; break; }
      await playClip(l);
    }

    // Give the encoder a tiny moment to flush the last frames
    await new Promise(r => setTimeout(r, 150));

    if (recorder.state !== 'inactive') {
      try { recorder.stop(); } catch { /* ignore */ }
    }
    await Promise.race([
      stopped,
      new Promise<void>(r => setTimeout(r, 5000)), // never wait forever
    ]);

    if (recorderError && !exportError) exportError = recorderError;

    if (exportError) throw exportError;
    if (cancelRef?.current) throw new Error('Export cancelled');

    onProgress?.(100);

    if (chunks.length === 0) {
      throw new Error('No data captured — export produced an empty file.');
    }

    const raw = new Blob(chunks, { type: mime });
    // Patch missing Duration header so players can seek and show length
    const fixed = await fixWebMDuration(raw, totalDuration * 1000);
    return fixed;
  } finally {
    stopPainter = true;
    currentVideo = null;
    try {
      if (recorder.state !== 'inactive') recorder.stop();
    } catch { /* ignore */ }
    loaded.forEach(l => disposeHiddenVideo(l.video));
    stream.getTracks().forEach(t => { try { t.stop(); } catch { /* ignore */ } });
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

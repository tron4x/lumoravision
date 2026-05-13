/**
 * Frame-Diff WebWorker
 * ────────────────────
 * Pure CPU-bound pixel comparison runs off the main thread so scene
 * detection no longer blocks the UI. The main thread captures frames using
 * a hidden <video> element + canvas (the only way to seek arbitrary times
 * portably across all browsers/codecs), then transfers each frame's
 * ImageData.data buffer here for diffing against the previous frame.
 *
 * Messages:
 *   in:  { type: 'reset' }
 *        { type: 'diff', id: number, data: Uint8ClampedArray, w, h }
 *   out: { type: 'diff', id, value }
 *
 * The worker keeps the previous frame internally so we don't need to send
 * it twice. `reset` clears it (called at the start of a new analysis run).
 */

/// <reference lib="webworker" />

interface DiffIn {
  type: 'diff';
  id: number;
  buffer: ArrayBuffer;
  w: number;
  h: number;
}
interface ResetIn { type: 'reset' }
type In = DiffIn | ResetIn;

interface DiffOut { type: 'diff'; id: number; value: number }
type Out = DiffOut;

let prev: Uint8ClampedArray | null = null;

self.addEventListener('message', (ev: MessageEvent<In>) => {
  const msg = ev.data;
  if (msg.type === 'reset') {
    prev = null;
    return;
  }
  if (msg.type !== 'diff') return;

  const cur = new Uint8ClampedArray(msg.buffer);
  let value = 0;
  if (prev) {
    value = compare(prev, cur);
  }
  prev = cur;
  (self as unknown as Worker).postMessage({ type: 'diff', id: msg.id, value } as Out);
});

/**
 * Same algorithm as the previous main-thread implementation: stride-16 sampled
 * mean luminance difference. Kept identical to preserve detection results.
 */
function compare(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  const len = a.length;
  let diff = 0;
  for (let i = 0; i < len; i += 16) {
    const r1 = a[i],     g1 = a[i + 1], b1 = a[i + 2];
    const r2 = b[i],     g2 = b[i + 1], b2 = b[i + 2];
    diff += Math.abs(0.299 * (r1 - r2) + 0.587 * (g1 - g2) + 0.114 * (b1 - b2));
  }
  return diff / (len / 16);
}

/**
 * LUT (Look-Up Table) Loader
 * ──────────────────────────
 * Parses Adobe / Resolve `.cube` LUT files into a flat Uint8Array suitable
 * for upload to a WebGL `gl.TEXTURE_3D` (or a 2D atlas as fallback).
 *
 * The .cube spec we support is the common subset used by virtually every
 * grading app (DaVinci, Premiere, FCPX, Photoshop, Lightroom export):
 *
 *   TITLE "My Look"           # optional, ignored
 *   LUT_3D_SIZE 32            # the cube dimension N (so N^3 entries follow)
 *   DOMAIN_MIN 0 0 0          # optional, defaults 0 0 0
 *   DOMAIN_MAX 1 1 1          # optional, defaults 1 1 1
 *   <r> <g> <b>               # N*N*N float triplets, blue-fastest
 *
 * We deliberately ignore 1D LUTs (`LUT_1D_SIZE`) – they're rare in the
 * cinematic look ecosystem and bring more pain than value.
 */

export interface ParsedLUT {
  /** Cube dimension N (typically 17, 32 or 64) */
  size: number;
  /**
   * RGBA8 data laid out as N×N×N samples in B-fastest order:
   *   index = ((b * N + g) * N + r) * 4
   *   alpha is always 255
   *
   * We pre-convert floats → 8-bit so the shader doesn't need to allocate
   * a 32-bit float texture (which isn't universally supported on mobile
   * WebGL1).
   */
  data: Uint8Array;
  /** Original min domain (almost always [0,0,0]) – kept for completeness */
  domainMin: [number, number, number];
  domainMax: [number, number, number];
  title?: string;
}

export function parseCubeLUT(text: string): ParsedLUT {
  let size = 0;
  let title: string | undefined;
  const domainMin: [number, number, number] = [0, 0, 0];
  const domainMax: [number, number, number] = [1, 1, 1];
  const samples: number[] = [];

  // Process line-by-line. Comments start with '#'. We bail out with a clear
  // error if the file is malformed so the UI can show a real message instead
  // of the LUT silently doing nothing.
  const lines = text.split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;

    // Header tokens
    if (/^TITLE\s/i.test(line)) {
      const m = line.match(/^TITLE\s+(.+?)\s*$/i);
      if (m) title = m[1].replace(/^"(.*)"$/, '$1');
      continue;
    }
    if (/^LUT_3D_SIZE\s/i.test(line)) {
      const m = line.match(/^LUT_3D_SIZE\s+(\d+)/i);
      if (m) size = parseInt(m[1], 10);
      continue;
    }
    if (/^LUT_1D_SIZE\s/i.test(line)) {
      throw new Error('1D LUTs are not supported. Please supply a 3D .cube LUT.');
    }
    if (/^DOMAIN_MIN\s/i.test(line)) {
      const p = line.split(/\s+/).slice(1).map(parseFloat);
      if (p.length === 3 && p.every(n => isFinite(n))) {
        domainMin[0] = p[0]; domainMin[1] = p[1]; domainMin[2] = p[2];
      }
      continue;
    }
    if (/^DOMAIN_MAX\s/i.test(line)) {
      const p = line.split(/\s+/).slice(1).map(parseFloat);
      if (p.length === 3 && p.every(n => isFinite(n))) {
        domainMax[0] = p[0]; domainMax[1] = p[1]; domainMax[2] = p[2];
      }
      continue;
    }

    // Otherwise: numeric sample row "r g b"
    const nums = line.split(/\s+/).map(parseFloat);
    if (nums.length >= 3 && nums.slice(0, 3).every(n => isFinite(n))) {
      samples.push(nums[0], nums[1], nums[2]);
    }
  }

  if (size <= 1) throw new Error('LUT_3D_SIZE missing or invalid in .cube file');
  const expected = size * size * size * 3;
  if (samples.length < expected) {
    throw new Error(`LUT data incomplete: expected ${expected} values, got ${samples.length}`);
  }

  // Convert to RGBA8. Apply domain mapping if it's not the default [0..1].
  const dRangeR = (domainMax[0] - domainMin[0]) || 1;
  const dRangeG = (domainMax[1] - domainMin[1]) || 1;
  const dRangeB = (domainMax[2] - domainMin[2]) || 1;
  const data = new Uint8Array(size * size * size * 4);
  for (let i = 0; i < size * size * size; i++) {
    const r = samples[i * 3 + 0];
    const g = samples[i * 3 + 1];
    const b = samples[i * 3 + 2];
    // Normalise to [0..1] using the declared domain, then 8-bit clamp.
    const nr = Math.max(0, Math.min(1, (r - domainMin[0]) / dRangeR));
    const ng = Math.max(0, Math.min(1, (g - domainMin[1]) / dRangeG));
    const nb = Math.max(0, Math.min(1, (b - domainMin[2]) / dRangeB));
    data[i * 4 + 0] = Math.round(nr * 255);
    data[i * 4 + 1] = Math.round(ng * 255);
    data[i * 4 + 2] = Math.round(nb * 255);
    data[i * 4 + 3] = 255;
  }

  return { size, data, domainMin, domainMax, title };
}

/**
 * Re-arrange the 3D LUT into a 2D **atlas** texture for WebGL1 use, where
 * each Z-slice is laid out horizontally. Result is `(size*size) × size` RGBA.
 * The shader samples it by computing two adjacent Z slices and lerping.
 *
 * Shape:  width = size * size,  height = size
 *         atlas[(b * size + r), g] = lut[r, g, b]
 *
 * Note: WebGL2 supports gl.TEXTURE_3D natively, but for portability across
 * older browsers (and Safari without TexImage3D bugs) we use this atlas
 * approach. It's the same technique used by three.js's LUT effects.
 */
export function lutToAtlas2D(lut: ParsedLUT): { width: number; height: number; data: Uint8Array } {
  const N = lut.size;
  const width = N * N;
  const height = N;
  const out = new Uint8Array(width * height * 4);
  for (let b = 0; b < N; b++) {
    for (let g = 0; g < N; g++) {
      for (let r = 0; r < N; r++) {
        const srcIdx = ((b * N + g) * N + r) * 4;
        const tx = b * N + r;        // x in atlas
        const ty = g;                // y in atlas
        const dstIdx = (ty * width + tx) * 4;
        out[dstIdx + 0] = lut.data[srcIdx + 0];
        out[dstIdx + 1] = lut.data[srcIdx + 1];
        out[dstIdx + 2] = lut.data[srcIdx + 2];
        out[dstIdx + 3] = 255;
      }
    }
  }
  return { width, height, data: out };
}

/** Convenience: load a .cube file from a Blob/File. */
export async function loadCubeLUTFromFile(file: File | Blob): Promise<ParsedLUT> {
  const text = await file.text();
  return parseCubeLUT(text);
}

/** Convenience: load a .cube file from a URL. */
export async function loadCubeLUTFromUrl(url: string): Promise<ParsedLUT> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Failed to fetch LUT: ${resp.status}`);
  return parseCubeLUT(await resp.text());
}

/**
 * Built-in cinematic LUT presets
 * ──────────────────────────────
 * Generated procedurally at runtime so we don't ship megabytes of .cube
 * files. Each preset is a pure function (r,g,b) → (r',g',b') applied to a
 * 17³ identity grid – plenty of resolution for grading without bloating
 * memory (17³ × 4 = ~20 KB per preset).
 *
 * The maths are intentionally cheap: lifts/gains/curves implemented as
 * simple polynomial / Bézier-ish blends. No claim to colour-science
 * accuracy – the goal is **distinctive, immediately recognisable looks**
 * that would otherwise require Premiere or DaVinci to dial in.
 */

import type { ParsedLUT } from './lutLoader';

export interface LutPreset {
  id: string;
  name: string;
  description: string;
  /** Pure transform applied to each (r,g,b) ∈ [0,1] */
  transform: (r: number, g: number, b: number) => [number, number, number];
}

const clamp = (v: number) => v < 0 ? 0 : v > 1 ? 1 : v;
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const luminance = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;

export const LUT_PRESETS: LutPreset[] = [
  {
    id: 'identity',
    name: 'Original',
    description: 'No grading – passthrough',
    transform: (r, g, b) => [r, g, b],
  },
  {
    id: 'teal-orange',
    name: 'Teal & Orange',
    description: 'Hollywood blockbuster look – warm skin, cool shadows',
    transform: (r, g, b) => {
      // Push shadows toward teal, highlights toward orange.
      // We use luminance to decide where each pixel sits on the curve.
      const Y = luminance(r, g, b);
      // Shadow tint (teal): boost B/G, drop R
      const sR = r * 0.85;
      const sG = mix(g, g * 1.05 + 0.05, 0.6);
      const sB = mix(b, b * 1.15 + 0.08, 0.6);
      // Highlight tint (orange): boost R/G, drop B
      const hR = mix(r, r * 1.10 + 0.08, 0.7);
      const hG = mix(g, g * 1.05 + 0.04, 0.7);
      const hB = b * 0.80;
      return [
        clamp(mix(sR, hR, Y)),
        clamp(mix(sG, hG, Y)),
        clamp(mix(sB, hB, Y)),
      ];
    },
  },
  {
    id: 'kodak-2383',
    name: 'Kodak Film',
    description: 'Warm vintage 35mm film emulation – soft contrast, golden cast',
    transform: (r, g, b) => {
      // S-curve contrast + warm shift
      const curve = (v: number) => {
        // Soft toe + shoulder
        return clamp(v < 0.5 ? 2 * v * v : 1 - 2 * (1 - v) * (1 - v));
      };
      const cr = curve(r);
      const cg = curve(g);
      const cb = curve(b);
      // Warm shift: lift R/G, drop B
      return [
        clamp(cr * 1.05 + 0.02),
        clamp(cg * 1.02 + 0.01),
        clamp(cb * 0.92),
      ];
    },
  },
  {
    id: 'bleach-bypass',
    name: 'Bleach Bypass',
    description: 'Desaturated high-contrast war-film look (Saving Private Ryan)',
    transform: (r, g, b) => {
      const Y = luminance(r, g, b);
      // Mix 60 % luminance into each channel = desaturate
      const dR = mix(r, Y, 0.6);
      const dG = mix(g, Y, 0.6);
      const dB = mix(b, Y, 0.6);
      // Then crank contrast hard
      const contrast = (v: number) => clamp((v - 0.5) * 1.45 + 0.5);
      return [contrast(dR), contrast(dG), contrast(dB)];
    },
  },
  {
    id: 'noir-bw',
    name: 'Film Noir',
    description: 'High-contrast black & white with green tint in shadows',
    transform: (r, g, b) => {
      const Y = luminance(r, g, b);
      // Strong S-curve
      const c = clamp(Y < 0.5 ? 2 * Y * Y : 1 - 2 * (1 - Y) * (1 - Y));
      // Slight green shadow tint, slight cream highlight
      return [
        clamp(c * 0.97 + Y * 0.02),
        clamp(c * 1.00),
        clamp(c * 0.92 + Y * 0.05),
      ];
    },
  },
  {
    id: 'cyberpunk',
    name: 'Cyberpunk',
    description: 'Neon magenta + cyan – Blade Runner / Cyberpunk 2077 vibe',
    transform: (r, g, b) => {
      const Y = luminance(r, g, b);
      // Shadows → deep magenta, mids → desaturated, highs → cyan
      const sR = mix(r, r * 1.3 + 0.15, 0.7);
      const sG = g * 0.65;
      const sB = mix(b, b * 1.4 + 0.20, 0.7);
      const hR = r * 0.55;
      const hG = mix(g, g * 1.1 + 0.10, 0.6);
      const hB = mix(b, b * 1.25 + 0.15, 0.7);
      // Heavy contrast
      const contrast = (v: number) => clamp((v - 0.5) * 1.25 + 0.5);
      return [
        contrast(mix(sR, hR, Y)),
        contrast(mix(sG, hG, Y)),
        contrast(mix(sB, hB, Y)),
      ];
    },
  },
  {
    id: 'sun-drenched',
    name: 'Golden Hour',
    description: 'Warm sun-soaked summer afternoon – lifted blacks, golden tone',
    transform: (r, g, b) => {
      // Lift shadows so blacks are gentle
      const lift = 0.04;
      const lr = mix(r, 1, lift);
      const lg = mix(g, 1, lift * 0.8);
      const lb = mix(b, 1, lift * 0.5);
      // Warm highlights
      return [
        clamp(lr * 1.06 + 0.03),
        clamp(lg * 1.02 + 0.02),
        clamp(lb * 0.88 - 0.01),
      ];
    },
  },
  {
    id: 'matrix-green',
    name: 'Matrix',
    description: 'The famous green-tinted digital code aesthetic',
    transform: (r, g, b) => {
      const Y = luminance(r, g, b);
      // Push everything green, crush blacks
      const c = clamp(Y < 0.5 ? Y * Y * 2 : 1 - 2 * (1 - Y) * (1 - Y));
      return [
        clamp(c * 0.45 + r * 0.10),
        clamp(c * 1.10 + g * 0.05),
        clamp(c * 0.35 + b * 0.10),
      ];
    },
  },
];

/** Build a ParsedLUT by sampling a preset on an N×N×N identity grid. */
export function buildPresetLUT(preset: LutPreset, size: number = 17): ParsedLUT {
  const data = new Uint8Array(size * size * size * 4);
  const denom = size - 1;
  for (let bi = 0; bi < size; bi++) {
    for (let gi = 0; gi < size; gi++) {
      for (let ri = 0; ri < size; ri++) {
        const r = ri / denom;
        const g = gi / denom;
        const b = bi / denom;
        const [or, og, ob] = preset.transform(r, g, b);
        const idx = ((bi * size + gi) * size + ri) * 4;
        data[idx + 0] = Math.round(clamp(or) * 255);
        data[idx + 1] = Math.round(clamp(og) * 255);
        data[idx + 2] = Math.round(clamp(ob) * 255);
        data[idx + 3] = 255;
      }
    }
  }
  return {
    size,
    data,
    domainMin: [0, 0, 0],
    domainMax: [1, 1, 1],
    title: preset.name,
  };
}

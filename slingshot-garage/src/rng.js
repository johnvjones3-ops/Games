// Deterministic randomness: integer hashing, seeded PRNG and 1D noise.
// Everything here is pure so terrain is identical on every device for a given seed.

export function hash32(a, b = 0) {
  let h = (Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/** Uniform float in [0,1) for an integer lattice point. */
export function hash01(seed, i) {
  return hash32(seed, i) / 4294967296;
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const smooth = (t) => t * t * t * (t * (t * 6 - 15) + 10);

/** Gradient noise in roughly [-1,1]. */
export function noise1(x, seed) {
  const i = Math.floor(x);
  const f = x - i;
  const g0 = hash01(seed, i) * 2 - 1;
  const g1 = hash01(seed, i + 1) * 2 - 1;
  const v0 = g0 * f;
  const v1 = g1 * (f - 1);
  return (v0 + (v1 - v0) * smooth(f)) * 2;
}

/** Fractal noise, roughly [-1,1]. */
export function fbm(x, seed, octaves = 4, lacunarity = 2.03, gain = 0.5) {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let freq = 1;
  for (let o = 0; o < octaves; o++) {
    sum += noise1(x * freq, seed + o * 1013) * amp;
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / norm;
}

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

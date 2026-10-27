// Biomes are laid out by distance. Each one changes the look, the terrain shape
// and the physics (grip, gravity) so later regions play differently, not just look different.

export const BIOMES = [
  {
    id: 'meadow', dust: '#b08a5a', name: 'Green Meadows', start: 0,
    sky: ['#5fb7ff', '#cfeeff'], sun: { color: '#fff6c8', glow: 'rgba(255,240,180,0.35)', y: 0.18, size: 40 },
    far: '#9ccbe8', mid: '#6fb36b', near: '#4f9a4a',
    surface: '#6ccf4f', soil: '#8a5a33', deep: '#5b3a22',
    deco: 'trees', weather: null, stars: 0,
    grip: 1.0, gravity: 1.0, drag: 1.0,
    terrain: { amp: 1.15, rough: 0.9, ramps: 0.6, craters: 0, terrace: 0 },
  },
  {
    id: 'desert', dust: '#f3d9a0', name: 'Sunset Dunes', start: 700,
    sky: ['#ff9a5a', '#ffe0a3'], sun: { color: '#fff1c1', glow: 'rgba(255,190,120,0.45)', y: 0.32, size: 56 },
    far: '#e7a873', mid: '#d9935a', near: '#c77d43',
    surface: '#f2c879', soil: '#d9a557', deep: '#a8733a',
    deco: 'cacti', weather: 'dust', stars: 0,
    grip: 0.82, gravity: 1.0, drag: 1.0,
    terrain: { amp: 1.45, rough: 0.4, ramps: 0.5, craters: 0, terrace: 0 },
  },
  {
    id: 'canyon', dust: '#d98b62', name: 'Red Rock Canyon', start: 1800,
    sky: ['#e8735a', '#ffc9a0'], sun: { color: '#ffe3b0', glow: 'rgba(255,160,110,0.35)', y: 0.22, size: 44 },
    far: '#c46a4f', mid: '#a9503a', near: '#8d3e2c',
    surface: '#c9603e', soil: '#a2472c', deep: '#6e2e1d',
    deco: 'mesas', weather: null, stars: 0,
    grip: 1.05, gravity: 1.0, drag: 1.0,
    terrain: { amp: 1.5, rough: 0.9, ramps: 0.7, craters: 0, terrace: 0.4 },
  },
  {
    id: 'tundra', dust: '#ffffff', name: 'Frozen Peaks', start: 3500,
    sky: ['#7aa7d6', '#e8f4ff'], sun: { color: '#ffffff', glow: 'rgba(220,240,255,0.4)', y: 0.2, size: 34 },
    far: '#b9d2ea', mid: '#93b4d4', near: '#6f93b8',
    surface: '#f4fbff', soil: '#b6d3ea', deep: '#7c9fc0',
    deco: 'pines', weather: 'snow', stars: 0,
    grip: 0.58, gravity: 1.0, drag: 1.0,
    terrain: { amp: 1.9, rough: 0.7, ramps: 0.6, craters: 0, terrace: 0 },
  },
  {
    id: 'volcano', dust: '#5a4a48', name: 'Ember Wastes', start: 6000,
    sky: ['#2a0f12', '#a3341f'], sun: { color: '#ff7b3a', glow: 'rgba(255,90,40,0.45)', y: 0.3, size: 60 },
    far: '#4a1d1a', mid: '#341414', near: '#22100f',
    surface: '#3b2a28', soil: '#2a1b1a', deep: '#120a0a', lava: '#ff5a1f',
    deco: 'vents', weather: 'embers', stars: 0.2,
    grip: 0.95, gravity: 1.0, drag: 1.05,
    terrain: { amp: 1.8, rough: 1.0, ramps: 0.8, craters: 0.25, terrace: 0 },
  },
  {
    id: 'city', dust: '#8a8fa8', name: 'Neon Skyway', start: 9500,
    sky: ['#0b0630', '#3d1a6e'], sun: { color: '#ffe9ff', glow: 'rgba(255,120,255,0.25)', y: 0.16, size: 30, moon: true },
    far: '#22184a', mid: '#1a1238', near: '#120c28',
    surface: '#4a4f6b', soil: '#2b2e44', deep: '#17182a', neon: '#00f0ff',
    deco: 'towers', weather: null, stars: 0.6,
    grip: 1.15, gravity: 1.0, drag: 0.95,
    terrain: { amp: 1.4, rough: 0.2, ramps: 1.0, craters: 0, terrace: 0.2 },
  },
  {
    id: 'moon', dust: '#d8dae0', name: 'Lunar Highlands', start: 14000,
    sky: ['#000003', '#11131c'], sun: { color: '#ffffff', glow: 'rgba(255,255,255,0.15)', y: 0.14, size: 26, earth: true },
    far: '#3a3d47', mid: '#4b4e59', near: '#5e616c',
    surface: '#b9bcc4', soil: '#8b8e98', deep: '#5c5f69',
    deco: 'rocks', weather: null, stars: 1,
    grip: 0.75, gravity: 0.5, drag: 0.35,
    terrain: { amp: 1.7, rough: 0.6, ramps: 0.5, craters: 1, terrace: 0 },
  },
  {
    id: 'rift', dust: '#c9a8ff', name: 'Cosmic Rift', start: 24000,
    sky: ['#05001a', '#2b0a4f'], sun: { color: '#c8a0ff', glow: 'rgba(170,110,255,0.35)', y: 0.25, size: 48, ring: true },
    far: '#2a1052', mid: '#3a1670', near: '#4d1e8f',
    surface: '#9b6bff', soil: '#5a2fb0', deep: '#2a1260', neon: '#ff5cf0',
    deco: 'crystals', weather: 'sparkle', stars: 1,
    grip: 0.9, gravity: 0.42, drag: 0.3,
    terrain: { amp: 2.3, rough: 0.5, ramps: 0.9, craters: 0.4, terrace: 0 },
  },
];

export const BLEND = 160; // meters over which neighbouring biomes cross-fade

export function biomeIndexAt(d) {
  let idx = 0;
  for (let i = 0; i < BIOMES.length; i++) if (d >= BIOMES[i].start) idx = i;
  return idx;
}

/** Returns { a, b, t } where t blends biome a into biome b near a boundary. */
export function biomeBlendAt(d) {
  const i = biomeIndexAt(d);
  const next = BIOMES[i + 1];
  if (next && d > next.start - BLEND) {
    const t = (d - (next.start - BLEND)) / BLEND;
    return { a: BIOMES[i], b: next, t: Math.min(1, t) };
  }
  return { a: BIOMES[i], b: BIOMES[i], t: 0 };
}

export function blendNumber(d, key) {
  const { a, b, t } = biomeBlendAt(d);
  return a[key] + (b[key] - a[key]) * t;
}

export function blendTerrain(d, key) {
  const { a, b, t } = biomeBlendAt(d);
  return a.terrain[key] + (b.terrain[key] - a.terrain[key]) * t;
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const rgbCache = new Map();
function rgb(hex) {
  let v = rgbCache.get(hex);
  if (!v) { v = hexToRgb(hex); rgbCache.set(hex, v); }
  return v;
}

export function mixColor(h1, h2, t) {
  if (t <= 0 || h1 === h2) return h1;
  if (t >= 1) return h2;
  const a = rgb(h1);
  const b = rgb(h2);
  const r = Math.round(a[0] + (b[0] - a[0]) * t);
  const g = Math.round(a[1] + (b[1] - a[1]) * t);
  const bl = Math.round(a[2] + (b[2] - a[2]) * t);
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1);
}

export function blendColor(d, key, idx) {
  const { a, b, t } = biomeBlendAt(d);
  const ca = idx === undefined ? a[key] : a[key][idx];
  const cb = idx === undefined ? b[key] : b[key][idx];
  return mixColor(ca, cb, t);
}

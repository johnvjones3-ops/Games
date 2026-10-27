// Procedural terrain: a seeded height field sampled on a coarse grid and
// smoothed with Catmull-Rom splines, plus stateless "features" (ramps, craters)
// and pickups that are placed deterministically per slot so nothing has to be
// generated in order.

import { fbm, noise1, hash01, hash32, mulberry32, smoothstep } from './rng.js';
import { blendTerrain, biomeIndexAt } from './biomes.js';

export const SEG = 4;            // meters between control points
export const PAD_END = 10;       // flat launch pad ends here
export const WALL_X = -34;       // steep wall behind the slingshot
const RAMP_SLOT = 170;
const CRATER_SLOT = 95;
export const ITEM_SLOT = 60;

// Fuel can spacing bands: [first slot, slots per group]. ~300 m apart early, ~720 m late.
const FUEL_BANDS = [[0, 5], [17, 7], [52, 9], [115, 12]];

export function fuelGroupOf(k) {
  let index = 0;
  for (let b = 0; b < FUEL_BANDS.length; b++) {
    const [start, size] = FUEL_BANDS[b];
    const end = b + 1 < FUEL_BANDS.length ? FUEL_BANDS[b + 1][0] : Infinity;
    if (k < end) {
      const g = Math.floor((k - start) / size);
      return { index: index + g, start: start + g * size, size: Math.min(size, end - (start + g * size)) };
    }
    index += Math.ceil((end - start) / size);
  }
  return { index: 0, start: 0, size: 1 };
}

export class Terrain {
  constructor(seed = 1) {
    this.seed = seed >>> 0;
    this.points = new Map();
    this.slots = new Map();
  }

  /** Raw (unsmoothed) control height at grid index i. */
  point(i) {
    let y = this.points.get(i);
    if (y === undefined) {
      y = this.computePoint(i * SEG);
      this.points.set(i, y);
    }
    return y;
  }

  computePoint(x) {
    const s = this.seed;
    if (x <= WALL_X) return 4 + (WALL_X - x) * 1.6;
    if (x < -20) return smoothstep(-20, WALL_X, x) * 4;
    if (x <= PAD_END) return 0;

    // Launch drop: a slope down from the pad gives the first flight some hang time.
    const drop = -9 * smoothstep(PAD_END, 90, x);
    const intro = smoothstep(40, 160, x); // fade procedural terrain in

    const d = x;
    const ampT = blendTerrain(d, 'amp');
    const rough = blendTerrain(d, 'rough');
    const terrace = blendTerrain(d, 'terrace');
    const growth = 1 - Math.exp(-d / 2600);
    const amp = (6 + 15 * growth) * ampT;

    let y = fbm(d / 150, s, 3) * amp
      + fbm(d / 42, s + 7, 3) * amp * 0.32 * rough
      + noise1(d / 9, s + 13) * (0.25 + 0.6 * growth) * rough;

    if (terrace > 0) {
      // Mesa steps: flatten the height into plateaus joined by short steep faces.
      const step = 5 + 4 * growth;
      const k = y / step - Math.floor(y / step);
      const tq = Math.floor(y / step) * step + step * smoothstep(0.2, 0.8, k);
      y += (tq - y) * terrace;
    }

    y += this.rampAt(d) + this.craterAt(d);
    return drop + y * intro;
  }

  rampAt(x) {
    const k = Math.floor(x / RAMP_SLOT);
    if (k < 1) return 0;
    const s = this.seed + 101;
    const chance = 0.42 * blendTerrain(k * RAMP_SLOT, 'ramps');
    if (hash01(s, k) > chance) return 0;
    const len = 16 + hash01(s + 1, k) * 22;
    const off = 20 + hash01(s + 2, k) * (RAMP_SLOT - len - 40);
    const x0 = k * RAMP_SLOT + off;
    const u = (x - x0) / len;
    if (u < 0 || u > 1.12) return 0;
    const growth = Math.min(1, k * RAMP_SLOT / 6000);
    const h = (2.6 + hash01(s + 3, k) * 4) * (1 + growth * 1.2);
    if (u <= 1) return h * Math.pow(u, 1.7);
    return h * (1 - (u - 1) / 0.12);
  }

  craterAt(x) {
    const k = Math.floor(x / CRATER_SLOT);
    if (k < 2) return 0;
    const amount = blendTerrain(k * CRATER_SLOT, 'craters');
    if (amount <= 0) return 0;
    const s = this.seed + 211;
    if (hash01(s, k) > 0.65 * amount) return 0;
    const R = 9 + hash01(s + 1, k) * 16;
    const cx = k * CRATER_SLOT + R + 4 + hash01(s + 2, k) * (CRATER_SLOT - 2 * R - 8);
    const r = Math.abs(x - cx);
    const depth = R * 0.28;
    let v = 0;
    if (r < R) v -= depth * (1 - (r / R) * (r / R));
    v += depth * 0.4 * Math.exp(-(((r - R) / (0.22 * R)) ** 2));
    return v;
  }

  height(x) {
    const f = x / SEG;
    const i = Math.floor(f);
    const t = f - i;
    const p0 = this.point(i - 1), p1 = this.point(i), p2 = this.point(i + 1), p3 = this.point(i + 2);
    return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
  }

  slope(x) {
    const f = x / SEG;
    const i = Math.floor(f);
    const t = f - i;
    const p0 = this.point(i - 1), p1 = this.point(i), p2 = this.point(i + 1), p3 = this.point(i + 2);
    const dydt = 0.5 * ((-p0 + p2) + 2 * (2 * p0 - 5 * p1 + 4 * p2 - p3) * t + 3 * (-p0 + 3 * p1 - 3 * p2 + p3) * t * t);
    return dydt / SEG;
  }

  /** Unit normal of the ground at x (pointing up / out of the ground). */
  normal(x) {
    const s = this.slope(x);
    const inv = 1 / Math.sqrt(1 + s * s);
    return { x: -s * inv, y: inv };
  }

  /** Approximate signed distance from a point to the ground surface (positive = above). */
  signedDistance(px, py) {
    const s = this.slope(px);
    return (py - this.height(px)) / Math.sqrt(1 + s * s);
  }

  /** Deterministic pickups/obstacles for an item slot. Cached. */
  slot(k) {
    let items = this.slots.get(k);
    if (items) return items;
    items = this.generateSlot(k);
    this.slots.set(k, items);
    return items;
  }

  generateSlot(k) {
    const items = [];
    if (k < 1) return items;
    const s = this.seed + 409;
    const rnd = mulberry32(hash32(s, k));
    const x0 = k * ITEM_SLOT;
    const dist = x0;
    const coinValue = dist < 1000 ? 1 : dist < 3000 ? 2 : dist < 7000 ? 5 : dist < 13000 ? 10 : 20;
    let n = 0;
    const id = () => k * 64 + n++;
    const ground = (x, lift) => this.height(x) + lift;

    // Fuel: exactly one can per group of slots at a seeded slot; groups widen with distance.
    const fg = fuelGroupOf(k);
    if (k === fg.start + (hash32(s + 1, fg.index) % fg.size) && k >= 2) {
      const fx = x0 + 10 + rnd() * 40;
      items.push({ id: id(), type: 'fuel', x: fx, y: ground(fx, 1.3) });
    }
    // Nitro: one per group of 8 slots (~480 m).
    const nitroGroup = Math.floor(k / 8);
    if (k === nitroGroup * 8 + (hash32(s + 2, nitroGroup) % 8) && k >= 3) {
      const nx = x0 + 10 + rnd() * 40;
      items.push({ id: id(), type: 'nitro', x: nx, y: ground(nx, 1.3 + rnd() * 5) });
    }

    // Coins
    const roll = rnd();
    if (roll < 0.34) {
      const count = 6 + Math.floor(rnd() * 5);
      const start = x0 + 4 + rnd() * 20;
      for (let j = 0; j < count; j++) {
        const cx = start + j * 2.3;
        items.push({ id: id(), type: 'coin', x: cx, y: ground(cx, 1.2), value: coinValue });
      }
    } else if (roll < 0.62) {
      const count = 7 + Math.floor(rnd() * 5);
      const start = x0 + 4 + rnd() * 16;
      const peak = 5 + rnd() * 7;
      for (let j = 0; j < count; j++) {
        const u = j / (count - 1);
        const cx = start + j * 3;
        items.push({ id: id(), type: 'coin', x: cx, y: ground(cx, 1.4) + Math.sin(u * Math.PI) * peak, value: coinValue });
      }
    } else if (roll < 0.8 && dist > 250) {
      // Sky trail: rewards long flights and gliding builds.
      const count = 8;
      const start = x0 + 6 + rnd() * 14;
      const alt = 14 + rnd() * 26 + Math.min(40, dist / 400);
      const base = ground(start, 0);
      for (let j = 0; j < count; j++) {
        const cx = start + j * 3.2;
        items.push({ id: id(), type: 'coin', x: cx, y: Math.max(base, ground(cx, 0)) + alt + Math.sin(j * 0.9) * 1.5, value: coinValue * 2 });
      }
    }

    if (rnd() < 0.05 && dist > 400) {
      const sx = x0 + rnd() * 50;
      items.push({ id: id(), type: 'star', x: sx, y: ground(sx, 8 + rnd() * 25), value: coinValue * 25 });
    }

    if (rnd() < 0.28) {
      const cx = x0 + 20 + rnd() * 30;
      const stack = 1 + Math.floor(rnd() * (dist > 1500 ? 3 : 2));
      for (let j = 0; j < stack; j++) {
        const gx = cx + j * 1.25;
        items.push({ id: id(), type: 'crate', x: gx, y: ground(gx, 0.55), value: coinValue * 3 });
      }
    }

    if (rnd() < 0.11 && dist > 150) {
      const px = x0 + 15 + rnd() * 30;
      items.push({ id: id(), type: 'pad', x: px, y: ground(px, 0.05) });
    }
    return items;
  }

  /** Items whose x lies in [x0, x1]. */
  itemsInRange(x0, x1) {
    const out = [];
    const k0 = Math.floor(x0 / ITEM_SLOT) - 1;
    const k1 = Math.floor(x1 / ITEM_SLOT) + 1;
    for (let k = Math.max(1, k0); k <= k1; k++) {
      for (const it of this.slot(k)) if (it.x >= x0 && it.x <= x1) out.push(it);
    }
    return out;
  }

  biomeIndex(x) {
    return biomeIndexAt(Math.max(0, x));
  }
}

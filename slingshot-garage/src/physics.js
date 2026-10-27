// 2D vehicle physics: one rigid chassis, two ray-cast suspension wheels and a
// convex hull that collides with the terrain height field using impulses.
// Units are meters, seconds and "unit mass" (forces are accelerations).

import { clamp } from './rng.js';
import { blendNumber } from './biomes.js';

export const BASE_GRAVITY = 12;

export const CHASSIS = {
  mass: 1,
  inertia: 1.55,
  anchors: [{ x: -1.3, y: -0.28 }, { x: 1.35, y: -0.28 }],
  // Collision hull in local space (x forward, y up). `roof` points hurt more.
  hull: [
    { x: -2.0, y: -0.36 }, { x: 2.0, y: -0.36 },
    { x: 2.1, y: 0.05 }, { x: 1.0, y: 0.67, roof: true },
    { x: 0, y: 0.8, roof: true }, { x: -1.0, y: 0.67, roof: true },
    { x: -2.1, y: 0.1 },
  ],
};

const TAU = Math.PI * 2;
export const wrapAngle = (a) => {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
};

export class Car {
  constructor(stats) {
    this.stats = stats;
    this.x = 0; this.y = 2; this.a = 0;
    this.vx = 0; this.vy = 0; this.w = 0;
    this.wheels = CHASSIS.anchors.map((anchor) => ({
      anchor, L: stats.suspTravel, contact: false, bottomed: false,
      spin: 0, omega: 0, cx: 0, cy: 0, slip: false, load: 0, nx: 0, ny: 1,
    }));
    this.hullContact = false;
    this.roofContact = false;
    this.events = [];
    this.boosting = false;
    this.lift = 0;
  }

  get speed() { return Math.hypot(this.vx, this.vy); }
  get grounded() { return this.wheels[0].contact || this.wheels[1].contact; }
  get wheelsDown() { return (this.wheels[0].contact ? 1 : 0) + (this.wheels[1].contact ? 1 : 0); }

  toWorld(lx, ly) {
    const c = Math.cos(this.a), s = Math.sin(this.a);
    return { x: this.x + lx * c - ly * s, y: this.y + lx * s + ly * c };
  }

  wheelCenter(wh) {
    const A = this.toWorld(wh.anchor.x, wh.anchor.y);
    return { x: A.x + Math.sin(this.a) * wh.L, y: A.y - Math.cos(this.a) * wh.L };
  }

  /**
   * Advance one fixed step.
   * ctrl: { throttle 0..1, brake 0..1, boost bool, assist bool, nitro (seconds left) }
   * Returns nitro consumed this step.
   */
  step(dt, ctrl, terrain) {
    const st = this.stats;
    const xd = Math.max(0, this.x);
    const g = BASE_GRAVITY * blendNumber(xd, 'gravity');
    const grip = st.grip * blendNumber(xd, 'grip');
    const dragMul = blendNumber(xd, 'drag');
    const c = Math.cos(this.a), s = Math.sin(this.a);
    const dx = s, dy = -c; // suspension axis (chassis down)

    let fx = 0, fy = -g * CHASSIS.mass, tq = 0;
    const r = st.wheelRadius;
    const Lmax = st.suspTravel;

    for (const wh of this.wheels) {
      const ax = this.x + wh.anchor.x * c - wh.anchor.y * s;
      const ay = this.y + wh.anchor.x * s + wh.anchor.y * c;
      const rax = ax - this.x, ray = ay - this.y;
      const vax = this.vx - this.w * ray, vay = this.vy + this.w * rax;

      const gap = (L) => terrain.signedDistance(ax + dx * L, ay + dy * L) - r;
      wh.contact = false; wh.bottomed = false; wh.slip = false; wh.load = 0;
      let L = Lmax;
      if (gap(Lmax) <= 0) {
        wh.contact = true;
        if (gap(0) <= 0) {
          L = 0; wh.bottomed = true;
        } else {
          let lo = 0, hi = Lmax;
          for (let k = 0; k < 10; k++) {
            const mid = (lo + hi) * 0.5;
            if (gap(mid) > 0) lo = mid; else hi = mid;
          }
          L = (lo + hi) * 0.5;
        }
      }

      if (!wh.contact) {
        // Wheel hangs at full extension; ease the visual length toward it.
        wh.L += (Lmax - wh.L) * Math.min(1, dt * 14);
        wh.omega += (ctrl.throttle - ctrl.brake) * 40 * dt;
        wh.omega *= 1 - dt * 0.6;
        wh.spin += wh.omega * dt;
        continue;
      }
      wh.L = L;

      const wcx = ax + dx * L, wcy = ay + dy * L;
      const n = terrain.normal(wcx);
      wh.nx = n.x; wh.ny = n.y;
      const tx = n.y, ty = -n.x;
      const comp = Lmax - L;
      const compRate = vax * dx + vay * dy;
      let Fs = st.suspK * comp + st.suspC * compRate;
      if (comp > Lmax * 0.8) Fs += st.suspK * 4 * (comp - Lmax * 0.8);
      Fs = Math.max(0, Fs);
      const sfx = -dx * Fs, sfy = -dy * Fs;
      fx += sfx; fy += sfy;
      tq += rax * sfy - ray * sfx;

      const N = Fs * clamp(-(n.x * dx + n.y * dy), 0.25, 1);
      wh.load = N;
      const vt = vax * tx + vay * ty;
      let Ft = 0;
      if (ctrl.throttle > 0) {
        const curve = vt < 0 ? 1 : Math.max(0, 1 - vt / st.topSpeed);
        Ft += ctrl.throttle * st.engineForce * 0.5 * curve;
      }
      if (ctrl.brake > 0) {
        if (vt > 0.4) Ft -= ctrl.brake * st.brakeForce * 0.5;
        else Ft -= ctrl.brake * st.engineForce * 0.18 * Math.max(0, 1 + vt / 5);
      }
      Ft -= st.rollResist * N * Math.tanh(vt * 2);
      const maxT = grip * N;
      if (Math.abs(Ft) > maxT) {
        wh.slip = ctrl.throttle > 0 || ctrl.brake > 0;
        Ft = Math.sign(Ft) * maxT;
      }
      const pcx = wcx - n.x * r, pcy = wcy - n.y * r;
      const tfx = tx * Ft, tfy = ty * Ft;
      fx += tfx; fy += tfy;
      // Traction acts at the contact patch; scale the pitch it causes (anti-squat geometry).
      tq += ((pcx - this.x) * tfy - (pcy - this.y) * tfx) * 0.45;

      const roll = vt / r;
      wh.omega = wh.slip ? roll + Math.sign(Ft || 1) * 12 : roll;
      wh.spin += wh.omega * dt;
      wh.cx = pcx; wh.cy = pcy;
    }

    const grounded = this.grounded;
    const speed = this.speed;

    // Aerodynamic drag
    if (speed > 0.01) {
      const k = (st.dragK * speed + 0.008) * dragMul;
      fx -= this.vx * k; fy -= this.vy * k;
    }

    // Glider wings: lift perpendicular to velocity, scaled by angle of attack.
    this.lift = 0;
    if (!grounded && st.wingLift > 0 && speed > 8) {
      const ux = this.vx / speed, uy = this.vy / speed;
      const along = c * ux + s * uy;
      if (along > 0.2) {
        const aoa = Math.atan2(ux * s - uy * c, along);
        const factor = clamp(0.45 + aoa * 2.2, 0, 1.3);
        let L = st.wingLift * speed * speed * factor;
        L = Math.min(L, g * 0.88);
        this.lift = L / g;
        fx += -uy * L - ux * L * 0.1;
        fy += ux * L - uy * L * 0.1;
        tq -= aoa * st.wingStability; // weather-vane into the airflow
      }
    }

    // Rocket booster
    let nitroUsed = 0;
    this.boosting = false;
    if (ctrl.boost && st.boostThrust > 0 && ctrl.nitro > 0) {
      fx += c * st.boostThrust; fy += s * st.boostThrust;
      nitroUsed = dt;
      this.boosting = true;
    }

    // Air control: target an angular velocity instead of raw torque so input is smooth.
    if (!grounded) {
      const input = ctrl.lean ?? ctrl.throttle - ctrl.brake;
      if (input !== 0) {
        const target = input * st.airSpin;
        this.w += clamp(target - this.w, -st.airAccel * dt, st.airAccel * dt);
      } else {
        this.w *= Math.exp(-0.5 * dt);
        if (ctrl.assist) {
          // Landing assist: when the ground is close, rotate toward its slope.
          const h = this.y - terrain.height(this.x);
          if (h < 6 + Math.max(0, -this.vy) * 0.5) {
            const target = Math.atan(terrain.slope(this.x + this.vx * 0.15));
            const diff = wrapAngle(target - this.a);
            const want = clamp(diff * 5, -st.airSpin, st.airSpin);
            this.w += clamp(want - this.w, -st.airAccel * 0.6 * dt, st.airAccel * 0.6 * dt);
          }
        }
      }
    }

    // Integrate (semi-implicit Euler)
    this.vx += (fx / CHASSIS.mass) * dt;
    this.vy += (fy / CHASSIS.mass) * dt;
    this.w += (tq / CHASSIS.inertia) * dt;
    this.w = clamp(this.w, -14, 14);
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.a += this.w * dt;

    this.resolveHull(terrain, grip);
    return nitroUsed;
  }

  resolveHull(terrain, grip) {
    this.hullContact = false;
    this.roofContact = false;
    const st = this.stats;
    const contacts = [];
    const c = Math.cos(this.a), s = Math.sin(this.a);
    for (const p of CHASSIS.hull) {
      contacts.push({ x: this.x + p.x * c - p.y * s, y: this.y + p.x * s + p.y * c, roof: !!p.roof, rad: 0, wheel: false });
    }
    // A fully compressed wheel behaves like a rigid bump stop.
    for (const wh of this.wheels) {
      contacts.push({ x: this.x + wh.anchor.x * c - wh.anchor.y * s, y: this.y + wh.anchor.x * s + wh.anchor.y * c, roof: false, rad: st.wheelRadius * 0.92, wheel: true });
    }

    for (const p of contacts) {
      const sd = terrain.signedDistance(p.x, p.y) - p.rad;
      if (sd >= 0) continue;
      const n = terrain.normal(p.x);
      // Positional correction
      this.x -= n.x * sd; this.y -= n.y * sd;
      const px = p.x - n.x * p.rad, py = p.y - n.y * p.rad;
      const rx = px - this.x, ry = py - this.y;
      const vpx = this.vx - this.w * ry, vpy = this.vy + this.w * rx;
      const vn = vpx * n.x + vpy * n.y;
      if (p.wheel) { /* suspension already absorbs part of the hit */ } else this.hullContact = true;
      if (p.roof) this.roofContact = true;
      if (vn >= 0) continue;
      const rn = rx * n.y - ry * n.x;
      const e = p.wheel ? 0.05 : 0.18;
      const jn = -(1 + e) * vn / (1 / CHASSIS.mass + (rn * rn) / CHASSIS.inertia);
      this.vx += n.x * jn; this.vy += n.y * jn; this.w += (rn * jn) / CHASSIS.inertia;

      const tx = n.y, ty = -n.x;
      const vpx2 = this.vx - this.w * ry, vpy2 = this.vy + this.w * rx;
      const vt = vpx2 * tx + vpy2 * ty;
      const rt = rx * ty - ry * tx;
      let jt = -vt / (1 / CHASSIS.mass + (rt * rt) / CHASSIS.inertia);
      const mu = p.wheel ? 0.15 : 0.55 * Math.min(1, grip);
      jt = clamp(jt, -mu * jn, mu * jn);
      this.vx += tx * jt; this.vy += ty * jt; this.w += (rt * jt) / CHASSIS.inertia;

      const impact = -vn * (p.wheel ? st.suspAbsorb : 1);
      if (impact > 2) this.events.push({ type: 'impact', speed: impact, roof: p.roof, wheel: p.wheel, x: px, y: py, scrape: Math.abs(vt) });
    }
  }
}

/** Ballistic preview for the launch arc (no terrain response, just drag + gravity). */
export function previewArc(x, y, vx, vy, stats, terrain, steps = 70, dt = 0.05) {
  const pts = [];
  for (let i = 0; i < steps; i++) {
    const sp = Math.hypot(vx, vy);
    const k = stats.dragK * sp + 0.008;
    vx -= vx * k * dt;
    vy -= (BASE_GRAVITY + vy * k) * dt;
    x += vx * dt; y += vy * dt;
    pts.push({ x, y });
    if (y < terrain.height(x)) break;
  }
  return pts;
}

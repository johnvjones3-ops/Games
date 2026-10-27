// A single launch-to-stop run: physics stepping, resources (fuel, rocket fuel,
// hit points), pickups, stunts, and the end-of-run summary. No DOM here so the
// balance simulator can drive it with an autopilot.

import { Car, wrapAngle } from './physics.js';
import { biomeIndexAt, BIOMES } from './biomes.js';
import { clamp } from './rng.js';

export const STEP = 1 / 240;
export const SLING = { x: 0, y: 2.6, minY: 1.55, maxPull: 4.2 };
const TAU = Math.PI * 2;

export function tierValue(d) {
  return d < 1000 ? 1 : d < 3000 ? 2 : d < 7000 ? 5 : d < 13000 ? 10 : 20;
}

/** Fuel cans top up a flat amount so a bigger tank matters mostly at the start. */
export const fuelRefill = (stats) => 4 + stats.fuelCap * 0.12;

export class Run {
  constructor({ terrain, stats, best = 0, assist = true }) {
    this.terrain = terrain;
    this.stats = stats;
    this.best = best;
    this.assist = assist;
    this.car = new Car(stats);
    this.state = 'aim';
    this.fuel = stats.fuelCap;
    this.nitro = stats.boostThrust > 0 ? stats.nitroCap : 0;
    this.hp = stats.maxHP;
    this.time = 0;
    this.acc = 0;
    this.maxX = 0;
    this.lastProgressTime = 0;
    this.lastProgressX = 0;
    this.stillTime = 0;
    this.flippedTime = 0;
    this.endTimer = 0;
    this.reason = '';
    this.collected = new Set();
    this.fx = [];
    this.stats_ = {
      flips: 0, backflips: 0, frontflips: 0, perfect: 0, maxAir: 0, totalAir: 0,
      maxSpeed: 0, maxAlt: 0, crates: 0, coinsPicked: 0, pickCoins: 0, stuntCoins: 0,
      fuelCans: 0, boostTime: 0, damageTaken: 0, maxFlipCombo: 0,
    };
    this.air = { active: false, time: 0, rot: 0, peak: 0 };
    this.biome = 0;
    this.recordAnnounced = best <= 0;
    this.nextMilestone = 1000;
    this.wasFlying = true;
    this.leanBlock = { gas: false, brake: false };
    this.placeInSling(0, 0);
  }

  placeInSling(pullX, pullY) {
    const car = this.car;
    car.x = SLING.x + pullX;
    // The pouch can't drag the car through the launch pad; extra downward pull still steepens the aim.
    car.y = SLING.y + Math.max(pullY, SLING.minY - SLING.y);
    car.a = Math.atan2(-pullY, -pullX || -1) * 0.35;
    car.vx = car.vy = car.w = 0;
  }

  /** pull: vector from the pouch to the pointer (meters). */
  aim(pullX, pullY) {
    const len = Math.hypot(pullX, pullY);
    const max = SLING.maxPull;
    if (len > max) { pullX *= max / len; pullY *= max / len; }
    // Only allow launching forward and upward-ish.
    let ang = Math.atan2(-pullY, -pullX);
    ang = clamp(ang, -0.1, 1.45);
    const l = Math.min(len, max);
    pullX = -Math.cos(ang) * l; pullY = -Math.sin(ang) * l;
    this.pull = { x: pullX, y: pullY, power: l / max, angle: ang };
    this.placeInSling(pullX, pullY);
    return this.pull;
  }

  launchVelocity(pull = this.pull) {
    if (!pull) return { vx: 0, vy: 0 };
    const v = this.stats.launchSpeed * pull.power;
    return { vx: Math.cos(pull.angle) * v, vy: Math.sin(pull.angle) * v };
  }

  launch() {
    if (this.state !== 'aim' || !this.pull || this.pull.power < 0.12) return false;
    const { vx, vy } = this.launchVelocity();
    const car = this.car;
    car.vx = vx; car.vy = vy;
    car.a = this.pull.angle * 0.5;
    car.w = 0.15;
    this.state = 'run';
    this.lastProgressTime = 0;
    this.air = { active: true, time: 0, rot: 0, peak: car.y, launch: true };
    this.fx.push({ type: 'launch', power: this.pull.power });
    return true;
  }

  get distance() { return Math.max(0, this.maxX); }

  update(dt, input) {
    if (this.state === 'aim' || this.state === 'ended') return;
    this.acc += Math.min(dt, 0.1);
    while (this.acc >= STEP) {
      this.acc -= STEP;
      this.tick(STEP, input);
      if (this.state === 'ended') break;
    }
  }

  tick(dt, input) {
    const car = this.car;
    const st = this.stats;
    this.time += dt;
    const dead = this.state === 'wrecked';
    const throttle = !dead && this.fuel > 0 ? input.throttle : 0;
    // Buttons already held when the car leaves the ground don't tilt it until
    // they are pressed again, so driving over a crest at full gas doesn't flip you.
    const flying = !car.grounded && !car.hullContact;
    if (flying && !this.wasFlying) { this.leanBlock.gas = input.throttle > 0; this.leanBlock.brake = input.brake > 0; }
    if (!input.throttle) this.leanBlock.gas = false;
    if (!input.brake) this.leanBlock.brake = false;
    this.wasFlying = flying;
    const lean = (this.leanBlock.gas ? 0 : input.throttle) - (this.leanBlock.brake ? 0 : input.brake);
    const ctrl = {
      throttle,
      brake: dead ? 0 : input.brake,
      lean: dead ? 0 : lean,
      boost: !dead && input.boost,
      nitro: this.nitro,
      assist: this.assist,
    };
    const nitroUsed = car.step(dt, ctrl, this.terrain);
    if (nitroUsed) { this.nitro = Math.max(0, this.nitro - nitroUsed); this.stats_.boostTime += nitroUsed; }
    if (car.grounded && throttle > 0) this.fuel = Math.max(0, this.fuel - throttle * dt * st.fuelBurn);

    // Impacts -> damage
    for (const ev of car.events) {
      const thr = st.damageThreshold * (ev.roof ? 0.5 : 1);
      if (ev.speed > thr) {
        const dmg = Math.pow(ev.speed - thr, 1.35) * 4 * (ev.roof ? 2.2 : 1);
        this.damage(dmg);
        this.fx.push({ type: 'impact', x: ev.x, y: ev.y, speed: ev.speed, dmg });
      } else if (ev.speed > 4) {
        this.fx.push({ type: 'thud', x: ev.x, y: ev.y, speed: ev.speed });
      }
      if (ev.scrape > 3 && !ev.wheel) this.fx.push({ type: 'sparks', x: ev.x, y: ev.y, speed: ev.scrape });
    }
    car.events.length = 0;
    if (car.roofContact && car.speed > 2) this.damage(dt * 6);

    this.trackAir(dt);
    this.collect();

    // Progress and records
    if (car.x > this.maxX) this.maxX = car.x;
    if (this.maxX > this.lastProgressX + 0.5) { this.lastProgressX = this.maxX; this.lastProgressTime = this.time; }
    const s = car.speed;
    if (s > this.stats_.maxSpeed) this.stats_.maxSpeed = s;
    if (car.y > this.stats_.maxAlt) this.stats_.maxAlt = car.y;
    const b = biomeIndexAt(this.maxX);
    if (b !== this.biome) { this.biome = b; this.fx.push({ type: 'biome', name: BIOMES[b].name, index: b }); }
    if (!this.recordAnnounced && this.maxX > this.best) { this.recordAnnounced = true; this.fx.push({ type: 'record' }); }
    if (this.maxX >= this.nextMilestone) { this.fx.push({ type: 'milestone', meters: this.nextMilestone }); this.nextMilestone += 1000; }

    this.checkEnd(dt, input);
  }

  damage(amount) {
    if (this.state !== 'run') return;
    this.hp -= amount;
    this.stats_.damageTaken += amount;
    if (this.hp <= 0) {
      this.hp = 0;
      this.state = 'wrecked';
      this.endTimer = 1.6;
      this.reason = 'wrecked';
      this.fx.push({ type: 'wreck', x: this.car.x, y: this.car.y });
    }
  }

  trackAir(dt) {
    const car = this.car;
    const flying = !car.grounded && !car.hullContact;
    const air = this.air;
    if (flying) {
      if (!air.active) { air.active = true; air.time = 0; air.rot = 0; air.peak = car.y; air.launch = false; }
      air.time += dt;
      air.rot += car.w * dt;
      const above = car.y - this.terrain.height(car.x);
      if (above > (air.peakAbove || 0)) air.peakAbove = above;
      this.stats_.totalAir += dt;
    } else if (air.active) {
      air.active = false;
      if (air.time > this.stats_.maxAir) this.stats_.maxAir = air.time;
      this.onLand(air);
      air.peakAbove = 0;
    }
  }

  onLand(air) {
    const car = this.car;
    if (this.state !== 'run') return;
    const ground = Math.atan(this.terrain.slope(car.x));
    const diff = Math.abs(wrapAngle(car.a - ground));
    const upright = diff < 1.0 && !car.roofContact;
    const tier = tierValue(this.maxX);
    const bonus = [];
    if (upright && air.time > 0.35) {
      const flips = Math.floor((Math.abs(air.rot) + 0.5) / TAU);
      if (flips > 0) {
        const back = air.rot > 0;
        this.stats_.flips += flips;
        if (back) this.stats_.backflips += flips; else this.stats_.frontflips += flips;
        if (flips > this.stats_.maxFlipCombo) this.stats_.maxFlipCombo = flips;
        const label = flips > 1 ? `${flips}x ${back ? 'BACKFLIP' : 'FRONTFLIP'}` : back ? 'BACKFLIP' : 'FRONTFLIP';
        bonus.push({ label, coins: Math.round(20 * Math.pow(flips, 1.5) * tier) });
      }
      if (diff < 0.22 && car.wheelsDown === 2 && !car.hullContact && air.time > 0.8) {
        this.stats_.perfect++;
        bonus.push({ label: 'PERFECT LANDING', coins: 10 * tier });
        // A clean landing keeps momentum: small push along the slope.
        const boost = 2.5;
        car.vx += Math.cos(ground) * boost; car.vy += Math.sin(ground) * boost;
      }
      if (air.time > 2.5) bonus.push({ label: `HANG TIME ${air.time.toFixed(1)}s`, coins: Math.round(6 * air.time * tier) });
      if ((air.peakAbove || 0) > 30) bonus.push({ label: 'SKY HIGH', coins: Math.round((air.peakAbove / 2) * tier) });
    }
    for (const b of bonus) {
      const coins = b.coins * this.stats.bonusMult;
      this.stats_.stuntCoins += coins;
      this.fx.push({ type: 'stunt', label: b.label, coins: Math.round(coins * this.stats.coinMult), x: car.x, y: car.y });
    }
    this.fx.push({ type: 'land', time: air.time, perfect: bonus.some((b) => b.label === 'PERFECT LANDING') });
  }

  collect() {
    const car = this.car;
    const R = this.stats.magnetRadius;
    const cx = car.x, cy = car.y + 0.25;
    const items = this.terrain.itemsInRange(cx - R - 3, cx + R + 3);
    for (const it of items) {
      if (this.collected.has(it.id)) continue;
      const dx = it.x - cx, dy = it.y - cy;
      const d2 = dx * dx + dy * dy;
      switch (it.type) {
        case 'coin': case 'star':
          if (d2 < (R + 0.5) ** 2) {
            this.collected.add(it.id);
            const v = it.value * this.stats.bonusMult;
            this.stats_.pickCoins += v;
            this.stats_.coinsPicked++;
            this.fx.push({ type: it.type, x: it.x, y: it.y, value: Math.round(v * this.stats.coinMult) });
          }
          break;
        case 'fuel':
          if (d2 < (Math.max(R, 1.6) + 0.6) ** 2) {
            this.collected.add(it.id);
            this.fuel = Math.min(this.stats.fuelCap, this.fuel + fuelRefill(this.stats));
            this.stats_.fuelCans++;
            this.fx.push({ type: 'fuel', x: it.x, y: it.y });
          }
          break;
        case 'nitro':
          if (d2 < (Math.max(R, 1.6) + 0.6) ** 2) {
            this.collected.add(it.id);
            if (this.stats.boostThrust > 0) this.nitro = Math.min(this.stats.nitroCap, this.nitro + 1 + this.stats.nitroCap * 0.25);
            else this.stats_.pickCoins += 5 * tierValue(it.x);
            this.fx.push({ type: 'nitro', x: it.x, y: it.y });
          }
          break;
        case 'crate':
          if (Math.abs(dx) < 2.3 && Math.abs(dy) < 1.5) {
            this.collected.add(it.id);
            this.stats_.crates++;
            const v = it.value * this.stats.bonusMult;
            this.stats_.pickCoins += v;
            car.vx *= 0.93;
            this.fx.push({ type: 'crate', x: it.x, y: it.y, value: Math.round(v * this.stats.coinMult), vx: car.vx });
          }
          break;
        case 'pad':
          if (Math.abs(dx) < 2 && Math.abs(it.y - car.y) < 2.2 && car.grounded) {
            this.collected.add(it.id);
            const sp = 9;
            car.vx += Math.cos(car.a) * sp; car.vy += Math.sin(car.a) * sp;
            this.fx.push({ type: 'pad', x: it.x, y: it.y });
          }
          break;
      }
    }
  }

  checkEnd(dt, input) {
    const car = this.car;
    if (this.state === 'wrecked') {
      this.endTimer -= dt;
      if (this.endTimer <= 0) this.finish('wrecked');
      return;
    }
    const slow = car.speed < 0.7;
    const upside = Math.abs(wrapAngle(car.a - Math.atan(this.terrain.slope(car.x)))) > 1.9;
    // Body contact flickers step to step while resting, so remember it briefly.
    this.bodyTouch = car.roofContact || car.hullContact ? 0.3 : Math.max(0, (this.bodyTouch || 0) - dt);
    if (upside && this.bodyTouch > 0 && car.speed < 2.5) this.flippedTime += dt; else this.flippedTime = 0;
    if (this.flippedTime > 1.4) return this.finish('flipped');

    const trying = input.throttle > 0 && this.fuel > 0;
    if (slow && car.grounded) this.stillTime += dt; else this.stillTime = 0;
    if (this.stillTime > (trying ? 2.5 : this.fuel > 0 ? 3.5 : 1.4)) return this.finish(this.fuel > 0 ? 'stopped' : 'out of fuel');
    if (this.time - this.lastProgressTime > 8) return this.finish(this.fuel > 0 ? 'stuck' : 'out of fuel');
  }

  finish(reason) {
    this.state = 'ended';
    this.reason = reason;
    this.fx.push({ type: 'end', reason });
  }

  summary() {
    const st = this.stats;
    const distance = Math.floor(this.distance);
    const distCoins = distance;
    const pick = this.stats_.pickCoins;
    const stunt = this.stats_.stuntCoins;
    const mult = st.coinMult;
    const total = Math.round((distCoins + pick + stunt) * mult);
    return {
      distance, reason: this.reason, total, mult,
      distCoins: Math.round(distCoins * mult),
      pickCoins: Math.round(pick * mult),
      stuntCoins: Math.round(stunt * mult),
      newRecord: distance > this.best,
      biome: biomeIndexAt(distance),
      ...this.stats_,
      maxSpeedKmh: Math.round(this.stats_.maxSpeed * 3.6),
      time: this.time,
    };
  }
}

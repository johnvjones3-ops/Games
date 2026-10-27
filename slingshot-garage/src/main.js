// Game controller: owns the save, the state machine (garage -> aim -> run ->
// results) and all DOM UI. Physics and rules live in run.js / physics.js.

import { Terrain } from './terrain.js';
import { Run, SLING, STEP } from './run.js';
import { Car, previewArc } from './physics.js';
import { BIOMES, biomeIndexAt } from './biomes.js';
import {
  UPGRADES, UPGRADE_BY_ID, PERKS, STAGES, computeStats, upgradeCost, describeUpgrade, stageIndex,
  totalLevels, perkCost, dnaForDistance, EVOLVE_MIN_DISTANCE,
} from './progression.js';
import { loadSave, writeSave, clearSave, exportSave, importSave, defaultSave } from './save.js';
import {
  ensureMissions, applyRunToMissions, claimMission, rerollMission, missionText, ACHIEVEMENTS, checkAchievements, dailyReward,
} from './meta.js';
import { Renderer, PAINTS } from './render.js';
import { Particles } from './particles.js';
import { Audio } from './audio.js';
import { Input } from './input.js';
import { ICONS, UPGRADE_ICONS, PERK_ICONS } from './icons.js';

const $ = (id) => document.getElementById(id);
const fmt = (n) => {
  n = Math.floor(n);
  if (n < 10000) return n.toLocaleString('en-US');
  const units = ['K', 'M', 'B', 'T', 'Qa'];
  let u = -1;
  while (n >= 1000 && u < units.length - 1) { n /= 1000; u++; }
  return `${n < 100 ? n.toFixed(1) : Math.floor(n)}${units[u]}`;
};
const fmtDist = (m) => (m >= 10000 ? `${(m / 1000).toFixed(2)} km` : `${Math.floor(m).toLocaleString('en-US')} m`);
const REASONS = { 'out of fuel': 'Out of fuel', stopped: 'Came to a stop', wrecked: 'Wrecked!', flipped: 'Flipped over', stuck: 'Stuck on a hill', banked: 'Run ended' };
const GARAGE_X = -3.2;
const GHOST_HZ = 10;

function fillIcons(root = document) {
  for (const el of root.querySelectorAll('[data-icon]')) {
    if (!el.firstChild) el.innerHTML = ICONS[el.dataset.icon] || '';
  }
}

class Game {
  constructor() {
    this.save = loadSave();
    this.renderer = new Renderer($('game'));
    this.particles = new Particles();
    this.audio = new Audio();
    this.input = new Input();
    this.mode = 'boot';
    this.t = 0;
    this.last = performance.now();
    this.run = null;
    this.ghostRec = null;
    this.ghostCar = null;
    this.aimDrag = null;
    this.endDelay = 0;
    this.lastHud = {};
    this.coinCombo = 0;
    this.coinComboTimer = 0;
    this.bannerTimer = 0;
    this.prevCamX = 0;
    this.paused = false;
    this.missionRerolled = false;

    this.setWorld();
    this.refreshStats();
    ensureMissions(this.save, this.stats);
    this.applySettings();
    fillIcons();
    this.bindUI();
    this.enterGarage(true);
    requestAnimationFrame(this.loop);
  }

  // ---------- state helpers ----------
  setWorld() {
    this.terrain = new Terrain(this.save.seed * 7919 + 13);
  }

  refreshStats() {
    this.stats = computeStats(this.save.levels, this.save.perks);
    this.stage = this.stats.stage;
  }

  persist() { writeSave(this.save); }

  carOpts(extra = {}) {
    return { stage: this.stage, levels: this.save.levels, paint: PAINTS[this.save.paint || 0] || null, t: this.t, ...extra };
  }

  applySettings() {
    const s = this.save.settings;
    this.audio.setEnabled(s.sound);
    this.audio.setMusic(s.music);
    this.renderer.setQuality(s.quality);
    this.particles.setQuality(s.quality);
    for (const el of document.querySelectorAll('[data-setting]')) {
      const k = el.dataset.setting;
      if (el.type === 'checkbox') el.checked = !!s[k]; else el.value = s[k];
    }
  }

  haptic(ms) {
    if (this.save.settings.haptics && navigator.vibrate) { try { navigator.vibrate(ms); } catch { /* ignore */ } }
  }

  // ---------- modes ----------
  show(id, on) { $(id).hidden = !on; }

  enterGarage(first = false) {
    this.mode = 'garage';
    this.run = null;
    this.audio.setMood('garage');
    this.audio.silenceLoops();
    for (const id of ['hud', 'controls', 'aim-ui', 'results', 'pause']) this.show(id, false);
    this.show('garage', true);
    this.garageCar = new Car(this.stats);
    this.garageCar.x = GARAGE_X; this.garageCar.y = 1.6;
    if (first) this.positionCamera(true);
    this.renderGarage();
    const daily = dailyReward(this.save);
    $('btn-daily').hidden = !daily;
    if (first && daily && this.save.totals.runs > 0) setTimeout(() => this.offerDaily(), 600);
  }

  enterAim() {
    this.audio.unlock();
    this.mode = 'aim';
    this.refreshStats();
    for (const id of ['garage', 'hud', 'controls', 'results', 'pause']) this.show(id, false);
    this.show('aim-ui', true);
    $('aim-hint').hidden = this.save.flags.tutorialAim && this.save.totals.runs > 2;
    $('aim-readout').textContent = '';
    this.run = new Run({ terrain: this.terrain, stats: this.stats, best: this.save.genBest, assist: this.save.settings.assist });
    this.run.aim(0, 0);
    this.arc = null;
    this.aimDrag = null;
    this.particles.list.length = 0;
    this.particles.popups.length = 0;
    this.collected = this.run.collected;
    this.setupGhost();
  }

  setupGhost() {
    const g = this.save.ghost;
    this.ghostCar = null;
    if (this.save.settings.ghost && g && g.seed === this.save.seed && g.frames && g.frames.length > 4) {
      this.ghostCar = new Car(this.stats);
      this.ghostData = g;
    }
    this.ghostRec = { frames: [], acc: 0 };
  }

  startRun() {
    if (!this.run.launch()) return false;
    this.mode = 'run';
    this.audio.setMood('run');
    this.audio.play('launch');
    this.haptic(30);
    this.save.flags.tutorialAim = true;
    this.show('aim-ui', false);
    this.show('hud', true);
    this.show('controls', true);
    $('g-nitro').hidden = !(this.stats.boostThrust > 0);
    $('btn-boost').hidden = !(this.stats.boostThrust > 0);
    this.endDelay = 0;
    this.lastHud = {};
    this.arc = null;
    this.runTime = 0;
    this.renderer.shake(0.25);
    return true;
  }

  // ---------- main loop ----------
  loop = (now) => {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (!this.paused) {
      this.t += dt;
      this.update(dt);
    }
    this.draw(this.paused ? 0 : dt);
    requestAnimationFrame(this.loop);
  };

  update(dt) {
    const input = this.input.state();
    if (this.mode === 'garage') {
      const steps = Math.round(dt / STEP);
      for (let i = 0; i < steps; i++) this.garageCar.step(STEP, { throttle: 0, brake: 0, lean: 0, boost: false, nitro: 0, assist: false }, this.terrain);
      this.garageCar.events.length = 0;
      if (this.garageCar.x < GARAGE_X - 0.5 || this.garageCar.x > GARAGE_X + 0.5) { this.garageCar.vx += (GARAGE_X - this.garageCar.x) * dt * 4; }
    } else if (this.mode === 'aim') {
      this.updateAimKeys(dt);
      this.audio.updateDrive({ pull: this.run.pull ? this.run.pull.power : 0 });
    } else if (this.mode === 'run' && this.run) {
      this.runTime += dt;
      this.run.update(dt, input);
      this.handleFx();
      this.emitTrails(dt, input);
      this.recordGhost(dt);
      this.updateHud();
      const car = this.run.car;
      this.audio.updateDrive({ speed: car.speed, throttle: this.run.fuel > 0 ? input.throttle : 0, grounded: car.grounded, boosting: car.boosting, running: this.run.state === 'run' });
      $('controls').classList.toggle('airborne', !car.grounded && !car.hullContact);
      if (this.run.state === 'ended') {
        this.endDelay += dt;
        if (this.endDelay > 0.9) this.finishRun();
      }
    }
    this.particles.update(dt);
    if (this.bannerTimer > 0) { this.bannerTimer -= dt; if (this.bannerTimer <= 0) $('banner').classList.remove('show'); }
    if (this.coinComboTimer > 0) { this.coinComboTimer -= dt; if (this.coinComboTimer <= 0) this.coinCombo = 0; }
    this.positionCamera(false, dt);
  }

  positionCamera(snap, dt = 0.016) {
    const r = this.renderer;
    const portrait = r.h > r.w * 1.1;
    if (this.mode === 'garage' || this.mode === 'boot') {
      const c = this.garageCar || { x: GARAGE_X, y: 1.5 };
      const sideways = r.w / r.h >= 1.25;
      if (sideways) r.frame(c.x + 1, c.y + 0.6, 10, 0.27, 0.56, dt, 10, snap);
      // Portrait: sit the car in the gap between the info card and the upgrade sheet.
      else r.frame(c.x + 1.0, c.y + 0.3, 12, 0.5, 0.37, dt, 10, snap);
    } else if (this.mode === 'aim') {
      if (portrait) r.frame(SLING.x + 4.5, SLING.y + 1.5, 30, 0.5, 0.45, dt, 22, snap);
      else r.frame(SLING.x + 7, SLING.y + 2.5, 22, 0.5, 0.5, dt, 30, snap);
    } else if (this.run) {
      const car = this.run.car;
      const ground = this.terrain.height(car.x);
      const above = Math.max(0, car.y - ground);
      const look = Math.max(-4, Math.min(16, car.vx * 0.3));
      const viewH = Math.min(150, 19 + car.speed * 0.22 + Math.min(above * 0.95, 110));
      // When flying high, keep the ground in view by aiming between car and ground.
      const focusY = car.y - Math.min(above * 0.42, 40);
      r.frame(car.x + look, focusY + 1.5, viewH, portrait ? 0.4 : 0.36, 0.48, dt, portrait ? 19 : 28, snap);
    }
  }

  draw(dt) {
    const run = this.run;
    const scene = {
      terrain: this.terrain,
      t: this.t,
      particles: this.particles,
      best: this.save.genBest,
      last: this.save.lastDistance,
      collected: run ? run.collected : null,
      showSling: true,
      speed: run && this.mode === 'run' ? run.car.speed : 0,
      camVel: (this.renderer.cam.x - this.prevCamX) / Math.max(dt, 0.001),
    };
    this.prevCamX = this.renderer.cam.x;
    if (this.mode === 'garage' || this.mode === 'boot') {
      scene.car = this.garageCar;
      scene.carOpts = this.carOpts();
    } else if (run) {
      scene.car = run.car;
      scene.carOpts = this.carOpts({ boosting: run.car.boosting, throttle: this.input.state().throttle, hpFrac: run.hp / this.stats.maxHP });
      if (this.mode === 'aim') {
        scene.arc = this.arc;
        const c = run.car;
        scene.pouch = { x: c.x - 2.05 * Math.cos(c.a), y: c.y - 2.05 * Math.sin(c.a) };
      }
      if (this.ghostCar && this.mode === 'run') {
        if (this.poseGhost(this.runTime)) scene.ghost = { car: this.ghostCar, opts: this.carOpts({ stage: this.ghostData.stage ?? this.stage, levels: this.ghostData.levels || {}, paint: null }) };
      }
    }
    this.renderer.draw(scene, dt);
  }

  // ---------- aiming ----------
  bindAim() {
    const canvas = $('game');
    const toWorldDelta = (dx, dy) => ({ x: (dx * this.renderer.dpr) / this.renderer.cam.scale, y: -(dy * this.renderer.dpr) / this.renderer.cam.scale });
    canvas.addEventListener('pointerdown', (e) => {
      if (this.mode !== 'aim') return;
      this.audio.unlock();
      this.aimDrag = { id: e.pointerId, x: e.clientX, y: e.clientY };
      try { canvas.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      $('aim-hint').hidden = true;
    });
    canvas.addEventListener('pointermove', (e) => {
      if (this.mode !== 'aim' || !this.aimDrag || e.pointerId !== this.aimDrag.id) return;
      const d = toWorldDelta(e.clientX - this.aimDrag.x, e.clientY - this.aimDrag.y);
      // Drag distance on screen maps to pull; a little amplification keeps phones comfortable.
      this.applyAim(d.x * 1.15, d.y * 1.15);
    });
    const release = (e) => {
      if (this.mode !== 'aim' || !this.aimDrag || e.pointerId !== this.aimDrag.id) return;
      this.aimDrag = null;
      if (!this.startRun()) { this.run.aim(0, 0); this.arc = null; $('aim-readout').textContent = ''; }
    };
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', (e) => { if (this.aimDrag && e.pointerId === this.aimDrag.id) { this.aimDrag = null; this.run.aim(0, 0); this.arc = null; } });
  }

  applyAim(px, py) {
    const pull = this.run.aim(px, py);
    const v = this.run.launchVelocity(pull);
    const c = this.run.car;
    this.arc = pull.power > 0.05 ? previewArc(c.x, c.y, v.vx, v.vy, this.stats, this.terrain, 60, 0.045) : null;
    $('aim-readout').textContent = pull.power > 0.05 ? `${Math.round(pull.power * 100)}% · ${Math.round((pull.angle * 180) / Math.PI)}°` : '';
  }

  updateAimKeys(dt) {
    // Keyboard / gamepad aiming: up/down = angle, left/right = power.
    const k = this.input.keys;
    if (!this.keyAim) this.keyAim = { angle: 0.7, power: 1 };
    let changed = false;
    if (k.has('ArrowUp') || k.has('KeyW')) { this.keyAim.angle = Math.min(1.4, this.keyAim.angle + dt * 0.8); changed = true; }
    if (k.has('ArrowDown') || k.has('KeyS')) { this.keyAim.angle = Math.max(0, this.keyAim.angle - dt * 0.8); changed = true; }
    if (k.has('ArrowLeft') || k.has('KeyA')) { this.keyAim.power = Math.min(1, this.keyAim.power + dt * 0.8); changed = true; }
    if (k.has('ArrowRight') || k.has('KeyD')) { this.keyAim.power = Math.max(0.15, this.keyAim.power - dt * 0.8); changed = true; }
    if (changed) {
      $('aim-hint').hidden = true;
      const L = SLING.maxPull * this.keyAim.power;
      this.applyAim(-Math.cos(this.keyAim.angle) * L, -Math.sin(this.keyAim.angle) * L);
    }
  }

  onKey(code) {
    if (code === 'Escape' || code === 'KeyP' || code === 'PadStart') {
      if (this.mode === 'run') this.togglePause();
      return;
    }
    if (this.mode === 'aim' && (code === 'Space' || code === 'Enter' || code === 'PadA')) {
      if (!this.run.pull || this.run.pull.power < 0.12) {
        const a = this.keyAim || { angle: 0.7, power: 1 };
        const L = SLING.maxPull * a.power;
        this.applyAim(-Math.cos(a.angle) * L, -Math.sin(a.angle) * L);
      }
      this.startRun();
    } else if (this.mode === 'garage' && (code === 'Enter' || code === 'PadA')) {
      if (!document.querySelector('.modal:not([hidden])')) this.enterAim();
    } else if (this.mode === 'results' && (code === 'Enter' || code === 'Space' || code === 'PadA')) {
      this.closeResults(true);
    }
  }

  // ---------- run feedback ----------
  handleFx() {
    const run = this.run;
    const P = this.particles;
    const r = this.renderer;
    const biome = BIOMES[biomeIndexAt(Math.max(0, run.car.x))];
    for (const f of run.fx) {
      switch (f.type) {
        case 'coin': case 'star': {
          this.coinCombo++; this.coinComboTimer = 0.6;
          this.audio.play(f.type === 'star' ? 'star' : 'coin', this.coinCombo);
          P.burst('glint', f.x, f.y, f.type === 'star' ? 14 : 4, { speed: 4, size: 0.25, life: 0.5, color: '#fff3a0' });
          if (f.type === 'star') { P.popup(f.x, f.y, `+${fmt(f.value)}`, '#ffd23f', 1.3); this.haptic(15); }
          break;
        }
        case 'fuel':
          this.audio.play('fuel'); P.burst('ring', f.x, f.y, 1, { speed: 0, size: 1.2, life: 0.5, color: '#ff6a3d' });
          P.popup(f.x, f.y, 'FUEL +', '#ff8a5c'); this.haptic(20);
          break;
        case 'nitro':
          this.audio.play('nitro'); P.burst('ring', f.x, f.y, 1, { speed: 0, size: 1.2, life: 0.5, color: '#3aa8ff' });
          P.popup(f.x, f.y, this.stats.boostThrust > 0 ? 'ROCKET FUEL +' : 'BONUS', '#7cc7ff'); this.haptic(20);
          break;
        case 'crate':
          this.audio.play('crate'); r.shake(0.15); this.haptic(25);
          P.burst('debris', f.x, f.y, 12, { speed: 8, size: 0.22, life: 1.2, grav: 14, drag: 0.4, colors: ['#c4874a', '#a46a33', '#7a4a1e'], vx: f.vx * 0.5, vy: 3 });
          P.popup(f.x, f.y, `+${fmt(f.value)}`, '#ffd23f');
          break;
        case 'pad':
          this.audio.play('pad'); r.shake(0.2);
          P.burst('glint', f.x, f.y + 0.5, 14, { speed: 9, size: 0.3, life: 0.6, color: '#3dff8a', dir: Math.PI * 0.25, spread: 1.2 });
          P.popup(f.x, f.y, 'BOOST!', '#3dff8a');
          break;
        case 'impact':
          this.audio.play('impact'); r.shake(Math.min(1, f.speed / 25)); this.haptic(Math.min(80, f.speed * 3));
          P.burst('spark', f.x, f.y, 16, { speed: 10, size: 0.2, life: 0.5, grav: 10, color: '#ffd75a', dir: Math.PI / 2, spread: 2.4 });
          P.burst('dust', f.x, f.y, 8, { speed: 4, size: 0.6, life: 0.9, grow: 1.2, color: biome.soil });
          if (f.dmg > 15) P.popup(f.x, f.y + 1, `-${Math.round(f.dmg)}`, '#ff4d6d', 0.9);
          break;
        case 'thud':
          this.audio.play('thud', f.speed);
          P.burst('dust', f.x, f.y, 5, { speed: 3, size: 0.5, life: 0.7, grow: 1, color: biome.surface });
          break;
        case 'sparks':
          if (Math.random() < 0.3) this.audio.play('scrape');
          P.burst('spark', f.x, f.y, 3, { speed: 7, size: 0.18, life: 0.35, grav: 8, color: '#ffe38a', dir: Math.PI, spread: 1.2 });
          break;
        case 'stunt':
          this.audio.play(f.label.startsWith('PERFECT') ? 'perfect' : 'stunt');
          P.popup(f.x, f.y + 1.5, `${f.label} +${fmt(f.coins)}`, f.label.startsWith('PERFECT') ? '#7af7ff' : '#ffd23f', 1.05, true);
          if (f.label.includes('FLIP')) { r.doFlash(0.15, '#fff3a0'); this.haptic(30); }
          break;
        case 'land':
          if (f.time > 0.6) this.audio.play('land');
          if (!this.save.flags.tutorialDrive) {
            this.save.flags.tutorialDrive = true;
            this.showBanner('Hold ▶ to drive', 'In the air, ▶ and ◀ tilt the car', 4);
          }
          break;
        case 'biome': {
          this.audio.play('biome');
          const b = BIOMES[f.index];
          const notes = { 1: 'Sand is slippery: grip down', 3: 'Icy roads: grip way down', 4: 'Watch the jagged rocks', 5: 'Smooth asphalt: grip up', 6: 'Low gravity!', 7: 'Even lower gravity!' };
          this.showBanner(b.name, notes[f.index] || 'New region', 2.8);
          r.doFlash(0.25, '#ffffff');
          break;
        }
        case 'record':
          this.audio.play('record');
          this.showBanner('New record!', 'Keep going!', 2);
          P.burst('confetti', run.car.x, run.car.y + 2, 40, { speed: 10, size: 0.22, life: 2, grav: 8, drag: 1, colors: ['#ffd23f', '#ff5cf0', '#3ff5ff', '#3dff8a', '#ff3b5c'] });
          break;
        case 'milestone':
          this.showBanner(fmtDist(f.meters), 'Milestone', 1.6);
          break;
        case 'wreck':
          this.audio.play('wreck'); r.shake(1.2); r.doFlash(0.6, '#ffb070'); this.haptic([60, 40, 120]);
          P.burst('flame', f.x, f.y, 40, { speed: 9, size: 0.6, life: 1.0, drag: 2, grow: 0.8 });
          P.burst('smoke', f.x, f.y, 30, { speed: 5, size: 0.8, life: 2.2, drag: 1, grow: 1.5, grav: -2, color: '#2a2a2a' });
          P.burst('debris', f.x, f.y, 18, { speed: 14, size: 0.25, life: 1.8, grav: 14, drag: 0.3, colors: ['#555', '#888', PAINTS[this.save.paint || 0] || '#e8453c'] });
          break;
        case 'end':
          this.audio.play('end');
          break;
      }
    }
    run.fx.length = 0;
  }

  emitTrails(dt, input) {
    const run = this.run;
    const car = run.car;
    const P = this.particles;
    const q = this.save.settings.quality;
    const rate = q === 'low' ? 0.35 : q === 'medium' ? 0.7 : 1;
    const biome = BIOMES[biomeIndexAt(Math.max(0, car.x))];
    for (const wh of car.wheels) {
      if (!wh.contact) continue;
      const sp = Math.abs(car.vx);
      if (sp > 3 && Math.random() < sp * 0.05 * rate) {
        P.add({ type: 'dust', x: wh.cx, y: wh.cy + 0.15, vx: -car.vx * 0.15 + (Math.random() - 0.5) * 2, vy: 1 + Math.random() * 2, size: 0.25 + Math.random() * 0.3, grow: 1.2, color: biome.dust || biome.soil, life: 0.7, drag: 2, grav: 2, rot: 0, vr: 0 });
      }
      if (wh.slip && Math.random() < 0.6 * rate) {
        P.add({ type: 'smoke', x: wh.cx, y: wh.cy + 0.2, vx: -car.vx * 0.1, vy: 1.5, size: 0.35, grow: 1.6, color: '#d9d9d9', life: 0.9, drag: 1.5, grav: -1, rot: 0, vr: 0 });
      }
    }
    const c = Math.cos(car.a), s = Math.sin(car.a);
    if (input.throttle > 0 && run.fuel > 0 && Math.random() < 0.35 * rate) {
      P.add({ type: 'smoke', x: car.x - 2.2 * c - 0.0 * s, y: car.y - 2.2 * s - 0.05, vx: -c * 2 + car.vx * 0.6, vy: car.vy * 0.6 + 0.8, size: 0.18, grow: 0.9, color: '#9a9aa5', life: 0.6, drag: 2, grav: -1, rot: 0, vr: 0 });
    }
    if (car.boosting) {
      const n = Math.ceil(3 * rate);
      for (let i = 0; i < n; i++) {
        const back = 2.9 + Math.random() * 0.4;
        const ox = 0.45 * -s, oy = 0.45 * c;
        P.add({ type: 'flame', x: car.x - back * c + ox, y: car.y - back * s + oy, vx: car.vx - c * (12 + Math.random() * 6) + (Math.random() - 0.5) * 2, vy: car.vy - s * (12 + Math.random() * 6) + (Math.random() - 0.5) * 2, size: 0.35 + Math.random() * 0.25, grow: -0.2, life: 0.32, drag: 3, grav: 0, rot: 0, vr: 0 });
      }
    }
    const hpFrac = run.hp / this.stats.maxHP;
    if ((hpFrac < 0.35 || run.state === 'wrecked') && Math.random() < (run.state === 'wrecked' ? 0.9 : 0.25) * rate) {
      P.add({ type: 'smoke', x: car.x + 1.2 * c, y: car.y + 1.2 * s + 0.4, vx: car.vx * 0.3, vy: 1.5, size: 0.4, grow: 1.8, color: run.state === 'wrecked' ? '#222' : '#555', life: 1.4, drag: 1, grav: -1.5, rot: 0, vr: 0 });
    }
  }

  showBanner(title, sub = '', time = 2) {
    const el = $('banner');
    el.innerHTML = `${title}${sub ? `<small>${sub}</small>` : ''}`;
    el.classList.add('show');
    this.bannerTimer = time;
  }

  updateHud() {
    const run = this.run;
    const car = run.car;
    const st = this.stats;
    const set = (id, v) => { if (this.lastHud[id] !== v) { this.lastHud[id] = v; $(id).textContent = v; } };
    set('h-dist', Math.floor(run.distance).toLocaleString('en-US'));
    set('h-speed', Math.round(car.speed * 3.6));
    set('h-alt', Math.max(0, Math.round(car.y - this.terrain.height(car.x))));
    const s = run.stats_;
    set('h-coins', fmt((run.distance + s.pickCoins + s.stuntCoins) * st.coinMult));
    const bar = (id, frac, gaugeSel) => {
      const v = Math.max(0, Math.min(1, frac));
      const key = id + 'w';
      const r = Math.round(v * 200) / 200;
      if (this.lastHud[key] !== r) { this.lastHud[key] = r; $(id).style.transform = `scaleX(${r})`; if (gaugeSel) $(id).closest('.gauge').classList.toggle('low', r < 0.2 && r > 0); }
    };
    bar('h-fuel', run.fuel / st.fuelCap, true);
    bar('h-hp', run.hp / st.maxHP, true);
    if (st.boostThrust > 0) bar('h-nitro', run.nitro / st.nitroCap, false);
    // progress toward the next region (or record)
    const d = run.distance;
    const bi = biomeIndexAt(d);
    const next = BIOMES[bi + 1];
    const start = BIOMES[bi].start;
    const end = next ? next.start : start + 10000;
    bar('h-prog', (d - start) / (end - start));
    const best = this.save.genBest;
    const tick = best > start && best < end ? ((best - start) / (end - start)) * 100 : -10;
    const tk = Math.round(tick * 10) / 10;
    if (this.lastHud.tick !== tk) { this.lastHud.tick = tk; $('h-best-tick').style.left = `${tk}%`; $('h-best-tick').style.display = tk < 0 ? 'none' : ''; }
    set('h-next', next ? `${BIOMES[bi].name} → ${next.name} in ${fmtDist(Math.max(0, next.start - d))}` : BIOMES[bi].name);
  }

  recordGhost(dt) {
    const rec = this.ghostRec;
    if (!rec) return;
    rec.acc += dt;
    const car = this.run.car;
    while (rec.acc >= 1 / GHOST_HZ) {
      rec.acc -= 1 / GHOST_HZ;
      if (rec.frames.length < 6000 * 3) rec.frames.push(Math.round(car.x * 100) / 100, Math.round(car.y * 100) / 100, Math.round(car.a * 1000) / 1000);
    }
  }

  poseGhost(time) {
    const f = this.ghostData.frames;
    const n = f.length / 3;
    const pos = time * GHOST_HZ;
    const i = Math.floor(pos);
    if (i >= n - 1) return false;
    const u = pos - i;
    const g = this.ghostCar;
    g.x = f[i * 3] + (f[i * 3 + 3] - f[i * 3]) * u;
    g.y = f[i * 3 + 1] + (f[i * 3 + 4] - f[i * 3 + 1]) * u;
    g.a = f[i * 3 + 2] + (f[i * 3 + 5] - f[i * 3 + 2]) * u;
    for (const wh of g.wheels) { wh.L = g.stats.suspTravel * 0.7; wh.spin += 0.2; }
    return true;
  }

  // ---------- end of run ----------
  finishRun() {
    if (this.mode !== 'run') return;
    this.mode = 'results';
    this.missionRerolled = false;
    this.audio.setMood('garage');
    this.audio.silenceLoops();
    const sv = this.save;
    const sum = this.run.summary();
    if (this.run.reason === 'banked') sum.reason = 'banked';
    const prevBest = sv.genBest;
    const prevAllBest = sv.best;
    sv.coins += sum.total;
    sv.totals.runs++;
    sv.totals.distance += sum.distance;
    sv.totals.coins += sum.total;
    sv.totals.flips += sum.flips;
    sv.totals.perfect += sum.perfect;
    sv.totals.crates += sum.crates;
    sv.totals.airTime += sum.totalAir;
    if (sum.reason === 'wrecked') sv.totals.wrecks++;
    sv.lastDistance = sum.distance;
    sv.recentEarnings = [...sv.recentEarnings, sum.total].slice(-5);
    if (sum.distance > sv.genBest) {
      sv.genBest = sum.distance;
      if (this.ghostRec && this.ghostRec.frames.length > 6) sv.ghost = { seed: sv.seed, frames: this.ghostRec.frames, stage: this.stage, levels: { ...sv.levels } };
    }
    if (sum.distance > sv.best) sv.best = sum.distance;
    const completed = applyRunToMissions(sv, sum);
    const newAch = checkAchievements(sv, sum);
    const unlocked = UPGRADES.filter((u) => u.unlock > 0 && prevAllBest < u.unlock && sv.best >= u.unlock);
    this.persist();
    this.showResults(sum, completed, prevBest);
    newAch.forEach((a, i) => setTimeout(() => this.toastAchievement(a), 900 + i * 1400));
    unlocked.forEach((u, i) => setTimeout(() => this.toast(UPGRADE_ICONS[u.id], `New upgrade: ${u.name}`, u.blurb), 600 + i * 1200));
  }

  showResults(sum, completed, prevBest) {
    this.show('hud', false);
    this.show('controls', false);
    this.show('results', true);
    $('r-ribbon').hidden = !(sum.distance > prevBest && prevBest > 0) && !(prevBest === 0 && sum.distance > 0 && this.save.totals.runs === 1);
    $('r-reason').textContent = REASONS[sum.reason] || sum.reason;
    const rows = [
      ['Distance', `${fmt(sum.distance)} m`, sum.distCoins],
      ['Pickups', `${sum.coinsPicked} coins, ${sum.crates} crates`, sum.pickCoins],
      ['Stunts', `${sum.flips} flips, ${sum.perfect} perfect`, sum.stuntCoins],
    ];
    $('r-breakdown').innerHTML = rows.map(([a, b, c]) => `<div><span>${a} <small>(${b})</small></span><span>+${fmt(c)}</span></div>`).join('') +
      `<div><span>Coin multiplier</span><span>×${sum.mult.toFixed(2)}</span></div>`;
    const chips = [
      `Top speed ${sum.maxSpeedKmh} km/h`, `Best air ${sum.maxAir.toFixed(1)}s`, `Peak ${Math.round(sum.maxAlt)} m`,
    ];
    if (sum.boostTime > 0) chips.push(`Rocket ${sum.boostTime.toFixed(1)}s`);
    $('r-chips').innerHTML = chips.map((c) => `<span>${c}</span>`).join('');
    $('r-missions').innerHTML = completed.map((m) => `<div>Mission complete: ${missionText(m)} · claim in Missions</div>`).join('');
    $('dot-missions').hidden = !this.save.missions.some((m) => m.done);
    // count-up
    const distEl = $('r-dist'), totEl = $('r-total');
    const start = performance.now();
    const dur = 900;
    const tick = (now) => {
      const k = Math.min(1, (now - start) / dur);
      const e = 1 - Math.pow(1 - k, 3);
      distEl.textContent = Math.floor(sum.distance * e).toLocaleString('en-US');
      totEl.textContent = fmt(sum.total * e);
      if (k < 1 && this.mode === 'results') requestAnimationFrame(tick);
      else { distEl.textContent = sum.distance.toLocaleString('en-US'); totEl.textContent = fmt(sum.total); }
    };
    requestAnimationFrame(tick);
    if (sum.distance > prevBest && prevBest > 0) this.audio.play('record');
    // Suggest what to buy
    const affordable = this.affordableCount();
    const nextStage = STAGES[this.stage + 1];
    $('r-hint').textContent = affordable > 0
      ? `${affordable} upgrade${affordable > 1 ? 's' : ''} ready to buy${nextStage ? ` · ${nextStage.at - totalLevels(this.save.levels)} levels to ${nextStage.name}` : ''}`
      : `Wallet: ${fmt(this.save.coins)} coins`;
    $('btn-r-retry').focus({ preventScroll: true });
  }

  closeResults(retry) {
    this.show('results', false);
    if (retry) this.enterAim(); else this.enterGarage();
  }

  affordableCount() {
    let n = 0;
    for (const u of UPGRADES) {
      const lvl = this.save.levels[u.id] || 0;
      if (lvl >= u.max || !this.isUnlocked(u)) continue;
      if (upgradeCost(u.id, lvl, this.save.perks) <= this.save.coins) n++;
    }
    return n;
  }

  isUnlocked(u) {
    // Unlocks are earned once, by all-time best, and carry over between generations.
    if (this.save.best < u.unlock) return false;
    if (u.requires && !(this.save.levels[u.requires] > 0)) return false;
    return true;
  }

  togglePause(force) {
    const on = force ?? !this.paused;
    if (this.mode !== 'run') return;
    this.paused = on;
    this.show('pause', on);
    if (on) this.audio.silenceLoops();
    this.last = performance.now();
  }

  // ---------- garage UI ----------
  renderGarage() {
    const sv = this.save;
    this.refreshStats();
    $('g-gen').textContent = sv.gen;
    $('g-coins').textContent = fmt(sv.coins);
    $('g-dna').textContent = fmt(sv.dna);
    $('g-best').textContent = fmtDist(sv.genBest);
    $('g-world').textContent = `World ${sv.seed}`;
    const total = totalLevels(sv.levels);
    const stage = STAGES[this.stage];
    const next = STAGES[this.stage + 1];
    $('g-stage').textContent = stage.name;
    if (next) {
      const k = (total - stage.at) / (next.at - stage.at);
      $('g-stage-bar').style.width = `${Math.round(k * 100)}%`;
      $('g-stage-next').textContent = `Evolves into ${next.name} in ${next.at - total} upgrade${next.at - total === 1 ? '' : 's'}`;
    } else {
      $('g-stage-bar').style.width = '100%';
      $('g-stage-next').textContent = 'Final evolution reached';
    }
    for (const b of document.querySelectorAll('.buy-amount button')) b.classList.toggle('sel', String(sv.settings.buyAmount) === b.dataset.amt);
    this.renderUpgrades();
    this.renderMissions();
    this.renderLab();
    this.renderTrophies();
    $('dot-missions').hidden = !sv.missions.some((m) => m.done);
    $('dot-lab').hidden = !(sv.genBest >= EVOLVE_MIN_DISTANCE || PERKS.some((p) => (sv.perks[p.id] || 0) < p.max && perkCost(sv.perks[p.id] || 0) <= sv.dna));
    this.renderPaints();
  }

  buyPlan(id) {
    const sv = this.save;
    const u = UPGRADE_BY_ID[id];
    const lvl = sv.levels[id] || 0;
    const want = sv.settings.buyAmount === 'max' ? Infinity : Number(sv.settings.buyAmount) || 1;
    let n = 0, cost = 0;
    while (n < want && lvl + n < u.max) {
      const c = upgradeCost(id, lvl + n, sv.perks);
      if (cost + c > sv.coins && n > 0) break;
      if (n === 0 && c > sv.coins) { cost = c; break; }
      cost += c; n++;
    }
    return { n: Math.max(1, n), cost, affordable: cost <= sv.coins && n > 0 };
  }

  renderUpgrades() {
    const sv = this.save;
    const list = $('upgrade-list');
    const html = [];
    for (const u of UPGRADES) {
      const lvl = sv.levels[u.id] || 0;
      const unlocked = this.isUnlocked(u);
      const maxed = lvl >= u.max;
      const [cur, nxt] = describeUpgrade(u.id, sv.levels, sv.perks);
      const plan = maxed || !unlocked ? null : this.buyPlan(u.id);
      const pips = Array.from({ length: Math.min(u.max, 25) }, (_, i) => `<i class="${i < Math.round((lvl / u.max) * Math.min(u.max, 25)) ? 'on' : ''}"></i>`).join('');
      let btn;
      if (!unlocked) {
        const why = u.requires && !(sv.levels[u.requires] > 0) && sv.genBest >= u.unlock ? `Needs ${UPGRADE_BY_ID[u.requires].name}` : `Reach ${fmtDist(u.unlock)}`;
        btn = `<button class="buy" disabled><span class="ico">${ICONS.lock}</span><small>${why}</small></button>`;
      } else if (maxed) btn = `<button class="buy max" disabled>MAX</button>`;
      else btn = `<button class="buy ${plan.affordable ? '' : 'poor'}" data-buy="${u.id}"><span class="ico">${ICONS.coin}</span>${fmt(plan.cost)}${plan.n > 1 ? `<small>×${plan.n}</small>` : ''}</button>`;
      html.push(`<div class="card ${unlocked ? '' : 'locked'}" data-card="${u.id}">
        <div class="icon">${UPGRADE_ICONS[u.id]}</div>
        <div><h3>${u.name} <small>Lv ${lvl}/${u.max}</small></h3>
          <div class="stat">${unlocked ? (maxed ? cur : `${cur} → <b>${nxt}</b>`) : u.blurb}</div>
          <div class="pips">${pips}</div></div>
        ${btn}</div>`);
    }
    list.innerHTML = html.join('');
  }

  buyUpgrade(id) {
    const sv = this.save;
    const u = UPGRADE_BY_ID[id];
    const before = this.stage;
    const plan = this.buyPlan(id);
    if (!plan.affordable) { this.audio.play('deny'); this.haptic(10); return; }
    this.audio.unlock();
    let bought = 0;
    while (bought < plan.n) {
      const lvl = sv.levels[id] || 0;
      if (lvl >= u.max) break;
      const c = upgradeCost(id, lvl, sv.perks);
      if (c > sv.coins) break;
      sv.coins -= c;
      sv.levels[id] = lvl + 1;
      bought++;
    }
    this.audio.play('buy', Math.min(12, sv.levels[id] % 12));
    this.haptic(12);
    this.refreshStats();
    this.garageCar.stats = this.stats;
    this.garageCar.vy += 2.5; this.garageCar.w += (Math.random() - 0.5) * 1.5;
    this.particles.burst('glint', this.garageCar.x, this.garageCar.y + 0.5, 12, { speed: 5, size: 0.2, life: 0.6, color: '#ffd23f' });
    const ach = checkAchievements(sv, null);
    this.persist();
    this.renderGarage();
    const card = document.querySelector(`[data-card="${id}"]`);
    if (card) { card.classList.remove('flash'); void card.offsetWidth; card.classList.add('flash'); }
    if (this.stage > before) this.celebrateEvolution(this.stage);
    ach.forEach((a, i) => setTimeout(() => this.toastAchievement(a), 400 + i * 1400));
  }

  celebrateEvolution(stage) {
    const fx = $('overlay-fx');
    fx.innerHTML = `<div class="evolve-fx"><h2>EVOLUTION!</h2><p>${STAGES[stage - 1].name} → ${STAGES[stage].name}</p></div>`;
    this.audio.play('evolve');
    this.renderer.doFlash(0.8, '#ffffff');
    this.haptic([30, 30, 60]);
    const c = this.garageCar;
    this.particles.burst('confetti', c.x, c.y + 1, 70, { speed: 12, size: 0.16, life: 2.4, grav: 8, drag: 1, colors: ['#ffd23f', '#ff5cf0', '#3ff5ff', '#3dff8a', '#ff3b5c'] });
    c.vy += 5;
    setTimeout(() => { if (fx.firstChild) fx.innerHTML = ''; }, 2700);
  }

  renderMissions() {
    const sv = this.save;
    ensureMissions(sv, this.stats);
    const html = sv.missions.map((m) => {
      const k = Math.min(1, m.progress / m.target);
      const prog = Number.isInteger(m.target) ? `${fmt(Math.min(m.progress, m.target))} / ${fmt(m.target)}` : '';
      return `<div class="mission ${m.done ? 'done' : ''}">
        <div><p>${missionText(m)}</p><div class="bar"><i style="width:${Math.round(k * 100)}%"></i></div><small>${prog} · best in a single run</small></div>
        <div class="side">${m.done
          ? `<button class="btn good" data-claim="${m.seq}"><span class="ico">${ICONS.coin}</span>${fmt(m.reward)}</button>`
          : `<span class="pill"><span class="ico">${ICONS.coin}</span>${fmt(m.reward)}</span>${this.missionRerolled ? '' : `<button class="reroll" data-reroll="${m.seq}"><span class="ico">${ICONS.swap}</span>Swap</button>`}`}
        </div></div>`;
    });
    const daily = dailyReward(sv);
    const dailyHtml = daily ? `<div class="mission done"><div><p>Daily bonus · day ${daily.streak} streak</p><small>Come back every day to grow the streak</small></div><div class="side"><button class="btn good" id="btn-daily-claim"><span class="ico">${ICONS.gift}</span>${fmt(daily.coins)}</button></div></div>` : '';
    $('tab-missions').innerHTML = `${dailyHtml}<div class="section-title">Active missions</div>${html.join('')}<p class="fineprint">One free swap per run. Completed missions: ${sv.totals.missions}</p>`;
  }

  renderLab() {
    const sv = this.save;
    const gain = dnaForDistance(sv.genBest);
    const can = sv.genBest >= EVOLVE_MIN_DISTANCE;
    const evolveHtml = `<div class="evolve-card">
      <h3>Evolve to Generation ${sv.gen + 1}</h3>
      <p>Start over in a brand-new world. Coins and upgrades reset; DNA, perks, trophies and records stay.
      ${can ? `You'll gain <b>${gain} DNA</b> for your ${fmtDist(sv.genBest)} best this generation.` : `Reach <b>${fmtDist(EVOLVE_MIN_DISTANCE)}</b> in this generation to evolve (best: ${fmtDist(sv.genBest)}).`}
      Further runs give more DNA.</p>
      <button class="btn primary" id="btn-evolve" ${can ? '' : 'disabled'}><span class="ico">${ICONS.dna}</span>${can ? `Evolve for ${gain} DNA` : 'Locked'}</button></div>`;
    const perks = PERKS.map((p) => {
      const lvl = sv.perks[p.id] || 0;
      const maxed = lvl >= p.max;
      const cost = perkCost(lvl);
      const pips = Array.from({ length: p.max }, (_, i) => `<i class="${i < lvl ? 'on' : ''}"></i>`).join('');
      return `<div class="card"><div class="icon">${PERK_ICONS[p.id]}</div>
        <div><h3>${p.name} <small>Lv ${lvl}/${p.max}</small></h3><div class="stat">${p.blurb}</div><div class="pips">${pips}</div></div>
        ${maxed ? '<button class="buy max" disabled>MAX</button>' : `<button class="buy ${cost <= sv.dna ? '' : 'poor'}" data-perk="${p.id}"><span class="ico">${ICONS.dna}</span>${cost}</button>`}</div>`;
    }).join('');
    $('tab-lab').innerHTML = `${evolveHtml}<div class="section-title">DNA perks · permanent</div><div class="cards">${perks}</div>`;
  }

  buyPerk(id) {
    const sv = this.save;
    const p = PERKS.find((x) => x.id === id);
    const lvl = sv.perks[id] || 0;
    if (lvl >= p.max) return;
    const cost = perkCost(lvl);
    if (cost > sv.dna) { this.audio.play('deny'); return; }
    sv.dna -= cost;
    sv.perks[id] = lvl + 1;
    this.audio.play('buy', 7);
    this.persist();
    this.renderGarage();
  }

  evolve() {
    const sv = this.save;
    const gain = dnaForDistance(sv.genBest);
    if (sv.genBest < EVOLVE_MIN_DISTANCE) return;
    this.confirm(`Evolve to Generation ${sv.gen + 1}?`, `You gain <b>${gain} DNA</b>. Coins (${fmt(sv.coins)}) and all upgrades reset, and you start in a new world. DNA perks, trophies and records are kept.`, 'Evolve', () => {
      sv.dna += gain;
      sv.gen++;
      sv.seed++;
      sv.coins = 0;
      const hs = sv.perks.headstart || 0;
      sv.levels = hs ? { sling: hs, engine: hs, fuel: hs } : {};
      sv.genBest = 0;
      sv.lastDistance = 0;
      sv.ghost = null;
      sv.totals.evolves++;
      this.setWorld();
      this.refreshStats();
      const ach = checkAchievements(sv, null);
      this.persist();
      this.enterGarage();
      const fx = $('overlay-fx');
      fx.innerHTML = `<div class="evolve-fx"><h2>GENERATION ${sv.gen}</h2><p>+${gain} DNA · a new world awaits</p></div>`;
      setTimeout(() => { fx.innerHTML = ''; }, 2700);
      this.audio.play('evolve');
      this.renderer.doFlash(1, '#b38cff');
      ach.forEach((a, i) => setTimeout(() => this.toastAchievement(a), 1200 + i * 1400));
    });
  }

  renderTrophies() {
    const sv = this.save;
    const got = ACHIEVEMENTS.filter((a) => sv.achievements[a.id]).length;
    const html = ACHIEVEMENTS.map((a) => {
      const has = !!sv.achievements[a.id];
      const rw = a.reward.dna ? `<span class="ico">${ICONS.dna}</span>${a.reward.dna} DNA` : `<span class="ico">${ICONS.coin}</span>${fmt(a.reward.coins)}`;
      return `<div class="trophy ${has ? 'got' : ''}"><span class="ico">${ICONS.trophy}</span><h4>${a.name}</h4><p>${a.desc}</p><div class="rw">${has ? `${ICONS.check.replace('<svg', '<svg width="14" height="14"')} Earned` : rw}</div></div>`;
    }).join('');
    $('tab-trophies').innerHTML = `<div class="section-title">${got} / ${ACHIEVEMENTS.length} earned</div><div class="trophies">${html}</div>`;
  }

  renderPaints() {
    const sv = this.save;
    $('paints').innerHTML = PAINTS.map((p, i) => `<button class="${i === (sv.paint || 0) ? 'sel' : ''} ${p ? '' : 'auto'}" data-paint="${i}" style="${p ? `background:${p}` : ''}" aria-label="${p ? `Paint ${p}` : 'Factory colors'}"></button>`).join('');
  }

  toast(iconSvg, title, sub = '') {
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = `<span class="ico">${iconSvg}</span><div>${title}${sub ? `<small>${sub}</small>` : ''}</div>`;
    $('toasts').appendChild(el);
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 320); }, 2800);
  }

  toastAchievement(a) {
    this.audio.play('mission');
    const rw = a.reward.dna ? `+${a.reward.dna} DNA` : `+${fmt(a.reward.coins)} coins`;
    this.toast(ICONS.trophy, `Trophy: ${a.name}`, `${a.desc} · ${rw}`);
    if (this.mode === 'garage') this.renderGarage();
  }

  confirm(title, body, okText, onOk, danger = false) {
    const panel = $('dialog-panel');
    panel.innerHTML = `<h2>${title}</h2><p>${body}</p><div class="row-btns"><button class="btn secondary" data-dlg="cancel">Cancel</button><button class="btn ${danger ? 'danger' : 'primary'}" data-dlg="ok">${okText}</button></div>`;
    this.show('dialog', true);
    panel.querySelector('[data-dlg="cancel"]').onclick = () => this.show('dialog', false);
    panel.querySelector('[data-dlg="ok"]').onclick = () => { this.show('dialog', false); onOk(); };
  }

  offerDaily() {
    const d = dailyReward(this.save);
    if (!d || this.mode !== 'garage') return;
    const panel = $('dialog-panel');
    panel.innerHTML = `<h2>Daily bonus</h2><p>Day <b>${d.streak}</b> streak. Here's <b>${fmt(d.coins)} coins</b> for the road. Come back tomorrow for more.</p><button class="btn primary" data-dlg="ok"><span class="ico">${ICONS.gift}</span>Collect</button>`;
    this.show('dialog', true);
    panel.querySelector('[data-dlg="ok"]').onclick = () => { this.show('dialog', false); this.claimDaily(); };
  }

  claimDaily() {
    const d = dailyReward(this.save);
    if (!d) return;
    this.save.coins += d.coins;
    this.save.daily = { last: d.today, streak: d.streak };
    this.audio.unlock();
    this.audio.play('mission');
    this.persist();
    this.renderGarage();
    $('btn-daily').hidden = true;
  }

  renderStats() {
    const t = this.save.totals;
    const rows = [
      ['Runs', fmt(t.runs)], ['Total distance', fmtDist(t.distance)], ['Coins earned', fmt(t.coins)], ['All-time best', fmtDist(this.save.best)],
      ['Flips landed', fmt(t.flips)], ['Perfect landings', fmt(t.perfect)], ['Crates smashed', fmt(t.crates)], ['Time airborne', `${Math.round(t.airTime)} s`],
      ['Wrecks', fmt(t.wrecks)], ['Generations', fmt(this.save.gen)], ['Missions done', fmt(t.missions)],
    ];
    $('stats-grid').innerHTML = rows.map(([a, b]) => `<span>${a}</span><b>${b}</b>`).join('');
  }

  // ---------- events ----------
  bindUI() {
    this.input.onKey = (code) => this.onKey(code);
    this.input.bindButton($('btn-gas'), 'gas');
    this.input.bindButton($('btn-brake'), 'brake');
    this.input.bindButton($('btn-boost'), 'boost');
    this.bindAim();

    $('btn-launch').onclick = () => { this.audio.unlock(); this.audio.play('click'); this.enterAim(); };
    $('btn-aim-back').onclick = () => this.enterGarage();
    $('btn-r-garage').onclick = () => this.closeResults(false);
    $('btn-r-retry').onclick = () => this.closeResults(true);
    $('btn-pause').onclick = () => this.togglePause(true);
    $('btn-resume').onclick = () => this.togglePause(false);
    $('btn-endrun').onclick = () => { this.togglePause(false); if (this.run && this.run.state === 'run') { this.run.finish('banked'); this.endDelay = 1; } };
    $('btn-quit').onclick = () => { this.paused = false; this.show('pause', false); this.audio.silenceLoops(); this.enterGarage(); };
    $('btn-settings').onclick = () => { this.renderStats(); this.show('settings', true); };
    $('btn-daily').onclick = () => this.offerDaily();
    $('btn-paint').onclick = () => { $('paints').hidden = !$('paints').hidden; };

    for (const el of document.querySelectorAll('[data-close]')) el.onclick = () => this.show(el.closest('.modal').id, false);
    for (const m of document.querySelectorAll('.modal')) {
      m.addEventListener('pointerdown', (e) => { if (e.target === m && m.id !== 'results' && m.id !== 'pause') this.show(m.id, false); });
    }

    for (const tab of document.querySelectorAll('.tabs button')) {
      tab.onclick = () => {
        this.audio.play('click');
        for (const t of document.querySelectorAll('.tabs button')) t.classList.toggle('active', t === tab);
        for (const b of document.querySelectorAll('.tab-body')) b.hidden = b.id !== `tab-${tab.dataset.tab}`;
      };
    }
    for (const b of document.querySelectorAll('.buy-amount button')) {
      b.onclick = () => { this.save.settings.buyAmount = b.dataset.amt === 'max' ? 'max' : Number(b.dataset.amt); this.persist(); this.renderGarage(); };
    }

    $('garage').addEventListener('click', (e) => {
      const buy = e.target.closest('[data-buy]');
      if (buy) return this.buyUpgrade(buy.dataset.buy);
      const perk = e.target.closest('[data-perk]');
      if (perk) return this.buyPerk(perk.dataset.perk);
      const claim = e.target.closest('[data-claim]');
      if (claim) {
        const coins = claimMission(this.save, Number(claim.dataset.claim), this.stats);
        if (coins) { this.audio.play('mission'); this.toast(ICONS.coin, `+${fmt(coins)} coins`, 'Mission reward'); }
        const ach = checkAchievements(this.save, null);
        ach.forEach((a, i) => setTimeout(() => this.toastAchievement(a), 600 + i * 1400));
        this.persist(); this.renderGarage();
        return;
      }
      const reroll = e.target.closest('[data-reroll]');
      if (reroll && !this.missionRerolled) {
        rerollMission(this.save, Number(reroll.dataset.reroll), this.stats);
        this.missionRerolled = true;
        this.audio.play('click'); this.persist(); this.renderMissions();
        return;
      }
      if (e.target.closest('#btn-evolve')) return this.evolve();
      if (e.target.closest('#btn-daily-claim')) return this.claimDaily();
      const paint = e.target.closest('[data-paint]');
      if (paint) { this.save.paint = Number(paint.dataset.paint); this.audio.play('click'); this.persist(); this.renderPaints(); this.garageCar.vy += 1.5; }
    });

    for (const el of document.querySelectorAll('[data-setting]')) {
      el.addEventListener('change', () => {
        const k = el.dataset.setting;
        this.save.settings[k] = el.type === 'checkbox' ? el.checked : el.value;
        this.audio.unlock();
        this.applySettings();
        this.persist();
      });
    }

    $('btn-export').onclick = async () => {
      const code = exportSave(this.save);
      let copied = false;
      try { await navigator.clipboard.writeText(code); copied = true; } catch { /* clipboard blocked */ }
      const panel = $('dialog-panel');
      panel.innerHTML = `<h2>Save code</h2><p>${copied ? 'Copied to your clipboard. ' : ''}Keep it somewhere safe to move your progress to another device.</p><textarea class="code" readonly>${code}</textarea><button class="btn primary" data-dlg="ok">Done</button>`;
      this.show('dialog', true);
      panel.querySelector('[data-dlg="ok"]').onclick = () => this.show('dialog', false);
    };
    $('btn-import').onclick = () => {
      const panel = $('dialog-panel');
      panel.innerHTML = `<h2>Load save code</h2><p>Paste a code from “Copy save code”. This replaces your current progress.</p><textarea class="code" id="import-text"></textarea><p id="import-err" style="color:#ff8aa0"></p><div class="row-btns"><button class="btn secondary" data-dlg="cancel">Cancel</button><button class="btn primary" data-dlg="ok">Load</button></div>`;
      this.show('dialog', true);
      panel.querySelector('[data-dlg="cancel"]').onclick = () => this.show('dialog', false);
      panel.querySelector('[data-dlg="ok"]').onclick = () => {
        try {
          this.save = importSave($('import-text').value);
          this.persist();
          this.setWorld(); this.refreshStats(); this.applySettings();
          this.show('dialog', false); this.show('settings', false);
          this.enterGarage();
          this.toast(ICONS.check, 'Save loaded');
        } catch { $('import-err').textContent = "That code didn't work. Check that it was copied completely."; }
      };
    };
    $('btn-reset').onclick = () => {
      this.confirm('Reset all progress?', 'Coins, upgrades, DNA, trophies and records will be erased. This cannot be undone.', 'Erase everything', () => {
        clearSave();
        this.save = defaultSave();
        this.persist();
        this.setWorld(); this.refreshStats(); this.applySettings();
        ensureMissions(this.save, this.stats);
        this.show('settings', false);
        this.enterGarage(true);
      }, true);
    };

    window.addEventListener('resize', () => this.renderer.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.renderer.resize(), 200));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (this.mode === 'run' && !this.paused) this.togglePause(true);
        this.audio.silenceLoops();
        this.persist();
      }
    });
    const updateRotate = () => { $('rotate-hint').hidden = !(window.innerHeight > window.innerWidth * 1.15 && matchMedia('(pointer: coarse)').matches && this.mode === 'garage'); };
    window.addEventListener('resize', updateRotate);
    updateRotate();
  }
}

// Expose for debugging and automated smoke tests.
window.game = new Game();

// Offline support only when served as a standalone site (not embedded or bundled).
if ('serviceWorker' in navigator && location.protocol === 'https:' && window.top === window && !window.SINGLE_FILE) {
  navigator.serviceWorker.register('sw.js').catch(() => { /* offline support is optional */ });
}

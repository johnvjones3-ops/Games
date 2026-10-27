// Canvas renderer: sky, celestial bodies, parallax layers, terrain,
// decorations, pickups, the slingshot, cars, particles and weather.

import { BIOMES, biomeBlendAt, blendColor, mixColor, biomeIndexAt } from './biomes.js';
import { drawCarLocal, PAINTS } from './carArt.js';
import { hash01, fbm, noise1, clamp } from './rng.js';
import { SLING } from './run.js';

const FONT = 'ui-rounded, "SF Pro Rounded", "Nunito", system-ui, -apple-system, "Segoe UI", sans-serif';
const FORK = { x: 3.4, y: 4.6, gap: 0.45 };

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.cam = { x: 0, y: 4, scale: 30, shake: 0, sx: 0, sy: 0 };
    this.quality = 'high';
    this.flash = 0;
    this.flashColor = '#fff';
    this.stars = Array.from({ length: 160 }, (_, i) => ({ x: hash01(5, i), y: hash01(6, i) * 0.8, r: 0.5 + hash01(7, i) * 1.4, tw: hash01(8, i) * 6 }));
    this.flakes = Array.from({ length: 110 }, (_, i) => ({ x: hash01(11, i), y: hash01(12, i), s: 0.5 + hash01(13, i), p: hash01(14, i) }));
    this.speedLines = Array.from({ length: 24 }, (_, i) => ({ y: hash01(21, i), x: hash01(22, i), l: 0.3 + hash01(23, i) * 0.7 }));
    this.resize();
  }

  setQuality(q) { this.quality = q; this.resize(); }

  resize() {
    const dprCap = this.quality === 'high' ? 2 : this.quality === 'medium' ? 1.5 : 1;
    const dpr = Math.min(window.devicePixelRatio || 1, dprCap);
    const w = Math.max(1, Math.floor(window.innerWidth * dpr));
    const h = Math.max(1, Math.floor(window.innerHeight * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w; this.canvas.height = h;
    }
    this.w = w; this.h = h; this.dpr = dpr;
    this.ui = Math.min(w, h) / 700 * Math.max(1, dpr * 0.7);
  }

  sx = (x) => (x - this.cam.x) * this.cam.scale + this.w / 2 + this.cam.sx;
  sy = (y) => this.h / 2 - (y - this.cam.y) * this.cam.scale + this.cam.sy;

  /** Smoothly frame world point (px,py) at screen fraction (fx,fy) with a given visible height. */
  frame(px, py, viewH, fx, fy, dt, minViewW = 24, snap = false) {
    const cam = this.cam;
    let scale = this.h / viewH;
    if (this.w / scale < minViewW) scale = this.w / minViewW;
    const k = snap ? 1 : 1 - Math.exp(-dt * 3.2);
    cam.scale += (scale - cam.scale) * (snap ? 1 : 1 - Math.exp(-dt * 2));
    const tx = px - (fx * this.w - this.w / 2) / cam.scale;
    const ty = py + (fy * this.h - this.h / 2) / cam.scale;
    cam.x += (tx - cam.x) * (snap ? 1 : Math.min(1, k * 2.2));
    cam.y += (ty - cam.y) * k;
    if (cam.shake > 0) {
      const m = cam.shake * this.ui * 14;
      cam.sx = (Math.random() - 0.5) * m; cam.sy = (Math.random() - 0.5) * m;
      cam.shake = Math.max(0, cam.shake - dt * 2.5);
    } else { cam.sx = cam.sy = 0; }
  }

  shake(amount) { this.cam.shake = Math.min(1.2, this.cam.shake + amount); }
  doFlash(alpha, color = '#fff') { this.flash = Math.max(this.flash, alpha); this.flashColor = color; }

  draw(scene, dt) {
    const { ctx, w, h } = this;
    const terrain = scene.terrain;
    const camX = Math.max(0, this.cam.x);
    const blend = biomeBlendAt(camX);

    this.drawSky(blend, camX, scene.t);
    this.drawParallax(blend, scene.t);

    const x0 = this.cam.x - (w / 2 + Math.abs(this.cam.sx)) / this.cam.scale - 3;
    const x1 = this.cam.x + (w / 2 + Math.abs(this.cam.sx)) / this.cam.scale + 3;
    this.drawDecorations(terrain, x0, x1, scene.t);
    this.drawSlingshotBack(scene);
    this.drawTerrain(terrain, x0, x1, scene.t);
    this.drawMarkers(terrain, x0, x1, scene);
    this.drawItems(terrain, x0, x1, scene);
    if (scene.arc) this.drawArc(scene.arc);
    if (scene.ghost) this.drawCar(scene.ghost.car, scene.ghost.opts, 0.32);
    if (scene.car) this.drawCar(scene.car, scene.carOpts, 1);
    this.drawSlingshotFront(scene);
    scene.particles.draw(ctx, this.sx, this.sy, this.cam.scale);
    this.drawWeather(blend, dt, scene);
    if (scene.speed > 32 && this.quality !== 'low') this.drawSpeedLines(scene.speed, dt);
    scene.particles.drawPopups(ctx, this.sx, this.sy, this.cam.scale, this.ui);

    if (this.flash > 0.01) {
      ctx.globalAlpha = this.flash;
      ctx.fillStyle = this.flashColor;
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
      this.flash *= Math.exp(-dt * 5);
    }
  }

  drawSky(blend, camX, t) {
    const { ctx, w, h } = this;
    const top = blendColor(camX, 'sky', 0);
    const bottom = blendColor(camX, 'sky', 1);
    // Climbing high darkens the sky toward space.
    const alt = clamp((this.cam.y - 40) / 400, 0, 0.75);
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, mixColor(top, '#05030f', alt));
    g.addColorStop(0.75, mixColor(bottom, '#1a1640', alt * 0.8));
    g.addColorStop(1, mixColor(bottom, '#1a1640', alt * 0.8));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    const stars = Math.max(blend.a.stars * (1 - blend.t) + blend.b.stars * blend.t, alt);
    if (stars > 0.02) {
      for (const s of this.stars) {
        const x = ((s.x * w - this.cam.x * this.cam.scale * 0.004) % w + w) % w;
        const tw = 0.6 + 0.4 * Math.sin(t * 2 + s.tw);
        ctx.globalAlpha = stars * tw;
        ctx.fillStyle = '#fff';
        ctx.fillRect(x, s.y * h, s.r * this.dpr, s.r * this.dpr);
      }
      ctx.globalAlpha = 1;
    }
    if (blend.t < 1) this.drawCelestial(blend.a, 1 - blend.t, t);
    if (blend.t > 0) this.drawCelestial(blend.b, blend.t, t);
    const cloudAlpha = (1 - stars) * 0.85;
    if (cloudAlpha > 0.05) this.drawClouds(cloudAlpha, camX);
  }

  drawCelestial(b, alpha, t) {
    const { ctx, w, h } = this;
    const sun = b.sun;
    const x = w * 0.78, y = h * sun.y + clamp(this.cam.y * 0.15, -20, 60) * this.ui;
    const r = sun.size * this.ui;
    ctx.globalAlpha = alpha;
    const g = ctx.createRadialGradient(x, y, r * 0.5, x, y, r * 4);
    g.addColorStop(0, sun.glow);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r * 4, y - r * 4, r * 8, r * 8);
    if (sun.earth) {
      ctx.beginPath(); ctx.arc(x, y, r * 1.6, 0, 7); ctx.fillStyle = '#2f6fd6'; ctx.fill();
      ctx.save(); ctx.clip();
      ctx.fillStyle = '#3fae5a';
      for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.ellipse(x + Math.cos(i * 2.1 + t * 0.02) * r, y + Math.sin(i * 1.7) * r * 0.9, r * 0.5, r * 0.3, i, 0, 7); ctx.fill(); }
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.beginPath(); ctx.ellipse(x - r * 0.3, y - r * 0.6, r * 0.9, r * 0.2, 0.3, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,20,0.45)';
      ctx.beginPath(); ctx.arc(x + r * 0.9, y + r * 0.5, r * 1.6, 0, 7); ctx.fill();
      ctx.restore();
    } else if (sun.ring) {
      ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fillStyle = sun.color; ctx.fill();
      ctx.strokeStyle = 'rgba(255,200,255,0.7)'; ctx.lineWidth = r * 0.15;
      ctx.beginPath(); ctx.ellipse(x, y, r * 2, r * 0.45, -0.35, 0, 7); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fillStyle = sun.color; ctx.fill();
      if (sun.moon) {
        ctx.fillStyle = 'rgba(11,6,48,0.85)';
        ctx.beginPath(); ctx.arc(x + r * 0.45, y - r * 0.2, r * 0.9, 0, 7); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  drawClouds(alpha, camX) {
    const { ctx, w, h } = this;
    const f = 0.06;
    const offset = this.cam.x * this.cam.scale * f;
    const cell = 90 * this.ui;
    const first = Math.floor((offset - cell) / cell);
    const last = Math.floor((offset + w + cell) / cell);
    ctx.fillStyle = '#ffffff';
    for (let i = first; i <= last; i++) {
      if (hash01(31, i) > 0.55) continue;
      const cx = i * cell - offset + hash01(32, i) * cell;
      const cy = h * (0.08 + hash01(33, i) * 0.3) + clamp(this.cam.y * 0.3, -50, 400) * this.ui;
      if (cy > h) continue;
      const s = (0.6 + hash01(34, i)) * 26 * this.ui;
      ctx.globalAlpha = alpha * (0.55 + hash01(35, i) * 0.35);
      ctx.beginPath();
      ctx.ellipse(cx, cy, s * 2.2, s * 0.8, 0, 0, 7);
      ctx.ellipse(cx - s * 1.1, cy + s * 0.15, s * 1.2, s * 0.65, 0, 0, 7);
      ctx.ellipse(cx + s * 0.9, cy - s * 0.3, s * 1.3, s * 0.9, 0, 0, 7);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  drawParallax(blend, t) {
    const layers = [
      { f: 0.1, key: 'far', base: -30, amp: 1 },
      { f: 0.22, key: 'mid', base: -18, amp: 0.7 },
      { f: 0.42, key: 'near', base: -12, amp: 0.5 },
    ];
    const skyBottom = blendColor(Math.max(0, this.cam.x), 'sky', 1);
    for (let i = 0; i < layers.length; i++) {
      const L = layers[i];
      // Draw the current biome, then cross-fade the next one over it near a boundary.
      this.drawLayer(blend.a, L, i, 1, skyBottom, t);
      if (blend.t > 0 && blend.b !== blend.a) this.drawLayer(blend.b, L, i, blend.t, skyBottom, t);
    }
  }

  layerHeight(style, i, u) {
    switch (style) {
      case 'trees': return [70 + fbm(u / 160, 3, 3) * 70, 26 + fbm(u / 70, 4, 3) * 22, 10 + fbm(u / 40, 5, 2) * 8][i];
      case 'cacti': return [40 + fbm(u / 220, 3, 2) * 35, 18 + Math.abs(fbm(u / 90, 4, 2)) * 26, 6 + fbm(u / 60, 5, 2) * 6][i];
      case 'mesas': {
        const raw = [60 + fbm(u / 150, 3, 3) * 60, 30 + fbm(u / 80, 4, 3) * 34, 10 + fbm(u / 45, 5, 2) * 10][i];
        const step = [26, 16, 8][i];
        const q = Math.floor(raw / step) * step;
        return q + step * clamp((raw / step - Math.floor(raw / step) - 0.75) * 4, 0, 1);
      }
      case 'pines': return [110 + (1 - Math.abs(fbm(u / 120, 3, 4))) * 90 - 60, 34 + fbm(u / 60, 4, 3) * 30, 12 + fbm(u / 40, 5, 2) * 10][i];
      case 'vents': return [80 + (1 - Math.abs(noise1(u / 140, 3))) * 70 - 50, 30 + fbm(u / 50, 4, 3) * 26, 10 + fbm(u / 30, 5, 3) * 9][i];
      case 'towers': {
        const cell = [18, 12, 9][i];
        const c = Math.floor(u / cell);
        const gap = hash01(41 + i, c) < 0.15;
        return gap ? 6 : [50 + hash01(42, c) * 110, 30 + hash01(43, c) * 55, 12 + hash01(44, c) * 20][i];
      }
      case 'rocks': return [50 + fbm(u / 180, 3, 3) * 40, 20 + fbm(u / 70, 4, 3) * 18, 8 + fbm(u / 35, 5, 3) * 7][i];
      case 'crystals': return [60 + Math.abs(noise1(u / 40, 3)) * 80, 28 + Math.abs(noise1(u / 25, 4)) * 40, 10 + fbm(u / 30, 5, 2) * 10][i];
      default: return 20;
    }
  }

  drawLayer(biome, L, i, alpha, skyBottom, t) {
    const { ctx, w, h } = this;
    if (alpha <= 0.01) return;
    const f = L.f;
    const scale = this.cam.scale * f;
    const baseY = h / 2 - (L.base - this.cam.y) * scale + this.cam.sy * f;
    const color = mixColor(biome[L.key], skyBottom, [0.45, 0.25, 0.08][i]);
    const style = biome.deco;
    const step = Math.max(3, Math.round(4 * this.dpr));
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let x = 0; x <= w + step; x += step) {
      const u = this.cam.x + (x - w / 2) / scale;
      ctx.lineTo(x, baseY - this.layerHeight(style, i, u) * scale);
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    if (baseY < h) { ctx.fillRect(0, baseY, w, h - baseY); }

    // Snow caps and lit windows add life to some styles.
    if (style === 'pines' && i === 0) {
      ctx.save(); ctx.clip();
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath(); ctx.moveTo(0, 0);
      for (let x = 0; x <= w + step; x += step) {
        const u = this.cam.x + (x - w / 2) / scale;
        ctx.lineTo(x, baseY - (95 + fbm(u / 50, 9, 2) * 10) * scale);
      }
      ctx.lineTo(w, 0); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    if (style === 'towers' && i > 0 && this.quality !== 'low') {
      const cell = [18, 12, 9][i];
      const u0 = this.cam.x + (-w / 2) / scale, u1 = this.cam.x + (w / 2) / scale;
      for (let c = Math.floor(u0 / cell); c <= Math.floor(u1 / cell); c++) {
        const hgt = this.layerHeight(style, i, c * cell + 1);
        if (hgt < 8) continue;
        const left = (c * cell - this.cam.x) * scale + w / 2;
        for (let wy = 4; wy < hgt - 3; wy += 4) {
          for (let wx = 2; wx < cell - 2; wx += 3) {
            const on = hash01(c * 131 + wy, wx) < 0.35;
            if (!on) continue;
            ctx.fillStyle = hash01(c, wy * 7 + wx) < 0.5 ? 'rgba(0,240,255,0.55)' : 'rgba(255,92,240,0.5)';
            ctx.fillRect(left + wx * scale, baseY - wy * scale, Math.max(1, 1.2 * scale), Math.max(1, 1.6 * scale));
          }
        }
      }
    }
    if (style === 'vents' && i === 0) {
      const glow = ctx.createLinearGradient(0, baseY - 40 * scale, 0, baseY);
      glow.addColorStop(0, 'rgba(255,80,20,0)');
      glow.addColorStop(1, `rgba(255,80,20,${0.25 + 0.1 * Math.sin(t * 2)})`);
      ctx.fillStyle = glow;
      ctx.fillRect(0, baseY - 40 * scale, w, 40 * scale);
    }
    ctx.globalAlpha = 1;
  }

  drawTerrain(terrain, x0, x1, t) {
    const { ctx, h } = this;
    const scale = this.cam.scale;
    const step = Math.max(0.25, 5 * this.dpr / scale);
    const CH = 24;
    const c0 = Math.floor(x0 / CH), c1 = Math.floor(x1 / CH);
    const surfLW = Math.max(3, 0.42 * scale);
    // One gradient anchor for the whole screen so chunk boundaries don't show.
    let topY = Infinity;
    for (let x = x0; x <= x1; x += step * 4) topY = Math.min(topY, this.sy(terrain.height(x)));
    for (let c = c0; c <= c1; c++) {
      // Chunks overlap by one step so anti-aliased edges don't leave seams.
      const a = Math.max(x0, c * CH - step), b = Math.min(x1, (c + 1) * CH + step);
      const mid = Math.max(0, (a + b) / 2);
      const surface = blendColor(mid, 'surface');
      const soil = blendColor(mid, 'soil');
      const deep = blendColor(mid, 'deep');
      const pts = [];
      for (let x = a; x < b + step; x += step) {
        const xx = Math.min(x, b + 0.05);
        pts.push(this.sx(xx), this.sy(terrain.height(xx)));
      }
      ctx.beginPath();
      ctx.moveTo(pts[0], h + 10);
      for (let i = 0; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
      ctx.lineTo(pts[pts.length - 2], h + 10);
      ctx.closePath();
      const g = ctx.createLinearGradient(0, topY, 0, Math.max(topY + 1, Math.min(h, topY + 30 * scale)));
      g.addColorStop(0, soil);
      g.addColorStop(1, deep);
      ctx.fillStyle = g;
      ctx.fill();

      // Strata lines give the cross-section some depth.
      if (this.quality !== 'low') {
        ctx.strokeStyle = 'rgba(0,0,0,0.12)';
        ctx.lineWidth = Math.max(1, 0.18 * scale);
        for (const d of [2.4, 5.5, 10]) {
          ctx.beginPath();
          for (let i = 0; i < pts.length; i += 2) {
            const y = pts[i + 1] + d * scale + Math.sin((pts[i] / scale + this.cam.x) * 0.3 + d) * 0.3 * scale;
            if (i === 0) ctx.moveTo(pts[i], y); else ctx.lineTo(pts[i], y);
          }
          ctx.stroke();
        }
      }

      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (let i = 0; i < pts.length; i += 2) {
        if (i === 0) ctx.moveTo(pts[i], pts[i + 1] + surfLW * 0.35); else ctx.lineTo(pts[i], pts[i + 1] + surfLW * 0.35);
      }
      ctx.strokeStyle = surface;
      ctx.lineWidth = surfLW;
      ctx.stroke();
      const biome = BIOMES[biomeIndexAt(mid)];
      if (biome.neon) {
        ctx.strokeStyle = biome.neon;
        ctx.lineWidth = Math.max(1.5, 0.08 * scale);
        ctx.globalAlpha = 0.6 + 0.3 * Math.sin(t * 3 + c);
        ctx.beginPath();
        for (let i = 0; i < pts.length; i += 2) { if (i === 0) ctx.moveTo(pts[i], pts[i + 1]); else ctx.lineTo(pts[i], pts[i + 1]); }
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      if (biome.id === 'city') {
        ctx.setLineDash([1.6 * scale, 1.6 * scale]);
        ctx.strokeStyle = 'rgba(255,214,90,0.8)';
        ctx.lineWidth = Math.max(1, 0.1 * scale);
        ctx.beginPath();
        for (let i = 0; i < pts.length; i += 2) { const y = pts[i + 1] + surfLW * 0.5; if (i === 0) ctx.moveTo(pts[i], y); else ctx.lineTo(pts[i], y); }
        ctx.stroke();
        ctx.setLineDash([]);
      }
      if (biome.lava && this.quality !== 'low') {
        ctx.strokeStyle = biome.lava;
        ctx.lineWidth = Math.max(1, 0.12 * scale);
        ctx.globalAlpha = 0.55 + 0.25 * Math.sin(t * 2.3 + c);
        for (let k = 0; k < 3; k++) {
          const cx = c * CH + hash01(71, c * 3 + k) * CH;
          if (cx < a || cx > b) continue;
          const top = terrain.height(cx) - 1.2 - hash01(72, c * 3 + k) * 4;
          ctx.beginPath();
          ctx.moveTo(this.sx(cx), this.sy(top));
          ctx.lineTo(this.sx(cx + 0.8), this.sy(top - 1.2));
          ctx.lineTo(this.sx(cx + 0.3), this.sy(top - 2.4));
          ctx.lineTo(this.sx(cx + 1.2), this.sy(top - 3.5));
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
    }
  }

  drawDecorations(terrain, x0, x1, t) {
    const { ctx } = this;
    const scale = this.cam.scale;
    const CELL = 7;
    for (let c = Math.floor(x0 / CELL) - 1; c <= Math.floor(x1 / CELL) + 1; c++) {
      if (c * CELL < 14 && c * CELL > -30) continue;
      const r = hash01(91, c);
      const x = c * CELL + hash01(92, c) * CELL * 0.8;
      const biome = BIOMES[biomeIndexAt(Math.max(0, x))];
      const density = { trees: 0.55, cacti: 0.3, mesas: 0.22, pines: 0.6, vents: 0.25, towers: 0.35, rocks: 0.35, crystals: 0.4 }[biome.deco];
      if (r > density) continue;
      const size = 0.7 + hash01(93, c) * 0.9;
      const y = terrain.height(x) - 0.3;
      const X = this.sx(x), Y = this.sy(y), S = size * scale;
      ctx.save();
      ctx.translate(X, Y);
      ctx.rotate(-Math.atan(terrain.slope(x)) * 0.3);
      switch (biome.deco) {
        case 'trees': {
          ctx.fillStyle = '#6b4226'; ctx.fillRect(-0.15 * S, -2.2 * S, 0.3 * S, 2.2 * S);
          const g = hash01(94, c) < 0.5 ? '#3f8f3a' : '#4fa64a';
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(0, -2.6 * S, 1.1 * S, 0, 7); ctx.arc(-0.7 * S, -2.0 * S, 0.8 * S, 0, 7); ctx.arc(0.7 * S, -2.1 * S, 0.85 * S, 0, 7); ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.beginPath(); ctx.arc(-0.3 * S, -3.0 * S, 0.5 * S, 0, 7); ctx.fill();
          break;
        }
        case 'cacti': {
          ctx.fillStyle = '#3f9a52'; ctx.strokeStyle = '#2b6e3a'; ctx.lineWidth = Math.max(1, 0.08 * S);
          const arm = (sx, h1, h2) => { ctx.beginPath(); ctx.moveTo(0, -h1 * S); ctx.lineTo(sx * S, -h1 * S); ctx.lineTo(sx * S, -h2 * S); ctx.lineCap = 'round'; ctx.lineWidth = 0.32 * S; ctx.strokeStyle = '#3f9a52'; ctx.stroke(); };
          arm(-0.6, 1.2, 1.9); arm(0.55, 1.6, 2.4);
          ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -2.8 * S); ctx.lineWidth = 0.45 * S; ctx.strokeStyle = '#3f9a52'; ctx.stroke();
          break;
        }
        case 'mesas': {
          ctx.fillStyle = '#b4553a';
          ctx.beginPath(); ctx.ellipse(0, -1.0 * S, 0.5 * S, 1.0 * S, 0, 0, 7); ctx.fill();
          ctx.fillStyle = '#9a4430';
          ctx.beginPath(); ctx.ellipse(0, -2.2 * S, 0.65 * S, 0.45 * S, 0, 0, 7); ctx.fill();
          break;
        }
        case 'pines': {
          ctx.fillStyle = '#5b3a22'; ctx.fillRect(-0.12 * S, -0.8 * S, 0.24 * S, 0.8 * S);
          for (let k = 0; k < 3; k++) {
            const by = -0.6 - k * 0.9, wdt = 1.1 - k * 0.25;
            ctx.fillStyle = '#2f6b55';
            ctx.beginPath(); ctx.moveTo(-wdt * S, by * S); ctx.lineTo(wdt * S, by * S); ctx.lineTo(0, (by - 1.3) * S); ctx.closePath(); ctx.fill();
            ctx.fillStyle = '#f4fbff';
            ctx.beginPath(); ctx.moveTo(-wdt * 0.45 * S, (by - 0.75) * S); ctx.lineTo(wdt * 0.45 * S, (by - 0.75) * S); ctx.lineTo(0, (by - 1.3) * S); ctx.closePath(); ctx.fill();
          }
          break;
        }
        case 'vents': {
          ctx.fillStyle = '#1d1212';
          ctx.beginPath(); ctx.moveTo(-0.9 * S, 0); ctx.lineTo(-0.2 * S, -1.8 * S); ctx.lineTo(0.3 * S, -1.6 * S); ctx.lineTo(0.9 * S, 0); ctx.fill();
          const gl = 0.5 + 0.5 * Math.sin(t * 3 + c);
          ctx.fillStyle = `rgba(255,${90 + gl * 60},30,${0.5 + gl * 0.4})`;
          ctx.beginPath(); ctx.ellipse(0.05 * S, -1.7 * S, 0.3 * S, 0.1 * S, 0, 0, 7); ctx.fill();
          break;
        }
        case 'towers': {
          ctx.fillStyle = '#2b2e44'; ctx.fillRect(-0.08 * S, -4 * S, 0.16 * S, 4 * S);
          ctx.fillRect(-0.08 * S, -4 * S, 0.9 * S, 0.14 * S);
          const on = 0.7 + 0.3 * Math.sin(t * 5 + c * 3);
          ctx.fillStyle = `rgba(0,240,255,${on})`;
          ctx.beginPath(); ctx.arc(0.75 * S, -3.75 * S, 0.18 * S, 0, 7); ctx.fill();
          ctx.globalAlpha = 0.18 * on;
          ctx.beginPath(); ctx.moveTo(0.55 * S, -3.7 * S); ctx.lineTo(1.6 * S, 0); ctx.lineTo(-0.1 * S, 0); ctx.closePath(); ctx.fill();
          ctx.globalAlpha = 1;
          break;
        }
        case 'rocks': {
          ctx.fillStyle = '#7d808a';
          ctx.beginPath(); ctx.ellipse(0, -0.4 * S, 0.9 * S, 0.6 * S, 0, 0, 7); ctx.fill();
          ctx.fillStyle = '#6a6d77'; ctx.beginPath(); ctx.arc(0.25 * S, -0.5 * S, 0.15 * S, 0, 7); ctx.fill();
          break;
        }
        case 'crystals': {
          const hue = hash01(95, c) < 0.5 ? '#ff5cf0' : '#7af7ff';
          ctx.fillStyle = hue; ctx.globalAlpha = 0.85;
          for (let k = -1; k <= 1; k++) {
            ctx.beginPath(); ctx.moveTo(k * 0.35 * S - 0.2 * S, 0); ctx.lineTo(k * 0.5 * S, -(1.8 - Math.abs(k) * 0.6) * S); ctx.lineTo(k * 0.35 * S + 0.2 * S, 0); ctx.closePath(); ctx.fill();
          }
          ctx.globalAlpha = 1;
          break;
        }
      }
      ctx.restore();
    }
  }

  drawMarkers(terrain, x0, x1, scene) {
    const { ctx } = this;
    const scale = this.cam.scale;
    const ui = this.ui;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // Distance signs every 100 m
    const step = scale < 6 ? 500 : 100;
    for (let d = Math.max(step, Math.ceil(x0 / step) * step); d <= x1; d += step) {
      const big = d % 1000 === 0;
      const gy = terrain.height(d);
      const X = this.sx(d), Y = this.sy(gy);
      const postH = (big ? 3.2 : 2.2) * scale;
      ctx.fillStyle = '#5a4632'; ctx.fillRect(X - 0.08 * scale, Y - postH, 0.16 * scale, postH);
      const label = d >= 1000 ? `${(d / 1000).toFixed(d % 1000 ? 1 : 0)} km` : `${d} m`;
      const fs = Math.max(10 * ui, (big ? 0.75 : 0.55) * scale);
      ctx.font = `800 ${fs}px ${FONT}`;
      const tw = ctx.measureText(label).width + fs * 0.8;
      ctx.fillStyle = big ? '#ffd23f' : '#fff7e6';
      roundRect(ctx, X - tw / 2, Y - postH - fs * 1.2, tw, fs * 1.4, fs * 0.3);
      ctx.fill();
      ctx.fillStyle = '#2a1d10';
      ctx.fillText(label, X, Y - postH - fs * 0.5);
    }
    // Biome gates
    for (const b of BIOMES) {
      if (b.start <= 0 || b.start < x0 - 10 || b.start > x1 + 10) continue;
      const gy = terrain.height(b.start);
      const X = this.sx(b.start), Y = this.sy(gy);
      const H = 7 * scale, W = 6 * scale;
      ctx.strokeStyle = '#2a1d10'; ctx.lineWidth = 0.3 * scale;
      ctx.beginPath(); ctx.moveTo(X - W / 2, Y); ctx.lineTo(X - W / 2, Y - H); ctx.moveTo(X + W / 2, Y); ctx.lineTo(X + W / 2, Y - H); ctx.stroke();
      const fs = Math.max(11 * ui, 0.7 * scale);
      ctx.font = `900 ${fs}px ${FONT}`;
      const tw = Math.max(W + 0.6 * scale, ctx.measureText(b.name).width + fs);
      ctx.fillStyle = b.surface;
      roundRect(ctx, X - tw / 2, Y - H - fs * 0.9, tw, fs * 1.8, fs * 0.4); ctx.fill();
      ctx.lineWidth = Math.max(2, 0.1 * scale); ctx.strokeStyle = '#2a1d10'; ctx.stroke();
      ctx.fillStyle = '#1b1020'; ctx.fillText(b.name, X, Y - H);
    }
    // Best and last-run flags
    const flag = (d, color, label) => {
      if (!d || d < x0 - 5 || d > x1 + 5) return;
      const gy = terrain.height(d);
      const X = this.sx(d), Y = this.sy(gy);
      const H = 5 * scale;
      ctx.fillStyle = '#dcdcdc'; ctx.fillRect(X - 0.07 * scale, Y - H, 0.14 * scale, H);
      ctx.fillStyle = color;
      const wave = Math.sin(scene.t * 6) * 0.15 * scale;
      ctx.beginPath(); ctx.moveTo(X, Y - H); ctx.lineTo(X + 2.2 * scale, Y - H + 0.6 * scale + wave); ctx.lineTo(X, Y - H + 1.3 * scale); ctx.closePath(); ctx.fill();
      const fs = Math.max(10 * ui, 0.5 * scale);
      ctx.font = `900 ${fs}px ${FONT}`;
      ctx.lineWidth = fs * 0.25; ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      ctx.strokeText(label, X, Y - H - fs * 0.8);
      ctx.fillStyle = '#fff'; ctx.fillText(label, X, Y - H - fs * 0.8);
    };
    if (scene.last && Math.abs(scene.last - scene.best) > 15) flag(scene.last, '#1fb6ff', `LAST ${Math.floor(scene.last)} m`);
    flag(scene.best, '#ff3b5c', `BEST ${Math.floor(scene.best)} m`);
  }

  drawItems(terrain, x0, x1, scene) {
    const { ctx } = this;
    const scale = this.cam.scale;
    const t = scene.t;
    const collected = scene.collected;
    const items = terrain.itemsInRange(x0, x1);
    for (const it of items) {
      if (collected && collected.has(it.id)) continue;
      const X = this.sx(it.x), Y = this.sy(it.y);
      switch (it.type) {
        case 'coin': {
          const r = 0.42 * scale;
          const sq = Math.abs(Math.cos(t * 3 + it.id * 0.7));
          const tier = it.value >= 40 ? 4 : it.value >= 20 ? 3 : it.value >= 10 ? 2 : it.value >= 4 ? 1 : 0;
          const cols = [['#ffe46b', '#e0a000'], ['#e8f4ff', '#8fb3cf'], ['#7bf5a8', '#1f9e5a'], ['#ff8aa0', '#c0183a'], ['#d9a6ff', '#7a2fd1']][tier];
          ctx.beginPath(); ctx.ellipse(X, Y, Math.max(1, r * (0.25 + 0.75 * sq)), r, 0, 0, 7);
          ctx.fillStyle = cols[1]; ctx.fill();
          ctx.beginPath(); ctx.ellipse(X, Y, Math.max(0.5, r * 0.72 * (0.25 + 0.75 * sq)), r * 0.72, 0, 0, 7);
          ctx.fillStyle = cols[0]; ctx.fill();
          if (sq > 0.6) { ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fillRect(X - r * 0.15 * sq, Y - r * 0.45, r * 0.12, r * 0.5); }
          break;
        }
        case 'star': {
          const r = 0.8 * scale;
          ctx.save(); ctx.translate(X, Y); ctx.rotate(t * 1.5);
          const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 2);
          g.addColorStop(0, 'rgba(255,240,150,0.6)'); g.addColorStop(1, 'rgba(255,240,150,0)');
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r * 2, 0, 7); ctx.fill();
          ctx.beginPath();
          for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2 - Math.PI / 2; const rr = i % 2 ? r * 0.45 : r; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
          ctx.closePath(); ctx.fillStyle = '#ffd23f'; ctx.fill(); ctx.lineWidth = Math.max(1, 0.06 * scale); ctx.strokeStyle = '#b77900'; ctx.stroke();
          ctx.restore();
          break;
        }
        case 'fuel': {
          const s = scale;
          const bob = Math.sin(t * 3 + it.id) * 0.12 * s;
          ctx.save(); ctx.translate(X, Y + bob);
          const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1.6 * s);
          g.addColorStop(0, 'rgba(255,80,60,0.35)'); g.addColorStop(1, 'rgba(255,80,60,0)');
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 1.6 * s, 0, 7); ctx.fill();
          roundRect(ctx, -0.45 * s, -0.6 * s, 0.9 * s, 1.15 * s, 0.12 * s);
          ctx.fillStyle = '#e8453c'; ctx.fill(); ctx.lineWidth = Math.max(1, 0.06 * s); ctx.strokeStyle = '#7a1a14'; ctx.stroke();
          ctx.fillStyle = '#ffd23f'; ctx.fillRect(0.1 * s, -0.78 * s, 0.25 * s, 0.2 * s);
          ctx.strokeStyle = '#7a1a14'; ctx.beginPath(); ctx.moveTo(-0.3 * s, -0.6 * s); ctx.lineTo(-0.1 * s, -0.8 * s); ctx.lineTo(0.05 * s, -0.6 * s); ctx.stroke();
          ctx.fillStyle = '#fff'; ctx.font = `900 ${0.42 * s}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText('F', 0, 0);
          ctx.restore();
          break;
        }
        case 'nitro': {
          const s = scale;
          const bob = Math.sin(t * 3.5 + it.id) * 0.15 * s;
          ctx.save(); ctx.translate(X, Y + bob);
          const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1.6 * s);
          g.addColorStop(0, 'rgba(60,170,255,0.4)'); g.addColorStop(1, 'rgba(60,170,255,0)');
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 1.6 * s, 0, 7); ctx.fill();
          roundRect(ctx, -0.32 * s, -0.7 * s, 0.64 * s, 1.4 * s, 0.3 * s);
          ctx.fillStyle = '#1f8bff'; ctx.fill(); ctx.lineWidth = Math.max(1, 0.06 * s); ctx.strokeStyle = '#0b2f66'; ctx.stroke();
          ctx.fillStyle = '#ffd23f';
          ctx.beginPath(); ctx.moveTo(0.08 * s, -0.45 * s); ctx.lineTo(-0.15 * s, 0.05 * s); ctx.lineTo(0.02 * s, 0.05 * s); ctx.lineTo(-0.08 * s, 0.45 * s); ctx.lineTo(0.17 * s, -0.1 * s); ctx.lineTo(0, -0.1 * s); ctx.closePath(); ctx.fill();
          ctx.restore();
          break;
        }
        case 'crate': {
          const s = 1.1 * scale;
          const ang = -Math.atan(terrain.slope(it.x));
          ctx.save(); ctx.translate(X, Y); ctx.rotate(ang);
          ctx.fillStyle = '#c4874a'; ctx.fillRect(-s / 2, -s / 2, s, s);
          ctx.strokeStyle = '#7a4a1e'; ctx.lineWidth = Math.max(1, 0.1 * scale);
          ctx.strokeRect(-s / 2, -s / 2, s, s);
          ctx.beginPath(); ctx.moveTo(-s / 2, -s / 2); ctx.lineTo(s / 2, s / 2); ctx.moveTo(s / 2, -s / 2); ctx.lineTo(-s / 2, s / 2); ctx.stroke();
          ctx.restore();
          break;
        }
        case 'pad': {
          const ang = -Math.atan(terrain.slope(it.x));
          const s = scale;
          ctx.save(); ctx.translate(X, Y); ctx.rotate(ang);
          ctx.fillStyle = '#20242c'; ctx.fillRect(-1.6 * s, -0.12 * s, 3.2 * s, 0.24 * s);
          for (let k = 0; k < 3; k++) {
            const on = ((t * 4 - k) % 3 + 3) % 3 < 1;
            ctx.fillStyle = on ? '#3dff8a' : '#1b7a45';
            const cx = (-0.9 + k * 0.9) * s;
            ctx.beginPath(); ctx.moveTo(cx - 0.3 * s, -0.1 * s); ctx.lineTo(cx + 0.2 * s, -0.1 * s); ctx.lineTo(cx + 0.5 * s, -0.5 * s); ctx.lineTo(cx, -0.5 * s); ctx.closePath();
            ctx.globalAlpha = 0.9; ctx.fill();
          }
          ctx.globalAlpha = 1;
          ctx.restore();
          break;
        }
      }
    }
  }

  drawArc(points) {
    const { ctx } = this;
    for (let i = 0; i < points.length; i += 2) {
      const p = points[i];
      const k = 1 - i / points.length;
      ctx.globalAlpha = 0.25 + 0.65 * k;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(this.sx(p.x), this.sy(p.y), Math.max(2, 0.14 * this.cam.scale * (0.5 + k * 0.5)), 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  drawSlingshotBack(scene) {
    if (!scene.showSling) return;
    const { ctx } = this;
    const s = this.cam.scale;
    const bx = this.sx(FORK.x), by = this.sy(0);
    // launch pad
    ctx.fillStyle = '#6b6f7a';
    roundRect(ctx, this.sx(-6), by - 0.25 * s, 12 * s, 0.5 * s, 0.15 * s); ctx.fill();
    ctx.fillStyle = '#ffd23f';
    for (let i = -5; i < 6; i += 1.2) { ctx.fillRect(this.sx(i), by - 0.2 * s, 0.5 * s, 0.12 * s); }
    // trunk
    ctx.strokeStyle = '#7a4a1e'; ctx.lineCap = 'round';
    ctx.lineWidth = 0.7 * s;
    ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx, this.sy(2.4)); ctx.stroke();
    ctx.lineWidth = 0.5 * s;
    ctx.beginPath(); ctx.moveTo(bx, this.sy(2.3)); ctx.quadraticCurveTo(this.sx(FORK.x - 0.8), this.sy(3.2), this.sx(FORK.x - FORK.gap), this.sy(FORK.y)); ctx.stroke();
    // back band
    this.drawBand(scene, FORK.x - FORK.gap, 'rgba(120,30,30,0.95)');
  }

  drawSlingshotFront(scene) {
    if (!scene.showSling) return;
    const { ctx } = this;
    const s = this.cam.scale;
    const bx = this.sx(FORK.x);
    this.drawBand(scene, FORK.x + FORK.gap, '#c0392b');
    ctx.strokeStyle = '#8c5a2b'; ctx.lineCap = 'round';
    ctx.lineWidth = 0.5 * s;
    ctx.beginPath(); ctx.moveTo(bx, this.sy(2.3)); ctx.quadraticCurveTo(this.sx(FORK.x + 0.8), this.sy(3.2), this.sx(FORK.x + FORK.gap), this.sy(FORK.y)); ctx.stroke();
    // bark rings
    ctx.strokeStyle = 'rgba(60,35,15,0.6)'; ctx.lineWidth = Math.max(1, 0.06 * s);
    for (const yy of [0.7, 1.4]) { ctx.beginPath(); ctx.moveTo(bx - 0.33 * s, this.sy(yy)); ctx.lineTo(bx + 0.33 * s, this.sy(yy + 0.08)); ctx.stroke(); }
    ctx.fillStyle = '#3a2a1a';
    for (const dx of [-FORK.gap, FORK.gap]) { ctx.beginPath(); ctx.arc(this.sx(FORK.x + dx), this.sy(FORK.y), 0.27 * s, 0, 7); ctx.fill(); }
  }

  drawBand(scene, tipX, color) {
    const { ctx } = this;
    const s = this.cam.scale;
    const pouch = scene.pouch;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(2, 0.16 * s);
    ctx.beginPath();
    ctx.moveTo(this.sx(tipX), this.sy(FORK.y));
    if (pouch) ctx.lineTo(this.sx(pouch.x), this.sy(pouch.y));
    else ctx.lineTo(this.sx(FORK.x), this.sy(FORK.y - 0.4));
    ctx.stroke();
  }

  drawCar(car, opts, alpha) {
    const { ctx } = this;
    const s = this.cam.scale;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(this.sx(car.x), this.sy(car.y));
    ctx.rotate(-car.a);
    ctx.scale(s, -s);
    // ground shadow-ish underglow for the hover stage
    const wheels = car.wheels.map((wh) => ({
      ax: wh.anchor.x, ay: wh.anchor.y,
      x: wh.anchor.x, y: wh.anchor.y - wh.L, spin: wh.spin,
    }));
    drawCarLocal(ctx, wheels, car.stats.wheelRadius, opts);
    ctx.restore();
  }

  drawWeather(blend, dt, scene) {
    const { ctx, w, h } = this;
    if (this.quality === 'low') return;
    const kind = blend.t < 0.5 ? blend.a.weather : blend.b.weather;
    if (!kind) return;
    const strength = blend.a.weather === blend.b.weather ? 1 : Math.abs(blend.t - 0.5) * 2;
    const vx = scene.camVel || 0;
    for (const f of this.flakes) {
      switch (kind) {
        case 'snow': f.y += dt * (0.08 + f.s * 0.06); f.x += dt * (0.02 * Math.sin(scene.t + f.p * 6) - vx * 0.004 * f.s); break;
        case 'dust': f.x -= dt * (0.25 + f.s * 0.3 + vx * 0.004); f.y += dt * 0.01 * Math.sin(scene.t * 2 + f.p * 9); break;
        case 'embers': f.y -= dt * (0.05 + f.s * 0.05); f.x += dt * (0.02 * Math.sin(scene.t * 2 + f.p * 9) - vx * 0.003); break;
        case 'sparkle': f.x -= dt * vx * 0.002; break;
      }
      f.x = ((f.x % 1) + 1) % 1; f.y = ((f.y % 1) + 1) % 1;
      const x = f.x * w, y = f.y * h, r = f.s * 2.2 * this.dpr;
      switch (kind) {
        case 'snow': ctx.globalAlpha = 0.85 * strength; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); break;
        case 'dust': ctx.globalAlpha = 0.25 * strength; ctx.fillStyle = '#ffe3b0'; ctx.fillRect(x, y, r * 6, r * 0.6); break;
        case 'embers': ctx.globalAlpha = (0.5 + 0.5 * Math.sin(scene.t * 5 + f.p * 20)) * strength; ctx.fillStyle = '#ff8a3a'; ctx.fillRect(x, y, r, r); break;
        case 'sparkle': ctx.globalAlpha = Math.max(0, Math.sin(scene.t * 3 + f.p * 30)) * 0.8 * strength; ctx.fillStyle = f.p < 0.5 ? '#ff5cf0' : '#7af7ff'; ctx.fillRect(x, y, r, r); break;
      }
    }
    ctx.globalAlpha = 1;
  }

  drawSpeedLines(speed, dt) {
    const { ctx, w, h } = this;
    const k = clamp((speed - 32) / 60, 0, 1);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = Math.max(1, this.dpr);
    for (const l of this.speedLines) {
      l.x -= dt * (1.5 + l.l * 2) * (0.5 + k);
      if (l.x < -0.3) { l.x = 1 + Math.random() * 0.3; l.y = Math.random(); }
      ctx.globalAlpha = k * 0.35 * l.l;
      ctx.beginPath(); ctx.moveTo(l.x * w, l.y * h); ctx.lineTo(l.x * w + l.l * w * 0.25 * k, l.y * h); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export { PAINTS, FORK, SLING };

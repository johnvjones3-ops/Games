// Lightweight particle system in world space plus floating score popups.

export class Particles {
  constructor(max = 700) {
    this.max = max;
    this.list = [];
    this.popups = [];
  }

  setQuality(q) { this.max = q === 'low' ? 220 : q === 'medium' ? 450 : 800; }

  add(p) {
    if (this.list.length >= this.max) this.list.splice(0, this.list.length - this.max + 1);
    p.life = p.max = p.life ?? 1;
    this.list.push(p);
    return p;
  }

  burst(type, x, y, n, opts = {}) {
    const spread = opts.spread ?? Math.PI * 2;
    const dir = opts.dir ?? 0;
    const speed = opts.speed ?? 6;
    for (let i = 0; i < n; i++) {
      const a = dir + (Math.random() - 0.5) * spread;
      const v = speed * (0.4 + Math.random() * 0.8);
      this.add({
        type, x, y,
        vx: Math.cos(a) * v + (opts.vx || 0), vy: Math.sin(a) * v + (opts.vy || 0),
        size: (opts.size ?? 0.2) * (0.6 + Math.random() * 0.8),
        color: opts.colors ? opts.colors[(Math.random() * opts.colors.length) | 0] : opts.color,
        life: (opts.life ?? 0.8) * (0.6 + Math.random() * 0.7),
        grav: opts.grav ?? 0, drag: opts.drag ?? 1.5, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 12,
        grow: opts.grow ?? 0,
      });
    }
  }

  popup(x, y, text, color = '#ffd23f', size = 1, big = false) {
    this.popups.push({ x, y, text, color, size, life: big ? 2.2 : 1.4, max: big ? 2.2 : 1.4, big });
    if (this.popups.length > 30) this.popups.shift();
  }

  update(dt) {
    const L = this.list;
    let j = 0;
    for (let i = 0; i < L.length; i++) {
      const p = L[i];
      p.life -= dt;
      if (p.life <= 0) continue;
      const d = Math.exp(-p.drag * dt);
      p.vx *= d; p.vy = p.vy * d - p.grav * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.rot += p.vr * dt;
      p.size += p.grow * dt;
      L[j++] = p;
    }
    L.length = j;
    for (const p of this.popups) { p.life -= dt; p.y += dt * (p.big ? 0.6 : 1.6); }
    this.popups = this.popups.filter((p) => p.life > 0);
  }

  draw(ctx, sx, sy, scale) {
    for (const p of this.list) {
      const k = p.life / p.max;
      const x = sx(p.x), y = sy(p.y);
      const s = Math.max(1, p.size * scale);
      switch (p.type) {
        case 'dust':
        case 'smoke':
          ctx.globalAlpha = k * (p.type === 'smoke' ? 0.45 : 0.5);
          ctx.fillStyle = p.color;
          ctx.beginPath(); ctx.arc(x, y, s, 0, 7); ctx.fill();
          break;
        case 'flame': {
          ctx.globalAlpha = k;
          ctx.fillStyle = k > 0.6 ? '#fff3b0' : k > 0.3 ? '#ffa53a' : '#ff4d1a';
          ctx.beginPath(); ctx.arc(x, y, s * (0.5 + k * 0.6), 0, 7); ctx.fill();
          break;
        }
        case 'spark':
          ctx.globalAlpha = k;
          ctx.strokeStyle = p.color || '#ffd75a';
          ctx.lineWidth = Math.max(1, s * 0.4);
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - p.vx * scale * 0.03, y + p.vy * scale * 0.03); ctx.stroke();
          break;
        case 'debris':
          ctx.globalAlpha = Math.min(1, k * 2);
          ctx.save(); ctx.translate(x, y); ctx.rotate(p.rot);
          ctx.fillStyle = p.color; ctx.fillRect(-s, -s * 0.5, s * 2, s);
          ctx.restore();
          break;
        case 'glint': {
          ctx.globalAlpha = k;
          ctx.fillStyle = p.color || '#fff6c8';
          ctx.save(); ctx.translate(x, y); ctx.rotate(p.rot);
          ctx.beginPath();
          for (let i = 0; i < 4; i++) { const a = (i * Math.PI) / 2; ctx.lineTo(Math.cos(a) * s, Math.sin(a) * s); ctx.lineTo(Math.cos(a + 0.785) * s * 0.3, Math.sin(a + 0.785) * s * 0.3); }
          ctx.closePath(); ctx.fill(); ctx.restore();
          break;
        }
        case 'ring':
          ctx.globalAlpha = k;
          ctx.strokeStyle = p.color; ctx.lineWidth = Math.max(1, 0.08 * scale * k);
          ctx.beginPath(); ctx.arc(x, y, s * (2 - k), 0, 7); ctx.stroke();
          break;
        case 'confetti':
          ctx.globalAlpha = Math.min(1, k * 2);
          ctx.save(); ctx.translate(x, y); ctx.rotate(p.rot);
          ctx.fillStyle = p.color; ctx.fillRect(-s, -s * 0.35, s * 2, s * 0.7);
          ctx.restore();
          break;
      }
    }
    ctx.globalAlpha = 1;
  }

  drawPopups(ctx, sx, sy, scale, uiScale) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const p of this.popups) {
      const k = p.life / p.max;
      const appear = Math.min(1, (p.max - p.life) * 8);
      const size = (p.big ? 30 : 20) * p.size * uiScale * (0.7 + 0.3 * appear);
      ctx.globalAlpha = Math.min(1, k * 2.5);
      ctx.font = `900 ${size}px ui-rounded, "SF Pro Rounded", system-ui, sans-serif`;
      const x = sx(p.x), y = sy(p.y) - 30 * uiScale;
      ctx.lineWidth = size * 0.18;
      ctx.strokeStyle = 'rgba(20,10,30,0.85)';
      ctx.strokeText(p.text, x, y);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, x, y);
    }
    ctx.globalAlpha = 1;
  }
}

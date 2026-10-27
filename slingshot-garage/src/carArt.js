// Procedural vector art for every evolution stage of the car, plus the
// visible add-ons that appear as parts are upgraded. Drawn in car-local
// meters (x forward, y up); the caller sets up the transform.

// The art is authored with its floor at y≈-0.25; this shifts it onto the collision hull.
const BODY_DROP = -0.25;

export const PAINTS = [
  null, '#e84545', '#ff8c1a', '#ffd23f', '#2ec27e', '#1fb6ff', '#5b5bff', '#c061cb', '#f5f5f5', '#2b2b33',
];

const STAGE_STYLE = [
  { body: '#c48a52', accent: '#8c5a2b', dark: '#5e3b1c', glass: null, rim: 'wood' },
  { body: '#e8453c', accent: '#ffd23f', dark: '#2b2b33', glass: null, rim: 'kart' },
  { body: '#ff8c1a', accent: '#2b2b33', dark: '#3b2a1a', glass: null, rim: 'steel' },
  { body: '#1fa9b8', accent: '#f5f5f5', dark: '#16323a', glass: '#bfe9ff', rim: 'steel' },
  { body: '#3c9d4e', accent: '#e9e3c9', dark: '#1e3a24', glass: '#c7ecff', rim: 'steel' },
  { body: '#ff7a1a', accent: '#1b1b1f', dark: '#3a1d0a', glass: '#9fd8ff', rim: 'mag' },
  { body: '#f2f2f2', accent: '#1f6fff', dark: '#1b2a4a', glass: '#9fd8ff', rim: 'rally' },
  { body: '#e01e37', accent: '#ffd23f', dark: '#3a0a12', glass: '#a8dcff', rim: 'star' },
  { body: '#1d1d24', accent: '#3dff8a', dark: '#0b0b0f', glass: '#7ad7ff', rim: 'turbine' },
  { body: '#c9d3e0', accent: '#1f8bff', dark: '#3a4658', glass: '#86e1ff', rim: 'turbine' },
  { body: '#2a1b5c', accent: '#3ff5ff', dark: '#120a2e', glass: '#b38cff', rim: 'hover' },
];

// Where add-ons attach for each stage.
const MOUNTS = [
  { roof: [-1.35, 0.85], rear: [-1.75, 0.15], hood: [1.1, 0.3] },
  { roof: [-1.45, 0.6], rear: [-1.9, 0.3], hood: [1.2, 0.2] },
  { roof: [-0.2, 1.3], rear: [-2.0, 0.35], hood: [1.3, 0.35] },
  { roof: [-0.7, 1.02], rear: [-2.0, 0.45], hood: [1.4, 0.45] },
  { roof: [0.2, 1.07], rear: [-2.1, 0.55], hood: [1.5, 0.45] },
  { roof: [-0.5, 0.93], rear: [-2.15, 0.5], hood: [1.3, 0.5] },
  { roof: [-0.6, 1.03], rear: [-2.05, 0.5], hood: [1.4, 0.48] },
  { roof: [-0.5, 0.84], rear: [-2.1, 0.45], hood: [1.3, 0.4] },
  { roof: [-0.6, 0.76], rear: [-2.1, 0.45], hood: [1.2, 0.3] },
  { roof: [-0.4, 0.74], rear: [-2.2, 0.4], hood: [1.4, 0.3] },
  { roof: [-0.2, 0.92], rear: [-2.15, 0.35], hood: [1.4, 0.4] },
];

export function stageStyle(stage, paint) {
  const s = STAGE_STYLE[Math.min(stage, STAGE_STYLE.length - 1)];
  return paint ? { ...s, body: paint } : s;
}

function path(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
}

/** Closed path with rounded corners (radius r in meters). */
function roundPath(ctx, pts, r) {
  const n = pts.length;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n];
    const d1 = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
    const d2 = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const rr = Math.min(r, d1 / 2, d2 / 2);
    const ax = p1[0] + ((p0[0] - p1[0]) / d1) * rr, ay = p1[1] + ((p0[1] - p1[1]) / d1) * rr;
    const bx = p1[0] + ((p2[0] - p1[0]) / d2) * rr, by = p1[1] + ((p2[1] - p1[1]) / d2) * rr;
    if (i === 0) ctx.moveTo(ax, ay); else ctx.lineTo(ax, ay);
    ctx.quadraticCurveTo(p1[0], p1[1], bx, by);
  }
  ctx.closePath();
}

function fillStroke(ctx, fill, stroke = 'rgba(0,0,0,0.55)', lw = 0.05) {
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) { ctx.lineWidth = lw; ctx.strokeStyle = stroke; ctx.stroke(); }
}

function shade(ctx, top, bottom, y0, y1) {
  const g = ctx.createLinearGradient(0, y1, 0, y0);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  return g;
}

function hexShift(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c) => Math.max(0, Math.min(255, Math.round(c + amt * 255)));
  const r = f((n >> 16) & 255), g = f((n >> 8) & 255), b = f(n & 255);
  return `rgb(${r},${g},${b})`;
}

function bodyFill(ctx, color, y0, y1) {
  return shade(ctx, hexShift(color, 0.12), hexShift(color, -0.18), y0, y1);
}

export function drawHelmet(ctx, x, y, color = '#ffd23f', r = 0.27) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 0.04; ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.stroke();
  // visor
  ctx.beginPath();
  ctx.moveTo(x + r * 0.15, y + r * 0.35);
  ctx.quadraticCurveTo(x + r * 1.05, y + r * 0.3, x + r * 0.95, y - r * 0.25);
  ctx.lineTo(x + r * 0.2, y - r * 0.15);
  ctx.closePath();
  ctx.fillStyle = '#1b2a4a';
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x + r * 0.45, y + r * 0.22);
  ctx.lineTo(x + r * 0.8, y + r * 0.18);
  ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 0.03; ctx.stroke();
  // stripe
  ctx.beginPath();
  ctx.arc(x, y, r * 0.98, Math.PI * 0.55, Math.PI * 0.95);
  ctx.strokeStyle = '#e8453c'; ctx.lineWidth = 0.07; ctx.stroke();
}

function torso(ctx, x, y, color = '#3b6fd6') {
  roundPath(ctx, [[x - 0.28, y - 0.35], [x + 0.25, y - 0.35], [x + 0.2, y + 0.12], [x - 0.25, y + 0.15]], 0.1);
  fillStroke(ctx, color);
}

function glass(ctx, pts, tint) {
  path(ctx, pts);
  const ys = pts.map((p) => p[1]);
  const g = ctx.createLinearGradient(0, Math.max(...ys), 0, Math.min(...ys));
  g.addColorStop(0, tint);
  g.addColorStop(1, 'rgba(40,70,110,0.75)');
  ctx.fillStyle = g;
  ctx.globalAlpha *= 0.82;
  ctx.fill();
  ctx.globalAlpha /= 0.82;
  ctx.lineWidth = 0.06; ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.stroke();
  // glare
  const minX = Math.min(...pts.map((p) => p[0])), maxX = Math.max(...pts.map((p) => p[0]));
  ctx.save();
  path(ctx, pts); ctx.clip();
  ctx.beginPath();
  ctx.moveTo(minX + (maxX - minX) * 0.55, Math.max(...ys));
  ctx.lineTo(minX + (maxX - minX) * 0.7, Math.max(...ys));
  ctx.lineTo(minX + (maxX - minX) * 0.45, Math.min(...ys));
  ctx.lineTo(minX + (maxX - minX) * 0.3, Math.min(...ys));
  ctx.closePath();
  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  ctx.fill();
  ctx.restore();
}

function headlight(ctx, x, y, r = 0.09, on = true) {
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = on ? '#fff6c8' : '#cfcfcf'; ctx.fill();
  ctx.lineWidth = 0.03; ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.stroke();
}

function taillight(ctx, x, y, w = 0.08, h = 0.14) {
  ctx.fillStyle = '#ff3b3b';
  ctx.fillRect(x - w / 2, y - h / 2, w, h);
}

const STAGE_DRAW = [
  // 0 Soapbox: a wooden crate on wheels
  (ctx, s) => {
    roundPath(ctx, [[-1.5, 0.3], [-1.2, 0.3], [-1.25, 1.05], [-1.55, 1.05]], 0.06);
    fillStroke(ctx, s.accent);
    torso(ctx, -0.75, 0.62, '#3b6fd6');
    drawHelmet(ctx, -0.6, 0.98, '#ffd23f');
    ctx.beginPath(); ctx.moveTo(-0.5, 0.6); ctx.lineTo(0.25, 0.62); ctx.strokeStyle = '#3b6fd6'; ctx.lineWidth = 0.12; ctx.lineCap = 'round'; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0.75, 0.3); ctx.lineTo(0.35, 0.68); ctx.strokeStyle = '#333'; ctx.lineWidth = 0.07; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(0.32, 0.7, 0.06, 0.2, -0.6, 0, Math.PI * 2); ctx.strokeStyle = '#222'; ctx.lineWidth = 0.06; ctx.stroke();
    path(ctx, [[-1.75, -0.25], [1.25, -0.25], [1.8, 0.02], [1.6, 0.35], [-1.75, 0.38]]);
    fillStroke(ctx, bodyFill(ctx, s.body, -0.25, 0.38));
    ctx.strokeStyle = s.dark; ctx.lineWidth = 0.035;
    for (const y of [-0.08, 0.1, 0.25]) { ctx.beginPath(); ctx.moveTo(-1.7, y); ctx.lineTo(1.5, y); ctx.stroke(); }
    ctx.fillStyle = '#3a2a1a';
    for (const x of [-1.6, -0.4, 0.8]) for (const y of [-0.17, 0.3]) { ctx.beginPath(); ctx.arc(x, y, 0.03, 0, 7); ctx.fill(); }
    // painted number
    ctx.beginPath(); ctx.arc(0.1, 0.06, 0.16, 0, 7); ctx.fillStyle = '#f5f5f5'; ctx.fill();
  },
  // 1 Go-Kart
  (ctx, s) => {
    roundPath(ctx, [[-1.9, 0.12], [-1.15, 0.12], [-1.15, 0.6], [-1.9, 0.6]], 0.06);
    fillStroke(ctx, '#4a4a55');
    ctx.fillStyle = '#777'; ctx.fillRect(-2.05, 0.25, 0.2, 0.09);
    roundPath(ctx, [[-1.15, 0.15], [-0.85, 0.15], [-0.95, 0.95], [-1.2, 0.95]], 0.06);
    fillStroke(ctx, '#2b2b33');
    torso(ctx, -0.55, 0.55, '#e9e3c9');
    drawHelmet(ctx, -0.4, 0.9, '#ffffff');
    ctx.beginPath(); ctx.moveTo(-0.35, 0.5); ctx.lineTo(0.3, 0.55); ctx.strokeStyle = '#e9e3c9'; ctx.lineWidth = 0.11; ctx.lineCap = 'round'; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0.8, 0.2); ctx.lineTo(0.4, 0.6); ctx.strokeStyle = '#222'; ctx.lineWidth = 0.06; ctx.stroke();
    roundPath(ctx, [[-1.9, -0.18], [1.6, -0.18], [2.1, 0.0], [1.75, 0.22], [0.6, 0.28], [-0.3, 0.2], [-1.9, 0.16]], 0.1);
    fillStroke(ctx, bodyFill(ctx, s.body, -0.18, 0.28));
    ctx.beginPath(); ctx.moveTo(0.4, 0.05); ctx.lineTo(1.7, 0.05); ctx.strokeStyle = s.accent; ctx.lineWidth = 0.08; ctx.stroke();
    ctx.beginPath(); ctx.arc(0.9, 0.12, 0.13, 0, 7); ctx.fillStyle = '#fff'; ctx.fill();
  },
  // 2 Dune Buggy with roll cage
  (ctx, s) => {
    torso(ctx, -0.45, 0.62, '#2e7d32');
    drawHelmet(ctx, -0.3, 0.98, '#ff4d6d');
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = s.accent; ctx.lineWidth = 0.1;
    ctx.beginPath();
    ctx.moveTo(-1.55, 0.42); ctx.lineTo(-1.1, 1.3); ctx.lineTo(0.6, 1.3); ctx.lineTo(1.15, 0.42);
    ctx.moveTo(-1.1, 1.3); ctx.lineTo(-0.8, 0.42);
    ctx.moveTo(0.6, 1.3); ctx.lineTo(0.35, 0.42);
    ctx.stroke();
    for (const x of [-0.6, -0.15, 0.3]) { ctx.beginPath(); ctx.arc(x, 1.36, 0.08, 0, 7); ctx.fillStyle = '#fff6c8'; ctx.fill(); ctx.lineWidth = 0.03; ctx.strokeStyle = '#333'; ctx.stroke(); }
    roundPath(ctx, [[-2.0, -0.2], [1.75, -0.2], [2.15, 0.15], [1.2, 0.45], [-1.55, 0.48], [-2.1, 0.25]], 0.12);
    fillStroke(ctx, bodyFill(ctx, s.body, -0.2, 0.48));
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    roundPath(ctx, [[-1.6, 0.05], [-0.2, 0.05], [-0.2, 0.3], [-1.6, 0.3]], 0.06); ctx.fill();
    headlight(ctx, 1.95, 0.15, 0.08);
  },
  // 3 Hatchback
  (ctx, s) => {
    drawHelmet(ctx, -0.35, 0.78, '#ffd23f', 0.24);
    glass(ctx, [[0.85, 0.5], [0.2, 0.98], [-1.55, 0.98], [-1.9, 0.52]], s.glass);
    ctx.beginPath(); ctx.moveTo(-0.55, 0.98); ctx.lineTo(-0.55, 0.5); ctx.strokeStyle = s.dark; ctx.lineWidth = 0.08; ctx.stroke();
    roundPath(ctx, [[-2.0, -0.25], [1.95, -0.25], [2.1, 0.15], [1.85, 0.42], [0.85, 0.52], [-1.95, 0.55], [-2.05, 0.2]], 0.14);
    fillStroke(ctx, bodyFill(ctx, s.body, -0.25, 0.55));
    roundPath(ctx, [[0.2, 1.06], [-1.6, 1.06], [-1.62, 0.96], [0.22, 0.96]], 0.04); fillStroke(ctx, s.body);
    ctx.beginPath(); ctx.moveTo(-1.9, 0.12); ctx.lineTo(1.9, 0.12); ctx.strokeStyle = s.accent; ctx.lineWidth = 0.06; ctx.stroke();
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(0.1, 0.25, 0.25, 0.05);
    headlight(ctx, 1.98, 0.25, 0.09); taillight(ctx, -2.0, 0.33);
  },
  // 4 Pickup
  (ctx, s) => {
    drawHelmet(ctx, 0.15, 0.82, '#ff8c1a', 0.24);
    glass(ctx, [[1.05, 0.55], [0.65, 1.05], [-0.3, 1.05], [-0.3, 0.55]], s.glass);
    roundPath(ctx, [[-2.15, -0.25], [2.05, -0.25], [2.15, 0.3], [1.95, 0.5], [1.05, 0.56], [-0.35, 0.56], [-0.35, 0.68], [-2.15, 0.68]], 0.1);
    fillStroke(ctx, bodyFill(ctx, s.body, -0.25, 0.68));
    roundPath(ctx, [[0.65, 1.12], [-0.38, 1.12], [-0.38, 1.02], [0.67, 1.02]], 0.04); fillStroke(ctx, s.body);
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(-2.0, 0.42, 1.55, 0.2);
    ctx.strokeStyle = s.accent; ctx.lineWidth = 0.05;
    ctx.beginPath(); ctx.moveTo(-2.15, 0.78); ctx.lineTo(-0.4, 0.78); ctx.stroke();
    for (const x of [-2.05, -1.5, -0.95]) { ctx.beginPath(); ctx.moveTo(x, 0.68); ctx.lineTo(x, 0.78); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(-2.0, 0.05); ctx.lineTo(2.0, 0.05); ctx.strokeStyle = s.accent; ctx.lineWidth = 0.08; ctx.stroke();
    ctx.fillStyle = '#d9d9d9'; ctx.fillRect(2.0, -0.2, 0.18, 0.28);
    headlight(ctx, 2.03, 0.33, 0.09); taillight(ctx, -2.13, 0.45);
  },
  // 5 Muscle Car
  (ctx, s) => {
    drawHelmet(ctx, -0.55, 0.72, '#f5f5f5', 0.23);
    glass(ctx, [[0.55, 0.52], [-0.1, 0.9], [-1.0, 0.9], [-1.95, 0.55]], s.glass);
    roundPath(ctx, [[-2.2, -0.2], [2.15, -0.2], [2.22, 0.25], [2.0, 0.45], [0.6, 0.52], [-2.1, 0.56], [-2.25, 0.3]], 0.1);
    fillStroke(ctx, bodyFill(ctx, s.body, -0.2, 0.56));
    roundPath(ctx, [[-0.1, 0.97], [-1.02, 0.97], [-1.05, 0.88], [-0.08, 0.88]], 0.04); fillStroke(ctx, s.body);
    // racing stripes over hood and roof
    ctx.strokeStyle = s.accent; ctx.lineWidth = 0.07;
    ctx.beginPath(); ctx.moveTo(2.0, 0.42); ctx.lineTo(0.6, 0.49); ctx.moveTo(2.08, 0.32); ctx.lineTo(0.6, 0.39); ctx.stroke();
    roundPath(ctx, [[0.95, 0.5], [1.5, 0.48], [1.45, 0.64], [1.05, 0.66]], 0.04); fillStroke(ctx, s.accent);
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(-0.3, 0.05, 0.6, 0.06);
    headlight(ctx, 2.12, 0.28, 0.1); taillight(ctx, -2.2, 0.35, 0.1, 0.16);
  },
  // 6 Rally Car with livery and light pod
  (ctx, s) => {
    drawHelmet(ctx, -0.35, 0.8, '#1f6fff', 0.24);
    glass(ctx, [[0.8, 0.52], [0.15, 1.0], [-1.45, 1.0], [-1.85, 0.55]], s.glass);
    roundPath(ctx, [[-2.05, -0.22], [2.0, -0.22], [2.15, 0.18], [1.9, 0.44], [0.8, 0.54], [-1.95, 0.57], [-2.1, 0.22]], 0.14);
    fillStroke(ctx, bodyFill(ctx, s.body, -0.22, 0.57));
    roundPath(ctx, [[0.15, 1.08], [-1.5, 1.08], [-1.52, 0.98], [0.17, 0.98]], 0.04); fillStroke(ctx, s.body);
    roundPath(ctx, [[-0.6, 1.08], [-0.2, 1.08], [-0.25, 1.2], [-0.55, 1.2]], 0.04); fillStroke(ctx, s.dark);
    // livery swoosh
    ctx.beginPath(); ctx.moveTo(-2.0, -0.05); ctx.bezierCurveTo(-0.8, 0.4, 0.6, -0.15, 2.05, 0.3); ctx.lineTo(2.1, 0.1); ctx.bezierCurveTo(0.6, -0.3, -0.8, 0.2, -2.0, -0.2); ctx.closePath();
    ctx.fillStyle = s.accent; ctx.fill();
    ctx.beginPath(); ctx.arc(-0.6, 0.22, 0.2, 0, 7); ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = 0.04; ctx.strokeStyle = '#111'; ctx.stroke();
    ctx.fillStyle = '#111'; ctx.fillRect(-0.66, 0.12, 0.05, 0.2); ctx.fillRect(-0.56, 0.12, 0.05, 0.2);
    for (const y of [0.55, 0.7]) for (const x of [1.25, 1.45]) headlight(ctx, x, y, 0.075);
    ctx.fillStyle = '#222'; ctx.fillRect(-1.95, -0.45, 0.1, 0.3); ctx.fillRect(1.3, -0.45, 0.1, 0.3);
    headlight(ctx, 2.03, 0.26, 0.09); taillight(ctx, -2.05, 0.35);
  },
  // 7 Sports Car
  (ctx, s) => {
    drawHelmet(ctx, -0.5, 0.64, '#ffd23f', 0.22);
    glass(ctx, [[0.5, 0.47], [-0.15, 0.82], [-0.9, 0.82], [-1.65, 0.5]], s.glass);
    roundPath(ctx, [[-2.1, -0.15], [2.2, -0.15], [2.32, 0.1], [1.6, 0.38], [0.5, 0.48], [-2.0, 0.52], [-2.2, 0.25]], 0.16);
    fillStroke(ctx, bodyFill(ctx, s.body, -0.15, 0.52));
    ctx.beginPath(); ctx.moveTo(-0.15, 0.82); ctx.quadraticCurveTo(-0.5, 0.92, -0.92, 0.82); ctx.strokeStyle = s.body; ctx.lineWidth = 0.09; ctx.stroke();
    path(ctx, [[-1.1, 0.05], [-0.5, 0.15], [-0.5, 0.28], [-1.2, 0.2]]); ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(-2.05, 0.3); ctx.lineTo(2.25, 0.08); ctx.strokeStyle = s.accent; ctx.lineWidth = 0.04; ctx.stroke();
    path(ctx, [[2.0, 0.2], [2.25, 0.12], [2.05, 0.08]]); ctx.fillStyle = '#fff6c8'; ctx.fill();
    taillight(ctx, -2.12, 0.3, 0.08, 0.1);
  },
  // 8 Hypercar with bubble canopy and big wing
  (ctx, s) => {
    ctx.strokeStyle = '#111'; ctx.lineWidth = 0.07;
    ctx.beginPath(); ctx.moveTo(-1.9, 0.45); ctx.lineTo(-2.0, 0.98); ctx.moveTo(-1.55, 0.45); ctx.lineTo(-1.6, 0.98); ctx.stroke();
    roundPath(ctx, [[-2.4, 0.95], [-1.4, 1.02], [-1.42, 1.1], [-2.42, 1.08]], 0.03); fillStroke(ctx, s.body);
    drawHelmet(ctx, -0.45, 0.55, '#3dff8a', 0.21);
    glass(ctx, [[0.4, 0.42], [-0.15, 0.74], [-0.95, 0.72], [-1.4, 0.48]], s.glass);
    roundPath(ctx, [[-2.15, -0.12], [2.3, -0.12], [2.38, 0.04], [1.2, 0.3], [0.35, 0.42], [-1.4, 0.5], [-2.15, 0.45]], 0.1);
    fillStroke(ctx, bodyFill(ctx, s.body, -0.12, 0.5));
    ctx.beginPath(); ctx.moveTo(-2.1, 0.12); ctx.lineTo(2.3, 0.0); ctx.strokeStyle = s.accent; ctx.lineWidth = 0.05; ctx.stroke();
    path(ctx, [[-1.2, 0.0], [-0.4, 0.1], [-0.6, 0.3], [-1.25, 0.28]]); ctx.fillStyle = '#000'; ctx.fill();
    ctx.shadowColor = s.accent; ctx.shadowBlur = 0;
    path(ctx, [[1.9, 0.1], [2.3, 0.05], [2.0, 0.02]]); ctx.fillStyle = s.accent; ctx.fill();
    taillight(ctx, -2.13, 0.3, 0.06, 0.1);
  },
  // 9 Jet Racer
  (ctx, s) => {
    path(ctx, [[-2.05, 0.45], [-1.55, 0.45], [-1.95, 1.35], [-2.3, 1.35]]); fillStroke(ctx, s.accent);
    drawHelmet(ctx, -0.3, 0.55, '#ffffff', 0.21);
    glass(ctx, [[0.55, 0.4], [0.0, 0.72], [-0.75, 0.7], [-1.1, 0.45]], s.glass);
    roundPath(ctx, [[-2.25, -0.1], [1.8, -0.1], [2.75, 0.08], [1.1, 0.35], [0.1, 0.44], [-1.85, 0.5], [-2.25, 0.3]], 0.08);
    fillStroke(ctx, bodyFill(ctx, s.body, -0.1, 0.5));
    ctx.strokeStyle = s.accent; ctx.lineWidth = 0.08;
    ctx.beginPath(); ctx.moveTo(-2.2, 0.15); ctx.lineTo(2.5, 0.08); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(-1.2, 0.2, 0.28, 0.16, 0, 0, 7); ctx.fillStyle = '#20242c'; ctx.fill();
    ctx.beginPath(); ctx.ellipse(-1.2, 0.2, 0.16, 0.09, 0, 0, 7); ctx.fillStyle = '#5a6577'; ctx.fill();
    ctx.beginPath(); ctx.arc(-2.25, 0.2, 0.17, 0, 7); ctx.fillStyle = '#ffb347'; ctx.fill();
  },
  // 10 Quantum Hover
  (ctx, s, t) => {
    drawHelmet(ctx, -0.2, 0.6, '#3ff5ff', 0.22);
    ctx.beginPath(); ctx.ellipse(-0.15, 0.5, 0.95, 0.5, 0, 0, Math.PI); ctx.closePath();
    ctx.fillStyle = 'rgba(180,140,255,0.45)'; ctx.fill(); ctx.lineWidth = 0.05; ctx.strokeStyle = 'rgba(220,200,255,0.9)'; ctx.stroke();
    roundPath(ctx, [[-2.1, -0.1], [2.0, -0.1], [2.35, 0.2], [1.6, 0.5], [-1.7, 0.55], [-2.2, 0.25]], 0.25);
    fillStroke(ctx, bodyFill(ctx, s.body, -0.1, 0.55), s.accent, 0.06);
    const pulse = 0.6 + 0.4 * Math.sin(t * 6);
    ctx.globalAlpha *= pulse;
    ctx.beginPath(); ctx.moveTo(-1.9, 0.12); ctx.lineTo(2.1, 0.12); ctx.strokeStyle = s.accent; ctx.lineWidth = 0.09; ctx.stroke();
    ctx.globalAlpha /= pulse;
    for (const x of [-1.4, -0.7, 0, 0.7, 1.4]) { ctx.beginPath(); ctx.arc(x, 0.3, 0.05, 0, 7); ctx.fillStyle = s.accent; ctx.fill(); }
  },
];

function drawRocket(ctx, mount, level, boosting, t) {
  const [x, y] = mount;
  const r = 0.17 + level * 0.008;
  const len = 0.75 + level * 0.015;
  if (boosting) {
    const flick = 0.85 + Math.sin(t * 60) * 0.1 + Math.random() * 0.15;
    const fl = (1.4 + level * 0.06) * flick;
    const g = ctx.createLinearGradient(x - len, y, x - len - fl, y);
    g.addColorStop(0, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.25, 'rgba(120,200,255,0.9)');
    g.addColorStop(0.6, 'rgba(255,140,40,0.7)');
    g.addColorStop(1, 'rgba(255,60,0,0)');
    ctx.beginPath();
    ctx.moveTo(x - len, y + r * 0.9);
    ctx.quadraticCurveTo(x - len - fl * 0.5, y + r * 1.4, x - len - fl, y);
    ctx.quadraticCurveTo(x - len - fl * 0.5, y - r * 1.4, x - len, y - r * 0.9);
    ctx.closePath();
    ctx.fillStyle = g; ctx.fill();
  }
  roundPath(ctx, [[x + 0.2, y - r], [x + 0.2, y + r], [x - len + 0.15, y + r], [x - len, y + r * 1.25], [x - len, y - r * 1.25], [x - len + 0.15, y - r]], 0.05);
  fillStroke(ctx, shade(ctx, '#e6e9ef', '#7d8594', y - r, y + r));
  ctx.fillStyle = '#e8453c'; ctx.fillRect(x - len * 0.55, y - r, 0.1, r * 2);
}

function drawWings(ctx, level, accent, stage) {
  const span = 0.6 + level * 0.05;
  const y = stage >= 8 ? 0.25 : 0.32;
  path(ctx, [[0.7, y], [-0.4, y + 0.02], [-1.3 - span * 0.6, y - span * 0.55], [-0.6 - span * 0.4, y - span * 0.6]]);
  const g = ctx.createLinearGradient(0.7, y, -1.5, y - span);
  g.addColorStop(0, 'rgba(240,244,255,0.95)');
  g.addColorStop(1, accent);
  fillStroke(ctx, g, 'rgba(0,0,0,0.6)', 0.04);
  ctx.beginPath(); ctx.arc(-1.3 - span * 0.6, y - span * 0.55, 0.06, 0, 7); ctx.fillStyle = '#ff3b3b'; ctx.fill();
}

function drawSpoiler(ctx, mount, level, color) {
  const [x, y] = mount;
  const h = 0.25 + Math.min(level, 20) * 0.012;
  ctx.strokeStyle = '#222'; ctx.lineWidth = 0.06;
  ctx.beginPath(); ctx.moveTo(x + 0.35, y); ctx.lineTo(x + 0.3, y + h); ctx.stroke();
  roundPath(ctx, [[x - 0.2, y + h], [x + 0.6, y + h + 0.06], [x + 0.6, y + h + 0.13], [x - 0.22, y + h + 0.1]], 0.03);
  fillStroke(ctx, color);
}

function drawExhaust(ctx, mount, throttle, t) {
  const [x] = mount;
  const y = -0.05;
  roundPath(ctx, [[x + 0.3, y - 0.07], [x - 0.25, y - 0.07], [x - 0.25, y + 0.07], [x + 0.3, y + 0.07]], 0.03);
  fillStroke(ctx, shade(ctx, '#f0f0f0', '#888', y - 0.07, y + 0.07));
  if (throttle > 0 && Math.sin(t * 37) > 0.6) {
    ctx.beginPath(); ctx.moveTo(x - 0.25, y + 0.06); ctx.lineTo(x - 0.65, y); ctx.lineTo(x - 0.25, y - 0.06);
    ctx.fillStyle = 'rgba(255,170,60,0.85)'; ctx.fill();
  }
}

function drawMagnet(ctx, mount, level, t) {
  const [x, y] = mount;
  const h = 0.45 + level * 0.02;
  ctx.strokeStyle = '#555'; ctx.lineWidth = 0.04;
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + h); ctx.stroke();
  ctx.beginPath(); ctx.arc(x, y + h + 0.12, 0.13, Math.PI, 0, true);
  ctx.strokeStyle = '#e8453c'; ctx.lineWidth = 0.08; ctx.stroke();
  ctx.fillStyle = '#ddd'; ctx.fillRect(x - 0.17, y + h + 0.06, 0.08, 0.07); ctx.fillRect(x + 0.09, y + h + 0.06, 0.08, 0.07);
  const p = (t * 1.5) % 1;
  ctx.beginPath(); ctx.arc(x, y + h + 0.12, 0.2 + p * 0.5, 0, 7);
  ctx.strokeStyle = `rgba(255,220,80,${0.5 * (1 - p)})`; ctx.lineWidth = 0.03; ctx.stroke();
}

function drawArmor(ctx, level, stage) {
  ctx.fillStyle = 'rgba(40,44,52,0.85)';
  const y0 = stage >= 7 ? -0.12 : -0.2;
  roundPath(ctx, [[-1.8, y0], [1.8, y0], [1.75, y0 + 0.2], [-1.75, y0 + 0.2]], 0.04);
  ctx.fill();
  ctx.fillStyle = '#c9ced6';
  for (let x = -1.6; x <= 1.6; x += 0.4) { ctx.beginPath(); ctx.arc(x, y0 + 0.1, 0.03, 0, 7); ctx.fill(); }
  if (level >= 10) {
    ctx.strokeStyle = '#9aa3ad'; ctx.lineWidth = 0.07; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(2.05, -0.15); ctx.lineTo(2.35, -0.05); ctx.lineTo(2.35, 0.35); ctx.lineTo(2.1, 0.42);
    ctx.moveTo(2.35, 0.15); ctx.lineTo(2.15, 0.15); ctx.stroke();
  }
}

export function drawWheel(ctx, x, y, r, spin, style, t) {
  ctx.save();
  ctx.translate(x, y);
  if (style === 'hover') {
    const g = ctx.createRadialGradient(0, 0, r * 0.2, 0, 0, r * 1.1);
    g.addColorStop(0, 'rgba(63,245,255,0.9)');
    g.addColorStop(0.6, 'rgba(120,90,255,0.45)');
    g.addColorStop(1, 'rgba(120,90,255,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r * 1.1, 0, 7); ctx.fill();
    ctx.rotate(-spin);
    ctx.strokeStyle = '#3ff5ff'; ctx.lineWidth = 0.06;
    ctx.beginPath(); ctx.arc(0, 0, r * 0.85, 0, Math.PI * 1.6); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, r * 0.5, Math.PI, Math.PI * 2.4); ctx.stroke();
    ctx.restore();
    return;
  }
  ctx.rotate(-spin);
  ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fillStyle = '#1c1c22'; ctx.fill();
  // tread blocks
  ctx.fillStyle = '#2c2c34';
  const n = 14;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    ctx.save(); ctx.rotate(a); ctx.fillRect(r * 0.86, -0.05, r * 0.17, 0.1); ctx.restore();
  }
  ctx.beginPath(); ctx.arc(0, 0, r * 0.82, 0, 7); ctx.fillStyle = '#25252c'; ctx.fill();
  const rimR = r * 0.58;
  const rimColor = { wood: '#b07a45', kart: '#ffd23f', steel: '#c9ced6', mag: '#d8dde4', rally: '#ffffff', star: '#e0e3e8', turbine: '#9aa3ad' }[style] || '#c9ced6';
  ctx.beginPath(); ctx.arc(0, 0, rimR, 0, 7); ctx.fillStyle = rimColor; ctx.fill();
  ctx.lineWidth = 0.03; ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.stroke();
  const spokes = { wood: 4, kart: 3, steel: 5, mag: 6, rally: 6, star: 5, turbine: 10 }[style] || 5;
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.lineWidth = style === 'turbine' ? 0.025 : 0.05;
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2;
    ctx.beginPath();
    if (style === 'turbine') { ctx.moveTo(Math.cos(a) * rimR * 0.2, Math.sin(a) * rimR * 0.2); ctx.quadraticCurveTo(Math.cos(a + 0.6) * rimR * 0.7, Math.sin(a + 0.6) * rimR * 0.7, Math.cos(a + 0.4) * rimR, Math.sin(a + 0.4) * rimR); }
    else { ctx.moveTo(Math.cos(a) * rimR * 0.25, Math.sin(a) * rimR * 0.25); ctx.lineTo(Math.cos(a) * rimR * 0.92, Math.sin(a) * rimR * 0.92); }
    ctx.stroke();
  }
  ctx.beginPath(); ctx.arc(0, 0, rimR * 0.22, 0, 7); ctx.fillStyle = '#555'; ctx.fill();
  ctx.restore();
}

function drawSpring(ctx, ax, ay, bx, by, color) {
  const dx = bx - ax, dy = by - ay;
  const len = Math.hypot(dx, dy);
  if (len < 0.05) return;
  const nx = -dy / len, ny = dx / len;
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  const coils = 6;
  for (let i = 1; i < coils * 2; i++) {
    const u = i / (coils * 2);
    const w = (i % 2 ? 1 : -1) * 0.11;
    ctx.lineTo(ax + dx * u + nx * w, ay + dy * u + ny * w);
  }
  ctx.lineTo(bx, by);
  ctx.strokeStyle = color; ctx.lineWidth = 0.05; ctx.stroke();
}

/**
 * Draw a full car. `wheels` are [{x,y,spin}] in local coords.
 * opts: { stage, levels, paint, boosting, throttle, t, hpFrac, ghost }
 */
export function drawCarLocal(ctx, wheels, wheelR, opts) {
  const stage = Math.min(opts.stage, STAGE_DRAW.length - 1);
  const s = stageStyle(stage, opts.paint);
  const L = opts.levels || {};
  const mount = MOUNTS[stage];
  const t = opts.t || 0;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  const springs = wheels.map((w) => ({ ...w, ay: w.ay }));
  ctx.save();
  ctx.translate(0, BODY_DROP);
  if ((L.wings || 0) > 0) drawWings(ctx, L.wings, s.accent, stage);
  if ((L.booster || 0) > 0) drawRocket(ctx, mount.rear, L.booster, opts.boosting, t);

  const suspColor = (L.suspension || 0) >= 8 ? '#ffd23f' : (L.suspension || 0) >= 3 ? '#e8453c' : '#888';
  for (const w of springs) drawSpring(ctx, w.ax, w.ay - BODY_DROP, w.x, w.y - BODY_DROP, suspColor);

  if ((L.aero || 0) >= 4 && stage < 8) drawSpoiler(ctx, [mount.rear[0] + 0.05, mount.rear[1] + 0.05], L.aero, s.dark);
  if ((L.engine || 0) >= 5) drawExhaust(ctx, mount.rear, opts.throttle, t);

  STAGE_DRAW[stage](ctx, s, t);

  if ((L.armor || 0) >= 5) drawArmor(ctx, L.armor, stage);
  if ((L.engine || 0) >= 12 && stage >= 3 && stage <= 7) {
    const [hx, hy] = mount.hood;
    roundPath(ctx, [[hx - 0.25, hy], [hx + 0.25, hy], [hx + 0.2, hy + 0.25], [hx - 0.2, hy + 0.25]], 0.04);
    fillStroke(ctx, shade(ctx, '#f0f0f0', '#8a8a8a', hy, hy + 0.25));
    ctx.fillStyle = '#222'; ctx.fillRect(hx - 0.15, hy + 0.25, 0.3, 0.07);
  }
  if ((L.magnet || 0) > 0) drawMagnet(ctx, mount.roof, L.magnet, t);

  // Damage: scorch marks as hit points drop
  if (opts.hpFrac !== undefined && opts.hpFrac < 0.6) {
    const n = opts.hpFrac < 0.3 ? 5 : 2;
    ctx.fillStyle = 'rgba(20,15,10,0.45)';
    for (let i = 0; i < n; i++) {
      ctx.beginPath(); ctx.ellipse(-1.4 + i * 0.7, 0.1 + (i % 2) * 0.2, 0.18, 0.1, i, 0, 7); ctx.fill();
    }
  }

  ctx.restore();
  for (const w of wheels) drawWheel(ctx, w.x, w.y, wheelR, w.spin, s.rim, t);
}

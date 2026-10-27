// Browser smoke test: serves the game, plays a launch with simulated input,
// fails on any console error, and saves screenshots of each screen.
//   node tools/smoke.mjs [outDir=screenshots] [--portrait]

import http from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPlaywright } from './pw.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const outDir = resolve(root, process.argv.slice(2).find((a) => !a.startsWith('--')) || 'screenshots');
const portrait = process.argv.includes('--portrait');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };

const server = http.createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
  const file = join(root, path || 'index.html');
  if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
  try {
    const body = await readFile(file.endsWith('/') ? join(file, 'index.html') : file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end('not found'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/`;

const { chromium } = loadPlaywright();
const browser = await chromium.launch();
const viewport = portrait ? { width: 390, height: 844 } : { width: 1280, height: 720 };
const page = await browser.newPage({ viewport, deviceScaleFactor: 1, hasTouch: portrait });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));
await mkdir(outDir, { recursive: true });
const shot = (name) => page.screenshot({ path: join(outDir, `${portrait ? 'p-' : ''}${name}.png`) });
const wait = (ms) => page.waitForTimeout(ms);

await page.goto(url);
await wait(800);
await shot('1-garage');

// Give some coins so the upgrade flow can be exercised.
await page.evaluate(() => { window.game.save.coins = 5000; window.game.renderGarage(); });
await page.click('[data-buy="sling"]');
await page.click('[data-buy="engine"]');
await page.click('[data-buy="fuel"]');
await wait(400);
await shot('2-garage-upgraded');

await page.click('#btn-launch');
await wait(500);
// Drag back from the middle of the screen.
const cx = viewport.width * 0.55, cy = viewport.height * 0.5;
await page.mouse.move(cx, cy);
await page.mouse.down();
for (let i = 1; i <= 10; i++) { await page.mouse.move(cx - i * 16, cy + i * 11); await wait(16); }
await wait(200);
await shot('3-aim');
await page.mouse.up();
await wait(700);
await shot('4-flight');
await page.keyboard.down('ArrowRight');
await wait(2500);
await shot('5-driving');
// Wait for the run to end on its own (timeout safety).
for (let i = 0; i < 90; i++) {
  if (await page.evaluate(() => window.game.mode === 'results')) break;
  await wait(500);
}
await page.keyboard.up('ArrowRight');
await wait(1200);
await shot('6-results');
const summary = await page.evaluate(() => ({ mode: window.game.mode, coins: window.game.save.coins, best: window.game.save.genBest, runs: window.game.save.totals.runs }));

// Visit every garage tab.
await page.click('#btn-r-garage');
await wait(300);
for (const tab of ['missions', 'lab', 'trophies']) {
  await page.click(`.tabs [data-tab="${tab}"]`);
  await wait(250);
  await shot(`7-tab-${tab}`);
}
await page.click('#btn-settings');
await wait(300);
await shot('8-settings');

// Late-game look: jump to an evolved car far along the world.
await page.evaluate(() => {
  const g = window.game;
  document.querySelector('[data-close]').click();
  g.save.levels = { sling: 20, engine: 20, fuel: 20, tires: 15, armor: 15, coins: 18, suspension: 15, aero: 15, magnet: 10, booster: 15, nitro: 15, wings: 12 };
  g.save.best = g.save.genBest = 20000;
  g.refreshStats();
  g.renderGarage();
  g.garageCar.stats = g.stats;
});
await wait(600);
await shot('9-garage-late');

await browser.close();
server.close();
console.log(JSON.stringify(summary));
if (errors.length) {
  console.error('Console errors:\n' + errors.join('\n'));
  process.exit(1);
}
console.log(`OK, screenshots in ${outDir}`);

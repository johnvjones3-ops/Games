// Rasterizes icons/icon.svg into the PNG sizes iOS and Android expect.
//   node tools/make-icons.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadPlaywright } from './pw.mjs';

const { chromium } = loadPlaywright();

const root = fileURLToPath(new URL('..', import.meta.url));
const svg = readFileSync(`${root}icons/icon.svg`, 'utf8');
const browser = await chromium.launch();
const page = await browser.newPage();
for (const size of [180, 192, 512]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
  await page.screenshot({ path: `${root}icons/icon-${size}.png`, omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
}
await browser.close();
console.log('icons written');
